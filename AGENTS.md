# Working contract

Read README.md, docs/METHODS.md, docs/CANADA.md and docs/VALIDATION.md before changing the study.
Report only outcomes read from exported predictions. Keep real data separate from test fixtures.
Use system Python 3.14. Code transcribes the definitions in docs/METHODS.md.
Never interpolate ACS 2020 or replace annual estimates with five-year estimates.
Keep the fixed sample and chronological folds: changing them after seeing errors changes the study.
Source revisions make this a pseudo-real-time backtest; do not claim archived-vintage forecasts.
The forecasts are fitted in analysis/models.py. County changes, survey-noise checks and the
forecasts added after the final test live in analysis/gap.py; keep those added-later forecasts out
of predictions.csv and label them as added later wherever they appear.
Every stage after analysis.data runs offline from data/processed/; the raw cache is not committed.
The default atlas build is `cargo run --release --locked -- build`; it runs offline without Python.
Rust owns Canadian sources, descriptive exports and the combined site; Python retains the US
models, bulk US adapters and reference diagnostics. `refit-us` reruns the US study and builds both.
Canadian Census burden, CHS core housing need and CMHC rents/vacancies have different populations.
Keep their definitions, periods, source flags and geography quality notes attached. Never fill
suppressed cells or interpolate burden between surveys. `fetch-ca` is an explicit source refresh;
`canada.first_year` defaults to 2011. A changed collection window requires regeneration.
The registered US site is in site/us; analysis.build_site rebuilds it. site/ is the country atlas.
The optional bootstrap backend RCB_BACKEND=rust must preserve NumPy's random draws, pairwise
reduction and positive-zero identity. Python is the default because subprocess/JSON costs more
than the small NumPy reduction; do not claim a rewrite speedup without timing the full calls.

Before finishing: `python -m pytest -q`, `python -m ruff check .`, `python -m pip check`.
State measured and unmeasured checks in docs/VALIDATION.md.
Also run `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`,
`cargo test --locked`, `cargo run --release --locked -- verify-us` and the offline build.
Run `python qa/browser.py` after site changes. `python qa/canada_sources.py` requires the optional
Canadian source cache and independently checks source cells and ZIP hashes.
