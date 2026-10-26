"""Optional Rust county bootstrap; NumPy retains random draws and quantiles.

Legend: g county differences; ix sampled county indices; b executable path;
q kernel request; r process result; rng NumPy generator.
"""
import json
import os
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def executable():
    """Resolve the release build, with an explicit override for CI/build systems."""
    suffix = '.exe' if os.name == 'nt' else ''
    return Path(os.environ.get('RCB_RUST_BIN', ROOT / 'target' / 'release'
                               / f'renter-cost-burden{suffix}'))


def bootstrap(g, rng, samples=2000, backend=None):
    """Return row means from the same NumPy draws for either implementation."""
    backend = backend or os.environ.get('RCB_BACKEND', 'python')
    if backend not in ('python', 'rust'):
        raise ValueError('RCB_BACKEND must be python or rust')
    g = np.asarray(g, dtype=np.float64)
    if backend == 'python':
        return rng.choice(g, size=(samples, len(g))).mean(axis=1)
    if g.ndim != 1 or not len(g) or not np.isfinite(g).all():
        raise ValueError('Rust bootstrap requires finite, nonempty one-dimensional values')
    b = executable()
    if not b.is_file():
        raise FileNotFoundError('Rust backend requires cargo build --release --locked')
    # Sampling the positions consumes exactly the draws used by choice(g).
    ix = rng.choice(len(g), size=(samples, len(g)))
    q = {'op': 'bootstrap', 'values': g.tolist(), 'indices': ix.tolist()}
    r = subprocess.run([str(b), 'kernel'], input=json.dumps(q), text=True,
                       capture_output=True, check=True)
    return np.asarray(json.loads(r.stdout)['means'], dtype=np.float64)
