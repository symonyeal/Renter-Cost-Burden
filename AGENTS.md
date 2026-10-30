# Working contract

Read README.md and docs/METHODS.md before changing the pipeline or the site.

- Canada only. The former US study lives at the git tag `us-county-study`; do not reintroduce it on main.
- The pipeline is Rust. `cargo run --release --locked -- build` must run offline from `data/processed/`;
  only `fetch` and `fetch-geo` touch the network. Never commit `data/raw/` or `site/data/` (generated).
- Each measure keeps its own population and period, defined once in `data/measures.json`; the build
  rejects a measure without an entry. Never compute a burden rate from median rent and median income,
  never interpolate between Census or Housing Survey years, never fill a suppressed cell.
- Places join on Statistics Canada codes without the Census year (`place.rs`); names join only where
  a source has no codes, and then must match exactly once.
- Headline numbers on the page come from `facts` in `atlas.json`, computed in `src/compute.rs`; chart
  titles state findings computed from the data shown. Never type a figure into the page or README
  without checking it against the built data.
- Colours: region hues and sequential/diverging ramps are tokens in `site/style.css`; marks use
  `var()` strings so a theme toggle re-colours them. Validate any palette change for colour blindness.

Before finishing: `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`,
`cargo test --locked`, the offline build, `python qa/browser.py` after site changes, and
`python qa/sources.py` after any adapter change (needs the raw cache from `fetch`).
