"""Expanding-window prediction of burden with release-aware label eligibility."""
import json

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from analysis.data import C, OUT, ROOT

GROUPS = C['groups']
SETS = {'core': ['core'], 'housing': ['core', 'housing'],
        'employment': ['core', 'housing', 'employment'], 'all': list(GROUPS),
        'no_housing': ['core', 'employment', 'commuting'],
        'no_employment': ['core', 'housing', 'commuting']}


def growth(a, b, n=1):
    """Annualized percentage growth across n reference years; never treat gaps as one year."""
    return 100 * ((a / b) ** (1 / n) - 1) if a > 0 and b > 0 else np.nan


def panel():
    """Create origin/target pairs with source years and conservative usable-origin years."""
    a = pd.read_csv(OUT / 'acs.csv', dtype={'fips': str})
    q = pd.read_csv(OUT / 'qcew.csv', dtype={'fips': str})
    l = pd.DataFrame(json.loads((OUT / 'lodes.json').read_text()))
    cpi = pd.read_csv(OUT / 'cpi.csv', index_col='year')['mean']
    A, Q, L = [d.set_index(['fips', 'year']) for d in [a, q, l]]
    rows, exclusions = [], []
    for f in a.fips.unique():
        for y in range(C['target_years'][0], C['target_years'][1] + 1):
            if (f, y) not in A.index:
                exclusions.append({'fips': f, 'target_year': y, 'source': 'ACS',
                                   'reason': 'No standard published one-year target (2020 gap)'})
                continue
            t = y - 1
            yrs = [k for k in a[a.fips == f].year if k <= t - C['lags']['acs']]
            if len(yrs) < 2:
                continue
            v, u = sorted(yrs)[-2:]
            x, b, z = A.loc[(f, u)], A.loc[(f, v)], A.loc[(f, y)]
            j = t - C['lags']['qcew']
            w, w0 = Q.loc[(f, j)], Q.loc[(f, j - 1)]
            k = t - C['lags']['lodes']
            first = C['lodes_first_release'].get(f[:2], 0)
            if (f, k) not in L.index or t < first:
                exclusions.append({
                    'fips': f, 'target_year': y, 'lodes_year': k,
                    'reason': 'LODES coverage or first release unavailable at origin'})
                continue
            h = L.loc[(f, k)]
            s, s0 = cpi[C['base_year']] / cpi[u], cpi[C['base_year']] / cpi[v]
            rows.append({
                'fips': f, 'name': z['name'], 'state': f[:2], 'target_year': y,
                'origin': t, 'acs_year': u, 'acs_previous': v, 'qcew_year': j,
                'lodes_year': k, 'label_available': y + 1,
                'acs_available': u + C['lags']['acs'],
                'qcew_available': j + C['lags']['qcew'],
                'lodes_available': max(k + C['lags']['lodes'], first),
                'y': z.burden, 'latest': x.burden, 'target_moe': z.burden_moe,
                'renters': z.renters, 'weight': x.renters,
                'burden_change': (x.burden - b.burden) / (u - v),
                'log_population': np.log(x.population), 'real_rent': x.rent * s,
                'real_income': x.income * s,
                'rent_growth': growth(x.rent * s, b.rent * s0, u - v),
                'income_growth': growth(x.income * s, b.income * s0, u - v),
                'housing_growth': growth(x.housing, b.housing, u - v),
                'job_growth': growth(w.jobs, w0.jobs),
                'pay_growth': growth(w.pay / cpi[j], w0.pay / cpi[j - 1]),
                'goods_share': w.goods_share, 'services_share': w.services_share,
                'inbound': h.inbound, 'outbound': h.outbound,
            })
    d = pd.DataFrame(rows)
    d.to_csv(OUT / 'panel.csv', index=False)
    (OUT / 'exclusions.json').write_text(json.dumps(exclusions, indent=2))
    return d


def fit(d, features, model, alpha):
    """Minimize squared error plus alpha(||beta||²+||county effects||²), pooled intercept."""
    imp = SimpleImputer(strategy='median', keep_empty_features=True)
    A = imp.fit_transform(d[features])
    scale = StandardScaler().fit(A)
    A = scale.transform(A)
    counties = sorted(d.fips.unique())
    B = np.array([[float(f == c) for c in counties] for f in d.fips])
    if model == 'linear':
        m = Ridge(alpha=alpha).fit(np.c_[A, B], d.y)
    else:
        m = HistGradientBoostingRegressor(
            max_leaf_nodes=alpha, max_iter=80, learning_rate=0.06,
            min_samples_leaf=15, l2_regularization=10,
            early_stopping=False, random_state=C['seed']).fit(A, d.y)
    return m, imp, scale, counties


def predict(m, d, features, model):
    """All models share clipping to the closed interval [0,100]."""
    estimator, imp, scale, counties = m
    A = scale.transform(imp.transform(d[features]))
    if model == 'linear':
        B = np.array([[float(f == c) for c in counties] for f in d.fips])
        A = np.c_[A, B]
    return np.clip(estimator.predict(A), 0, 100)


def tune(d, features, model):
    """Last eligible earlier temporal fold; its fitting labels precede its own origin."""
    grid = C['ridge_grid'] if model == 'linear' else C['tree_grid']
    y = int(d.target_year.max())
    train = d[d.label_available <= y - 1]
    val = d[d.target_year == y]
    if len(train) < 30:
        return grid[1]
    errors = []
    for alpha in grid:
        m = fit(train, features, model, alpha)
        errors.append(np.mean(abs(predict(m, val, features, model) - val.y)))
    return grid[int(np.argmin(errors))]


def export_model(m, features, model):
    """Export the fitted predictor, including every histogram tree split and leaf."""
    estimator, imp, scale, counties = m
    out = {'features': features, 'impute': imp.statistics_.tolist(),
           'mean': scale.mean_.tolist(), 'scale': scale.scale_.tolist(), 'model': model}
    if model == 'linear':
        n = len(features)
        out.update(intercept=float(estimator.intercept_), beta=estimator.coef_[:n].tolist(),
                   county=dict(zip(counties, estimator.coef_[n:].tolist())))
    else:
        out['intercept'] = float(estimator._baseline_prediction[0, 0])
        out['trees'] = [[{c: (float(r[c]) if c in ('value', 'num_threshold') else int(r[c]))
                          for c in ['value', 'feature_idx', 'num_threshold', 'left', 'right',
                                    'is_leaf', 'missing_go_to_left']}
                         for r in stage[0].nodes] for stage in estimator._predictors]
    return out


def metrics(d, weighted=False):
    """County-equal primary errors; secondary weights are renters observed at the origin."""
    w = d.weight.to_numpy() if weighted else np.ones(len(d))
    e = d.pred - d.y
    tol = C['direction_tolerance']
    direction = lambda x: np.where(abs(x) <= tol, 0, np.sign(x))
    valid = d.lo.notna()
    return {'n': len(d), 'mae': float(np.average(abs(e), weights=w)),
            'rmse': float(np.sqrt(np.average(e ** 2, weights=w))),
            'improvement': float(np.average(abs(d.latest - d.y) - abs(e), weights=w)),
            'direction': float(np.average(direction(d.pred - d.latest)
                                          == direction(d.y - d.latest), weights=w)),
            'coverage': float(np.average(((d.y >= d.lo) & (d.y <= d.hi))[valid],
                                        weights=w[valid])) if valid.any() else None,
            'width': float(np.average((d.hi - d.lo)[valid], weights=w[valid]))
            if valid.any() else None, 'interval_n': int(valid.sum())}


def paired(d):
    """Paired MAE differences: county-cluster bootstrap, preserving each county's years."""
    rows = []
    rng = np.random.default_rng(C['seed'])
    for (regime, model), a in d[d.model != 'persistence'].groupby(['regime', 'model']):
        for experiment in sorted(SETS.keys() - {'all'}):
            base = a[a.experiment == experiment][['fips', 'target_year', 'pred', 'y']]
            all_ = a[a.experiment == 'all'][['fips', 'target_year', 'pred']]
            z = base.merge(all_, on=['fips', 'target_year'], suffixes=('_base', '_all'))
            z['delta'] = abs(z.pred_all - z.y) - abs(z.pred_base - z.y)
            g = z.groupby('fips').delta.mean().to_numpy()
            b = rng.choice(g, size=(2000, len(g))).mean(axis=1)
            rows.append({'regime': regime, 'model': model, 'experiment': experiment,
                         'delta': float(g.mean()), 'lo': float(np.quantile(b, .1)),
                         'hi': float(np.quantile(b, .9)), 'n': len(z), 'clusters': len(g)})
    return rows


def run():
    """Freeze origin-specific fits; no held-out outcome enters preprocessing or calibration."""
    d = panel()
    rows, configs, scenarios, calibration = [], [], {}, []
    regimes = [('temporal', None)] + [(f'holdout_{s}', s) for s in sorted(d.state.unique())]
    for regime, state in regimes:
        for experiment, groups in SETS.items():
            features = [f for g in groups for f in GROUPS[g]]
            for model in ['linear', 'trees']:
                history = []
                for y in C['evaluation_years']:
                    t = y - 1
                    train = d[d.label_available <= t]
                    if state:
                        train = train[train.state != state]
                    test = d[d.target_year == y]
                    alpha = tune(train, features, model)
                    m = fit(train, features, model, alpha)
                    p = predict(m, test, features, model)
                    cal = [r['error'] for r in history if r['available'] <= t]
                    radius = (float(np.quantile(cal, C['interval_coverage'], method='higher'))
                              if len(cal) >= 30 else np.nan)
                    for (_, r), pred in zip(test.iterrows(), p):
                        if not state or r.state != state:
                            h = {'error': abs(pred - r.y), 'available': r.label_available,
                                 'fips': r.fips, 'target_year': y, 'state': r.state,
                                 'pred': float(pred), 'observed': r.y}
                            history.append(h)
                            calibration.append(h | {'regime': regime, 'experiment': experiment,
                                                    'model': model})
                        if state and r.state != state:
                            continue
                        a = r.to_dict()
                        a.update(regime=regime, experiment=experiment, model=model,
                                 pred=float(pred), residual=float(pred - r.y),
                                 lo=max(0, pred - radius) if np.isfinite(radius) else np.nan,
                                 hi=min(100, pred + radius) if np.isfinite(radius) else np.nan,
                                 calibration_n=len(cal), radius=radius,
                                 calibration_latest=max([h['available'] for h in history
                                                         if h['available'] <= t], default=0),
                                 train_latest=int(train.label_available.max()),
                                 block=('final test' if y in C['final_test_years']
                                        else 'development'))
                        rows.append(a)
                    configs.append({'regime': regime, 'experiment': experiment, 'model': model,
                                    'target_year': y, 'alpha': alpha, 'features': features,
                                    'train_n': len(train),
                                    'train_counties': sorted(train.fips.unique()),
                                    'tuning_target': int(train.target_year.max()),
                                    'tuning_origin': int(train.target_year.max()) - 1,
                                    'tuning_train_targets': sorted(train[
                                        train.label_available <= train.target_year.max() - 1
                                    ].target_year.unique().tolist()),
                                    'train_targets': sorted(train.target_year.unique().tolist())})
                    if regime == 'temporal' and experiment == 'all' and y == 2024:
                        scenarios[model] = export_model(m, features, model)
                        scenarios['reference_' + model] = p.tolist()
                        cases = []
                        for multiplier in [.9, 1.1]:
                            x = test.copy()
                            for f, g in [('real_rent', 'rent_growth'),
                                         ('real_income', 'income_growth')]:
                                x[f] *= multiplier
                                n = x.acs_year - x.acs_previous
                                x[g] = 100 * ((1 + x[g] / 100)
                                              * multiplier ** (1 / n) - 1)
                            x.job_growth += 2
                            x.housing_growth += 1
                            cases.extend([{'row': r, 'pred': float(v)} for r, v in zip(
                                json.loads(x.to_json(orient='records')),
                                predict(m, x, features, model))])
                        scenarios['cases_' + model] = cases
        print('Evaluated', regime, flush=True)
    for regime, state in regimes:
        test = d[d.target_year.isin(C['evaluation_years'])]
        if state:
            test = test[test.state == state]
        for _, r in test.iterrows():
            # Earlier persistence errors, with the same label-availability condition.
            cal = d[(d.target_year.isin(C['evaluation_years']))
                    & (d.label_available <= r.origin)]
            if state:
                cal = cal[cal.state != state]
            radius = (float(np.quantile(abs(cal.y - cal.latest), .8, method='higher'))
                      if len(cal) >= 30 else np.nan)
            a = r.to_dict()
            a.update(regime=regime, experiment='all', model='persistence', pred=r.latest,
                     residual=r.latest - r.y,
                     lo=max(0, r.latest - radius) if np.isfinite(radius) else np.nan,
                     hi=min(100, r.latest + radius) if np.isfinite(radius) else np.nan,
                     calibration_n=len(cal), radius=radius,
                     calibration_latest=int(cal.label_available.max()) if len(cal) else 0,
                     train_latest=0,
                     block=('final test' if r.target_year in C['final_test_years']
                            else 'development'))
            rows.append(a)
    p = pd.DataFrame(rows)
    p.to_csv(OUT / 'predictions.csv', index=False)
    pd.DataFrame(calibration).to_csv(OUT / 'calibration.csv', index=False)
    records = []
    for key, a in p.groupby(['regime', 'experiment', 'model', 'block']):
        for weighted in [False, True]:
            records.append(dict(zip(['regime', 'experiment', 'model', 'block'], key))
                           | {'weighted': weighted} | metrics(a, weighted))
    (OUT / 'metrics.json').write_text(json.dumps(records, indent=2))
    (OUT / 'paired.json').write_text(json.dumps(paired(p[p.block == 'final test']), indent=2))
    artifacts = ROOT / C['paths']['models']
    artifacts.mkdir(exist_ok=True)
    (artifacts / 'fits.json').write_text(json.dumps(configs, indent=2))
    ref = d[d.target_year == 2024].copy()
    scenarios['rows'] = json.loads(ref.to_json(orient='records'))
    scenarios['ranges'] = {f: [float(d[d.label_available <= 2023][f].min()),
                               float(d[d.label_available <= 2023][f].max())]
                           for f in scenarios['linear']['features']}
    (artifacts / 'scenarios.json').write_text(json.dumps(scenarios, indent=2))
    print(pd.DataFrame(records).query(
        "regime == 'temporal' and experiment == 'all' and block == 'final test' and not weighted"
    ).to_string(index=False), flush=True)


if __name__ == '__main__':
    with threadpool_limits(limits=1):
        run()
