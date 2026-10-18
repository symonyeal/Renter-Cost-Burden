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
