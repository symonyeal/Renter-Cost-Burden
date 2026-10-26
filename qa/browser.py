"""Exercise the country atlas in installed Edge under a repository subpath.

Legend: b bundle; c country; m measure; r observation; u URL; e browser errors.
"""

import csv
import functools
import io
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parents[1] / "renter-cost-burden"


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    b = json.loads((ROOT / "site/bundle.json").read_text(encoding="utf-8"))
    shots = WORK / "shots"
    shots.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    u = f"http://127.0.0.1:{server.server_port}/site/"
    e, failed, checks = [], [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="msedge", headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.on("pageerror", lambda error: e.append(str(error)))
            page.on(
                "console",
                lambda message: e.append(f"{message.text} at {message.location}")
                if message.type == "error" else None,
            )
            page.on("requestfailed", lambda request: failed.append(request.url))
            page.goto(u)
            page.wait_for_function("window.RENDERED === true")
            assert page.locator("#status").inner_text() == ""
            assert page.locator("#measure").input_value() == "burden_history"
            assert page.locator("#year option").all_text_contents() == ["2016", "2021"]
            page.select_option("#year", "2016")
            assert page.locator("#value").inner_text() == "40.0%"
            assert "2016" in page.locator("#compareHeading").inner_text()
            page.reload()
            page.wait_for_function("window.RENDERED === true")
            assert page.locator("#year").input_value() == "2016"
            page.select_option("#year", "2021")
            assert page.locator("#value").inner_text() == "33.2%"
            checks.append("Historical burden and year control restore 2016/2021 source values")
            assert page.locator("#comparison tbody tr").count() == 13
            page.locator("#comparison [data-place]").first.click()
            assert page.locator("#place").input_value() == page.locator(
                "#comparison [data-place]").first.get_attribute("data-place")
            checks.append(
                "Canadian comparison lists all 13 provinces/territories and selects a place")
            for c in ["ca", "us"]:
                page.locator(f'[data-country="{c}"]').click()
                for m in b[c]["measures"]:
                    available = [r for r in b[c]["observations"] if r["measure"] == m["id"]]
                    if not available:
                        continue
                    page.select_option("#measure", m["id"])
                    # Select a real geography and compare every table value to the bundle.
                    g = str(available[0]["geo_id"])
                    page.select_option("#place", g)
                    expected = sorted(
                        [r for r in available if str(r["geo_id"]) == g], key=lambda r: r["year"]
                    )
                    actual = page.locator("#observations tbody tr")
                    assert actual.count() == len(expected), (c, m["id"])
                    for i, r in enumerate(expected):
                        value = actual.nth(i).get_attribute("data-value")
                        assert value == "" if r["value"] is None else float(value) == r["value"]
                        assert str(r["year"]) in actual.nth(i).inner_text()
                        if r.get("status"):
                            assert r["status"] in actual.nth(i).inner_text()
                    latest = next(
                        (r for r in reversed(expected) if isinstance(r["value"], (int, float))),
                        None,
                    )
                    if latest:
                        shown = (
                            page.locator("#value").inner_text().replace(",", "").replace("%", "")
                        )
                        assert abs(float(shown) - latest["value"]) <= 0.051
                    assert page.locator("#universe").inner_text() == "Population: " + m["universe"]
                checks.append(
                    f"{c}: all available measures, table values and latest values match bundle"
                )
                for width in [390, 768, 1440]:
                    page.set_viewport_size({"width": width, "height": 1000})
                    for theme in ["light", "dark"]:
                        page.evaluate(
                            "(theme) => { document.documentElement.dataset.theme = theme; }", theme
                        )
                        assert page.evaluate(
                            "document.documentElement.scrollWidth <= innerWidth + 1"
                        ), (c, width)
                        page.evaluate("window.scrollTo(0, 0)")
                        page.screenshot(
                            path=str(shots / f"{c}-{width}-{theme}.png"), full_page=False
                        )
                        page.locator("#chart").screenshot(
                            path=str(shots / f"{c}-{width}-{theme}-chart.png")
                        )
                checks.append(f"{c}: 390/768/1440 widths in light/dark have no page overflow")
            old = page.locator("#place").input_value()
            options = page.locator("#place option").all()
            new = next(
                option.get_attribute("value")
                for option in options
                if option.get_attribute("value") != old
            )
            page.select_option("#place", new)
            page.reload()
            page.wait_for_function("window.RENDERED === true")
            assert page.locator("#place").input_value() == new
            page.go_back()
            assert page.locator("#place").input_value() == old
            page.go_forward()
            assert page.locator("#place").input_value() == new
            checks.append("URL reload, browser back and forward restore selection")
            with page.expect_download() as download:
                page.locator("#csv").click()
            text = Path(download.value.path()).read_text(encoding="utf-8")
            exported = list(csv.DictReader(io.StringIO(text)))
            assert len(exported) == page.locator("#observations tbody tr").count()
            assert all(r["geo_id"] == new for r in exported)
            checks.append("Selection CSV is downloadable and contains selected rows")
            for link in page.locator("a[download]").all():
                response = page.request.get(u + link.get_attribute("href"))
                assert response.ok and len(response.body()) > 0
            response = page.request.get(u + "us/index.html")
            assert response.ok and len(response.body()) > 0
            checks.append("Both country bundles and retained US study return nonempty HTTP 200")
            page.locator("#theme").click()
            assert page.locator("#theme").inner_text() == "Theme: light"
            page.locator("#theme").click()
            assert page.evaluate("document.documentElement.dataset.theme") == "dark"
            assert page.locator("#chart .point").evaluate_all(
                "els => els.every(el => getComputedStyle(el).fill !== 'rgb(164, 62, 28)')"
            )
            checks.append("Live theme toggle updates chart colour")
            legacy = browser.new_page(viewport={"width": 1440, "height": 1000})
            legacy.on("pageerror", lambda error: e.append(str(error)))
            legacy.on("requestfailed", lambda request: failed.append(request.url))
            legacy.goto(u + "us/")
            legacy.wait_for_function("window.RENDERED === true", timeout=120000)
            g = json.loads((ROOT / "data/processed/gap.json").read_text())
            latest = max(g["pooled"], key=lambda r: r["year"])
            assert f"{latest['b']:.1f}%" in legacy.locator("#tiles").inner_text()
            assert legacy.locator("#status").inner_text() == ""
            checks.append("Retained US site renders with its original aggregate burden value")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    assert not e, e
    assert not failed, failed
    checks.append("No console errors, page exceptions or failed requests")
    report = {"browser": "installed Microsoft Edge", "checks": checks, "screenshots": str(shots)}
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "browser.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    run()
