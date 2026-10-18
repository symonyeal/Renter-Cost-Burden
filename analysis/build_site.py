"""Export measured results and exact predictors to the static site; generate the reports."""
import hashlib
import importlib.metadata
import json
import platform
import shutil
from datetime import UTC, datetime

import numpy as np
import pandas as pd
from plotly.offline import get_plotlyjs

from analysis.data import OUT, ROOT, C, source_manifest, write
from analysis.models import metrics

SITE = ROOT / C['paths']['site']
DOWNLOADS = ['acs.csv', 'panel.csv', 'predictions.csv', 'metrics.json', 'paired.json',
             'manifest.json', 'sample.csv', 'lodes.json', 'qcew.csv', 'exclusions.json',
             'calibration.csv']
STATE = {v[0]: v[1] for v in C['states'].values()}


def clean(d):
    """JSON null represents missing measurements; never serialize NaN as data."""
    return json.loads(d.to_json(orient='records', double_precision=8))


def certify(a, p):
    """Independent timing certificates: every source, label and calibration year ≤ origin."""
    assert not a.duplicated(['fips', 'year']).any()
    assert 2020 not in a.year.values
    assert a.burden.between(0, 100).all()
    for c in ['train_latest', 'calibration_latest', 'acs_available', 'qcew_available',
              'lodes_available']:
        assert (p[c] <= p.origin).all(), c


def support(fs, train):
    """Nearest-neighbour support heuristic: threshold is the 95th percentile of NN distances."""
    A = train[fs].fillna(train[fs].median()).to_numpy()
    mu, sd = A.mean(axis=0), A.std(axis=0)
    sd[sd == 0] = 1
    Z = (A - mu) / sd
    D = np.sqrt(((Z[:, None] - Z[None, :]) ** 2).sum(axis=2))
    np.fill_diagonal(D, np.inf)
    return {'mean': mu.tolist(), 'scale': sd.tolist(), 'z': Z.tolist(),
            'impute': train[fs].median().tolist(),
            'threshold': float(np.quantile(D.min(axis=1), .95))}


def verdict(r):
    """Read an 80% paired interval for (all − base) MAE; negative favours the added group."""
    return ('supports a gain' if r['hi'] < 0 else 'contradicts a gain' if r['lo'] > 0
            else 'is inconclusive') + ' within this sample'


def findings(final, metric_rows, paired_rows, a):
    """Findings report; every comparative sentence is read from the exported results."""
    measured = {m: metrics(d) for m, d in final.groupby('model')}
    base = measured['persistence']['mae']
    best = min(measured, key=lambda m: measured[m]['mae'])
    lead = (f'Persistence beats both all-source fitted models, with final temporal MAE '
            f'{base:.3f} pp.' if best == 'persistence' else
            f'{best} has the lowest primary-model MAE, {measured[best]["mae"]:.3f} pp, '
            f'versus persistence {base:.3f} pp.')
    table = '\n'.join(f'| {m} | {v["mae"]:.3f} | {v["rmse"]:.3f} | {v["improvement"]:.3f} | '
                      f'{v["coverage"]:.3f} |' for m, v in measured.items())
    final_rows = [r for r in metric_rows if r['regime'] == 'temporal'
                  and r['block'] == 'final test' and not r['weighted']]
    groups = '\n'.join(f'| {r["experiment"]} | {r["model"]} | {r["mae"]:.3f} |'
                       for r in final_rows)
    lin = {r['experiment']: r['mae'] for r in final_rows if r['model'] == 'linear'}
    commuting = {r['model']: r for r in paired_rows
                 if r['regime'] == 'temporal' and r['experiment'] == 'employment'}
    transfer = [r for r in paired_rows
                if r['regime'].startswith('holdout_') and r['experiment'] == 'employment']
    temporal = '\n'.join(f'- {m}: {r["delta"]:.3f} pp, 80% county-cluster interval '
                         f'[{r["lo"]:.3f}, {r["hi"]:.3f}], {r["clusters"]} clusters; '
                         f'{verdict(r)}.' for m, r in commuting.items())
    holdouts = '\n'.join(f'| {STATE[r["regime"].split("_")[1]]} | {r["model"]} | '
                         f'{r["delta"]:.3f} | [{r["lo"]:.3f}, {r["hi"]:.3f}] |'
                         for r in transfer)
    more = 'raises' if lin['employment'] > lin['housing'] else 'lowers'
    less = 'lowers' if lin['no_employment'] < lin['all'] else 'raises'
    signs = ', '.join(f"{'improves' if r['delta'] < 0 else 'worsens'} {m}"
                      for m, r in commuting.items())
    positive = sum(r['delta'] > 0 for r in transfer)
    simple = ('persistence beats both all-source models' if best == 'persistence'
              else f'{best} beats persistence')
    housing = 'lower' if lin['housing'] < base else 'higher'
    return f'''# Findings

{lead} This is a small regional pseudo-real-time backtest,
not evidence of a causal effect or national generalization.

| Model, all groups | MAE pp | RMSE pp | Gain over persistence pp | 80% interval coverage |
|---|---:|---:|---:|---:|
{table}

Coverage: {a.fips.nunique()} counties in three states; {len(a)} ACS county-years,
2011–2024 except 2020. Final temporal tests: {len(final[final.model == 'persistence'])}
county-targets in 2023–2024. Earlier development targets remain separately labelled.

Commuting contribution (all minus employment-only MAE; negative favours commuting):

{temporal}

## Feature-group comparisons

| Experiment | Model | Final temporal MAE pp |
|---|---|---:|
{groups}

Housing/history regression has MAE {lin['housing']:.3f} pp; adding employment {more} it to
{lin['employment']:.3f} pp. Removing employment from the full regression {less} error to
{lin['no_employment']:.3f} pp.

## Does the commuting gain transfer?

| Held-out state | Model | All minus employment-only MAE pp | 80% interval |
|---|---|---:|---|
{holdouts}

Intervals preserve within-county years but not common state shocks. Three independent
geographic groups are few; even a positive ablation needs independent states and future years.

## Evidence log

- **Timing leakage:** contradicted by source/label eligibility certificates; archived vintage
  availability remains unverified. The conservative lags are assumptions.
- **Simple models suffice:** {simple}.
  The housing-only linear experiment has {housing} error ({lin['housing']:.3f} pp)
  than persistence ({base:.3f} pp).
- **Commuting adds information:** in temporal evaluation, commuting {signs}.
  {positive} of {len(transfer)} state transfers have a positive (unfavourable) point difference.
- **Income/composition explains growth:** ablations test predictive substitution; population
  alone cannot remove demographic composition confounding. Causal explanation inconclusive.
- **Pandemic dependence, inconclusive:** development and geographic filters expose sensitivity;
  final two-year block cannot establish stability across regimes.
- **Measurement uncertainty:** published category margins are retained. Derived sampling margins
  ignore covariance; small gains should not be interpreted as precise changes in latent burden.

What would change the conclusion: a larger preregistered national sample, archived release
vintages, reliable cross-state destination rankings, and repeated gains in future target years.
Full definitions and exclusions are in METHODS.md and COVERAGE.md.
'''


def coverage(a, q, lodes, sample, panel, final, manifest):
    """Coverage audit with per-source county counts by reference year."""
    counts = '\n'.join(f'| {y} | {int((a.year == y).sum())} | {int((q.year == y).sum())} | '
                       f'{int((lodes.year == y).sum())} |' for y in range(2008, 2025))
    return f'''# Coverage audit

Sample fixed before errors: top {C['counties_per_state']} ACS one-year population counties in
each of CO/MA/WA, baseline {C['sample_year']}. Selected counties: {len(sample)}. National scope
reduced for bulk LODES cost. No major selected-county creation/consolidation was identified.
Minor boundary adjustments are not reconciled. Other states and nonselected counties are
outside the sample, not observations discarded for poor model performance.

ACS: {len(a)} county-years, 2011–2024 excluding 2020; {int(a.acs_missing.sum())}
county-years have a missing selected derived monetary/population/housing field.
QCEW: {len(q)} county-years, 2010–2023;
{int(q.qcew_suppressed.sum())} suppressed all-industry totals.
LODES: {len(lodes)} county-years, 2008–2019; JT01, common 2020 geography.
Massachusetts 2008–2010 lacks comparable workplace coverage (official availability table).
Its first release was March 2016; target 2014–2016 rows are excluded across all experiments.
See exclusions.json for every affected county-target.
Predictors use LODES through 2019 for origin 2023. Main OD plus WAC/RAC suffice for shares;
individual interstate destinations are not ranked. Full external-destination concentration omitted.
Raw cached bytes: {sum(r['bytes'] for r in manifest):,}. Processing streams 300,000-row chunks
with at most three concurrent state-year LODES jobs. Aggregates are cached in data/interim.

Panel: {len(panel)} eligible county-targets. Evaluation membership is identical for every
feature experiment. Final tests have {len(final[final.model == 'persistence'])} county-targets;
transfer has {len(C['states'])} state holdouts, {C['counties_per_state']} counties each.
Training targets and county membership are in fits.json.

Publication dates: unavailable historically; conservative lags in METHODS.md. File modification
dates are stored but are not release dates. The 2020 ACS target is missing, never substituted.
Vacancy, richer demographics and full industry composition are omitted and documented.
The 2025 official ACS bulk endpoint returned HTTP 401; later compatible coverage is unverified.

| Reference year | ACS counties | QCEW counties | LODES counties |
|---|---:|---:|---:|
{counts}

Zero means outside declared collection scope or a documented gap.
'''


def run():
    """Build the public bundle only after the timing certificates hold."""
    (SITE / 'downloads').mkdir(parents=True, exist_ok=True)
    (SITE / 'vendor').mkdir(exist_ok=True)
    a = pd.read_csv(OUT / 'acs.csv', dtype={'fips': str})
    p = pd.read_csv(OUT / 'predictions.csv', dtype={'fips': str, 'state': str})
    q = pd.read_csv(OUT / 'qcew.csv', dtype={'fips': str})
    panel = pd.read_csv(OUT / 'panel.csv', dtype={'fips': str})
    sample = pd.read_csv(OUT / 'sample.csv', dtype={'fips': str})
    cpi = pd.read_csv(OUT / 'cpi.csv', index_col='year')['mean']
    load = lambda f: json.loads((OUT / f).read_text())
    lodes, metric_rows, paired_rows = load('lodes.json'), load('metrics.json'), load('paired.json')
    certify(a, p)

    s = cpi[C['base_year']]
    for c in ['rent', 'income']:
        a['real_' + c] = a[c] * s / a.year.map(cpi)
    q['real_pay'] = q.pay * s / q.year.map(cpi)
    keys = pd.MultiIndex.from_product([a.fips.unique(), range(2011, 2025)],
                                      names=['fips', 'year']).to_frame(index=False)
    paths = keys.merge(a, on=['fips', 'year'], how='left').merge(
        q[['fips', 'year', 'jobs', 'real_pay']], on=['fips', 'year'], how='left')
    fields = ['fips', 'year', 'burden', 'burden_moe', 'population', 'housing',
              'real_rent', 'real_income', 'jobs', 'real_pay', 'renters']

    manifest = source_manifest()
    scenarios = json.loads((ROOT / 'artifacts/scenarios.json').read_text())
    y = C['evaluation_years'][-1]
    scenarios['support'] = support(scenarios['linear']['features'],
                                   panel[panel.label_available <= y - 1])
    data = {'config': C, 'sample': clean(sample), 'paths': clean(paths[fields]),
            'predictions': clean(p), 'lodes': lodes, 'metrics': metric_rows,
            'paired': paired_rows, 'scenarios': scenarios,
            'geometry': load('counties.geojson'),
            'sources': [{k: r[k] for k in ['url', 'retrieved', 'sha256', 'bytes']}
                        for r in manifest]}
    write(SITE / 'data.json', json.dumps(data, separators=(',', ':'), allow_nan=False))
    write(SITE / 'vendor/plotly-4.1.1.min.js', get_plotlyjs())
    write(SITE / 'vendor/README.md',
          'Plotly.js 4.1.1, MIT license, bundled from plotly.py 7.1.0. Header carries license.\n')

    final = p[(p.regime == 'temporal') & (p.experiment == 'all') & (p.block == 'final test')]
    write(ROOT / 'docs/FINDINGS.md', findings(final, metric_rows, paired_rows, a))
    write(ROOT / 'docs/COVERAGE.md', coverage(a, q, pd.DataFrame(lodes), sample, panel, final,
                                              manifest))
    for f in DOWNLOADS:
        shutil.copyfile(OUT / f, SITE / 'downloads' / f)
    for f in ['METHODS.md', 'SOURCES.md', 'DECISIONS.md', 'FINDINGS.md', 'COVERAGE.md']:
        shutil.copyfile(ROOT / 'docs' / f, SITE / 'downloads' / f)

    sources = sorted([*ROOT.glob('analysis/*.py'), *SITE.glob('*.js'), SITE / 'index.html',
                      SITE / 'style.css', ROOT / 'config.json', ROOT / 'requirements.txt'])
    results = [OUT / f for f in ['panel.csv', 'predictions.csv', 'calibration.csv',
                                 'metrics.json', 'paired.json', 'manifest.json']]
    build = {'source_revision': 'v0.1.0', 'built_utc': datetime.now(UTC).isoformat(),
             'seed': C['seed'], 'python': platform.python_version(),
             'dependencies': {n: importlib.metadata.version(n) for n in
                              ['numpy', 'scipy', 'pandas', 'scikit-learn', 'plotly']},
             'sha256': {f.relative_to(ROOT).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest()
                        for f in sources + results}}
    write(ROOT / 'artifacts/build.json', build)
    shutil.copyfile(ROOT / 'artifacts/fits.json', SITE / 'downloads/fits.json')
    shutil.copyfile(ROOT / 'artifacts/build.json', SITE / 'downloads/build.json')
    print('Site bundle:', (SITE / 'data.json').stat().st_size, 'bytes')


if __name__ == '__main__':
    run()
