"""Paired forecast comparisons preserve the county/year evaluation sample."""
import pandas as pd
import pytest

from analysis.comparison import compare


def fixture():
    rows = []
    for f, pred in [('08001', 8), ('53001', 10)]:
        for y in [2023, 2024]:
            base = dict(fips=f, state=f[:2], target_year=y, y=10,
                        regime='temporal', experiment='all', block='final test')
            rows += [base | dict(model='linear', pred=pred),
                     base | dict(model='persistence', pred=7)]
    return pd.DataFrame(rows)


def test_forecasts_are_compared_to_the_same_county_year_baseline():
    r = compare(fixture(), samples=1000, seed=1)[0]
    assert r['delta_mae'] == -2
    assert r['lo'] == -3
    assert r['hi'] == -1
    assert r['counties'] == 2
    assert r['years'] == [2023, 2024]
    assert r['drop_state']['08'] == -3
    assert r['drop_state']['53'] == -1


def test_missing_baseline_row_is_rejected_instead_of_changing_the_sample():
    d = fixture()
    with pytest.raises(ValueError, match='same county/year'):
        compare(d.drop(d[d.model == 'persistence'].index[0]))


def test_duplicate_forecast_is_rejected():
    d = fixture()
    with pytest.raises(ValueError, match='duplicate'):
        compare(pd.concat([d, d.iloc[[0]]]))
