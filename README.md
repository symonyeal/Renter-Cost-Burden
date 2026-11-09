# Renter Cost Burden

[Open the atlas](https://symonyeal.github.io/Renter-Cost-Burden/). Findings are on the site; this file covers the question, the measures and how to build it.

## Problem

- The atlas compares renter shelter costs across Canadian provinces, territories, metropolitan areas and 5,161 communities.
- Measures come from Statistics Canada and CMHC.

## Measures and limits

- Each measure keeps its own population and period.
- The 30% burden rate comes from the Census and covers renter households with income above zero.
- Core housing need comes from the Canadian Housing Survey and covers the ten provinces only. It also requires that the home be unaffordable, crowded or in poor repair, with no acceptable local option costing under 30% of income.
- Average rent and vacancy come from CMHC's survey of purpose-built rental buildings with three or more units.
- The CPI rent index follows the same units over time.
- These describe different things, so the site never divides one by another or presents one as another. A median rent divided by a median income is not a burden rate, and the site does not compute one.
- Census years are 2016 and 2021. Housing Survey years are 2018, 2021, 2022 and 2024. Charts show those years as separate points and draw nothing between them.
- Census 2021 measured 2020 income, which included pandemic benefits.
- Cells that Statistics Canada suppressed stay empty, with their status flag shown on hover.
- Census counts are randomly rounded to multiples of five, and small counts can round to zero. A community with 55 renter households can show 0% burdened even when some households are burdened.
- The community map shows every community. The ranking, the colour scale and the strip chart use only communities with 250 or more renter households, and every tooltip gives the renter count.
- Burden for Canada, provinces and metro areas comes from table 98-10-0252. Burden for census divisions and communities comes from 98-10-0255. The build checks that both give the same provincial rates to within rounding. That check showed 98-10-0252 excludes households on reserve, so the community table is read the same way.
- Real rents use the all-items CPI of the centre's province, in 2025 dollars. Where a province's CPI is not published for a year, the real rent for that year is left empty.
- Sources publish codes from the 2006, 2011, 2016 and 2021 Censuses. The atlas drops the vintage and keeps the code (Toronto is `m-535` in every table). Each value records which vintage it came from, because survey areas are redrawn after each Census.
- Two sources needed repair. The Housing Survey table writes St. John's code without its leading zeros, and some CMHC centres have no code at all; those centres keep a source-specific id so they are never matched by name to a different area.
- Full definitions, universes and caveats for every measure: [docs/METHODS.md](docs/METHODS.md) and the Sources section of the site.

## Sources

| Table | What | Years |
| --- | --- | --- |
| [34-10-0133](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013301) | CMHC average rents by bedroom count, 244 centres | 1987–2025 |
| [34-10-0130](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013001), [34-10-0131](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013101) | CMHC vacancy rates, metro areas and agglomerations of 50,000+ | 1992–2025 |
| [18-10-0005](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000501) | Consumer Price Index, annual: rent, shelter, all items | 1914–2025 |
| [11-10-0190](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110019001) | Median after-tax income, constant dollars | 1976–2024 |
| [17-10-0005](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710000501), [17-10-0148](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710014801) | Population, provinces and metro areas | 1971–2026 |
| [34-10-0126](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410012601) | CMHC housing starts and completions by dwelling type | 1955–2025 |
| [46-10-0085](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610008501), [46-10-0086](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610008601) | Canadian Housing Survey: core housing need and its causes | 2018–2024 |
| [98-10-0252](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810025201) | 2021 Census renter burden by income and household type | 2021 |
| [98-10-0255](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810025501) | 2021 Census renter burden for divisions and communities | 2021 |
| [The Daily, 2022-09-21, table 4](https://www150.statcan.gc.ca/n1/daily-quotidien/220921/t004b-eng.htm) | Renter burden 2016 and 2021 on common boundaries | 2016, 2021 |
| [2021 cartographic boundaries](https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer) | Provinces, divisions, metro areas, communities | 2021 |

Data: Statistics Canada and CMHC, Open Government Licence – Canada.

## Execution

The pipeline is Rust. `cargo run --release --locked -- build` works offline: it reads the accepted files in `data/processed/` and publishes an immutable generation under `site/data/`. The root defaults to the current directory; a moved executable can use `build --root PATH`. Processed CSVs pass the same measure and cell validation on fetch and offline build.

```text
cargo run --release --locked -- build      # offline: derived series, headline facts, site data
cargo run --release --locked -- fetch      # read the official tables (download any missing), then build
cargo run --release --locked -- fetch-geo  # retrieve 2021 boundaries from Statistics Canada, then build
cargo test --locked
python qa/sources.py                       # independent cell-by-cell check against the raw tables
python qa/browser.py                       # browser checks (pip install -r requirements-qa.txt)
```

| Path | Holds |
| --- | --- |
| `src/statcan.rs` | StatCan ZIP metadata and streaming row reader |
| `src/cache.rs`, `src/net.rs` | Validated source cache and provenance; HTTP retries shared by source readers |
| `src/sources.rs`, `src/census.rs`, `src/history.rs` | One adapter per table |
| `src/place.rs`, `src/dataset.rs` | Place ids, cell validation and typed measure contracts |
| `src/generation.rs` | Writer lease, complete file inventory and atomic manifest publication |
| `src/geo.rs` | Boundary retrieval, island pruning, compact encoding, label points |
| `src/compute.rs` | Pure calculations: derived series (real rent, yearly change, starts per 1,000) and facts |
| `src/atlas.rs` | Metadata validation, partitioning and site export |
| `data/measures.json` | Title, unit, universe and caveats for every measure; the build rejects a measure without one |
| `site/provinces.json` | Province codes, names, abbreviations and regions, embedded by Rust and read by the browser |
| `data/processed/` | `observations.csv` (every value with its status and source), `places.csv`, `sources.json`, `geo/` |
| `site/` | The atlas: D3 7.9.0, no build step |
| `site/js/colors.js`, `site/js/charts.js` | Shared classification and legends; chart forms and complete heat-chart assembly |

Build output:

- Raw downloads go to `data/raw/` and are not committed.
- `site/data/` is generated by the build, locally and on GitHub Pages.
- `manifest.json` selects `generations/<id>/`; the browser pins that generation for JSON, geometry, province metadata and downloads.
- Each file is hashed. The generation identity also covers processed inputs, measure metadata and the executable's embedded source identity.
- Fetch and geometry refresh stage complete processed generations before changing their manifest.
- Previous generations and failed stages remain available for recovery.
- The writer lease prevents overlapping commands in one root.
- Atomic visibility is provided; power-loss durability is not claimed.

The registered 30-county US forecasting study that this repository held until October 2026 is preserved at the git tag [`us-county-study`](https://github.com/symonyeal/Renter-Cost-Burden/tree/us-county-study).
