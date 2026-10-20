# Supplementary temporal validation

Reconstructed from the committed forecasts; no models were refitted or selected.
Negative differences mean lower MAE than persistence, in percentage points.
The interval is an 80% county-cluster bootstrap with 2,000 resamples.

| Evaluation | Block | Model | MAE difference | 80% interval |
| --- | --- | --- | ---: | --- |
| holdout_08 | development | linear | 0.5595 | [-0.1872, 1.3648] |
| holdout_08 | development | trees | 0.0111 | [-0.5402, 0.6006] |
| holdout_08 | final test | linear | 2.9055 | [1.7171, 4.0109] |
| holdout_08 | final test | trees | 1.0929 | [0.3317, 1.8498] |
| holdout_25 | development | linear | -0.7745 | [-1.1244, -0.4106] |
| holdout_25 | development | trees | -0.6151 | [-1.1439, -0.0954] |
| holdout_25 | final test | linear | 2.4603 | [1.5592, 3.3790] |
| holdout_25 | final test | trees | 0.4965 | [-0.0397, 1.0779] |
| holdout_53 | development | linear | -0.2517 | [-0.7134, 0.2281] |
| holdout_53 | development | trees | 0.1407 | [-0.4413, 0.6914] |
| holdout_53 | final test | linear | 0.5417 | [-0.9076, 2.0197] |
| holdout_53 | final test | trees | 0.5903 | [-0.0959, 1.2818] |
| temporal | development | linear | -0.2878 | [-0.5031, -0.0599] |
| temporal | development | trees | -0.4364 | [-0.6362, -0.2477] |
| temporal | final test | linear | 0.7457 | [0.2784, 1.2458] |
| temporal | final test | trees | 0.2651 | [-0.1566, 0.6745] |

## Interpretation and limits

The final-test years remain 2023 and 2024. Earlier chronological predictions
are reported separately as development diagnostics; adding their errors to the
final test would change the registered study. comparison.json also contains
year-specific differences and results after dropping each state or target year.
These show sensitivity to the small evaluation sample without asserting more
independent test years than were observed.

The county bootstrap preserves repeated observations within counties. It does
not preserve common state or year shocks. Dropping a state or year is a
diagnostic, not a new confidence interval. Archived source vintages remain
unavailable: this is still a pseudo-real-time backtest using declared lags.

Reproduce with `python -m analysis.comparison`. The output records the forecast
file hash; the full pipeline runs this check after fitting.
