# Renter Cost Burden

Explore renter shelter costs in Canada and the United States. The site gives both countries
equal prominence, with each measure's population, period, quality flags and downloadable data.
The US section covers a fixed regional sample; it is not a national US estimate.

## Canadian coverage

| Measure | Published periods | Geography |
| --- | --- | --- |
| Renter burden, historical comparison | 2016 and 2021 Censuses, common 2021 boundaries | Canada, all 13 provinces/territories and 41 metropolitan areas |
| Renters spending at least 30% of income on shelter | 2021 Census | Canada, all 13 provinces/territories and 152 metropolitan/agglomeration areas |
| Renters in core housing need | 2018, 2021, 2022, 2024 Canadian Housing Survey | Provinces-only national estimate, provinces and selected metros |
| Two-bedroom average monthly rent | 2011–2025 CMHC Rental Market Survey | Source-supported rental markets; nominal CAD |
| Rental vacancy rate, all bedroom sizes | 2011–2025 CMHC Rental Market Survey | Source-supported metros and agglomerations |

Burden and core housing need are different measures. Rent describes the surveyed rental stock,
not asking rent or household burden. Missing observations remain missing. Canadian and US
currencies, years and survey populations are not pooled. See [Canadian definitions](docs/CANADA.md).
The year control changes the displayed estimate and place comparison; the chart and observation
table retain all available years. The historical burden series uses the same published comparison
for both years. Detailed 2021 counts remain a separate measure because revisions and rounding
can differ. Earlier 2011 housing estimates come from the voluntary National Household Survey;
they are not joined to this Census comparison. There are no estimates interpolated between years.

## Rust pipeline

Rust handles Canadian downloads and parsing, source validation, both countries' descriptive
exports and the combined site bundle. The US scikit-learn fitting and registered diagnostics
remain in Python as the reference implementation. The original bulk US source adapters also
remain in Python; the raw US cache is not needed for the default offline build.

Install the stable Rust toolchain, then run:

```text
cargo run --release --locked -- build       # offline analysis and combined site bundle
cargo run --release --locked -- verify-us   # exact US burden reconstruction
cargo run --release --locked -- fetch-ca    # explicitly fetch/reuse Canadian source ZIPs
cargo run --release --locked -- refit-us    # Python US study, then Rust site export
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

The optional US bootstrap backend can be selected with `RCB_BACKEND=rust` after building the
release executable. Python remains the default for that small kernel; startup and JSON transfer
must be included in any performance comparison. NumPy supplies identical random draws and
computes quantiles in both paths. No speedup is claimed for the rewrite as a whole.

The Rust build reads committed processed inputs and needs no network or Python installation.
Canadian source ZIPs and retrieval records are cached under `data/raw/canada/`; processed
exports retain source hashes, dates, disclosure symbols and Census geographic quality codes.
`artifacts/rust-build.json` records build input and output hashes.
The annual collection floor is `canada.first_year` in `config.json`, default 2011. A changed
window requires `fetch-ca` to regenerate the export; the offline build rejects a stale window.
With the optional source cache present, `python qa/canada_sources.py` checks source cells and ZIP
hashes independently of the Rust parser.

Serve `site/` with `python -m http.server 8765 --directory site`. The rebuilt atlas opens at
http://localhost:8765/; the preserved US study is at http://localhost:8765/us/.
Run `python qa/browser.py` for installed-Edge checks at desktop, tablet and mobile widths.

The related [Canada Regional Profiles](https://github.com/symonyeal/Canada-Regional-Profiles)
project informed geography and missing-data handling. This project uses versioned processed
observations for reproducible analysis; its related dashboard queries live APIs.

## Registered US study

Did renter incomes keep up with rent in the 30 largest counties of Colorado, Massachusetts and
Washington between 2011 and 2024? And did job growth make renters worse off?

**Site: https://symonyeal.github.io/Renter-Cost-Burden/**

## What the data shows

A renter household is *stretched* when rent and utilities take 30% or more of its income.
All figures are from Census and BLS data; dollars are adjusted for inflation.

1. **Half of renters are stretched, as in 2011.** 51.2% of renter households were stretched in
   2011 and 51.9% in 2024, a difference inside the survey margin (±1.0 point). The share fell to
   48.8% in 2019 and rose again after the pandemic.
2. **Rent and renter income grew at the same pace.** In the median county, rent rose 33% and the
   median renter's income 32%.
3. **Seven counties changed by more than the survey can miss.** The share rose in Douglas CO
   (+11.5 points), Thurston WA (+10.7), El Paso CO (+6.5) and Essex MA (+4.7), where rent outgrew
   renter income by 8 to 18 log points. It fell in Yakima WA (−16.4), Barnstable MA (−13.5) and
   Spokane WA (−6.1), where income outgrew rent.
4. **Job growth raised rent about twice as fast as renter income.** Per 10% more jobs, rent rose
   5.6% (80% range 3.7 to 8.7) and renter income 2.9% (0.1 to 6.8). Before the pandemic, the
   share stretched rose 1.8 points per 10% more jobs (0.2 to 3.5); over 2011–2024 the estimate
   (+0.8) does not resolve.
5. **Next year's share cannot be forecast.** A county's share moves about 3.7 points in a
   typical year, and survey sampling error alone would move it 4.0. Carrying last year's value
   forward missed by 2.85 points on 2023–2024. A regression on housing, jobs and commuting
   missed by 3.60, and boosted trees by 3.12. With a whole state left out, adding commuting
   data raised the miss in all six tests, by more than the 80% range in four.

The full tables, every county and every range are in [Findings](docs/FINDINGS.md).

**What this does not show.** Thirty large counties in three states do not represent the United
States. These are associations, not causes. Median renter income describes whoever rents that
year, so part of its rise may be higher earners moving into renting rather than raises.

## How it was done

- **Survey error first.** Every change is compared with its Census 90% margin, computed with
  the Census formula for a proportion. A change smaller than its margin is reported as such.
- **Forecasts use only what was published.** Each forecast stands at December 31 and predicts
  the next year from figures released by then (survey one year late, jobs two, commuting four).
  2023–2024 was held back as the final test and was registered before scoring.
- **Later additions are labelled.** A three-year average and a partial-pooling model were added
  after the final test had been scored. They beat carrying forward in 2017–2022 (the three-year
  average by 0.58 points) but not in 2023–2024. They are kept apart from the original results.

Definitions and formulas: [Methods](docs/METHODS.md). Exclusions: [Coverage](docs/COVERAGE.md).
Checks run: [Validation](docs/VALIDATION.md). Dated decisions: [Decisions](docs/DECISIONS.md).

## Reproduce the US study

System Python 3.14; no virtual environment.

```powershell
python -m pip install -r requirements.txt
python -m analysis              # every stage below, in order
python -m analysis.data         #   download sources and aggregate (about 1 GB on first run)
python -m analysis.models       #   forecast panel, fits, held-out forecasts, scores
python -m analysis.comparison   #   forecasts against carrying forward, with omission checks
python -m analysis.gap          #   county changes, survey noise, forecasts added later
python -m analysis.build_site   #   site bundle, FINDINGS.md, COVERAGE.md
python -m pytest -q
python -m ruff check .
```

Downloads are cached in `data/raw/` (not in the repository). Per-state-year commuting and
historical QCEW aggregates are cached in `data/interim/`, so every stage after `analysis.data`
runs offline from the committed `data/processed/` files.

To view the site locally, run `python -m http.server 8765 --directory site` and open
http://localhost:8765 (opening `index.html` as a file cannot load `data.json`). Browser checks:
`pip install -r requirements-qa.txt`, then `python qa/browser.py` (uses installed Microsoft Edge).

| Path | Contents |
|---|---|
| `analysis/` | `data.py` sources, `models.py` forecasts, `comparison.py` paired checks, `gap.py` county changes and noise, `build_site.py` reports and site |
| `config.json` | Sample, years, publication delays, seed, input groups, tuning grids |
| `data/processed/` | Survey estimates, forecast panel, forecasts, scores, `gap.json`, source checksums |
| `artifacts/` | Fit records, final fitted models, build hashes |
| `site/` | Static site; `data.json` and `downloads/` are generated |
| `tests/`, `qa/` | Data and timing checks; browser checks |
