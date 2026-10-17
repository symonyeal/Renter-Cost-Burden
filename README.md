# The Prosperity Gap

[GitHub repository](https://github.com/symonyeal/The-Prosperity-Gap) · Release `v0.1.0`

A reproducible regional study and static research website: can workplace growth and commuting
improve predictions of renter housing-cost burden? Final outcomes, including model losses,
are reported in [Findings](docs/FINDINGS.md). The approved design is implemented in
[Methods](docs/METHODS.md); actual coverage and exclusions are in [Coverage](docs/COVERAGE.md).

    Target: 100 × renters spending ≥30% of income on gross rent / renters with a computable ratio.
    Origin: December 31 of t. Target reference year: t+1. Only lag-eligible predictors/labels.

The sample is fixed at ten 2011 ACS-covered counties per state in Colorado, Massachusetts and
Washington. This smaller regional scope permits complete validation with all four sources.
The default site contains real public observations only. No tokens, backend or model server.

## Run locally

From this project directory in PowerShell:

```powershell
.\serve.cmd
```

Open **http://localhost:8765**. Alternatively, with working Python aliases:

```powershell
py -3.14 -m http.server 8765 --bind 127.0.0.1 --directory site
```

The CMD launcher works under the laptop's restricted PowerShell execution policy.
It resolves the installed system Python directly because the Windows
Store `py` and `python` aliases were inaccessible in the implementation session. It creates no
environment. Opening index.html through file:// cannot load the JSON bundle in most browsers;
use HTTP. All assets, including pinned Plotly.js 4.1.1, are local. No network is needed to view
the built site. External source links naturally require internet access.

## Reproduce

Use the **system Python 3.14**, NumPy/SciPy/pandas/scikit-learn. No virtual environment.
The installed versions were inspected and `pip check` is part of the gate. Network access
to official Census, BLS and FRED hosts is needed only for fetching/rebuilding.

```powershell
$taskPython = "$env:LOCALAPPDATA\Python\pythoncore-3.14-64\python.exe"
& $taskPython -m pip install -r requirements.txt
& $taskPython -m analysis.data
& $taskPython -m analysis.models
& $taskPython -m analysis.build_site
& $taskPython -m pytest -q
& $taskPython -m ruff check .
& $taskPython -m pip check
.\serve.cmd
```

`config.json` is the protocol: sample, years, lags, seed, feature groups, grids, folds, interval
coverage and paths. The cached data build is restartable. Raw downloads are immutable within
the cache; clear an individual cached object only when deliberately updating its vintage.
Bulk files can exceed 1 GB and take several minutes; LODES is streamed in 300,000-row chunks
with three concurrent jobs. Metadata and actual totals are in the generated coverage report.

| Artifact | Location |
|---|---|
| Raw downloads + per-object retrieval metadata | `data/raw/` (ignored) |
| Published estimates, panel, predictions, metrics, exclusions | `data/processed/` |
| Feature lists, hyperparameters, fitting memberships | `artifacts/fits.json` |
| Release identifier, dependency versions, source/result hashes | `artifacts/build.json` |
| Exact linear/tree predictors + Python reference predictions | `artifacts/scenarios.json` |
| Static public site and lightweight downloadable results | `site/` |
| Design, source audit, findings, validation | `docs/` |

`analysis.build_site` asserts integrity/timing certificates before exporting `site/data.json`.
It also generates findings from the measured results. The site uses precomputed fits, not a
live training service. Browser scenario code evaluates the exact exported numerical trees
and coefficients; `node qa/scenario.cjs` compares them with Python at observed and perturbed
vectors. `site/data.json` and `site/downloads/` are generated and committed for local/offline use.

## Verification and publication

Integrity tests cover source categories, source spot checks, timing, geographic fitting
exclusions, identical experiment membership, persistence reconstruction, metric reconstruction,
LODES identities and JS/Python agreement. Raw-source spot checks require the raw cache; the
remaining checks use committed lightweight results.

Browser QA uses the installed Microsoft Edge via Playwright; install `requirements-qa.txt`
only if required, then run `python qa/browser.py`; it starts its own temporary server. See
[Validation](docs/VALIDATION.md) for measured results and limits.

The site uses relative paths and works below a GitHub Pages repository subpath. To publish,
create a repository, push the project, enable Pages with GitHub Actions, and run the supplied
`static-pages` workflow. A local build requires no deployment.

Release dates are conservative assumptions, not archived vintages. Final tests cover only two
years, and geographic validation has three independent state groups. The project supports
predictive comparisons, not causal conclusions or household advice.
