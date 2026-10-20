# Working contract

Read README.md, docs/METHODS.md and docs/VALIDATION.md before changing the study.
Report only outcomes read from exported predictions. Keep real data separate from test fixtures.
Use system Python 3.14. Code transcribes the definitions in docs/METHODS.md.
Never interpolate ACS 2020 or replace annual estimates with five-year estimates.
Keep the fixed sample and chronological folds: changing them after seeing errors changes the study.
Source revisions make this a pseudo-real-time backtest; do not claim archived-vintage forecasts.
The forecasts are fitted in analysis/models.py. County changes, survey-noise checks and the
forecasts added after the final test live in analysis/gap.py; keep those added-later forecasts out
of predictions.csv and label them as added later wherever they appear.
Every stage after analysis.data runs offline from data/processed/; the raw cache is not committed.

Before finishing: `python -m pytest -q`, `python -m ruff check .`, `python -m pip check`.
State measured and unmeasured checks in docs/VALIDATION.md.
