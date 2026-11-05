"""Exercise the atlas in installed Edge under a repository subpath, as GitHub Pages serves it.

Legend: A atlas.json; u base URL; pg page; e browser errors; f failed requests; ok passed checks.
Run after `cargo run --release --locked -- build`; needs `pip install -r requirements-qa.txt`.
"""

import functools
import json
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - signature fixed by the base class
        pass


def run() -> int:
    manifest = json.loads((ROOT / "site/data/manifest.json").read_text(encoding="utf-8"))
    prefix = f"data/generations/{manifest['generation']}/"
    A = json.loads((ROOT / "site" / prefix / "atlas.json").read_text(encoding="utf-8"))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    u = f"http://127.0.0.1:{srv.server_port}/site/"
    e, f, ok, requests = [], [], [], []
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge", headless=True)
        pg = b.new_page(viewport={"width": 1440, "height": 1000})
        pg.on("pageerror", lambda x: e.append(str(x)))
        pg.on("console", lambda m: e.append(m.text) if m.type == "error" else None)
        pg.on("requestfailed", lambda r: f.append(r.url))
        pg.on("request", lambda r: requests.append(r.url))

        def ready(url):
            pg.goto(url)
            pg.wait_for_function("window.RENDERED === true", timeout=60000)

        ready(u)
        assert pg.locator("#status").is_hidden()
        assert pg.locator("#tiles .tile").count() == 6
        top = A["facts"]["top_rent"]
        assert f"${round(top['rent']):,}" in pg.locator("#tiles").inner_text()
        ok.append("Lead tiles render the Rust-computed facts")

        assert pg.locator("#map svg path.feat:not(.base)").count() > 100
        assert pg.locator("#year-out").inner_text() == "2025"
        first = pg.locator("#rank-list li").first.inner_text()
        assert "Canmore" in first and "$2,438" in first, first
        ok.append("Metro rent map draws boundaries; ranking matches 34-10-0133 for 2025")

        pg.locator("#year").fill("2000")
        pg.locator("#year").dispatch_event("input")
        assert pg.locator("#year-out").inner_text() == "2000"
        ok.append("Year scrubber redraws the map")

        ready(u + "?m=burden&lv=community&pr=12")
        assert pg.locator("#map svg path.feat:not(.base)").count() > 50
        assert "Nova Scotia" in pg.locator("#rank-title").inner_text()
        ok.append("Community map loads a province's subdivisions and ranks reliable communities")

        ready(u + "?m=core_need&lv=province")
        assert pg.locator('#m-level button[data-lv="province"]').get_attribute("aria-checked") == "true"
        ok.append("Measure and level restore from the URL")

        ready(u + "?p=m-535,pr-62")
        assert pg.locator("#chips .chip").count() == 2
        pg.locator("#place-q").fill("Whiteh")
        pg.locator("#place-opts li").first.click()
        assert pg.locator("#chips .chip").count() == 3
        assert "csd-6001009" in pg.url or "Whitehorse" in pg.locator("#chips").inner_text()
        assert pg.locator("#cmp-table thead th").count() == 4
        ok.append("Search adds a place; comparison table has a column per place")

        for sel in ["#c-heat svg", "#c-bump svg", "#c-scatter svg", "#c-multiples svg", "#c-cpiheat svg",
                    "#c-income-bars svg", "#c-hh-bars svg", "#c-strip svg", "#c-need svg", "#c-dims svg",
                    "#c-size svg", "#c-startsheat svg", "#c-stack svg"]:
            assert pg.locator(sel).count() >= 1, sel
        ok.append("All 13 section charts render")

        for href in ["data/observations.csv", "data/places.csv", "data/atlas.json", "data/local.json", "data/lineage.csv"]:
            r = pg.request.get(u + prefix + href.removeprefix("data/"))
            assert r.status == 200 and len(r.body()) > 1000, href
        ok.append("Every download returns a nonempty HTTP 200")

        assert all(prefix in url for url in requests if "/site/data/" in url and not url.endswith("/manifest.json")), requests
        assert sum(url.endswith("/data/manifest.json") for url in requests) == 4
        ok.append("Atlas, geometry and downloads stay within each page's selected generation")

        rejected = pg.evaluate("""async () => {
          const U = await import('./js/util.js');
          const errors = [];
          for (const mutate of [a => a.schema = 999, a => {
            const cats = Object.values(a.series)[0], places = Object.values(cats)[0];
            Object.values(places)[0][0].pop();
          }]) {
            const a = structuredClone(U.D.A); mutate(a);
            try { U.load(a, U.D.L, []); } catch(e) { errors.push(e.message); }
          }
          const r = U.rows('rent_real', '2br', 'm-535').find(r => r[7]);
          return {errors, provenance: U.provenance(r)};
        }""")
        assert len(rejected["errors"]) == 2, rejected
        assert "Source:" in rejected["provenance"] and "cpi" in rejected["provenance"], rejected
        ok.append("Unsupported schemas and malformed rows are rejected; derived provenance is available")

        invalid = b.new_page()
        invalid.route("**/site/data/manifest.json", lambda route: route.fulfill(json={"schema": 999}))
        invalid.goto(u)
        invalid.wait_for_function("document.querySelector('#status').textContent.includes('Unsupported data schema')")
        assert not invalid.evaluate("window.RENDERED === true")
        invalid.close()
        ok.append("Unsupported manifest schema shows a loading error")

        pg.locator("#theme").click()
        pg.locator("#theme").click()
        assert pg.evaluate("document.documentElement.dataset.theme") == "dark"
        ok.append("Theme toggle reaches dark")

        m = b.new_page(viewport={"width": 390, "height": 900})
        m.on("pageerror", lambda x: e.append(str(x)))
        m.goto(u)
        m.wait_for_function("window.RENDERED === true", timeout=60000)
        assert m.evaluate("document.documentElement.scrollWidth") <= 390
        ok.append("390 px width has no horizontal page scroll")
        b.close()
    srv.shutdown()
    assert not e, e
    assert not [x for x in f if "fonts.g" not in x], f
    ok.append("No console errors, page exceptions or failed requests")
    print("\n".join(f"pass: {x}" for x in ok))
    return 0


if __name__ == "__main__":
    sys.exit(run())
