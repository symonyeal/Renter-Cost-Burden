# Sources

## Canadian expansion, inspected 2026-10-26

The Rust adapter parses the official ZIP CSVs and their metadata. Source URLs, ZIP and metadata
SHA-256, retrieval dates and source release dates are retained in `data/processed/canada.json`.
Definitions, selections and exclusions are in [CANADA.md](CANADA.md).

| Official source | Use |
| --- | --- |
| [Statistics Canada 98-10-0252-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810025201) | 2021 Census renter shelter-cost-to-income categories and geography quality flags |
| [Statistics Canada 46-10-0085-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610008501) | Canadian Housing Survey renter core housing need, with published confidence limits |
| [CMHC via Statistics Canada 34-10-0133-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013301) | Two-bedroom mean rents, privately initiated row/apartment structures with at least three units |
| [CMHC via Statistics Canada 34-10-0130-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013001) | Vacancy, all bedroom sizes, matching structure universe, metropolitan areas |
| [CMHC via Statistics Canada 34-10-0131-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013101) | Vacancy, all bedroom sizes, matching structure universe, agglomerations of at least 50,000 |

[Canada Regional Profiles](https://github.com/symonyeal/Canada-Regional-Profiles) informed
geographic coverage and missing-value handling. It is a related implementation, not the source
of this project's observations. Its live-API design is distinct from this reproducible build.

The optional bootstrap reduction follows NumPy's pairwise sum and reduction identity:
[NumPy 2.4.4 reduction loop](https://github.com/numpy/numpy/blob/v2.4.4/numpy/_core/src/umath/loops_arithm_fp.dispatch.c.src)
and [pairwise summation](https://github.com/numpy/numpy/blob/v2.4.4/numpy/_core/src/umath/loops_utils.h.src).
NumPy retains the random draws and quantiles. The small bootstrap stays on NumPy by default.

## Original US sources

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
