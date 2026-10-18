# Findings

Persistence beats both all-source fitted models, with final temporal MAE 2.855 pp. This is a small regional pseudo-real-time backtest,
not evidence of a causal effect or national generalization.

| Model, all groups | MAE pp | RMSE pp | Gain over persistence pp | 80% interval coverage |
|---|---:|---:|---:|---:|
| linear | 3.600 | 4.550 | -0.746 | 0.817 |
| persistence | 2.855 | 3.796 | 0.000 | 0.867 |
| trees | 3.120 | 4.048 | -0.265 | 0.800 |

Coverage: 30 counties in three states; 390 ACS county-years,
2011–2024 except 2020. Final temporal tests: 60
county-targets in 2023–2024. Earlier development targets remain separately labelled.

Commuting contribution (all minus employment-only MAE; negative favours commuting):

- linear: 0.141 pp, 80% county-cluster interval [0.113, 0.170], 30 clusters; contradicts a gain within this sample.
- trees: -0.096 pp, 80% county-cluster interval [-0.184, -0.010], 30 clusters; supports a gain within this sample.

## Feature-group comparisons

| Experiment | Model | Final temporal MAE pp |
|---|---|---:|
| all | linear | 3.600 |
| all | persistence | 2.855 |
| all | trees | 3.120 |
| core | linear | 3.099 |
| core | trees | 3.088 |
| employment | linear | 3.459 |
| employment | trees | 3.215 |
| housing | linear | 2.770 |
| housing | trees | 3.344 |
| no_employment | linear | 2.753 |
| no_employment | trees | 3.213 |
| no_housing | linear | 3.685 |
| no_housing | trees | 3.089 |

Housing/history regression has MAE 2.770 pp; adding employment raises it to
3.459 pp. Removing employment from the full regression lowers error to
2.753 pp.

## Does the commuting gain transfer?

| Held-out state | Model | All minus employment-only MAE pp | 80% interval |
|---|---|---:|---|
| Colorado | linear | 0.975 | [0.223, 1.645] |
| Colorado | trees | 0.174 | [-0.109, 0.453] |
| Massachusetts | linear | 0.345 | [0.253, 0.441] |
| Massachusetts | trees | 0.002 | [-0.138, 0.147] |
| Washington | linear | 1.043 | [0.187, 1.934] |
| Washington | trees | 0.733 | [0.353, 1.161] |

Intervals preserve within-county years but not common state shocks. Three independent
geographic groups are few; even a positive ablation needs independent states and future years.

## Evidence log

- **Timing leakage:** contradicted by source/label eligibility certificates; archived vintage
  availability remains unverified. The conservative lags are assumptions.
- **Simple models suffice:** persistence beats both all-source models.
  The housing-only linear experiment has lower error (2.770 pp)
  than persistence (2.855 pp).
- **Commuting adds information:** in temporal evaluation, commuting worsens linear, improves trees.
  6 of 6 state transfers have a positive (unfavourable) point difference.
- **Income/composition explains growth:** ablations test predictive substitution; population
  alone cannot remove demographic composition confounding. Causal explanation inconclusive.
- **Pandemic dependence, inconclusive:** development and geographic filters expose sensitivity;
  final two-year block cannot establish stability across regimes.
- **Measurement uncertainty:** published category margins are retained. Derived sampling margins
  ignore covariance; small gains should not be interpreted as precise changes in latent burden.

What would change the conclusion: a larger preregistered national sample, archived release
vintages, reliable cross-state destination rankings, and repeated gains in future target years.
Full definitions and exclusions are in METHODS.md and COVERAGE.md.
