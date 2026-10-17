# Design and methods

Approved brief: build a methods showcase answering whether workplace growth and home-work
relationships improve predictions of county renter pressure. Predictive failure remains a result.

## Registered protocol, 2026-10-17

Hypothesis: adding employment and commuting reduces held-out county-equal MAE relative to
housing/history alone. A commuting gain must have a negative paired MAE difference, with an
80% county-cluster bootstrap interval excluding zero. This is predictive, not causal.

Three states were selected for geographically separated holdouts and tractable bulk processing:
Colorado, Massachusetts, Washington. Within each, select the ten largest counties by **2011
ACS one-year population**, before computing model errors. This is a regional study, not a
representative US sample. Selected county FIPS are stable; no major county creation or
consolidation was identified in Census county-change documentation. Small boundary adjustments
are not reconciled. The assumption is that these do not materially change county comparisons.
The intended national 100-county scope is reduced to 30; no national claim is supported.
Massachusetts LODES before 2011 is excluded according to the official availability table;
small residual records in these files do not establish comparable workplace coverage.
Massachusetts was first published in March 2016 (OnTheMap Data Notices, version 6.5).
Its target 2014–2016 rows are therefore excluded from all experiments equally. Evaluation
starts in 2017, when all thirty counties have usable lagged commuting observations.
ACS begins in 2011 because older bulk metadata require another parser. Years 2011–2024
are retained except 2020, for which standard one-year estimates were not published.
No five-year estimates or interpolated targets enter this study.
The 2025 official ACS bulk endpoint returned HTTP 401 during the audit; complete compatible
coverage beyond 2024 could not be established.

## Sources and availability

| Source | Reference period | Assumed earliest usable December origin | Scope |
|---|---|---|---|
| ACS one-year | calendar y | y+1 | Published county estimates and 90% margins of error |
| QCEW annual | calendar y | y+2 | All ownership/all industry totals; private supersector shares |
| LODES8 JT01 | calendar y | y+4 | Primary jobs; common 2020 block geography |
| CPIAUCNS | calendar y average | y+1 | Twelve monthly observations; US city average |

Lags are conservative assumptions, not recovered historical publication dates.
Massachusetts additionally has a known first-usable-origin floor of 2016. The 2020 LODES
release in April 2023 illustrates why contemporary reference years cannot be joined as though
they arrived together. Current LODES8 historical revisions and current QCEW/ACS downloads are
used; archived vintages are unavailable here. Consequently this is a **pseudo-real-time
backtest under declared lags**, not a reconstruction of information actually seen by forecasters.
Source file Last-Modified is recorded separately and is not a historical publication date.
Each cached object carries URL, retrieval timestamp, byte count, checksum and version context.

At origin t = December 31, target burden is for t+1. Use the most recent ACS year u≤t−1,
QCEW t−2, LODES t−4. A fitting label y is eligible only when y+1≤t. Source years and
usable-origin years accompany every row. Example: target 2024, origin 2023, latest ACS 2022,
QCEW 2021, LODES 2019. The target change is 2022→2024, **two years**. For target 2022
the ACS 2020 gap makes the interval 2019→2022, **three years**. Growth uses actual gaps.

## Target and measurement

Let N be the sum of B25070 categories 007–010 (30–34.9%, 35–39.9%, 40–49.9%, ≥50%).
Let D=B25070_001−B25070_011. Burden is 100N/D: renter households with a computable ratio
spending at least 30% of household income on gross rent. Categories 002–011 reconstruct 001.
Denominator counts and every E/M column are retained. Negative Census special values remain
in source columns and become missing in derived monetary features. No medians are aggregated.

The displayed approximate 90% sampling margin uses root-sum-of-squares of numerator margins
and the total-minus-not-computed denominator margins, then
100 sqrt(M_N²+(N/D)² M_D²)/D. This ratio approximation ignores covariance; it is not a
guaranteed bound or an official published margin for the derived ratio. It is **not** a model
prediction interval. ACS sampling noise can exceed small model improvements.

Real monetary values equal nominal × CPI(2023)/CPI(reference year); the declared base is a
unit normalization, not geographic purchasing-power adjustment. QCEW pay is average annual
covered-job pay at workplaces, not median pay or resident household income. Employment
counts jobs. Housing growth counts all units, not rental supply. The separate median-rent/
median-income statistic is not used as the burden target.

## LODES construction and cross-state flows

Use LODES8 primary jobs (JT01), all segments (S000). Downloaded state metadata declare
format 8.4, vintage 20251202_1657; the technical document specifies 2020 blocks on 2024
TIGER geography. Sum WAC C000 by the first five digits of 15-digit workplace blocks and
RAC C000 by residence blocks; these digits identify county FIPS. Aggregate OD main S000
by residence-county/workplace-county pair. All selected
county FIPS are stable; block changes within counties preserve county sums. Minor county
boundary adjustments remain a limitation.

Let J be workplace jobs, R resident primary-job holders, I same-county OD jobs.
Inbound share=1−I/J; outbound share=1−I/R; home-work retention=I/R. Only inbound and outbound
enter the linear model, avoiding a deterministic complement. WAC and RAC include interstate
relationships. Main OD contains within-state relationships. The residual between RAC/WAC
totals and within-state OD sums is displayed as **outside state / unranked residual**, rather
than dropped. Auxiliary OD files are therefore unnecessary for these shares. Their absence
prevents ranking individual cross-state destinations and measuring full destination concentration.
Residuals can also include source inconsistencies/disclosure processing; they are not asserted
to be exact named-destination flows. Employment links are not observed daily trips.

## Feature dictionary

| Group | Features | Units / definition |
|---|---|---|
| Core | latest burden; prior burden change; log population | percentage points; pp/year over actual interval; natural log people |
| Housing | real gross rent; real renter household income; their growth; housing growth | 2023 dollars/month; dollars/year; annualized percent |
| Employment | employment growth; real average-pay growth; goods and services shares | percent/year; private supersector jobs / all covered jobs |
| Commuting | inbound and outbound shares | fractions of workplace / resident primary jobs |

Private goods plus private services need not sum to one: the denominator includes government.
Rental vacancy is excluded because small denominators and uncertainty require a separate
reliability protocol. A richer demographic specification and full industry concentration are
deferred to keep the design compact relative to training size.

## Models

Persistence predicts the most recently available published burden. For standardized vector z,
fit the regularized panel regression

    min_(a,b,g) Σ_i (y_i − a − z_i′b − g_county(i))² + λ(‖b‖² + ‖g‖²).

The common intercept a is unpenalized. County indicator coefficients g are penalized but not
standardized. For an unseen county g=0. Imputation medians and scaling are fitted on training
rows only. There is no future-year effect. The candidate λ grid is {1,10,100}.

Histogram gradient boosting uses scikit-learn, 80 iterations, learning rate .06, minimum
leaf size 15, L2=10, leaf count in {3,7}, no early stopping. It receives the same continuous
features without county identity. Both predictors and persistence are clipped to [0,100].
This controlled comparison includes a different inductive bias and effective complexity.

At each origin, tune on the latest earlier label-eligible target with a chronological inner fit:
inner fitting labels must themselves have been published by the inner origin. If fewer than
30 inner training rows exist, use the middle grid entry. Training starts with target 2014.
Evaluate 2017–2019 and 2021–2024. Final untouched outcomes are target years 2023–2024;
no final outcome is used for tuning or fitting either final prediction.

Geographic transfer repeats chronological fits with one entire state excluded. Three independent
holdout groups is a severe limit. Adjacent sampled counties within a state stay together.
Cross-state metropolitan ties (notably Clark–Portland) can still connect to unsampled counties.

## Experiments and uncertainty

Train core; +housing; +employment; +commuting; all except housing; all except employment.
All use identical county/target membership. Each is actually refitted and tuned. Commuting-off
selects the employment experiment, never zeros its inputs in a fitted all-source model.

MAE and RMSE use percentage points. Improvement is baseline MAE minus model MAE on matching
rows. Direction classifies changes within ±0.5 pp as near-zero; otherwise up/down. This includes
the baseline's always-near-zero prediction. County-equal metrics are primary. Secondary weights
are renter counts **available at the origin**, not future target counts.

80% empirical prediction intervals use the higher empirical 80th percentile of absolute earlier
out-of-sample errors whose labels were published by the current origin. At least 30 calibration
errors are required; otherwise bounds are missing, visibly so. In geographic evaluation,
calibration uses earlier temporal predictions in training states only. Bounds are clipped to
[0,100]. These are historical empirical intervals, with no nominal exchangeability guarantee
under temporal/spatial dependence. Observed coverage and width are reported.

Paired commuting comparisons on final outcomes use 2,000 county-cluster bootstrap draws,
seed 271828, preserving both final years within county. Intervals are 80%; they do not preserve
cross-county state shocks. With only three states a state bootstrap would be poorly resolved.
State holdouts and period splits supplement, but cannot eliminate, this limitation.

## Scenario semantics

Export exact fitted linear coefficients and every numeric tree split/leaf. The browser evaluates
the same standardized features, with no interpolation approximation. Adjust growth rates and
real rent/income levels from the observed 2024 prediction input. Level adjustments also update
their annualized growth across the recorded ACS gap. Flag marginal range violations and a
joint nearest-training-vector standardized distance above the training 95th percentile.
These are conditional model predictions, not causal interventions. The household calculator
uses cost/income arithmetic over three years and is separate from county modelling.

## Rival explanations and kill conditions

1. History/persistence dominates: compare paired held-out errors.
2. Resident income explains apparent job effects: compare housing with employment experiment.
3. Commuting proxies scale: include log population in every experiment.
4. Leakage creates improvement: verify source/label timing and inner-fold chronology.
5. Pandemic or a few counties dominate: inspect year, burden, size and reliability strata.
6. Measurement dominates: compare error/gains to approximate ACS sampling margins.
7. Transfer fails: hold out entire states; report all groups, including losses.

A larger national sample, archived release vintages, longer pre-pandemic series, and
independent future years could change the conclusion. No identification strategy is supplied.
