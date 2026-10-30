# Methods

This page records how values are read, joined, derived and checked. The definition, universe and
caveats of each measure live in [`data/measures.json`](../data/measures.json), which the site
shows in its Sources section; they are not repeated here.

## Reading the tables

Each table is the full-table CSV download from Statistics Canada
(`https://www150.statcan.gc.ca/n1/tbl/csv/<id>-eng.zip`). The pipeline caches the ZIP in
`data/raw/canada/` and records its retrieval time and SHA-256 in `data/processed/sources.json`.
A download is only cached once it opens as a ZIP, so a broken transfer cannot pass for a
complete one.

A cell is read with its status flag. An empty value is unavailable and stays empty, with the
flag kept (`x` suppressed, `F` too unreliable, `..` not available, `A`–`E` survey quality). A
number published beside an "unavailable" flag stops the build.

## Places

A place id is the Statistics Canada geographic code without its Census year: `pr-35` Ontario,
`m-535` Toronto (metro areas and agglomerations share the `m-` prefix because their codes do not
overlap), `mp-35505` the Ontario part of Ottawa–Gatineau, `cd-3520` a census division,
`csd-3520005` a census subdivision (community). CMHC tables use 2006 and 2011 codes; Census
tables use 2021 codes. Joining on the code makes Lethbridge one place across sources, even
though it was an agglomeration in 2011 and a metro area in 2021. The 2021 classification and
name win. Each observation keeps the Census year of its code in the `vintage` column, because
survey areas are redrawn after each Census.

Two repairs are applied and tested:

- Codes are zero-padded to their standard width. Table 46-10-0085 publishes St. John's as
  `2021S05031` instead of `2021S0503001`.
- A few CMHC centres and one CPI area have no code. They get an id scoped to their source
  (`cmhc-strathroy`), so a name match can never join them to a different area.

The 2016–2021 Census comparison from The Daily has names only. Its 41 metro areas are matched
to the 2021 Census names, and the build stops if any fails to match exactly once.

## Census burden

Rate = households spending 30% or more / (30% or more + under 30%). "Not applicable" households
(income zero or below, farm, on reserve) are outside the universe.

Counts are randomly rounded to multiples of five and small counts can round to zero, so the
categories need not add up to the total. A difference of up to 25 households or 5% is treated as
rounding. Beyond that, a cell with fewer than 1,000 households keeps its value and is flagged
"rounded counts do not add up"; a larger cell stops the build. Examples: Bathurst couples with
children are 265 + 0 + 0 against a total of 290; Midland renters under $10,000 are 0 + 0 + 0
against 30.

Table 98-10-0252 (Canada, provinces, metro areas) excludes on-reserve households. This was found
by reconciliation: Manitoba's renter rate is 33.50% in 98-10-0252 and in the off-reserve rows of
98-10-0255, but 33.28% with reserves included. The community table is therefore read off
reserve too. The build compares the two tables for Canada and every province and territory. The
allowed difference is what ten households of rounding can move, so Yukon's 24.89% against 24.95%
of about 5,500 renters passes.

Household types in 98-10-0252 repeat names under different parents ("With children" appears
twice); categories are selected by member id, and nested subtotals other than the family and
non-family totals are left out. The median and average income rows of the income dimension are
not counts and are not read.

Census data-quality notes are carried as short flags: "non-response 50%+, use with caution",
"incompletely enumerated", "excludes incompletely enumerated reserves", "income data suppressed".

## Other sources

- **Vacancy.** Some metro areas appear in both 34-10-0130 and 34-10-0131. The metro table is
  kept. Values that differ between the two are counted in `sources.json` (82 in the current
  data).
- **Population.** Canada appears in both population tables; the provincial table (17-10-0005)
  supplies the national series.
- **Core housing need.** The territories are not in the Canadian Housing Survey tables, and
  "Canada" there means the ten provinces. Population-centre groups (large urban, medium, small,
  rural) are kept as a separate measure.

## Derived series

| Series | Formula | Missing input |
| --- | --- | --- |
| Real rent | rent × CPI(province, latest year) / CPI(province, year), all items | no value |
| Rent change | rent(year) / rent(year − 1) − 1 | no value |
| Rent relative to prices | CPI rent / CPI all items × 100 (2002 = 100) | no value |
| Rent price inflation | CPI rent(year) / CPI rent(year − 1) − 1 | no value |
| Starts per 1,000 | starts / July 1 population × 1,000 | no value |
| Apartment share | apartment starts / all starts | no value |

The headline facts on the site (`facts` in `atlas.json`) are computed in `src/compute.rs` from the
same observations, so the page never types a number by hand.

## Maps

Boundaries are the Statistics Canada 2021 cartographic boundary files, requested from its ArcGIS
service in Statistics Canada Lambert (EPSG:3347). The service generalizes each shape to a layer
tolerance: 1,000 m for provinces, 800 m for divisions, 100 m for metro areas, 120 m for
communities. Neighbours are generalized separately, so a shared edge can differ by up to that
tolerance, which stays under a pixel at each map's zoom range. Islands smaller than 30 km² (provinces,
divisions) or 0.2 km² (metro areas, communities) are dropped, except a place's largest piece.
Coordinates are rounded to a quarter of the tolerance and delta-encoded. The service sometimes
answers from a misconfigured node; the fetcher reconnects for each retry and splits a request
that keeps failing.

Colour classes are sevenths of the values shown. By default they come from the selected year,
so each year shows its own spread; "Same colour scale for every year" uses all years so the
time-lapse shows levels rising. Changes use fixed classes around zero.

## Checks

| Check | Command |
| --- | --- |
| Unit tests: parsing, flags, rounding rules, place ids, derivations, encoding | `cargo test --locked` |
| Format and lints | `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings` |
| Offline build is byte-reproducible | CI builds twice and compares the entire `site/data/` tree |
| Independent cell-by-cell comparison with the raw tables | `python qa/sources.py` (needs `data/raw/`) |
| Browser: maps, scrubber, URL state, search, charts, downloads, theme, 390 px | `python qa/browser.py` |

`qa/sources.py` shares no code with the Rust adapters. It compares every CMHC rent cell, every
renter core-need percentage, the CPI rent and all-items series for Canada and the provinces, the
Census renter burden for Canada, provinces and territories recomputed from counts, and all 110
cells of the 2016–2021 comparison.
