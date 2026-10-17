# Coverage audit

Sample fixed before errors: top ten ACS one-year population counties in each of CO/MA/WA,
baseline 2011. Selected counties: 30. National scope reduced for bulk LODES cost.
No major selected-county creation/consolidation was identified. Minor boundary adjustments
are not reconciled. Other states and nonselected counties
are outside the sample, not observations discarded for poor model performance.

ACS: 390 county-years, 2011–2024 excluding 2020; 0
county-years have a missing selected derived monetary/population/housing field.
QCEW: 420 county-years, 2010–2023;
0 suppressed all-industry totals.
LODES: 330 county-years, 2008–2019; JT01, common 2020 geography.
Massachusetts 2008–2010 lacks comparable workplace coverage (official availability table).
Its first release was March 2016; target 2014–2016 rows are excluded across all experiments.
See exclusions.json for every affected county-target.
Predictors use LODES through 2019 for origin 2023. Main OD plus WAC/RAC suffice for shares;
individual interstate destinations are not ranked. Full external-destination concentration omitted.
Raw cached bytes: 1,004,151,454. Processing streams 300,000-row chunks
with at most three concurrent state-year LODES jobs. Aggregates are cached separately.

Panel: 270 eligible county-targets. Evaluation membership
is identical for every feature experiment. Final tests have 60 county-targets; transfer has
three state holdouts, ten counties each. Training targets and county membership are in fits.json.

Publication dates: unavailable historically; conservative lags in METHODS.md. File modification
dates are stored but are not release dates. The 2020 ACS target is missing, never substituted.
Vacancy, richer demographics and full industry composition are omitted and documented.
The 2025 official ACS bulk endpoint returned HTTP 401; later compatible coverage is unverified.


| Reference year | ACS counties | QCEW counties | LODES counties |
|---|---:|---:|---:|
| 2008 | 0 | 0 | 20 |
| 2009 | 0 | 0 | 20 |
| 2010 | 0 | 30 | 20 |
| 2011 | 30 | 30 | 30 |
| 2012 | 30 | 30 | 30 |
| 2013 | 30 | 30 | 30 |
| 2014 | 30 | 30 | 30 |
| 2015 | 30 | 30 | 30 |
| 2016 | 30 | 30 | 30 |
| 2017 | 30 | 30 | 30 |
| 2018 | 30 | 30 | 30 |
| 2019 | 30 | 30 | 30 |
| 2020 | 0 | 30 | 0 |
| 2021 | 30 | 30 | 0 |
| 2022 | 30 | 30 | 0 |
| 2023 | 30 | 30 | 0 |
| 2024 | 30 | 0 | 0 |

Zero means outside declared collection scope or a documented gap.
