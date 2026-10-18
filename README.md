# The Prosperity Gap

When a county gains jobs, do its renters end up spending more of their income on rent? And
if you know how jobs and commuting are changing, can you better predict how many renters
will be stretched next year?

## In plain terms

A renter household counts as *stretched* if rent and utilities take 30% or more of its
income. This project tries to predict, a year ahead, what share of renters in a county are
stretched. It covers the ten largest counties in each of Colorado, Massachusetts and
Washington (30 in all) from 2011 to 2024, using official statistics on housing, jobs and
commuting.

Every prediction uses only figures that had actually been published by then. A forecaster in
December 2022 could not have known the 2023 job numbers, so the test does not let the models
know them either.

**What we found.** The simplest guess won. Assuming the share stays at its latest published
value missed by 2.9 percentage points on average in 2023–2024 (predicting 45% when the true
share was 48% is a miss of 3 points). Two statistical models that also used housing, jobs and
commuting data missed by 3.1 and 3.6 points. Commuting data helped one model and hurt the
other. When a model was trained on two states and tested on the third, commuting data made
its predictions slightly worse in every case.

**What this does not show.** It is a small regional study, not a national one. It measures
prediction, not cause: it does not show that job growth raises rents. It gives no advice to
households.

## Technical summary

    Target: 100 × renters spending ≥30% of income on gross rent / renters with a computable ratio.
    Origin: December 31 of t. Target year: t+1. Only lag-eligible predictors and labels.

Sample: the ten largest 2011 ACS counties in each of Colorado, Massachusetts and Washington.
Results are in [Findings](docs/FINDINGS.md), the design in [Methods](docs/METHODS.md), coverage
and exclusions in [Coverage](docs/COVERAGE.md), checks in [Validation](docs/VALIDATION.md).

## View the site

Live: **https://symonyeal.github.io/The-Prosperity-Gap/**. To serve it locally:

```powershell
python -m http.server 8765 --directory site
```

Open http://localhost:8765. The site is static (no backend); all assets, including Plotly.js,
are local. Opening `index.html` via `file://` cannot load `data.json`; use HTTP.

## Reproduce

System Python 3.14; no virtual environment.

```powershell
python -m pip install -r requirements.txt
python -m analysis              # data -> models -> site; or run each stage:
python -m analysis.data         #   fetch official sources, aggregate (network on first run)
python -m analysis.models       #   panel, expanding-window fits, metrics, exported predictors
python -m analysis.build_site   #   certificates, site bundle, FINDINGS.md, COVERAGE.md
python -m pytest -q
python -m ruff check .
```

`config.json` is the protocol: sample, years, lags, seed, feature groups, grids and paths.
Downloads are cached immutably in `data/raw/` (ignored; about 1 GB); per-state-year LODES and
historical QCEW aggregates are cached in `data/interim/`, so a rebuild needs no bulk download.

| Path | Contents |
|---|---|
| `analysis/` | `data.py` sources, `models.py` fits and evaluation, `build_site.py` export |
| `data/processed/` | estimates, panel, predictions, metrics, exclusions, provenance manifest |
| `artifacts/` | fit records, exact exported predictors, build hashes |
| `site/` | static site; `data.json` and `downloads/` are generated |
| `tests/`, `qa/` | integrity certificates; JS/Python predictor agreement; browser QA |

The browser evaluates the exported ridge coefficients and histogram trees exactly;
`node qa/scenario.cjs` checks it against Python. Browser QA (`pip install -r
requirements-qa.txt`, then `python qa/browser.py`) drives installed Microsoft Edge.

## Limits

Release dates are conservative assumed lags, not archived vintages: this is a pseudo-real-time
backtest. The final test covers two years and geographic transfer three states. The study
supports predictive comparisons, not causal conclusions or household advice.
