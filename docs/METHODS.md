# Methods

The following methods define the registered US study. The rebuilt atlas uses the same US
burden and money definitions, calculated in Rust from the committed source columns. Canadian
methods and coverage are specified separately in [CANADA.md](CANADA.md). Country estimates
are not pooled; core housing need is not substituted for shelter-cost burden.

This page defines every number in [FINDINGS.md](FINDINGS.md): what is measured, where it
comes from, how changes are judged against survey error, and how the forecasts were tested.

A few terms are used throughout:

- **Stretched**: a renter household paying 30% or more of its income on rent and utilities.
- **Survey margin**: the Census 90% margin of error. A change counts as real only when it is
  larger than the margin of the change.
- **80% range**: the middle 80% of 2,000 resamples of the 30 counties (a county bootstrap,
  seed 271828). A range that crosses zero means the data cannot tell the sign; that is "does not
  resolve", not "no effect".
- **Average miss (MAE)**: the average absolute gap between a forecast and the published
  value, in percentage points. RMSE weights large misses more.

## The question and the sample

The study asks whether renter incomes kept up with rent from 2011 to 2024, how that relates to
job growth, and whether the share stretched can be forecast a year ahead.

It covers the ten most populous counties in each of Colorado, Massachusetts and Washington by
**2011 ACS one-year population**, 30 in all. The three states were picked to be far apart and
small enough to process; the counties were fixed before any result was computed. This is a
regional study, not a sample of the United States. The original plan was 100 counties
nationally; the bulk commuting files made that impractical, and no national claim is made.

County codes for the 30 counties did not change over the period; Census county-change notes
show no creation or merger affecting them. Small boundary adjustments are not reconciled, on
the assumption that they do not change county comparisons materially.

## The share stretched

From ACS table B25070, let N be the households in the four categories from 30% up (30–34.9%,
35–39.9%, 40–49.9%, 50% or more), and D the total minus "not computed". The share is 100N/D.
Categories 002–011 add up to the total in every county-year, which is checked. Every estimate
and margin column is kept; negative Census placeholder values stay in the source columns and
become missing in derived money figures. Medians are never averaged across counties.

**Survey margin of the share.** The numerator is part of the denominator, so the Census formula
for a proportion applies: 100 sqrt(M_N² − p² M_D²)/D, with p = N/D, M_N the four category
margins combined by root-sum-of-squares, and M_D the total and "not computed" margins combined
the same way. Where the term under the root would be negative the Census ratio formula
(plus sign) is used instead; no county-year needs it. The formula ignores correlations between
categories that the Census does not publish, so it is an approximation. Until 2026-10-20 the
repository used the ratio formula, which overstated the median margin (5.78 points against
4.25).

For the 30 counties together, N and D are summed and their margins combined by
root-sum-of-squares across counties.

A change between two years has margin 1.645 × sqrt(s0² + s1²), where s is each year's margin
divided by 1.645. Survey samples in different years are treated as independent.

The ACS does not publish standard one-year estimates for 2020. That year is left out and never
filled in. Five-year estimates are not used. The ACS starts in 2011 here because older bulk
files need another parser. The 2025 ACS bulk endpoint returned HTTP 401 during the audit, so
nothing after 2024 is used.

## Rent, income, jobs and pay

| Measure | Source | Definition |
|---|---|---|
| Rent | ACS B25064 | Median gross rent, dollars a month |
| Renter income | ACS B25119_003 | Median renter household income, dollars a year |
| Population, housing units | ACS B01003, B25001 | Counts |
| Jobs | BLS QCEW, all ownerships, all industries | Annual average jobs at workplaces in the county |
| Pay | BLS QCEW | Average annual pay per covered job at workplaces, not resident income |
| Goods and services shares | BLS QCEW, private supersectors 101 and 102 | Private jobs in each / all covered jobs; government is in the denominator, so they need not add to one |
| Commuting | Census LODES8, primary jobs (JT01) | See below |
| Inflation | CPI-U, all US cities (CPIAUCNS), via FRED | Average of twelve months |

Money is converted to 2023 dollars: nominal × CPI(2023) / CPI(year). This removes national
inflation only; it is not a local cost-of-living adjustment.

Median renter income describes whoever rents in a given year. When higher earners start
renting, it rises without anyone getting a raise. The study cannot separate the two.

## Changes from 2011 (findings 1 to 4)

For each county and each period (2011–2024 and 2011–2019), the change in share is the later
share minus the earlier. Rent and income growth are percent changes in 2023 dollars. The
**rent-income gap** is 100 × [ln(rent ratio) − ln(income ratio)], in log points: positive when
rent grew faster. Jobs and pay run from 2011 to the matching year, or to 2023, the last QCEW
year fetched.

Each slope is an ordinary least-squares line across the 30 counties, reported per 10 units of
the x variable, with its 80% county bootstrap range and the correlation. Slopes describe
association between counties, not causes. They cannot rule out a third factor, such as who
moves in, driving both.

## How much is survey noise (finding 5)

**One year apart.** For each pair of consecutive published years in a county (330 pairs; the
2019–2021 step is skipped), compare the root mean square of the observed changes with the root
mean square that sampling error alone would produce, sqrt(mean of s0² + s1²). If they are about
equal, one county's year-to-year movement cannot be told from noise.

**Over 2011–2024.** The real share of the spread between counties' changes is
1 − (mean sampling variance of a change) / (variance of the changes), floored at zero.

## Commuting from LODES

Use LODES8 primary jobs (JT01), all workers (S000). The downloaded metadata declare format 8.4,
vintage 20251202_1657, 2020 census blocks on 2024 TIGER geography. Workplace counts (WAC, C000)
and residence counts (RAC, C000) are summed by the first five digits of the 15-digit block code,
which is the county code. The main origin-destination file (OD, S000) is summed by
home-county and work-county pair. Block changes inside a county do not change county sums.

With J workplace jobs, R working residents and I people who live and work in the county:

- share of the county's jobs held by people from elsewhere = 1 − I/J
- share of working residents who work elsewhere = 1 − I/R
- share who live and work in the county = I/R

Only the first two enter the regression, since the third is the complement of the second.
WAC and RAC include people crossing state lines; the main OD file covers only flows within a
state. The difference between the WAC/RAC totals and the in-state OD sums is reported as
"outside the state or unranked" rather than dropped. That makes the auxiliary OD files
unnecessary for these shares, but without them individual out-of-state destinations cannot be
ranked. The difference may also include disclosure processing. LODES records where people
work, not daily trips.

Massachusetts LODES before 2011 is excluded, following the official availability table; the few
records in those files do not give comparable workplace coverage. Massachusetts LODES was first
published in March 2016 (OnTheMap Data Notices, version 6.5), so its forecast targets for
2014–2016 are excluded from every experiment equally.

## The forecast study (registered 2026-10-17)

**The question.** Does adding jobs and commuting data to housing and the share's own history
lower the average forecast miss? A commuting gain needed a negative paired difference with an
80% county bootstrap range below zero. This is about prediction, not cause.

**What a forecaster could have known.** Each forecast stands at December 31 of year t and
predicts year t+1. It may use the latest ACS year up to t−1, QCEW t−2 and LODES t−4. These
delays are cautious assumptions, not recovered publication dates: today's revised downloads are
used, because archived releases were not available. That makes this a pseudo-real-time test:
it follows the delays, but not the exact figures forecasters saw. A training example with
target year y may be used only when y+1 ≤ t. Example: target 2024, forecast made at the end of
2023, latest ACS 2022, QCEW 2021, LODES 2019; the share changes over 2022→2024, two years. For
target 2022 the missing 2020 makes it 2019→2022, three years. Growth rates use the actual
number of years. Each file's URL, retrieval time, size and checksum are recorded; a file's
Last-Modified date is stored but is not treated as a release date. The April 2023 release of
2020 LODES shows why reference years cannot be treated as arriving together.

**Inputs.**

| Group | Inputs | Units |
|---|---|---|
| Core | latest share; its change per year since the previous ACS year; log population | points; points a year; log people |
| Housing | real rent; real renter income; their growth; growth in housing units | 2023 dollars; percent a year |
| Jobs | job growth; real pay growth; goods and services shares | percent a year; fractions |
| Commuting | jobs held from outside; residents working outside | fractions |

Rental vacancy is left out: small denominators need their own reliability rules. Richer
demographics and full industry detail were left out to keep the model small for the amount of
training data.

**Forecasts.**

- *Carry forward*: the latest published share.
- *Regression*: a penalized regression with a county effect,
  minimize Σ (y − a − z′b − g_county)² + λ(‖b‖² + ‖g‖²), with z the standardized inputs and the
  intercept a unpenalized. A county never seen in training gets g = 0. Missing values are filled
  with training medians and scaling is fitted on training rows only. No year effect.
  λ ∈ {1, 10, 100}.
- *Boosted trees*: scikit-learn histogram gradient boosting, 80 rounds, learning rate 0.06,
  at least 15 rows a leaf, L2 = 10, 3 or 7 leaves, no early stopping, the same inputs without
  county identity.

All forecasts are clipped to 0–100. At each forecast date the tuning choice is made on the
latest earlier target whose own training labels were published by that earlier date; with
fewer than 30 training rows the middle grid value is used. Training starts with target 2014.
Scored years are 2017–2019 and 2021–2024; **2023–2024 is the final test**, never used for
fitting or tuning.

**Leaving a state out.** The same chronological fits are repeated with a whole state excluded
from training and scored on that state. Three states give only three independent checks.
Neighbouring counties within a state stay together, but cross-state metro areas (Clark County
with Portland) still connect to counties outside the sample.

**Input experiments.** Core only; + housing; + jobs; + commuting (everything); everything
except housing; everything except jobs. Each is refitted and tuned separately on identical
county-years. "Without commuting" is a model that never saw commuting, not a fitted model with
commuting set to zero.

**Scoring.** Average miss and RMSE in points, each county counted equally. A secondary weighting
uses renter households known at the forecast date, never the future count. Direction is scored
with changes within ±0.5 points treated as no change, so carry forward always predicts no
change.

**Forecast ranges.** An 80% range is the forecast ± the 80th percentile ("higher" method) of
earlier out-of-sample misses whose outcomes were published by the forecast date. At least 30
earlier misses are needed; otherwise no range is shown. When a state is left out, only misses
from training states are used. Ranges are clipped to 0–100. They are historical, with no
guarantee under dependence across years and places; observed coverage and width are reported.

**Paired comparisons.** Differences between forecasts on the final test use 2,000 county
bootstrap resamples (seed 271828) that keep both final years of a county together. They do not
capture shocks shared by a whole state; with only three states a state bootstrap would be too
coarse. State and year omission checks are in
[TEMPORAL_VALIDATION.md](TEMPORAL_VALIDATION.md).

## Forecasts added after the final test

These were added on 2026-10-20, after the registered final test had been scored, and are
reported apart from it. They are scored on the same county-years and never enter
`predictions.csv`.

- *Three-year average*: the mean of the county's last three published shares. Two-, three- and
  four-year averages were compared on both blocks before choosing three; DECISIONS.md lists the
  results.
- *Partial pooling*: specified in DECISIONS.md before it was run. From every county-year up to
  the latest published year u: state-year level a(s,t) is the mean county share; the county
  offset g(c) is the county's mean distance from its state level; the deviation e(c,t) is what
  remains. The variance of real deviations is v = max(0, Σe²/(N − C) − mean sampling variance).
  The forecast is a(s,u) + g(c) + w·e(c,u), with w = v / (v + s²). This is the multilevel
  structure of the county radon example in Fonnesbeck's Bios8366 course (Section 4.7), fitted
  by moments instead of sampling. In every year v came out at zero, so w = 0: the model treated
  all county deviations as survey noise.

## Alternative explanations checked

1. Persistence dominates: paired comparison against carry forward.
2. Resident income explains apparent job effects: the housing experiment against the jobs one.
3. Commuting stands in for size: log population is in every experiment.
4. Leakage: source, label and tuning dates are certified for every fold.
5. The pandemic or a few counties dominate: year, state and county views, omission checks.
6. Survey error dominates: misses and gains compared with survey margins; the noise checks
   above.
7. Results do not travel: whole states left out, with every result reported, including losses.

More states, archived releases, a longer pre-pandemic series and later years could change the
conclusions. No design here identifies a cause.
