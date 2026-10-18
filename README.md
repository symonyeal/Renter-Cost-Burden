# The Prosperity Gap

Can workplace growth and commuting improve predictions of renter housing-cost burden?
A reproducible regional backtest on official public data, with a static research site.

    Target: 100 × renters spending ≥30% of income on gross rent / renters with a computable ratio.
    Origin: December 31 of t. Target year: t+1. Only lag-eligible predictors and labels.

Sample: the ten largest 2011 ACS counties in each of Colorado, Massachusetts and Washington.
Results are in [Findings](docs/FINDINGS.md), the design in [Methods](docs/METHODS.md), coverage
and exclusions in [Coverage](docs/COVERAGE.md), checks in [Validation](docs/VALIDATION.md).

## View the site

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
