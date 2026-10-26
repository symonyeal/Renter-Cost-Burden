# Findings

Thirty counties: the ten most populous in each of Colorado, Massachusetts and Washington.
"Stretched" means a renter household pays 30% or more of its income on rent and utilities.
Dollar figures are adjusted for inflation to 2023 dollars. Ranges are 80% county
bootstrap ranges unless they are called survey margins, which are Census 90% margins.

## 1. Half of renters are stretched, and the share is where it was in 2011

51.2% of renter households were stretched in 2011 and 51.9% in 2024. The
difference, +0.7 points, is inside the survey margin of ±1.0. The
share did move in between: it fell to 48.8% in 2019 and rose after the pandemic.

In the median county, rent rose 33.3% and the median renter household's
income rose 32.3%. Rent grew faster than renter income in
14 of the 30 counties.

## 2. Where the share changed by more than the survey can miss

The share rose by more than its survey margin in 4 counties (Douglas, Thurston, El Paso, Essex) and fell
by more than its margin in 3 (Spokane, Barnstable, Yakima). In the other 23 counties the
2011–2024 change is within the margin, so it could be sampling error.

| County | 2011 | 2024 | Change, points ± margin | Rent | Renter income | Jobs, 2011–2023 |
|---|---:|---:|---:|---:|---:|---:|
| Douglas County, Colorado | 39.5% | 51.0% | +11.5 ± 10.0 | +31.0% | +11.0% | +56.7% |
| Thurston County, Washington | 46.1% | 56.8% | +10.7 ± 9.2 | +35.6% | +13.3% | +31.5% |
| El Paso County, Colorado | 47.9% | 54.5% | +6.5 ± 5.4 | +42.4% | +31.4% | +30.7% |
| Essex County, Massachusetts | 53.0% | 57.7% | +4.7 ± 4.7 | +35.3% | +19.2% | +7.8% |
| Spokane County, Washington | 54.3% | 48.2% | -6.1 ± 5.1 | +42.2% | +52.9% | +22.5% |
| Barnstable County, Massachusetts | 67.2% | 53.8% | -13.5 ± 10.9 | +0.0% | +47.6% | +8.3% |
| Yakima County, Washington | 56.5% | 40.1% | -16.4 ± 8.8 | +7.3% | +33.3% | +14.6% |

Where the share rose, rent outgrew renter income by 8 to 18 log points.
Where it fell, renter income outgrew rent.

## 3. The share follows rent relative to income

Each 10 points by which rent outgrew renter income came with a
4.2-point rise in the share stretched (range
3.4 to 5.0; correlation 0.86). That is close to
arithmetic, since the share is set by rent against income. What it adds is which side moved:
the counties that improved are the ones where renter incomes outran rent. Real rent rose in
29 of the 30 counties.

Median renter income measures whoever rents in a given year. It rose faster than average pay
at the county's workplaces (14.0% in the median county, 2011–2023),
which suggests the mix of renters shifted toward higher earners. This study cannot separate
raises from a change in who rents.

## 4. Job growth raised rent about twice as fast as renter income

| Per 10% more jobs | 2011–2024 | 2011–2019 |
|---|---:|---:|
| Rent | +5.6% (3.7 to 8.7) | +7.3% (5.2 to 12.0) |
| Renter income | +2.9% (0.1 to 6.8) | +3.4% (-1.3 to 9.6) |
| Share stretched, points | +0.8 (-0.3 to 1.9) | +1.8 (0.2 to 3.5) |

Jobs are counted at workplaces, through 2023 and 2019. Before the pandemic, counties
that added jobs faster saw the share stretched rise: +1.8
points per 10% more jobs. Over the full period the estimate is
+0.8 and its range includes zero, so it does not resolve.
These are associations across 30 counties, not causes: jobs, rent and income all move with
things this study does not measure, such as who moves in.

## 5. Next year's share cannot be forecast, because the survey is too noisy

The share comes from a sample survey. Across 330 one-year changes, a county's share moved
by 3.7 points in a typical year (root mean square). Sampling error alone
would move it by 4.0. Year-to-year movement in one county is no larger than
survey noise, so no forecast can follow it. Over 13 years the picture is better: about
46% of the spread in counties' 2011–2024 changes is real.

The original study forecast each county's share one year ahead, using only figures that had
been published at the time, and kept 2023–2024 aside as the final test (60 county-years).
Error is the average miss in percentage points; smaller is better.

| Forecast | Final test 2023–2024 | Large misses (RMSE) | Earlier years 2017–2022 |
|---|---:|---:|---:|
| Average of the last three published years (added later) | 2.83 | 3.67 | 3.02 |
| Carry the last published value forward | 2.85 | 3.80 | 3.60 |
| Partial pooling across counties (added later) | 2.87 | 3.66 | 3.16 |
| Boosted trees on the same inputs | 3.12 | 4.05 | 3.16 |
| Regression on housing, jobs and commuting | 3.60 | 4.55 | 3.31 |

Carrying the last value forward missed by 2.85 points and neither fitted model beat it.
Two forecasts that average out survey noise were added after the final test had been scored,
so they are labelled as added later and kept apart from the original results. In 2017–2022
the three-year average beat carrying forward by 0.58 points (range
0.38 to 0.79). In the final test neither did: the three-year average
differs by -0.02 (range -0.38 to +0.30) and partial
pooling by +0.02 (-0.35 to +0.39). The pooling
model put no weight on any county's latest deviation from its usual level: it judged all of
it to be survey noise.

### Did commuting data help?

Commuting adds where workers live and work. Below, the error with commuting minus the error
without it; a negative number means commuting helped.

- Regression on housing, jobs and commuting: +0.14 points (80% range +0.11 to +0.17, 30 counties); the data show a loss within this sample.
- Boosted trees on the same inputs: -0.10 points (80% range -0.18 to -0.01, 30 counties); the data show a gain within this sample.

When one state was left out of fitting and forecast from the other two, commuting raised the
average miss in 6 of 6 cases; in 4 the whole 80% range is above zero.

| State left out | Forecast | With minus without commuting | Range |
|---|---|---:|---|
| Colorado | Regression on housing, jobs and commuting | +0.98 | +0.22 to +1.64 |
| Colorado | Boosted trees on the same inputs | +0.17 | -0.11 to +0.45 |
| Massachusetts | Regression on housing, jobs and commuting | +0.34 | +0.25 to +0.44 |
| Massachusetts | Boosted trees on the same inputs | +0.00 | -0.14 to +0.15 |
| Washington | Regression on housing, jobs and commuting | +1.04 | +0.19 to +1.93 |
| Washington | Boosted trees on the same inputs | +0.73 | +0.35 to +1.16 |

### Which inputs helped the regression?

| Inputs | Forecast | Final-test error |
|---|---|---:|
| Past share only | Regression on housing, jobs and commuting | 3.10 |
| + rent, income, housing stock | Regression on housing, jobs and commuting | 2.77 |
| + jobs and pay | Regression on housing, jobs and commuting | 3.46 |
| + commuting (everything) | Regression on housing, jobs and commuting | 3.60 |
| Everything except housing | Regression on housing, jobs and commuting | 3.68 |
| Everything except jobs | Regression on housing, jobs and commuting | 2.75 |
| Past share only | Boosted trees on the same inputs | 3.09 |
| + rent, income, housing stock | Boosted trees on the same inputs | 3.34 |
| + jobs and pay | Boosted trees on the same inputs | 3.22 |
| + commuting (everything) | Boosted trees on the same inputs | 3.12 |
| Everything except housing | Boosted trees on the same inputs | 3.09 |
| Everything except jobs | Boosted trees on the same inputs | 3.21 |

Rent, income and housing alone gave the regression an error of 2.77, against
2.85 for carrying forward. Adding jobs raised it to 3.46.

## Every county, 2011–2024

Rent and income are medians; the gap is rent growth minus income growth in log points.
Jobs and pay are counted at workplaces, 2011–2023.

| County | 2011 | 2024 | Change ± margin | Verdict | Rent | Renter income | Gap | Jobs | Pay |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| Douglas County, Colorado | 39.5% | 51.0% | +11.5 ± 10.0 | up | +31.0% | +11.0% | +16.5 | +56.7% | +12.2% |
| Thurston County, Washington | 46.1% | 56.8% | +10.7 ± 9.2 | up | +35.6% | +13.3% | +18.0 | +31.5% | +17.2% |
| Kitsap County, Washington | 49.2% | 57.5% | +8.3 ± 8.9 | within noise | +36.3% | +21.0% | +11.9 | +14.9% | +13.2% |
| El Paso County, Colorado | 47.9% | 54.5% | +6.5 ± 5.4 | up | +42.4% | +31.4% | +8.0 | +30.7% | +9.4% |
| Benton County, Washington | 44.2% | 50.3% | +6.1 ± 11.2 | within noise | +22.5% | +2.6% | +17.7 | +20.2% | -2.6% |
| Hampshire County, Massachusetts | 55.7% | 61.6% | +6.0 ± 11.8 | within noise | +16.6% | +10.3% | +5.6 | +10.3% | +11.5% |
| Snohomish County, Washington | 51.1% | 56.3% | +5.2 ± 6.0 | within noise | +40.9% | +26.2% | +11.1 | +18.5% | +14.6% |
| Essex County, Massachusetts | 53.0% | 57.7% | +4.7 ± 4.7 | up | +35.3% | +19.2% | +12.7 | +7.8% | +7.6% |
| Worcester County, Massachusetts | 49.6% | 53.5% | +3.9 ± 4.9 | within noise | +29.9% | +29.3% | +0.4 | +11.9% | +5.1% |
| Bristol County, Massachusetts | 51.6% | 55.5% | +3.8 ± 5.6 | within noise | +22.4% | +18.6% | +3.1 | +9.0% | +6.8% |
| Whatcom County, Washington | 53.4% | 57.3% | +3.8 ± 8.8 | within noise | +27.0% | +30.1% | -2.4 | +17.6% | +16.3% |
| Pierce County, Washington | 52.0% | 54.6% | +2.6 ± 4.3 | within noise | +41.7% | +29.4% | +9.1 | +27.1% | +15.0% |
| Hampden County, Massachusetts | 52.6% | 55.2% | +2.6 ± 6.8 | within noise | +10.3% | +13.7% | -3.0 | +4.2% | +2.8% |
| Adams County, Colorado | 54.3% | 56.6% | +2.2 ± 6.7 | within noise | +48.2% | +41.7% | +4.5 | +58.4% | +21.0% |
| Larimer County, Colorado | 56.9% | 57.8% | +0.9 ± 7.7 | within noise | +32.9% | +41.4% | -6.2 | +35.7% | +18.3% |
| Jefferson County, Colorado | 51.1% | 51.6% | +0.5 ± 5.8 | within noise | +50.1% | +46.9% | +2.2 | +20.6% | +14.8% |
| Denver County, Colorado | 49.2% | 49.5% | +0.3 ± 4.5 | within noise | +57.9% | +58.1% | -0.1 | +34.5% | +19.0% |
| Boulder County, Colorado | 56.7% | 56.8% | +0.1 ± 6.5 | within noise | +33.8% | +43.0% | -6.7 | +25.0% | +22.3% |
| Pueblo County, Colorado | 53.7% | 53.8% | +0.1 ± 9.7 | within noise | +7.6% | +13.1% | -5.0 | +11.4% | +10.2% |
| Arapahoe County, Colorado | 54.2% | 53.9% | -0.3 ± 5.7 | within noise | +51.3% | +48.6% | +1.8 | +22.7% | +9.1% |
| Middlesex County, Massachusetts | 46.9% | 46.4% | -0.6 ± 3.1 | within noise | +29.7% | +34.9% | -3.9 | +14.9% | +11.4% |
| Suffolk County, Massachusetts | 54.0% | 53.3% | -0.7 ± 3.6 | within noise | +29.2% | +58.9% | -20.7 | +21.5% | +17.0% |
| King County, Washington | 48.6% | 47.6% | -1.0 ± 2.7 | within noise | +41.8% | +44.0% | -1.5 | +28.0% | +40.6% |
| Norfolk County, Massachusetts | 52.0% | 49.6% | -2.4 ± 5.7 | within noise | +25.0% | +27.9% | -2.3 | +9.0% | +7.1% |
| Plymouth County, Massachusetts | 57.9% | 55.2% | -2.7 ± 6.6 | within noise | +19.8% | +42.3% | -17.2 | +12.9% | +11.4% |
| Clark County, Washington | 52.4% | 49.4% | -3.0 ± 5.8 | within noise | +40.3% | +53.2% | -8.8 | +41.1% | +19.0% |
| Weld County, Colorado | 57.4% | 52.4% | -5.1 ± 9.7 | within noise | +35.4% | +41.7% | -4.5 | +41.5% | +19.4% |
| Spokane County, Washington | 54.3% | 48.2% | -6.1 ± 5.1 | down | +42.2% | +52.9% | -7.2 | +22.5% | +15.4% |
| Barnstable County, Massachusetts | 67.2% | 53.8% | -13.5 ± 10.9 | down | +0.0% | +47.6% | -39.0 | +8.3% | +14.1% |
| Yakima County, Washington | 56.5% | 40.1% | -16.4 ± 8.8 | down | +7.3% | +33.3% | -21.7 | +14.6% | +13.9% |

## What this does not show

- It covers 30 large counties in three states, chosen by 2011 population before any results
  were seen. It says nothing about the United States as a whole.
- It describes associations, not causes. It does not show that job growth raises rent.
- Publication delays are assumed (survey one year, workplace jobs two, commuting four), and
  today's revised files stand in for what forecasters saw at the time.
- Only two final-test years and three states exist, so the ranges above are wide, and the
  county ranges do not capture shocks shared by a whole state.
- The survey has no 2020 one-year estimates; that year is left out, never filled in.
- The derived margins ignore correlations between survey categories that the Census does
  not publish.

More states, archived releases and later years could change these conclusions. Definitions
are in METHODS.md, exclusions in COVERAGE.md, checks in VALIDATION.md.
