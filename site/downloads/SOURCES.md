# Sources

Inspected 2026-10-17; individual raw-object retrieval dates and SHA-256 are in manifest.json.

| Source | Used for | Status |
|---|---|---|
| [Todd Jones catalogue](https://github.com/toddrjones/datasets) | Starting catalogue | Inspected |
| [ACS table shells](https://www.census.gov/programs-surveys/acs/technical-documentation/table-shells.html) | B25070 categories, B25119 renter median income | Inspected official 2023 machine-readable shells |
| [ACS summary files](https://www.census.gov/programs-surveys/acs/data/summary-file.html) | Official bulk published one-year estimates | Inspected table-based and sequence schemas |
| [ACS sequence documentation](https://www.census.gov/programs-surveys/acs/data/summary-file/sequence-based.html) | Geography LOGRECNO and sequence start positions | Inspected lookup files and miniature geography workbooks |
| [BLS QCEW files](https://www.bls.gov/cew/downloadable-data-files.htm) | County covered jobs, average annual pay, ownership | Inspected file definitions and API headers |
| [LODES8 technical documentation v8.4](https://lehd.ces.census.gov/data/lodes/LODES8/LODESTechDoc8.4.pdf) | JT01, WAC/RAC, main/aux definitions, geography | Inspected; state format 8.4, vintage 20251202_1657 |
| [LODES code examples](https://lehd.ces.census.gov/data/lehd-code-samples/sections/lodes/basic_examples.html) | Block identifiers and file schemas | Inspected |
| [2020 LODES release](https://www.census.gov/programs-surveys/ces/news-and-updates/updates/04042023.html) | Illustrative publication lag | Inspected |
| [LODES revision announcements](https://lehd.ces.census.gov/announcements.html) | Current historical files contain revisions | Inspected |
| [OnTheMap Data Notices](https://lehd.ces.census.gov/doc/OnTheMapDataNotices.pdf) | Massachusetts first release March 3, 2016 | Inspected |
| [Census county changes](https://www.census.gov/programs-surveys/geography/technical-documentation/county-changes.html) | Major county changes; minor adjustments not reconciled | Inspected |
| [FRED CPIAUCNS](https://fred.stlouisfed.org/series/CPIAUCNS) | Annual-average CPI-U, unadjusted | Inspected CSV; source BLS |
| [scikit-learn Ridge](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html) | Penalized least squares | Cited |
| [Histogram boosting](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html) | Maintained nonlinear implementation | Cited |
