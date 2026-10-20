"""Independent source, timing, evaluation and exported-model certificates."""
import csv
import gzip
import json

import numpy as np
import pandas as pd
import pytest

from analysis.data import OUT, RAW, ROOT, C
from analysis.models import growth


def test_growth_over_gap():
    assert np.isclose(growth(121, 100, 2), 10)


def test_published_categories():
    a = pd.read_csv(OUT / 'acs.csv', dtype={'fips': str})
    assert not a.duplicated(['fips', 'year']).any()
    assert set(a.year) == set(range(2011, 2025)) - {2020}
    assert len(a) == 390
    assert a.burden.between(0, 100).all()
    assert (a.burden_denominator > 0).all()
    assert np.allclose(a.burden, 100 * a.burden_numerator / a.burden_denominator)
    assert np.allclose(a[[f'B25070_{k:03}' for k in range(2, 12)]].sum(axis=1),
                       a.B25070_001)


@pytest.mark.skipif(not RAW.exists(), reason='Official raw cache is outside version control')
def test_official_source_spot_checks():
    a = pd.read_csv(OUT / 'acs.csv', dtype={'fips': str})
    manifests = [json.loads(p.read_text()) for p in RAW.glob('*.json')]
    m = next(r for r in manifests if '/2023/' in r['url'] and 'b25070.dat' in r['url'])
    with (RAW / m['cache']).open() as stream:
        source = {r['GEO_ID'][-5:]: r for r in csv.DictReader(stream, delimiter='|')
                  if r['GEO_ID'].startswith('0500000US')}
    for f in ['53033', '08031', '25025']:
        r = source[f]
        n = sum(int(r[f'B25070_E{k:03}']) for k in range(7, 11))
        den = int(r['B25070_E001']) - int(r['B25070_E011'])
        measured = a[(a.fips == f) & (a.year == 2023)].iloc[0]
        assert np.isclose(measured.burden, 100 * n / den)
    q = pd.read_csv(OUT / 'qcew.csv', dtype={'fips': str})
    m = next(r for r in manifests if '/2023/a/area/53033.csv' in r['url'])
    with (RAW / m['cache']).open() as stream:
        r = next(r for r in csv.DictReader(stream)
                 if r['own_code'] == '0' and r['industry_code'] == '10')
    z = q[(q.fips == '53033') & (q.year == 2023)].iloc[0]
    assert z.jobs == int(r['annual_avg_emplvl'])
    assert z.pay == int(r['avg_annual_pay'])
    rows = json.loads((OUT / 'lodes.json').read_text())
    z = next(r for r in rows if r['fips'] == '08031' and r['year'] == 2011)
    m = next(r for r in manifests if r['url'].endswith('co_wac_S000_JT01_2011.csv.gz'))
    with gzip.open(RAW / m['cache'], 'rt') as stream:
        total = sum(int(r['C000']) for r in csv.DictReader(stream))
    assert total == z['wac_total']
    m = next(r for r in manifests if r['url'].endswith('co_od_main_JT01_2011.csv.gz'))
    total, internal = 0, 0
    with gzip.open(RAW / m['cache'], 'rt') as stream:
        for r in csv.DictReader(stream):
            n = int(r['S000'])
            total += n
            if r['w_geocode'][:5] == r['h_geocode'][:5] == '08031':
                internal += n
    assert total == z['main_total']
    assert internal == z['internal']


def test_timing_and_geographic_certificates():
    p = pd.read_csv(OUT / 'predictions.csv', dtype={'fips': str, 'state': str})
    for c in ['acs_available', 'qcew_available', 'lodes_available',
              'train_latest', 'calibration_latest']:
        assert (p[c] <= p.origin).all()
    assert np.allclose(p.target_year, p.origin + 1)
    assert p.pred.between(0, 100).all()
    assert np.allclose(p[p.model == 'persistence'].pred,
                       p[p.model == 'persistence'].latest)
    assert not p.duplicated(['regime', 'experiment', 'model', 'target_year', 'fips']).any()
    fits = json.loads((ROOT / 'artifacts/fits.json').read_text())
    for fit in fits:
        origin = fit['target_year'] - 1
        assert max(fit['train_targets']) + 1 <= origin
        assert fit['tuning_target'] + 1 <= origin
        if fit['tuning_train_targets']:
            assert max(fit['tuning_train_targets']) + 1 <= fit['tuning_origin']
        if fit['regime'].startswith('holdout_'):
            state = fit['regime'].split('_')[1]
            assert all(not f.startswith(state) for f in fit['train_counties'])
        if fit['experiment'] == 'employment':
            assert not set(C['groups']['commuting']) & set(fit['features'])
    for _, d in p[p.model != 'persistence'].groupby(['regime', 'model']):
        sets = [set(zip(x.fips, x.target_year, strict=False)) for _, x in d.groupby('experiment')]
        assert all(s == sets[0] for s in sets)
    assert (p[p.lo.notna()].calibration_n >= 30).all()


def test_metrics_reconstruct():
    p = pd.read_csv(OUT / 'predictions.csv')
    m = json.loads((OUT / 'metrics.json').read_text())
    for r in m:
        d = p[(p.regime == r['regime']) & (p.experiment == r['experiment'])
              & (p.model == r['model']) & (p.block == r['block'])]
        w = d.weight if r['weighted'] else np.ones(len(d))
        assert r['n'] == len(d)
        assert np.isclose(r['mae'], np.average(abs(d.pred - d.y), weights=w))
        assert np.isclose(r['rmse'], np.sqrt(np.average((d.pred - d.y) ** 2, weights=w)))
        assert np.isclose(r['improvement'],
                          np.average(abs(d.latest - d.y) - abs(d.pred - d.y), weights=w))


def test_lodes_totals_and_cross_state_accounting():
    rows = json.loads((OUT / 'lodes.json').read_text())
    assert len({(r['fips'], r['year']) for r in rows}) == len(rows)
    for r in rows:
        assert 0 <= r['internal'] <= min(r['work_jobs'], r['resident_jobs'])
        assert np.isclose(r['outbound'] + r['retention'], 1)
        assert np.isclose(1 - r['internal'] / r['work_jobs'], r['inbound'])
        assert 0 <= r['in_state'] <= r['work_jobs']
        assert 0 <= r['out_state'] <= r['resident_jobs']
        assert r['main_total'] <= r['wac_total'] + 1


def test_penalized_least_squares_stationarity():
    s = json.loads((ROOT / 'artifacts/final_model.json').read_text())['linear']
    fits = json.loads((ROOT / 'artifacts/fits.json').read_text())
    fit = next(r for r in fits if r['regime'] == 'temporal' and r['model'] == 'linear'
               and r['experiment'] == 'all' and r['target_year'] == 2024)
    d = pd.read_csv(OUT / 'panel.csv', dtype={'fips': str})
    d = d[d.label_available <= 2023]
    A = d[s['features']].to_numpy()
    A = np.where(np.isnan(A), s['impute'], A)
    A = (A - s['mean']) / s['scale']
    counties = list(s['county'])
    B = np.array([[float(f == c) for c in counties] for f in d.fips])
    A = np.c_[A, B]
    b = np.r_[s['beta'], list(s['county'].values())]
    r = d.y.to_numpy() - s['intercept'] - A @ b
    assert abs(r.sum()) < 1e-6
    assert np.max(abs(A.T @ r - fit['alpha'] * b)) < 1e-6


def test_interval_calibration_reconstructs_without_held_out_outcomes():
    p = pd.read_csv(OUT / 'predictions.csv')
    c = pd.read_csv(OUT / 'calibration.csv', dtype={'state': str})
    for (regime, experiment, model, origin), d in p[p.model != 'persistence'].groupby(
            ['regime', 'experiment', 'model', 'origin']):
        a = c[(c.regime == regime) & (c.experiment == experiment) & (c.model == model)
              & (c.available <= origin)]
        assert np.allclose(a.error, abs(a.pred - a.observed))
        if regime.startswith('holdout_'):
            assert (a.state != regime.split('_')[1]).all()
        assert (d.calibration_n == len(a)).all()
        if len(a) < 30:
            assert d.lo.isna().all()
        else:
            radius = np.quantile(a.error, C['interval_coverage'], method='higher')
            assert np.allclose(d.lo, np.maximum(0, d.pred - radius))
            assert np.allclose(d.hi, np.minimum(100, d.pred + radius))
