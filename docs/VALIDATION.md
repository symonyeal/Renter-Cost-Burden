# Validation — 2026-10-17

## Additional years and release checks, 2026-10-26

The official 2016–2021 Census comparison adds 110 renter-burden observations across 55
geographies on common 2021 boundaries. They are a separate measure from the detailed 2021
count reconstruction. The Canadian export now contains 4,447 observations from six sources.
All 110 new values and their source checksum match an independent reading of the UTF-8 CSV.
The existing five-source checks also passed. Accented geography names are retained.

The year control changes the displayed value and same-source place comparison, persists in
the URL and survives reload. The historical national selection shows the source's 40.0% in
2016 and 33.2% in 2021; earlier detailed-count values are not spliced into this series.

Local checks: Rust 7 passed; Python 44 passed, 1 skipped (absent original US raw cache);
fmt, clippy with warnings denied, Ruff and pip dependency checks passed. Installed-Edge QA
passed 12 checks, including historical values and year restoration; both countries retain
all measure, download, history, theme and responsive checks. Rust US reconstruction still
reports zero bit differences across 390 county-years and four burden fields.

A source download through Rust succeeded using system certificate roots outside this machine's
sandbox. Certificate validation remains enabled. GitHub's clean-image CI and Pages deployment
are checked for the pushed release SHA; they are separate from these local measurements.

## Rust and Canadian expansion, 2026-10-26

Measured locally on Windows with Rust 1.99.1 and system Python 3.14.7. The older local Python
dependency versions listed below remain in use; this session did not install the CI pins.

| Check run this session | Result |
| --- | --- |
| Original offline pipeline and new `refit-us` entry point | Both completed; all 16 original processed files and both original fitted-model artifacts are byte-identical to the captured baseline. Build metadata changes with its build time and source paths. |
| Rust `verify-us` command | 390 county-years, four burden fields each; zero bit differences, maximum absolute difference 0.0. Comparator rejects a known last-bit change. |
| US atlas against reference exports | Exact county/year/measure membership and float64 money/burden values; every pooled burden, county change, growth figure, change margin and verdict matches. |
| Optional Rust bootstrap | Exact float64 outputs and identical NumPy RNG state across tested block sizes, cancellation cases, signed zero and all production paired comparisons. NumPy retains draws and quantiles. |
| `cargo test --locked` | 6 passed, 0 failed. |
| `cargo fmt --check`; `cargo clippy --locked --all-targets -- -D warnings` | Both passed. |
| `python -m pytest -q` with work-folder `--basetemp` | 43 passed, 1 skipped. The original US raw-cache check is skipped because that cache is absent; Canadian cache files do not count as a US raw cache. |
| `python -m ruff check .`; `python -m pip check` | All checks passed; no broken requirements. |
| Canadian ingestion | Five official tables; 4,337 observations including unavailable cells: 166 burden, 104 core housing need, 3,122 rent and 945 vacancy. |
| `python qa/canada_sources.py` | All five ZIP hashes match. Independently matched four national Census counts, 312 CHS estimate/bound cells, all 3,122 rent cells and all 945 vacancy cells, including statuses. The Census check is a national spot check, not a second full implementation. |
| Repeated offline builds and recovery | Bundle, US export and Rust build manifest have identical SHA-256 across builds. Changed collection settings and malformed Canadian JSON are rejected without overwriting accepted outputs. Restored inputs rebuild identically. |
| `python qa/browser.py`, installed Edge | 11 checks: both countries and every measure, displayed values, all 13 provincial/territorial comparison rows, source/quality notes, downloads, URL reload/back/forward, live themes and original US site rendering. No console errors or failed requests; no overflow at 390/768/1440 px in light/dark. |

Desktop, mobile and chart screenshots were inspected in two design rounds. The generic intro
was removed so the selected observation appears earlier. Vacancy axes use a zero-based scale
suited to their values; burden keeps its fixed 0–100% scale. Census geography quality codes and
nonresponse rates are visible. The original vendored Plotly asset matches the saved baseline.

The optional bootstrap was timed ten times per backend with the same 30-county final-test
differences, seed and 2,000 resamples, including draws, JSON and process startup. Median call
times were 0.000432 s for NumPy and 0.053069 s for the Rust subprocess. NumPy remains the
default for that small kernel. Overall pipeline speedup was not measured or claimed.

Rust owns Canadian ingestion/validation, US descriptive reconstruction and combined export.
US scikit-learn fitting, original bulk US adapters and reference diagnostics remain in Python.
Canadian sources were reprocessed from their cached official ZIPs. A second fresh network
download, full raw US ingestion, Linux/macOS execution, pinned-version CI, Safari/Firefox,
screen-reader testing and live GitHub Pages deployment were not measured. Canadian rents are
nominal CAD; US money is in 2023 USD. Survey populations and years differ. Canadian analysis
remains descriptive and the existing US forecast limits still apply.

The original-run snapshot, profiles, timing records, rebuild/recovery output and screenshots
are in `Useful Misc/Claude Func Folder/renter-cost-burden/` on the implementation machine.
Portable reconstruction and source-check commands are in README.md; build and US parity
manifests are under `artifacts/`.

## Original US validation record

The full official-data pipeline was executed locally with system Python 3.14.7. Raw retrieval,
sequence/table parsing, county aggregation, model fitting and static export all completed.
The final model fit was repeated after adding auditable calibration residuals; primary final
MAEs reproduced as 2.854647 (persistence), 3.600332 (regression), 3.119774 (trees).
The local integrity suite reports **9 passed**. The raw-source check is included locally.

| Certificate | Measured result |
|---|---|
| County/year uniqueness; published category sums; valid burden denominators and bounds | Passed across 390 ACS rows |
| Official-source spot checks | Three 2023 ACS counties, King QCEW; independent CSV LODES additive-total reconstruction |
| Source, fitting-label and inner-tuning chronology | Passed for every exported fold |
| State holdouts excluded from fitting; experiment memberships identical | Passed |
| Persistence and all exported MAE/RMSE/gains reconstructed | Passed |
| Earlier residual calibration and bounds reconstructed; held-out states absent from calibration | Passed |
| Ridge stationarity for the exported final predictor | Intercept and penalized normal equations within 1e-6 |
| Exact JS versus Python predictors | 180 observed/perturbed cases; maximum absolute difference 2.345e-10 pp |
| Dependencies | `No broken requirements found.` |
| Lint | `All checks passed!` |

Browser QA used installed Microsoft Edge (Chromium 155), served locally under `/site/` to
exercise a repository subpath. It measured:

- Initial JSON, local Plotly asset and every plot loaded; displayed metrics matched exports.
- Linked county, state, year and search; empty search results and absent Massachusetts LODES.
- Two/three-county controls, worker year and direction, evaluation regime, model, target period,
  weighting, diagnostic subset, actual ablation fits and commuting toggle.
- Scenario sliders and reset, derived rent-growth identity, household arithmetic and invalid input.
- URL restoration, section hash, global reset, native keyboard select operation and tab order.
- Every offered download returned nonempty HTTP 200.
- Desktop 1440×1000 and mobile 390×844; no horizontal document overflow on mobile.
- No console errors, page exceptions or failed requests.

Desktop, mobile hero and mobile model screenshots were inspected. The mobile hero was compacted
so its supported finding, complete evidence-bearing chart and explanation fit in the first view.
Browser QA shuts down its owned HTTP server and browser after completion.
### Maintenance rerun, 2026-10-17

After the refactor, `python -m analysis` rebuilt everything from the raw cache. Every file in
`data/processed/` and `artifacts/fits.json`/`scenarios.json` matched the previous release byte
for byte after CRLF→LF normalization (previously, re-reading cached QCEW CSVs perturbed the last
float digit; they are now parsed round-trip). Integrity suite: 9 passed. JS/Python predictor:
180 cases, maximum difference 2.34e-10 pp. Browser QA: all 12 checks passed, no console errors.

## Not measured / material limits

Supplementary comparison, 20 October 2026: `python -m analysis.comparison` reconstructed
16 paired model-versus-persistence comparisons from the frozen predictions, with
county-cluster intervals and year/state omission diagnostics. The full suite returned
11 passed and one skipped raw-cache check; Ruff and dependency checks passed. The
final-test split, source years and forecasts were unchanged. See
[the supplementary results](TEMPORAL_VALIDATION.md). This adds no archived vintages
or independent later holdout outcomes.

No archived-vintage reconstruction, national generalization, causal identification, future-year
prospective trial, screen-reader session, automated WCAG conformance audit, Safari/Firefox run,
physical mobile-device test, or actual GitHub Pages deployment. Small county-boundary adjustments
are not reconciled. Source publication dates mostly remain conservative-lag assumptions; the
Massachusetts first-release floor is documented separately. Cross-state destination rankings
are unavailable. Sampling-margin covariance is unknown. County bootstrap intervals do not
preserve common state shocks, and geographic transfer has only three independent state groups.

Reproduce the gate and browser QA with the commands in README.md. Raw-source tests require
the ignored cache; on a fresh clone the raw-source test is skipped until data are fetched.

## Reframe, 2026-10-20

Measured on Windows, system Python 3.14 with numpy 2.4.4, scipy 1.17.1, pandas 3.0.3,
scikit-learn 1.8.0 and plotly 6.7.0. These are older than the versions pinned in
`requirements.txt`; CI installs the pinned versions.

- Survey margin: the old ratio-formula margins were first reproduced exactly from the
  committed `acs.csv` columns (maximum difference 0.0). After switching to the proportion
  formula only `burden_moe` changed; median 5.78 pp became 4.25 pp, and no county-year needed
  the ratio fallback.
- Offline refit (`analysis.models`): `metrics.json`, `paired.json`, `calibration.csv`,
  `exclusions.json` and `artifacts/fits.json` are byte-identical to the previous release; in
  `panel.csv` and `predictions.csv` only `target_moe` changed. The exported final regression
  and tree models are identical to the former `scenarios.json` entries.
- The full offline pipeline (models, comparison, gap, build_site) was run twice; every
  processed file, artifact and generated report had identical SHA-256 both times.
- `analysis.gap`: carry-forward scores reproduce the registered final MAE (2.854647) and
  development MAE (3.598178) exactly; added-later forecasts use the same 60 + 150
  county-years, and their inputs come only from ACS years published by each forecast date.
- `python -m pytest -q`: 17 passed, 1 skipped (the raw-cache source check; `data/raw/` is not
  present on this machine). `python -m ruff check .`: all checks passed. `python -m pip check`:
  no broken requirements.
- Browser QA (`python qa/browser.py`, installed Microsoft Edge, served under `/site/`): headline
  numbers match `gap.json`; map click, county list and URL restore; period and scoring
  controls redraw; 30-row county table and 4-row holdout table; every download returns
  nonempty HTTP 200; no horizontal overflow at 390 px; no console errors or failed requests in
  light or dark colour scheme. Desktop screenshots in both schemes and a mobile screenshot were
  inspected.

Two build defects were found and fixed. `build_site` read the source manifest from the raw
cache, so without the cache it wrote "Raw cached bytes: 0" into COVERAGE.md and an empty source
list into the site; it now reads `data/processed/manifest.json`. It also overwrote the vendored
Plotly with whatever plotly.py bundled (here plotly.js 3.5.0 under the 4.1.1 file name); it now
leaves the vendored file alone unless the bundled version is 4.1.1.

Not measured in this pass: a rebuild from a fresh raw download, the pinned dependency versions
locally, Safari or Firefox, a screen reader, and the deployed GitHub Pages site before push.
