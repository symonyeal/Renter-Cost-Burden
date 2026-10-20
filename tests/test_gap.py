"""County change, survey-noise and post hoc baseline certificates.

Legend
  d   one-row frame in the shape margin() reads
  a   ACS table; g gap.json; p frozen predictions; b baselines.csv
"""
import json

import numpy as np
import pandas as pd

from analysis.data import OUT, margin
from analysis.gap import Z, load, pool, slope


def row(n, den, mn, md):
    """One county-year with four equal numerator margins and a denominator margin md."""
    d = {'burden_numerator': [n], 'burden_denominator': [den],
         'B25070_MOE001': [md], 'B25070_MOE011': [0.0]}
    for k in range(7, 11):
        d[f'B25070_MOE{k:03}'] = [mn / 2]
    return pd.DataFrame(d)


def test_margin_uses_proportion_formula():
    m = margin(row(500, 1000, 40, 30))
    assert np.isclose(m.iloc[0], 100 * np.sqrt(40 ** 2 - .25 * 30 ** 2) / 1000)


def test_margin_falls_back_to_ratio_formula():
    m = margin(row(900, 1000, 10, 60))
    assert np.isclose(m.iloc[0], 100 * np.sqrt(10 ** 2 + .81 * 60 ** 2) / 1000)


def test_slope_recovers_an_exact_line():
    x = np.arange(10.0)
    s = slope(x, 3 * x + 1, seed=1)
    assert np.isclose(s['per10'], 30) and np.isclose(s['lo'], 30) and np.isclose(s['hi'], 30)
    assert np.isclose(s['r'], 1) and s['resolved']


def test_pool_reads_only_published_years():
    a, _ = load()
    before = pool(a, '53033', 2019)
    a.loc[a.year > 2019, 'burden'] = 99.0
    assert pool(a, '53033', 2019) == before


def test_pool_trusts_the_county_when_noise_is_small():
    a, _ = load()
    a['s'] = 1e-6
    pred, w = pool(a, '53033', 2019)
    assert w > .99
    assert np.isclose(pred, a[(a.fips == '53033') & (a.year == 2019)].burden.iloc[0], atol=1e-3)


def test_pooled_share_and_county_changes_reconstruct():
    a = pd.read_csv(OUT / 'acs.csv', dtype={'fips': str})
    g = json.loads((OUT / 'gap.json').read_text())
    for r in g['pooled']:
        x = a[a.year == r['year']]
        assert np.isclose(r['b'], 100 * x.burden_numerator.sum() / x.burden_denominator.sum())
    for p in g['periods']:
        assert len(p['counties']) == 30
        for c in p['counties']:
            b0 = a[(a.fips == c['fips']) & (a.year == p['y0'])].iloc[0]
            b1 = a[(a.fips == c['fips']) & (a.year == p['y1'])].iloc[0]
            assert np.isclose(c['db'], b1.burden - b0.burden)
            assert np.isclose(c['m_db'], Z * np.hypot(b0.burden_moe / Z, b1.burden_moe / Z))
            assert c['verdict'] == ('up' if c['db'] > c['m_db'] else 'down'
                                    if c['db'] < -c['m_db'] else 'within noise')


def test_baselines_share_the_frozen_folds():
    p = pd.read_csv(OUT / 'predictions.csv', dtype={'fips': str})
    b = pd.read_csv(OUT / 'baselines.csv', dtype={'fips': str})
    p = p[(p.regime == 'temporal') & (p.model == 'persistence')].set_index(
        ['fips', 'target_year']).sort_index()
    for m, x in b.groupby('model'):
        x = x.set_index(['fips', 'target_year']).sort_index()
        assert x.index.equals(p.index), m
        assert np.allclose(x.y, p.y)
        assert (x.acs_year <= x.origin - 1).all()
    x = b[b.model == 'persistence'].set_index(['fips', 'target_year']).sort_index()
    assert np.allclose(x.pred, p.pred)
