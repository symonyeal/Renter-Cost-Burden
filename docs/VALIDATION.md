# Validation — 2026-10-17

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
