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

from analysis.data import OUT, ROOT, C, write
from analysis.models import metrics

SITE = ROOT / C['paths']['site']
DOWNLOADS = ['acs.csv', 'panel.csv', 'predictions.csv', 'metrics.json', 'paired.json',
             'gap.json', 'baselines.csv', 'comparison.json',
             'manifest.json', 'sample.csv', 'lodes.json', 'qcew.csv', 'exclusions.json',
             'calibration.csv']
STATE = {v[0]: v[1] for v in C['states'].values()}
LABEL = {'persistence': 'Carry the last published value forward',
         'linear': 'Regression on housing, jobs and commuting',
         'trees': 'Boosted trees on the same inputs',
         'mean3': 'Average of the last three published years (added later)',
         'pooled': 'Partial pooling across counties (added later)'}
INPUTS = {'core': 'Past share only', 'housing': '+ rent, income, housing stock',
          'employment': '+ jobs and pay', 'all': '+ commuting (everything)',
          'no_housing': 'Everything except housing', 'no_employment': 'Everything except jobs'}
KEEP = ['fips', 'state', 'target_year', 'regime', 'experiment', 'model', 'block', 'pred', 'y',
        'latest', 'lo', 'hi']


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


def verdict(r):
    """Read an 80% paired interval for (all − base) MAE; negative favours the added group."""
    return ('show a gain' if r['hi'] < 0 else 'show a loss' if r['lo'] > 0
            else 'do not resolve either way') + ' within this sample'


def pct(x):
    """Signed one-decimal percent."""
    return f'{round(x, 1) or 0.0:+.1f}%'


def rng(s):
    """80% bootstrap range of a slope."""
    return f'{s["lo"]:.1f} to {s["hi"]:.1f}'


def findings(final, metric_rows, paired_rows, g):
    """Findings report; every number is read from gap.json or the exported forecasts."""
    P = {(p['y0'], p['y1']): p for p in g['periods']}
    t, e = P[(2011, 2024)], P[(2011, 2019)]
    md, nz = t['median'], t['noise']
    sl = {(s['x'], s['y']): s for s in t['slopes']}
    se = {(s['x'], s['y']): s for s in e['slopes']}
    pool = {r['year']: r for r in g['pooled']}
    p0, p9, p1 = pool[2011], pool[2019], pool[2024]
    m01 = float(np.hypot(p0['moe'], p1['moe']))
    rows = sorted(t['counties'], key=lambda c: -c['db'])
    moved = [c for c in rows if c['verdict'] != 'within noise']
    county = '\n'.join(
        f"| {c['name']} | {c['b0']:.1f}% | {c['b1']:.1f}% | {c['db']:+.1f} ± {c['m_db']:.1f} | "
        f"{pct(c['rent_pct'])} | {pct(c['inc_pct'])} | {pct(c['jobs_pct'])} |" for c in moved)
    every = '\n'.join(
        f"| {c['name']} | {c['b0']:.1f}% | {c['b1']:.1f}% | {c['db']:+.1f} ± {c['m_db']:.1f} | "
        f"{c['verdict']} | {pct(c['rent_pct'])} | {pct(c['inc_pct'])} | {c['gap']:+.1f} | "
        f"{pct(c['jobs_pct'])} | {pct(c['pay_pct'])} |" for c in rows)
    up = [c['name'].split(' County')[0] for c in moved if c['verdict'] == 'up']
    dn = [c['name'].split(' County')[0] for c in moved if c['verdict'] == 'down']
    gu = [c['gap'] for c in moved if c['verdict'] == 'up']
    o = g['one_year']

    measured = {m: metrics(d) for m, d in final.groupby('model')}
    base = measured['persistence']['mae']
    bs = {(r['model'], r['block']): r for r in g['baselines']['score']}
    bp = {(r['model'], r['block']): r for r in g['baselines']['paired']}
    dev = {r['model']: r for r in metric_rows if r['regime'] == 'temporal'
           and r['experiment'] == 'all' and r['block'] == 'development' and not r['weighted']}
    score = sorted([(LABEL[m], v['mae'], v['rmse'], dev[m]['mae']) for m, v in measured.items()]
                   + [(LABEL[m], bs[(m, 'final test')]['mae'], bs[(m, 'final test')]['rmse'],
                       bs[(m, 'development')]['mae']) for m in ['mean3', 'pooled']],
                   key=lambda r: r[1])
    board = '\n'.join(f'| {n} | {f:.2f} | {r:.2f} | {d:.2f} |' for n, f, r, d in score)
    m3d, m3f = bp[('mean3', 'development')], bp[('mean3', 'final test')]
    pof = bp[('pooled', 'final test')]

    final_rows = [r for r in metric_rows if r['regime'] == 'temporal'
                  and r['block'] == 'final test' and not r['weighted']]
    groups = '\n'.join(f'| {INPUTS[r["experiment"]]} | {LABEL[r["model"]]} | {r["mae"]:.2f} |'
                       for r in sorted((r for r in final_rows if r['model'] != 'persistence'),
                                       key=lambda r: (r['model'],
                                                      list(INPUTS).index(r['experiment']))))
    lin = {r['experiment']: r['mae'] for r in final_rows if r['model'] == 'linear'}
    commuting = {r['model']: r for r in paired_rows
                 if r['regime'] == 'temporal' and r['experiment'] == 'employment'}
    transfer = [r for r in paired_rows
                if r['regime'].startswith('holdout_') and r['experiment'] == 'employment']
    temporal = '\n'.join(
        f'- {LABEL[m]}: {r["delta"]:+.2f} points (80% range {r["lo"]:+.2f} to {r["hi"]:+.2f}, '
        f'{r["clusters"]} counties); the data {verdict(r)}.' for m, r in commuting.items())
    holdouts = '\n'.join(f'| {STATE[r["regime"].split("_")[1]]} | {LABEL[r["model"]]} | '
                         f'{r["delta"]:+.2f} | {r["lo"]:+.2f} to {r["hi"]:+.2f} |'
                         for r in transfer)
    worse = sum(r['delta'] > 0 for r in transfer)
    sure = sum(r['lo'] > 0 for r in transfer)
    cell = lambda s, u: f'{s["per10"]:+.1f}{u} ({rng(s)})'
    jobs = '\n'.join(f'| {n} | {cell(sl[("jobs_pct", k)], u)} | {cell(se[("jobs_pct", k)], u)} |'
                     for n, k, u in [('Rent', 'rent_pct', '%'), ('Renter income', 'inc_pct', '%'),
                                     ('Share stretched, points', 'db', '')])
    return f'''# Findings

Thirty counties: the ten most populous in each of Colorado, Massachusetts and Washington.
"Stretched" means a renter household pays 30% or more of its income on rent and utilities.
Dollar figures are adjusted for inflation to {g['base_year']} dollars. Ranges are 80% county
bootstrap ranges unless they are called survey margins, which are Census 90% margins.

## 1. Half of renters are stretched, and the share is where it was in 2011

{p0['b']:.1f}% of renter households were stretched in 2011 and {p1['b']:.1f}% in 2024. The
difference, {p1['b'] - p0['b']:+.1f} points, is inside the survey margin of ±{m01:.1f}. The
share did move in between: it fell to {p9['b']:.1f}% in 2019 and rose after the pandemic.

In the median county, rent rose {md['rent_pct']:.1f}% and the median renter household's
income rose {md['inc_pct']:.1f}%. Rent grew faster than renter income in
{t['rent_outran_income']} of the 30 counties.

## 2. Where the share changed by more than the survey can miss

The share rose by more than its survey margin in {len(up)} counties ({', '.join(up)}) and fell
by more than its margin in {len(dn)} ({', '.join(dn)}). In the other {nz['within']} counties the
2011–2024 change is within the margin, so it could be sampling error.

| County | 2011 | 2024 | Change, points ± margin | Rent | Renter income | Jobs, 2011–{t['j1']} |
|---|---:|---:|---:|---:|---:|---:|
{county}

Where the share rose, rent outgrew renter income by {min(gu):.0f} to {max(gu):.0f} log points.
Where it fell, renter income outgrew rent.

## 3. The share follows rent relative to income

Each 10 points by which rent outgrew renter income came with a
{sl[('gap', 'db')]['per10']:.1f}-point rise in the share stretched (range
{rng(sl[('gap', 'db')])}; correlation {sl[('gap', 'db')]['r']:.2f}). That is close to
arithmetic, since the share is set by rent against income. What it adds is which side moved:
the counties that improved are the ones where renter incomes outran rent. Real rent rose in
{sum(c['rent_pct'] > 0 for c in rows)} of the 30 counties.

Median renter income measures whoever rents in a given year. It rose faster than average pay
at the county's workplaces ({md['pay_pct']:.1f}% in the median county, 2011–{t['j1']}),
which suggests the mix of renters shifted toward higher earners. This study cannot separate
raises from a change in who rents.

## 4. Job growth raised rent about twice as fast as renter income

| Per 10% more jobs | 2011–2024 | 2011–2019 |
|---|---:|---:|
{jobs}

Jobs are counted at workplaces, through {t['j1']} and {e['j1']}. Before the pandemic, counties
that added jobs faster saw the share stretched rise: {se[('jobs_pct', 'db')]['per10']:+.1f}
points per 10% more jobs. Over the full period the estimate is
{sl[('jobs_pct', 'db')]['per10']:+.1f} and its range includes zero, so it does not resolve.
These are associations across 30 counties, not causes: jobs, rent and income all move with
things this study does not measure, such as who moves in.

## 5. Next year's share cannot be forecast, because the survey is too noisy

The share comes from a sample survey. Across {o['n']} one-year changes, a county's share moved
by {o['rms_change']:.1f} points in a typical year (root mean square). Sampling error alone
would move it by {o['rms_noise']:.1f}. Year-to-year movement in one county is no larger than
survey noise, so no forecast can follow it. Over 13 years the picture is better: about
{100 * nz['real_share']:.0f}% of the spread in counties' 2011–2024 changes is real.

The original study forecast each county's share one year ahead, using only figures that had
been published at the time, and kept 2023–2024 aside as the final test (60 county-years).
Error is the average miss in percentage points; smaller is better.

| Forecast | Final test 2023–2024 | Large misses (RMSE) | Earlier years 2017–2022 |
|---|---:|---:|---:|
{board}

Carrying the last value forward missed by {base:.2f} points and neither fitted model beat it.
Two forecasts that average out survey noise were added after the final test had been scored,
so they are labelled as added later and kept apart from the original results. In 2017–2022
the three-year average beat carrying forward by {-m3d['delta_mae']:.2f} points (range
{-m3d['hi']:.2f} to {-m3d['lo']:.2f}). In the final test neither did: the three-year average
differs by {m3f['delta_mae']:+.2f} (range {m3f['lo']:+.2f} to {m3f['hi']:+.2f}) and partial
pooling by {pof['delta_mae']:+.2f} ({pof['lo']:+.2f} to {pof['hi']:+.2f}). The pooling
model put no weight on any county's latest deviation from its usual level: it judged all of
it to be survey noise.

### Did commuting data help?

Commuting adds where workers live and work. Below, the error with commuting minus the error
without it; a negative number means commuting helped.

{temporal}

When one state was left out of fitting and forecast from the other two, commuting raised the
average miss in {worse} of {len(transfer)} cases; in {sure} the whole 80% range is above zero.

| State left out | Forecast | With minus without commuting | Range |
|---|---|---:|---|
{holdouts}

### Which inputs helped the regression?

| Inputs | Forecast | Final-test error |
|---|---|---:|
{groups}

Rent, income and housing alone gave the regression an error of {lin['housing']:.2f}, against
{base:.2f} for carrying forward. Adding jobs raised it to {lin['employment']:.2f}.

## Every county, 2011–2024

Rent and income are medians; the gap is rent growth minus income growth in log points.
Jobs and pay are counted at workplaces, 2011–{t['j1']}.

| County | 2011 | 2024 | Change ± margin | Verdict | Rent | Renter income | Gap | Jobs | Pay |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
{every}

## What this does not show

- It covers 30 large counties in three states, chosen by 2011 population before any results
  were seen. It says nothing about the United States as a whole.
- It describes associations, not causes. It does not show that job growth raises rent.
- Publication delays are assumed (survey one year, workplace jobs two, commuting four), and
  today's revised files stand in for what forecasters saw at the time.
- Only two final-test years and three states exist, so the ranges above are wide, and the
  county ranges do not capture shocks shared by a whole state.
- The survey has no 2020 one-year estimates; that year is left out, never filled in.
- The derived margins ignore correlations between survey categories that the Census does
  not publish.

More states, archived releases and later years could change these conclusions. Definitions
are in METHODS.md, exclusions in COVERAGE.md, checks in VALIDATION.md.
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

    manifest = load('manifest.json')
    g = load('gap.json')
    b = pd.read_csv(OUT / 'baselines.csv', dtype={'fips': str, 'state': str})
    forecasts = pd.concat([p[p.experiment == 'all'][KEEP],
                           b[b.model != 'persistence'].reindex(columns=KEEP)])
    flows = [{k: r[k] for k in ['fips', 'year', 'inbound', 'outbound', 'retention',
                                'work_jobs', 'resident_jobs']} for r in lodes]
    data = {'config': {k: C[k] for k in ['states', 'base_year', 'final_test_years',
                                         'evaluation_years']},
            'labels': LABEL, 'inputs': INPUTS, 'sample': clean(sample),
            'paths': clean(paths[fields]), 'gap': g, 'forecasts': clean(forecasts),
            'flows': flows, 'metrics': metric_rows, 'paired': paired_rows,
            'comparison': load('comparison.json')['comparisons'],
            'geometry': load('counties.geojson'),
            'sources': [{k: r[k] for k in ['url', 'retrieved', 'sha256', 'bytes']}
                        for r in manifest]}
    write(SITE / 'data.json', json.dumps(data, separators=(',', ':'), allow_nan=False))
    js = get_plotlyjs()
    if 'plotly.js v4.1.1' in js[:200]:
        write(SITE / 'vendor/plotly-4.1.1.min.js', js)
    else:
        print('Installed plotly does not bundle plotly.js 4.1.1; vendored copy left unchanged.')
    write(SITE / 'vendor/README.md',
          'Plotly.js 4.1.1, MIT license, bundled from plotly.py 7.1.0. Header carries license.\n')

    final = p[(p.regime == 'temporal') & (p.experiment == 'all') & (p.block == 'final test')]
    write(ROOT / 'docs/FINDINGS.md', findings(final, metric_rows, paired_rows, g))
    write(ROOT / 'docs/COVERAGE.md', coverage(a, q, pd.DataFrame(lodes), sample, panel, final,
                                              manifest))
    for f in DOWNLOADS:
        shutil.copyfile(OUT / f, SITE / 'downloads' / f)
    for f in ['METHODS.md', 'SOURCES.md', 'DECISIONS.md', 'FINDINGS.md', 'COVERAGE.md']:
        shutil.copyfile(ROOT / 'docs' / f, SITE / 'downloads' / f)

    sources = sorted([*ROOT.glob('analysis/*.py'), *SITE.glob('*.js'), SITE / 'index.html',
                      SITE / 'style.css', ROOT / 'config.json', ROOT / 'requirements.txt'])
    results = [OUT / f for f in ['panel.csv', 'predictions.csv', 'calibration.csv',
                                 'metrics.json', 'paired.json', 'manifest.json', 'gap.json',
                                 'baselines.csv']]
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
