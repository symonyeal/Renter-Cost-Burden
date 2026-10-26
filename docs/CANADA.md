# Canadian sources and definitions

The Canadian section describes renter shelter costs, rental-market rents and vacancies.
It does not fit forecasts. Each measure keeps its own population, geography and reference
period. The Canadian data do not extend the registered US forecast experiment.

## Renter burden has a 2016–2021 comparison

[The Daily, table 4](https://www150.statcan.gc.ca/n1/daily-quotidien/220921/t004b-eng.htm)
publishes renter burden for both Census years on common 2021 geographic boundaries. The adapter
reads its official UTF-8 CSV, selects the two renter columns by their verified headers and retains
the published one-decimal percentages. It supplies 110 observations across Canada, all thirteen
provinces/territories and 41 metropolitan areas. At the national level the published percentages
are 40.0% in 2016 and 33.2% in 2021. Costs refer to the Census year; income is for the preceding
year. Temporary pandemic income support affects the 2020 income used for 2021.

This is the default historical burden measure. Its IDs are scoped to the comparison publication;
name matching is not used to harmonize geographies from different sources. The year selector
changes the displayed estimate and same-source place comparison. Observed years remain visible
in the chart and table; no values or connecting lines fill the intervening years.

The comparison is kept separate from the detailed 2021 table below. The Daily publication
is an earlier vintage and reports rounded percentages; a later detailed-table reconstruction can
differ. For example, its Nunavut renter figure is 5.2% whereas the detailed count reconstruction
rounds to 5.3%. Neither value silently replaces the other. Sampling intervals are not supplied.
The 2011 housing data came from the voluntary National Household Survey, a different survey
design; it is not appended as an interchangeable Census observation.

## Detailed shelter-cost counts use the 2021 Census

[Statistics Canada table 98-10-0252-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810025201)
reports shelter-cost-to-income categories separately for renters. Select total household
income, total household type, total housing suitability and total dwelling condition.
Keep the renter column, including its disclosure symbol, for each published count and
count confidence bound.

The percentage spending 30% or more is 100 times the count in that category divided by
the sum of the counts spending less than 30% and spending 30% or more. Households with
zero or negative income are in the not-applicable category and are excluded from that
denominator. The source universe is owner and tenant households in off-reserve, non-farm
private dwellings, from the 2021 Census 25% sample. The measure uses 2021 housing costs
and 2020 before-tax household income, during the pandemic and its temporary income
support programs. It is one observation, not an annual series.

The export retains the total, not-applicable, under-30% and 30%-or-more renter counts,
their published lower and upper count bounds and each symbol. Published counts are
randomly rounded independently. Category reconciliation allows a difference of twenty
households across the four base-five rounded counts and retains the observed difference.
The [2021 Census guide](https://www12.statcan.gc.ca/census-recensement/2021/ref/98-304/98-304-x2021001-eng.pdf)
describes random rounding and its effect on totals. A confidence interval for the derived percentage is
not available from these count bounds alone; the export leaves it blank. It does not
apply the US ACS survey-margin formula to Canada.

The Census source includes Canada, all ten provinces, all three territories and supported
census metropolitan areas and census agglomerations. Source DGUIDs, geographic levels,
data-quality codes, data-quality notes and long-form nonresponse rates remain attached
to each observation. Reserve exclusions and nonresponse limits therefore remain visible
with the territorial estimates as well as other areas.

## Core housing need has a separate definition

[Statistics Canada table 46-10-0085-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610008501)
provides Canadian Housing Survey renter estimates for 2018, 2021, 2022 and 2024. Select
the renter tenure category and percentage of households in core housing need, together
with the published 95% confidence limits. Keep Canada (provinces only), provinces and
named metropolitan areas; omit provincial urban/rural and other grouped aggregates.
The source uses 2021 Census geographic boundaries.

Core housing need assesses whether housing falls below adequacy, suitability or
affordability standards and the household would have to spend at least 30% of before-tax
income to rent acceptable alternative local housing. Households assessed have positive
income and a shelter-cost-to-income ratio below 100%. Special student-household rules
also apply, as described in the source footnotes. This percentage is distinct from the
percentage currently spending at least 30% on shelter.

The territories are absent from this CHS series. Its national row says “Canada
(provinces only)” throughout the export. No values are filled between survey years.
The inspected table 46-10-0084-01 contains dwelling, satisfaction and moving indicators,
so it is excluded. Table 46-10-0067-01 provides housing problems for vulnerable groups
but lacks a renter-tenure dimension, so it cannot supply this project's renter burden rate.

## Rents and vacancies describe the surveyed rental stock

[Statistics Canada table 34-10-0133-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013301)
distributes CMHC Rental Market Survey average rents for surveyed areas of 10,000 people
or more. Select two-bedroom units in row and apartment structures with three units or
more. Keep annual observations from `canada.first_year` in `config.json` (default 2011),
in nominal Canadian dollars per month.
These are average rents across the surveyed stock, rather than asking rents. Changes
can reflect changes in the dwellings surveyed. They are not a household burden measure.

Vacancy comes from the matching row-and-apartment, three-units-or-more structure universe:
[table 34-10-0130-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013001)
for census metropolitan areas and
[table 34-10-0131-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013101)
for census agglomerations of 50,000 or more. Those published vacancy rates cover all
bedroom sizes, which differs from the selected two-bedroom rent series. Keep aggregate
metropolitan and agglomeration rows labelled as aggregates; do not sum or average local rates.

These CMHC tables describe privately initiated rental structures. Geographic definitions
change every five years, so the source warns that historical observations are not strictly
comparable. The export preserves the published geography and terminated-series marker.
It does not calculate constant-boundary rent growth or inflation-adjusted Canadian rents.
CMHC data remain subject to the licence linked in the Statistics Canada table notes.

## Reproduce and inspect

Run `cargo run --release --locked -- fetch-ca` to download or reuse the official ZIP
cache in `data/raw/canada/` and generate `data/processed/canada.json`. The Census CSV is
streamed from its ZIP without extracting its approximately 1.38 GB uncompressed file.
The raw cache is ignored by Git. Remove or archive a cached source explicitly to fetch
a revised copy; the command does not silently replace an accepted cache.

Each exported source records its URL, download URL, SHA-256 of the ZIP and metadata,
retrieval timestamp and timestamp basis, byte size and source release date. Initial
inspection downloads use the cache file's modification time, labelled as such; new
downloads record the completion time. A cache preserves the retrieved release; this
is not a historical-vintage reconstruction. The ordinary `build` command reads the
committed processed export and needs no Canadian network access.

Empty, unavailable and suppressed source cells remain null with their flags. A numeric
zero remains zero. The adapter rejects duplicate natural keys, negative or nonfinite
values, percentages above 100, inconsistent published intervals, missing measure families
and missing national, provincial or territorial Census rows. Canadian count confidence
bounds and geographic data-quality information remain in the JSON download even where
the site displays only the derived percentage. Missing areas and years are never inferred.
