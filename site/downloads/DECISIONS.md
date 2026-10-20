# Decisions

2026-10-17. Use the approved implementation brief without another design gate.
Reduce the national sample to ten 2011 ACS-covered counties per state in CO/MA/WA before
seeing errors. Bulk LODES costs scale by state/year, not selected county count. Preserve
chronological evaluation and state transfer rather than a broad incomplete national dashboard.

Use official sequence ACS through 2017, prototype table files for 2018–2019, table files from
2021 onward. Census API returned an HTML Missing Key page; bulk downloads need no token.

Use WAC/RAC denominators plus main OD for within-state rankings. Downloading every workplace
state's auxiliary OD just to compute resident outbound totals is unnecessary with RAC.
Ranked cross-state destinations remain unavailable and are labelled accordingly.

Use conservative lags and revised downloads; do not pretend to have historical vintages.
Keep the final 2023–2024 block untouched. Clipping and feature eligibility are common to all models.

2026-10-17, maintenance. Generated files are written with LF endings and UTF-8 on every OS, and
`.gitattributes` normalizes line endings, so outputs no longer differ between Windows and CI.
Network fetches moved from the site build into `analysis.data`; the site build is offline.
Per-state-year aggregates live in `data/interim/`. The custom launchers were replaced by
`python -m http.server`. The refactor reproduced every processed output byte for byte.

2026-10-20, reframe. The study now leads with what happened to renters, 2011-2024, and treats
the year-ahead forecast as one result among several. The registered forecast study, its sample,
folds and final 2023-2024 test are unchanged.

The derived 90% margin of the burden share now uses the Census formula for a proportion
(the numerator is a subset of the denominator): sqrt(mN^2 - p^2 mD^2)/D, falling back to the
ratio formula only where the term under the root is negative (no county-year needs it). The
earlier ratio formula overstated the median margin, 5.78 pp against 4.25 pp. The raw download
cache is not in the repository, so `data/processed/acs.csv` was updated by applying
`analysis.data.margin` to the committed file; a check first reproduced every old margin exactly
from the same columns, and only `burden_moe` changed. Refitting the models reproduced every
prediction, metric, calibration residual and fit record byte for byte; only `target_moe` in
`panel.csv` and `predictions.csv` changed.

The scenario sliders and household calculator were removed: the sliders ran models that lose to
carrying the last value forward, and the calculator was not part of the study. The final fitted
predictors are still exported, now to `artifacts/final_model.json`, for the ridge check.

Two noise-aware forecasts were added after the original test had been scored, so they are
labelled post hoc and kept out of `predictions.csv`. Before scoring, three-, two- and four-year
means were compared on both blocks (MAE development 3.016 / 3.127 / 2.920, final 2.831 / 2.816 /
2.958); the three-year mean is reported. The partial-pooling forecast was specified here before
it was run. At each origin, with latest published ACS year u and every county-year up to u:
state-year level a(s,t) = mean county share; county offset g(c) = mean over years of
share - a; remaining deviation e(c,t) = share - a - g. The variance of real year-to-year
deviations is v = max(0, sum e^2 / (N - C) - mean sampling variance), with N county-years and
C counties. The forecast is a(s,u) + g(c) + w e(c,u), with w = v / (v + s(c,u)^2) and s the
sampling standard error (90% margin / 1.645). It is clipped to [0, 100] and scored only on the
temporal folds.
