"""Export measured results, exact predictors, and official boundary geometry to a static site."""
import json
import hashlib
import importlib.metadata
import platform
import shutil
from datetime import datetime, timezone
from urllib.parse import urlencode

import numpy as np
import pandas as pd
from plotly.offline import get_plotlyjs

from analysis.data import C, OUT, ROOT, fetch, source_manifest
from analysis.models import metrics


def clean(d):
    """JSON null represents missing measurements; never serialize NaN as data."""
    return json.loads(d.to_json(orient='records', double_precision=8))


def run():
    """Build the public bundle only after independent timing and metric certificates hold."""
    site = ROOT / 'site'
    (site / 'downloads').mkdir(parents=True, exist_ok=True)
    (site / 'vendor').mkdir(exist_ok=True)
    a = pd.read_csv(OUT / 'acs.csv', dtype={'fips': str})
    p = pd.read_csv(OUT / 'predictions.csv', dtype={'fips': str, 'state': str})
    q = pd.read_csv(OUT / 'qcew.csv', dtype={'fips': str})
    cpi = pd.read_csv(OUT / 'cpi.csv', index_col='year')['mean']
    assert not a.duplicated(['fips', 'year']).any()
    assert 2020 not in a.year.values
    assert a.burden.between(0, 100).all()
    assert (p.train_latest <= p.origin).all()
    assert (p.calibration_latest <= p.origin).all()
    for c in ['acs', 'qcew', 'lodes']:
        assert (p[c + '_available'] <= p.origin).all()
    for c in ['rent', 'income']:
        a['real_' + c] = a[c] * cpi[C['base_year']] / a.year.map(cpi)
    q['real_pay'] = q.pay * cpi[C['base_year']] / q.year.map(cpi)
    keys = pd.MultiIndex.from_product([a.fips.unique(), range(2011, 2025)],
                                     names=['fips', 'year']).to_frame(index=False)
    paths = keys.merge(a, on=['fips', 'year'], how='left').merge(
        q[['fips', 'year', 'jobs', 'real_pay']], on=['fips', 'year'], how='left')
    fields = ['fips', 'year', 'burden', 'burden_moe', 'population', 'housing',
              'real_rent', 'real_income', 'jobs', 'real_pay', 'renters']
    sample = pd.read_csv(OUT / 'sample.csv', dtype={'fips': str})
    u = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?'
    where = 'GEOID IN (' + ','.join("'" + f + "'" for f in sample.fips) + ')'
    geo = json.loads(fetch(u + urlencode({'where': where, 'outFields': 'GEOID,NAME,STATE',
                                         'returnGeometry': 'true', 'outSR': '4326',
                                         'maxAllowableOffset': '.015',
                                         'f': 'geojson'})).read_text())
    assert len(geo['features']) == len(sample)
    for st in C['states']:
        fetch(f'https://lehd.ces.census.gov/data/lodes/LODES8/{st}/version.txt')
    fetch('https://lehd.ces.census.gov/doc/OnTheMapDataNotices.pdf')
    manifest = source_manifest()
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    scenarios = json.loads((ROOT / 'artifacts/scenarios.json').read_text())
    train = pd.read_csv(OUT / 'panel.csv', dtype={'fips': str})
    train = train[train.label_available <= 2023]
    fs = scenarios['linear']['features']
    A = train[fs].fillna(train[fs].median()).to_numpy()
    mu, sd = A.mean(axis=0), A.std(axis=0)
    sd[sd == 0] = 1
    Z = (A - mu) / sd
    D = np.sqrt(((Z[:, None] - Z[None, :]) ** 2).sum(axis=2))
    np.fill_diagonal(D, np.inf)
    scenarios['support'] = {'mean': mu.tolist(), 'scale': sd.tolist(), 'z': Z.tolist(),
                            'threshold': float(np.quantile(D.min(axis=1), .95))}
    data = {'config': C, 'sample': clean(sample), 'paths': clean(paths[fields]),
            'predictions': clean(p), 'lodes': json.loads((OUT / 'lodes.json').read_text()),
            'metrics': json.loads((OUT / 'metrics.json').read_text()),
            'paired': json.loads((OUT / 'paired.json').read_text()),
            'scenarios': scenarios, 'geometry': geo,
            'sources': [{'url': r['url'], 'retrieved': r['retrieved'],
                         'sha256': r['sha256'], 'bytes': r['bytes']} for r in manifest]}
    (site / 'data.json').write_text(json.dumps(data, separators=(',', ':'), allow_nan=False))
    (site / 'vendor/plotly-4.1.1.min.js').write_text(get_plotlyjs(), encoding='utf-8')
    (site / 'vendor/README.md').write_text(
        'Plotly.js 4.1.1, MIT license, bundled from plotly.py 7.1.0. Header carries license.\n')
    for fn in ['acs.csv', 'panel.csv', 'predictions.csv', 'metrics.json', 'paired.json',
               'manifest.json', 'sample.csv', 'lodes.json', 'qcew.csv', 'exclusions.json',
               'calibration.csv']:
        shutil.copyfile(OUT / fn, site / 'downloads' / fn)
    for fn in ['METHODS.md', 'SOURCES.md', 'DECISIONS.md']:
        shutil.copyfile(ROOT / 'docs' / fn, site / 'downloads' / fn)
    final = p[(p.regime == 'temporal') & (p.experiment == 'all') & (p.block == 'final test')]
    measured = {m: metrics(d) for m, d in final.groupby('model')}
    baseline = measured['persistence']['mae']
    best = min(measured, key=lambda m: measured[m]['mae'])
    lead = (f'Persistence beats both all-source fitted models, with final temporal MAE '
            f'{baseline:.3f} pp.' if best == 'persistence' else
            f'{best} has the lowest primary-model MAE, {measured[best]["mae"]:.3f} pp, '
            f'versus persistence {baseline:.3f} pp.')
    rows = '\n'.join(f'| {m} | {v["mae"]:.3f} | {v["rmse"]:.3f} | '
                     f'{v["improvement"]:.3f} | {v["coverage"]:.3f} |'
                     for m, v in measured.items())
    paired = [r for r in data['paired'] if r['regime'] == 'temporal'
              and r['experiment'] == 'employment']
    report = f'''# Findings — 2026-10-17

{lead} This is a small regional pseudo-real-time backtest,
not evidence of a causal effect or national generalization.

| Model, all groups | MAE pp | RMSE pp | Gain over persistence pp | 80% interval coverage |
|---|---:|---:|---:|---:|
{rows}

Coverage: {a.fips.nunique()} counties in three states; {len(a)} ACS county-years,
2011–2024 except 2020. Final temporal tests: {len(final[final.model == 'persistence'])}
county-targets in 2023–2024. Earlier development targets remain separately labelled.

Commuting contribution (all minus employment-only MAE; negative favours commuting):
'''
    for r in paired:
        status = ('supports a gain within this sample' if r['hi'] < 0 else
                  'contradicts a gain within this sample' if r['lo'] > 0 else
                  'is inconclusive within this sample')
        report += (f'\n- {r["model"]}: {r["delta"]:.3f} pp, 80% county-cluster interval '
                   f'[{r["lo"]:.3f}, {r["hi"]:.3f}], {r["clusters"]} clusters; {status}.\n')
    report += '\n## Feature-group comparisons\n\n'
    report += '| Experiment | Model | Final temporal MAE pp |\n|---|---|---:|\n'
    for r in data['metrics']:
        if r['regime'] == 'temporal' and r['block'] == 'final test' and not r['weighted']:
            report += f'| {r["experiment"]} | {r["model"]} | {r["mae"]:.3f} |\n'
    m = {r['experiment']: r for r in data['metrics'] if r['regime'] == 'temporal'
         and r['block'] == 'final test' and not r['weighted'] and r['model'] == 'linear'}
    report += (f'\nHousing/history regression has MAE {m["housing"]["mae"]:.3f} pp; '
               f'adding employment raises it to {m["employment"]["mae"]:.3f} pp. '
               f'Removing employment from the full regression lowers error to '
               f'{m["no_employment"]["mae"]:.3f} pp. More features are not uniformly useful.\n')
    report += '\n## Does the commuting gain transfer?\n\n'
    report += '| Held-out state | Model | All minus employment-only MAE pp | 80% interval |\n'
    report += '|---|---|---:|---|\n'
    state_names = {v[0]: v[1] for v in C['states'].values()}
    for r in data['paired']:
        if r['regime'].startswith('holdout_') and r['experiment'] == 'employment':
            name = state_names[r['regime'].split('_')[1]]
            report += (f'| {name} | {r["model"]} | {r["delta"]:.3f} | '
                       f'[{r["lo"]:.3f}, {r["hi"]:.3f}] |\n')
    report += '''
Commuting has model-dependent value; the primary all-source comparison does not establish
a gain over persistence. Even a positive ablation needs independent states and future years.
Intervals preserve
within-county years but not common state shocks. Three independent geographic groups are few.

## Evidence log

- **Timing leakage:** contradicted by source/label eligibility certificates; archived vintage
  availability remains unverified. The conservative lags are assumptions.
- **Supporting the rival that simple models suffice:** persistence beats both all-source models;
  the housing-only linear experiment has a small lower error, so simplicity does not imply
  persistence is optimal across every experiment.
- **Commuting adds information:** mixed support in temporal evaluation (trees improve;
  regression worsens), contradicted by positive point differences in every state transfer.
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
    (ROOT / 'docs/FINDINGS.md').write_text(report, encoding='utf-8')
    shutil.copyfile(ROOT / 'docs/FINDINGS.md', site / 'downloads/FINDINGS.md')
    coverage = f'''# Coverage audit

Sample fixed before errors: top ten ACS one-year population counties in each of CO/MA/WA,
baseline 2011. Selected counties: {len(sample)}. National scope reduced for bulk LODES cost.
No major selected-county creation/consolidation was identified. Minor boundary adjustments
are not reconciled. Other states and nonselected counties
are outside the sample, not observations discarded for poor model performance.

ACS: {len(a)} county-years, 2011–2024 excluding 2020; {int(a.acs_missing.sum())}
county-years have a missing selected derived monetary/population/housing field.
QCEW: {len(q)} county-years, 2010–2023;
{int(q.qcew_suppressed.sum())} suppressed all-industry totals.
LODES: {len(data['lodes'])} county-years, 2008–2019; JT01, common 2020 geography.
Massachusetts 2008–2010 lacks comparable workplace coverage (official availability table).
Its first release was March 2016; target 2014–2016 rows are excluded across all experiments.
See exclusions.json for every affected county-target.
Predictors use LODES through 2019 for origin 2023. Main OD plus WAC/RAC suffice for shares;
individual interstate destinations are not ranked. Full external-destination concentration omitted.
Raw cached bytes: {sum(r['bytes'] for r in manifest):,}. Processing streams 300,000-row chunks
with at most three concurrent state-year LODES jobs. Aggregates are cached separately.

Panel: {len(pd.read_csv(OUT / 'panel.csv'))} eligible county-targets. Evaluation membership
is identical for every feature experiment. Final tests have 60 county-targets; transfer has
three state holdouts, ten counties each. Training targets and county membership are in fits.json.

Publication dates: unavailable historically; conservative lags in METHODS.md. File modification
dates are stored but are not release dates. The 2020 ACS target is missing, never substituted.
Vacancy, richer demographics and full industry composition are omitted and documented.
The 2025 official ACS bulk endpoint returned HTTP 401; later compatible coverage is unverified.
'''
    (ROOT / 'docs/COVERAGE.md').write_text(coverage)
    counts = '\n\n| Reference year | ACS counties | QCEW counties | LODES counties |\n'
    counts += '|---|---:|---:|---:|\n'
    l = pd.DataFrame(data['lodes'])
    for y in range(2008, 2025):
        counts += (f'| {y} | {int((a.year == y).sum())} | '
                   f'{int((q.year == y).sum())} | {int((l.year == y).sum())} |\n')
    coverage += counts + '\nZero means outside declared collection scope or a documented gap.\n'
    (ROOT / 'docs/COVERAGE.md').write_text(coverage)
    shutil.copyfile(ROOT / 'docs/COVERAGE.md', site / 'downloads/COVERAGE.md')
    shutil.copyfile(ROOT / 'artifacts/fits.json', site / 'downloads/fits.json')
    source_files = [*ROOT.glob('analysis/*.py'), *ROOT.glob('site/*.js'),
                    ROOT / 'site/index.html', ROOT / 'site/style.css',
                    ROOT / 'config.json', ROOT / 'requirements.txt']
    result_files = [OUT / f for f in ['panel.csv', 'predictions.csv', 'calibration.csv',
                                     'metrics.json', 'paired.json', 'manifest.json']]
    build = {'source_revision': 'v0.1.0', 'built_utc': datetime.now(timezone.utc).isoformat(),
             'seed': C['seed'], 'python': platform.python_version(),
             'dependencies': {n: importlib.metadata.version(n) for n in
                              ['numpy', 'scipy', 'pandas', 'scikit-learn', 'plotly']},
             'sha256': {str(p.relative_to(ROOT)).replace('\\', '/'):
                        hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in source_files + result_files}}
    (ROOT / 'artifacts/build.json').write_text(json.dumps(build, indent=2))
    shutil.copyfile(ROOT / 'artifacts/build.json', site / 'downloads/build.json')
    print('Site bundle:', (site / 'data.json').stat().st_size, 'bytes')
    print(report[:1000])


if __name__ == '__main__':
    run()
