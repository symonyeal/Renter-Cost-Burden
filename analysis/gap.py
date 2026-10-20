"""What happened to renters, county by county, and how much of it is survey noise.

Legend
  a      ACS county-year table (acs.csv)
  q      QCEW county-year table (qcew.csv)
  b      share of renter households paying >= 30% of income on rent and utilities, percent
  s      sampling standard error of b, pp: 90% margin / Z
  Z      1.645, the normal quantile behind a Census 90% margin
  y0, y1 first and last ACS year of a comparison; j1 last QCEW year (QCEW ends in 2023)
  db     b(y1) - b(y0), pp; m_db its 90% sampling margin
  R, I   median gross rent and median renter household income, base-year dollars
  g      rent-minus-income gap: 100 [ln(R1/R0) - ln(I1/I0)], log points
  J      covered workplace jobs; P real average workplace pay
  k      bootstrap draws over counties
  u      latest ACS year published at a forecast origin
  v      variance of real year-to-year deviations (pooling model)
  w      weight on a county's own latest deviation, v / (v + s^2)
"""
import numpy as np
import pandas as pd

from analysis.comparison import compare
from analysis.data import OUT, ROOT, C, margin, write

Z = 1.645
K = 2000
PERIODS = [(2011, 2024), (2011, 2019)]
SLOPES = [('jobs_pct', 'rent_pct'), ('jobs_pct', 'inc_pct'), ('jobs_pct', 'db'),
          ('gap', 'db')]


def load():
    """ACS with sampling errors and real rent/income; QCEW with real pay."""
    a = pd.read_csv(OUT / 'acs.csv', dtype={'fips': str}, float_precision='round_trip')
    q = pd.read_csv(OUT / 'qcew.csv', dtype={'fips': str}, float_precision='round_trip')
    cpi = pd.read_csv(OUT / 'cpi.csv', index_col='year')['mean']
    x = cpi[C['base_year']] / a.year.map(cpi)
    a = a.assign(s=a.burden_moe / Z, R=a.rent * x, I=a.income * x)
    q = q.assign(P=q.pay * cpi[C['base_year']] / q.year.map(cpi))
    return a, q


def pooled(a):
    """Share for all 30 counties together, per year: ΣN / ΣD, margins summed in quadrature."""
    m = [f'B25070_MOE{k:03}' for k in [1, 7, 8, 9, 10, 11]]
    t = a.groupby('year').agg(
        {'burden_numerator': 'sum', 'burden_denominator': 'sum'}
        | {c: lambda x: np.sqrt((x ** 2).sum()) for c in m})
    t['b'] = 100 * t.burden_numerator / t.burden_denominator
    t['moe'] = margin(t)
    return [{'year': int(y), 'b': r.b, 'moe': r.moe} for y, r in t.iterrows()]


def change(a, q, y0, y1):
    """Per-county change between two ACS years; jobs and pay to the nearest QCEW year."""
    j1 = min(y1, int(q.year.max()))
    A = a.set_index(['fips', 'year'])
    Q = q.set_index(['fips', 'year'])
    rows = []
    for f in sorted(a.fips.unique()):
        r0, r1, q0, q1 = A.loc[(f, y0)], A.loc[(f, y1)], Q.loc[(f, y0)], Q.loc[(f, j1)]
        db = r1.burden - r0.burden
        m_db = Z * np.hypot(r0.s, r1.s)
        rows.append({
            'fips': f, 'name': r1['name'], 'state': f[:2], 'y0': y0, 'y1': y1, 'j1': j1,
            'b0': r0.burden, 'b1': r1.burden, 'db': db, 'm_db': m_db,
            'verdict': 'up' if db > m_db else 'down' if db < -m_db else 'within noise',
            'R0': r0.R, 'R1': r1.R, 'rent_pct': 100 * (r1.R / r0.R - 1),
            'I0': r0.I, 'I1': r1.I, 'inc_pct': 100 * (r1.I / r0.I - 1),
            'gap': 100 * (np.log(r1.R / r0.R) - np.log(r1.I / r0.I)),
            'J0': q0.jobs, 'J1': q1.jobs, 'jobs_pct': 100 * (q1.jobs / q0.jobs - 1),
            'pay_pct': 100 * (q1.P / q0.P - 1)})
    return pd.DataFrame(rows)


def slope(x, y, seed):
    """Least-squares slope per 10 units of x, 80% county bootstrap interval, correlation."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    rng = np.random.default_rng(seed)
    i = rng.integers(0, len(x), size=(K, len(x)))
    X, Y = x[i], y[i]
    Xc = X - X.mean(axis=1, keepdims=True)
    B = (Xc * (Y - Y.mean(axis=1, keepdims=True))).sum(axis=1) / (Xc ** 2).sum(axis=1)
    b = np.polyfit(x, y, 1)[0]
    lo, hi = np.quantile(B, [.1, .9])
    return {'per10': 10 * b, 'lo': 10 * lo, 'hi': 10 * hi, 'r': float(np.corrcoef(x, y)[0, 1]),
            'n': len(x), 'resolved': bool(lo > 0 or hi < 0)}


def noise_long(d):
    """Between-county spread of a long change against what sampling error alone would give."""
    e = (d.m_db / Z) ** 2
    return {'sd_change': float(d.db.std()), 'sd_noise': float(np.sqrt(e.mean())),
            'real_share': float(max(0, 1 - e.mean() / d.db.var())),
            'up': int((d.verdict == 'up').sum()), 'down': int((d.verdict == 'down').sum()),
            'within': int((d.verdict == 'within noise').sum())}


def noise_short(a):
    """One-year changes in consecutive published years against their sampling error."""
    a = a.sort_values(['fips', 'year'])
    g = a.groupby('fips')
    d = a.assign(d=g.burden.diff(), e=g.s.shift() ** 2 + a.s ** 2, gap=g.year.diff())
    d = d[d.gap == 1]
    return {'n': len(d), 'rms_change': float(np.sqrt((d.d ** 2).mean())),
            'rms_noise': float(np.sqrt(d.e.mean())),
            'noise_share': float(min(1, d.e.mean() / (d.d ** 2).mean())),
            'pairs': [{'fips': r.fips, 'year': int(r.year), 'd': r.d, 's': float(np.sqrt(r.e))}
                      for r in d.itertuples()]}


def pool(a, f, u):
    """Partial-pooling estimate of county f's true share in year u, from years <= u only.

    State-year level plus county offset plus the county's latest deviation, shrunk by
    w = v / (v + s²). Specified in DECISIONS.md, 2026-10-20, before it was scored."""
    h = a[a.year <= u].assign(st=lambda x: x.fips.str[:2])
    h = h.assign(lv=h.groupby(['st', 'year']).burden.transform('mean'))
    h = h.assign(r=h.burden - h.lv)
    h = h.assign(gc=h.groupby('fips').r.transform('mean'))
    h = h.assign(e=h.r - h.gc)
    n, c = len(h), h.fips.nunique()
    v = max(0.0, (h.e ** 2).sum() / (n - c) - (h.s ** 2).mean())
    z = h[(h.fips == f) & (h.year == u)].iloc[0]
    w = v / (v + z.s ** 2) if v > 0 else 0.0
    return float(np.clip(z.lv + z.gc + w * z.e, 0, 100)), w


def baselines(a, p):
    """Post hoc forecasts on the original temporal folds; the frozen predictions are untouched."""
    B = a.pivot(index='fips', columns='year', values='burden')
    ys = sorted(B.columns)
    rows = []
    for r in p[p.target_year.isin(C['evaluation_years'])].itertuples():
        u = r.acs_year
        base = {'fips': r.fips, 'name': r.name, 'state': r.fips[:2],
                'target_year': r.target_year, 'origin': r.origin, 'acs_year': u, 'y': r.y,
                'latest': r.latest, 'regime': 'temporal', 'experiment': 'all',
                'block': 'final test' if r.target_year in C['final_test_years']
                else 'development'}
        m3 = float(B.loc[r.fips, [y for y in ys if y <= u][-3:]].mean())
        pp, w = pool(a, r.fips, u)
        rows += [base | {'model': 'persistence', 'pred': r.latest, 'w': 1.0},
                 base | {'model': 'mean3', 'pred': m3, 'w': None},
                 base | {'model': 'pooled', 'pred': pp, 'w': w}]
    d = pd.DataFrame(rows)
    score = [{'model': m, 'block': k, 'n': len(x), 'mae': float((x.pred - x.y).abs().mean()),
              'rmse': float(np.sqrt(((x.pred - x.y) ** 2).mean()))}
             for (m, k), x in d.groupby(['model', 'block'])]
    return d, score, compare(d)


def run():
    """Write gap.json and baselines.csv from the committed processed data."""
    a, q = load()
    out = {'base_year': C['base_year'], 'z': Z, 'resamples': K, 'seed': C['seed'],
           'pooled': pooled(a), 'one_year': noise_short(a), 'periods': []}
    for y0, y1 in PERIODS:
        d = change(a, q, y0, y1)
        med = d[['b0', 'b1', 'db', 'rent_pct', 'inc_pct', 'jobs_pct', 'pay_pct']].median()
        out['periods'].append({
            'y0': y0, 'y1': y1, 'j1': int(d.j1.iloc[0]),
            'median': {k: float(v) for k, v in med.items()},
            'rent_outran_income': int((d.gap > 0).sum()),
            'noise': noise_long(d),
            'slopes': [{'x': x, 'y': y} | slope(d[x], d[y], C['seed'] + i)
                       for i, (x, y) in enumerate(SLOPES)],
            'counties': d.to_dict('records')})
    p = pd.read_csv(OUT / 'panel.csv', dtype={'fips': str}, float_precision='round_trip')
    d, score, paired = baselines(a, p)
    write(OUT / 'baselines.csv', d)
    out['baselines'] = {'score': score, 'paired': paired,
                        'note': 'Added after the original test was scored; see DECISIONS.md.'}
    write(OUT / 'gap.json', out)
    t = out['periods'][0]
    print(f"Median county {t['y0']}-{t['y1']}: rent {t['median']['rent_pct']:.1f}%, renter "
          f"income {t['median']['inc_pct']:.1f}%, share {t['median']['db']:+.1f} pp")
    for s in t['slopes']:
        print(f"  {s['y']} on {s['x']}: {s['per10']:.2f} per 10 [{s['lo']:.2f}, {s['hi']:.2f}]")
    print(pd.DataFrame(score).to_string(index=False))
    print('Wrote', (OUT / 'gap.json').relative_to(ROOT))


if __name__ == '__main__':
    run()
