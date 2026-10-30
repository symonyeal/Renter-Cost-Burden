# Renter Cost Burden

How much do Canadian renters pay, how has it changed, and where is it hardest? This project
gathers the official answers from Statistics Canada and CMHC into one interactive atlas, with
every province, territory, metro area and 5,161 communities. You can compare any of them with
each other.

**Site: https://symonyeal.github.io/Renter-Cost-Burden/**

## What the tables show

- **One renter household in three spends 30% or more of its income on shelter.** The 2021
  Census put it at 33.2%, down from 40.0% in 2016. The 2021 Census asked about 2020 income,
  which included pandemic benefits, so part of the fall is temporary income support rather than
  cheaper housing.
- **Rents for the same units kept pace with prices; average rents did not.** The CPI rent
  index, which prices the same rental units over time, rose 68.6% from 2000 to 2025 against
  72.1% for all consumer prices. Average two-bedroom rents in the CMHC survey rose faster. In
  the typical metro area they rose 31% more than prices from 2015 to 2025 (median of 40 metro
  areas, in 2025 dollars), because newer and dearer units entered the stock.
- **Rent is still rising fast.** In 2025, two-bedroom rents rose more than 5% in 24 of the 40
  metro areas with a published change. Vancouver had the highest metro two-bedroom rent
  ($2,364); Canmore, Alberta, an agglomeration, was higher still ($2,438).
- **About one renter household in five is in core housing need.** That was 22.0% in the ten
  provinces in 2024, the same as in 2018. It was highest in Saskatchewan and British Columbia
  (29%) and lowest in Quebec (13.7%). Core housing need is a stricter test than the 30% rule: the
  home must also be unaffordable, crowded or in poor repair, with no acceptable local option
  under 30% of income.
- **Burden falls steeply with income.** In 2021, 77% of renter households with $10,000–20,000
  of income spent 30% or more, against 2.5% of those with $100,000 or more. People living alone
  were the most stretched household type (45.3%).
- **Building per person is half its 1970s peak.** Canada started 6.2 homes per 1,000 residents
  in 2025, against 11.9 in 1973. Apartments were 66% of starts in 2025, against 24% in 1995.

## How the atlas treats the numbers

**Each measure keeps its own population and period.** The 30% burden rate comes from the
Census and covers renter households with income above zero. Core housing need comes from the
Canadian Housing Survey and covers the ten provinces only. Average rent and vacancy come from
CMHC's survey of purpose-built rental buildings with three or more units. The CPI rent index
follows the same units over time. These describe different things, so the site never divides
one by another or presents one as another. A median rent divided by a median income is not a
burden rate, and the site does not compute one.

**Nothing is filled in.** Census years are 2016 and 2021, and Housing Survey years are 2018,
2021, 2022 and 2024. Charts show those years as separate points and draw nothing between them.
Cells that Statistics Canada suppressed stay empty, with their status flag shown on hover.

**Small places get a warning, not a guess.** Census counts are randomly rounded to multiples
of five, and small counts can round to zero. A community with 55 renter households can show
0% burdened when the true figure is a handful. The community map shows every community. The
ranking, the colour scale and the strip chart use only those with 250 or more renter households,
and every tooltip gives the renter count.

**The two Census tables have to agree.** Burden for Canada, provinces and metro areas comes
from table 98-10-0252. Burden for census divisions and communities comes from 98-10-0255. The
build checks that both give the same provincial rates to within rounding. That check showed
98-10-0252 excludes households on reserve, so the community table is read the same way.

**Inflation adjustment uses the province's own prices.** Real rents use the all-items CPI of
the centre's province, in 2025 dollars. Where a province's CPI is not published for a year, the
real rent for that year is left empty.

**Places join on Statistics Canada codes, not names.** Sources publish codes from the 2006,
2011, 2016 and 2021 Censuses. The atlas drops the vintage and keeps the code (Toronto is
`m-535` in every table). Each value records which vintage it came from, because survey areas
are redrawn after each Census. Two sources needed repair. The Housing Survey table writes
St. John's code without its leading zeros, and some CMHC centres have no code at all; those
centres keep a source-specific id so they are never matched by name to a different area.

The full definitions, universes and caveats for every measure are in
[docs/METHODS.md](docs/METHODS.md) and in the Sources section of the site.

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

## Project map

The pipeline is Rust. `cargo run --release --locked -- build` works offline: it reads the
committed files in `data/processed/` and writes the site's data to `site/data/`.

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
| `src/place.rs` | Place ids from Statistics Canada codes; observation validation |
| `src/geo.rs` | Boundary retrieval, island pruning, compact encoding, label points |
| `src/compute.rs` | Pure calculations: derived series (real rent, yearly change, starts per 1,000) and facts |
| `src/atlas.rs` | Metadata validation, partitioning and site export |
| `data/measures.json` | Title, unit, universe and caveats for every measure; the build rejects a measure without one |
| `site/provinces.json` | Province codes, names, abbreviations and regions, embedded by Rust and read by the browser |
| `data/processed/` | `observations.csv` (every value with its status and source), `places.csv`, `sources.json`, `geo/` |
| `site/` | The atlas: D3 7.9.0, no build step |
| `site/js/colors.js`, `site/js/charts.js` | Shared classification and legends; chart forms and complete heat-chart assembly |

Raw downloads go to `data/raw/` and are not committed. `site/data/` is generated by the build,
locally and on GitHub Pages.

The registered 30-county US forecasting study that this repository held until October 2026 is
preserved at the git tag
[`us-county-study`](https://github.com/symonyeal/Renter-Cost-Burden/tree/us-county-study).
