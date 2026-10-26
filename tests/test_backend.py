"""Bootstrap parity at float64 precision, including the delivered forecasts.

Legend: g county differences; a NumPy result; b Rust result; n counties;
rng seeded random generator; d frozen prediction frame.
"""
import json
import subprocess

import numpy as np
import pandas as pd
import pytest

from analysis.backend import ROOT, bootstrap, executable


@pytest.fixture
def rust():
    if not executable().is_file():
        pytest.skip('Build the Rust release executable to run cross-language parity checks')


@pytest.mark.parametrize('n', [1, 7, 8, 10, 15, 16, 30, 127, 128, 129, 260])
def test_pairwise_sum_and_rng(rust, n):
    g = np.random.default_rng(7).normal(size=n)
    a = np.random.default_rng(42)
    b = np.random.default_rng(42)
    x = bootstrap(g, a, samples=100, backend='python')
    y = bootstrap(g, b, samples=100, backend='rust')
    assert np.array_equal(x.view(np.uint64), y.view(np.uint64))
    assert a.bit_generator.state == b.bit_generator.state


@pytest.mark.parametrize('g', [np.zeros(30), np.full(30, -0.0),
                             np.array([1e100, 1., -1e100, 3., -3.] * 6),
                             np.array([1e-300, -1e-300, 1e200, -1e200, 0.] * 6)])
def test_cancellation_and_zero(rust, g):
    a = bootstrap(g, np.random.default_rng(1), backend='python')
    b = bootstrap(g, np.random.default_rng(1), backend='rust')
    assert np.array_equal(a.view(np.uint64), b.view(np.uint64))


def test_exact_comparator_rejects_known_bad_pair():
    a = np.array([1., 2.])
    b = a.copy()
    b[1] = np.nextafter(b[1], np.inf)
    assert not np.array_equal(a.view(np.uint64), b.view(np.uint64))


def test_production_comparisons(rust, monkeypatch):
    from analysis.comparison import compare
    from analysis.models import paired

    d = pd.read_csv(ROOT / 'data/processed/predictions.csv',
                    dtype={'fips': str, 'state': str})
    assert len(d) > 0
    monkeypatch.setenv('RCB_BACKEND', 'python')
    a = (compare(d), paired(d[d.block == 'final test']))
    monkeypatch.setenv('RCB_BACKEND', 'rust')
    b = (compare(d), paired(d[d.block == 'final test']))
    assert all(len(rows) > 0 for rows in a)
    assert a == b


@pytest.mark.parametrize('q', [
    {'op': 'bootstrap', 'values': [], 'indices': [[]]},
    {'op': 'bootstrap', 'values': [1.], 'indices': [[1]]},
    {'op': 'bootstrap', 'values': [1.], 'indices': [[]]},
    {'op': 'other', 'values': [1.], 'indices': [[0]]},
])
def test_invalid_kernel_requests(rust, q):
    r = subprocess.run([str(executable()), 'kernel'], input=json.dumps(q),
                       capture_output=True, text=True)
    assert r.returncode != 0


def test_invalid_backend():
    with pytest.raises(ValueError, match='RCB_BACKEND'):
        bootstrap([1.], np.random.default_rng(1), backend='invalid')


def test_python_is_default(monkeypatch):
    monkeypatch.delenv('RCB_BACKEND', raising=False)
    a = bootstrap([1., 2.], np.random.default_rng(1), samples=5)
    b = bootstrap([1., 2.], np.random.default_rng(1), samples=5, backend='python')
    assert np.array_equal(a, b)
