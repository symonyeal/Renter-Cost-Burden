"""Supplementary temporal and paired-baseline checks on frozen exported forecasts."""
import hashlib

import numpy as np
import pandas as pd

from analysis.backend import bootstrap
from analysis.data import OUT, ROOT, C, write


def compare(d, samples=2000, seed=None):
    """County-cluster MAE differences to persistence, on identical county/year pairs."""
    rng = np.random.default_rng(C['seed'] if seed is None else seed)
    key = ['fips', 'target_year']
    d = d[d.experiment == 'all'].copy()
    rows = []
    for (regime, block), group in d.groupby(['regime', 'block'], sort=True):
        base = group[group.model == 'persistence']
        for model, a in group[group.model != 'persistence'].groupby('model', sort=True):
            if a.duplicated(key).any() or base.duplicated(key).any():
                raise ValueError('duplicate county/year prediction')
            if set(map(tuple, a[key].to_numpy())) != set(map(tuple, base[key].to_numpy())):
                raise ValueError('model and persistence require the same county/year sample')
            z = a.merge(base[key + ['pred', 'y']], on=key, validate='one_to_one',
                        suffixes=('', '_base')).sort_values(key)
            if z[['pred', 'pred_base', 'y', 'y_base']].isna().any().any():
                raise ValueError('missing forecast or target in paired comparison')
            if not np.array_equal(z.y, z.y_base):
                raise ValueError('paired forecasts have different targets')
            z['delta'] = abs(z.pred - z.y) - abs(z.pred_base - z.y)
            g = z.groupby('fips', sort=True).delta.mean().to_numpy()
            boot = bootstrap(g, rng, samples)
            delta = lambda x: float(x.groupby('fips').delta.mean().mean())
            years = sorted(int(y) for y in z.target_year.unique())
            rows.append({
                'regime': regime, 'block': block, 'model': model,
                'reference': 'persistence', 'delta_mae': delta(z),
                'lo': float(np.quantile(boot, .1)), 'hi': float(np.quantile(boot, .9)),
                'counties': len(g), 'pairs': len(z), 'years': years,
                'by_year': {str(y): delta(z[z.target_year == y]) for y in years},
                'drop_year': {str(y): delta(z[z.target_year != y])
                              for y in years if len(years) > 1},
                'drop_state': {str(s): delta(z[z.state != s])
                               for s in sorted(z.state.unique())
                               if len(z.state.unique()) > 1},
            })
    return rows


def run():
    """Write supplementary evidence without changing the sample, fits or final holdout."""
    p = OUT / 'predictions.csv'
    d = pd.read_csv(p, dtype={'fips': str, 'state': str})
    rows = compare(d)
    write(OUT / 'comparison.json', {
        'predictions_sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
        'seed': C['seed'], 'resamples': 2000, 'interval_coverage': .8,
        'interpretation': 'Negative difference favours the fitted model over persistence.',
        'limits': [
            'Development years are diagnostics, not additional untouched final-test years.',
            'County resampling preserves county years but not common state or year shocks.',
            'Leave-one-state/year results are sensitivity checks, not confidence intervals.',
            'Current source revisions and assumed release lags remain pseudo-real-time.',
        ],
        'comparisons': rows,
    })
    lines = [
        '# Supplementary temporal validation', '',
        'Reconstructed from the committed forecasts; no models were refitted or selected.',
        'Negative differences mean lower MAE than persistence, in percentage points.',
        'The interval is an 80% county-cluster bootstrap with 2,000 resamples.', '',
        '| Evaluation | Block | Model | MAE difference | 80% interval |',
        '| --- | --- | --- | ---: | --- |',
    ]
    for r in rows:
        lines.append(f"| {r['regime']} | {r['block']} | {r['model']} | "
                     f"{r['delta_mae']:.4f} | [{r['lo']:.4f}, {r['hi']:.4f}] |")
    lines += [
        '', '## Interpretation and limits', '',
        'The final-test years remain 2023 and 2024. Earlier chronological predictions',
        'are reported separately as development diagnostics; adding their errors to the',
        'final test would change the registered study. comparison.json also contains',
        'year-specific differences and results after dropping each state or target year.',
        'These show sensitivity to the small evaluation sample without asserting more',
        'independent test years than were observed.', '',
        'The county bootstrap preserves repeated observations within counties. It does',
        'not preserve common state or year shocks. Dropping a state or year is a',
        'diagnostic, not a new confidence interval. Archived source vintages remain',
        'unavailable: this is still a pseudo-real-time backtest using declared lags.', '',
        'Reproduce with `python -m analysis.comparison`. The output records the forecast',
        'file hash; the full pipeline runs this check after fitting.', '',
    ]
    write(ROOT / 'docs/TEMPORAL_VALIDATION.md', '\n'.join(lines))
    print(f'Wrote {len(rows)} paired model/baseline comparisons.')


if __name__ == '__main__':
    run()
