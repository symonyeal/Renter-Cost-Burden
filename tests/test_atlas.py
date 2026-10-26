"""Check the Rust exports against independently reconstructed US results.

Legend: a ACS observations; d atlas export; g registered descriptive results;
c county; y year; m measure; p CPI; r exported observation.
"""
import json

import numpy as np
import pandas as pd

from analysis.data import OUT, C


def test_us_atlas_full_key_and_money_parity():
    a = pd.read_csv(OUT / 'acs.csv', dtype={'fips': str}, float_precision='round_trip')
    p = pd.read_csv(OUT / 'cpi.csv', index_col='year',
                    float_precision='round_trip')['mean']
    d = json.loads((OUT / 'us.json').read_text(encoding='utf-8'))
    rows = [r for r in d['observations'] if r['level'] == 'county']
    keys = [(r['geo_id'], r['year'], r['measure']) for r in rows]
    expected = {(r.fips, r.year, m) for r in a.itertuples()
                for m in ['burden', 'rent', 'income']}
    assert len(rows) == len(expected) == len(set(keys)) > 0
    assert set(keys) == expected
    values = {(r['geo_id'], r['year'], r['measure']): r for r in rows}
    for r in a.itertuples():
        x = p[C['base_year']] / p[r.year]
        for m, v in [('burden', r.burden), ('rent', r.rent * x), ('income', r.income * x)]:
            actual = values[(r.fips, r.year, m)]
            assert np.float64(actual['value']).view(np.uint64) == np.float64(v).view(np.uint64)
        assert values[(r.fips, r.year, 'burden')]['margin'] == r.burden_moe


def test_us_atlas_pooled_and_every_county_change():
    d = json.loads((OUT / 'us.json').read_text(encoding='utf-8'))
    g = json.loads((OUT / 'gap.json').read_text(encoding='utf-8'))
    old = {r['year']: r for r in g['pooled']}
    assert {r['year'] for r in d['pooled']} == set(old)
    for r in d['pooled']:
        a = old[r['year']]
        assert r['value'] == a['b']
        assert r['lower'] == a['b'] - a['moe']
        assert r['upper'] == a['b'] + a['moe']
    old = {r['fips']: r for r in g['periods'][0]['counties']}
    assert {r['geo_id'] for r in d['changes']} == set(old)
    assert len(d['changes']) == len(old) > 0
    for r in d['changes']:
        a = old[r['geo_id']]
        for k, v in [('burden_change', 'db'), ('margin', 'm_db'),
                     ('rent_growth', 'rent_pct'), ('income_growth', 'inc_pct'),
                     ('verdict', 'verdict')]:
            assert r[k] == a[v], (r['geo_id'], k)


def test_canadian_export_sources_and_flags():
    d = json.loads((OUT / 'canada.json').read_text(encoding='utf-8'))
    a = d['observations']
    keys = [(r['geo_id'], r['year'], r['measure'], r['source']) for r in a]
    assert len(keys) == len(set(keys)) > 0
    assert all(len(s['sha256']) == 64 and s['retrieved'] for s in d['sources'])
    assert {r['geo'] for r in a if r['measure'] == 'burden' and r['level'] == 'territory'} == {
        'Yukon', 'Northwest Territories', 'Nunavut'}
    assert {r['year'] for r in a if r['measure'] == 'burden'} == {2021}
    assert all(r['level'] != 'territory' for r in a if r['measure'] == 'core_need')
    withheld = [r for r in a if r['value'] is None]
    assert withheld and all(r['status'] for r in withheld)
    assert any(r['value'] == 0 for r in a)


def test_historical_burden_is_one_published_series():
    d = json.loads((OUT / 'canada.json').read_text(encoding='utf-8'))
    a = [r for r in d['observations'] if r['measure'] == 'burden_history']
    assert len(a) > 0
    keys = {(r['geo_id'], r['year']) for r in a}
    geos = {r['geo_id'] for r in a}
    assert keys == {(g, y) for g in geos for y in [2016, 2021]}
    assert all(r['source'] == 'census-comparison-2016-2021' for r in a)
    assert all(r['geography_vintage'] == 2021 for r in a)
    assert all(r['lower'] is None and r['upper'] is None for r in a)
    assert any(r['geo'].startswith('Montréal') for r in a)
    canada = {r['year']: r['value'] for r in a if r['geo'] == 'Canada'}
    assert canada == {2016: 40.0, 2021: 33.2}
