# Working contract

Read README.md, docs/METHODS.md and docs/VALIDATION.md before changing the study.
Report only outcomes read from exported predictions. Keep real data separate from test fixtures.
Use system Python 3.14. Code transcribes the definitions in docs/METHODS.md.
Never interpolate ACS 2020 or replace annual estimates with five-year estimates.
Keep the fixed sample and chronological folds: changing them after seeing errors changes the study.
Source revisions make this a pseudo-real-time backtest; do not claim archived-vintage forecasts.
The model is fitted in analysis/models.py; the browser evaluates its exported trees and coefficients.

Before finishing: `python -m pytest -q`, `python -m ruff check .`, `python -m pip check`.
State measured and unmeasured checks in docs/VALIDATION.md.
