"""Drive the static site in installed Microsoft Edge, desktop and mobile, under a subpath.

Legend
  u    site URL under /site/      g   gap.json as written by analysis.gap
  e    console errors and page exceptions; x failed requests; k checks passed
  w    wait for the page's RENDERED flag
"""
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    """Quiet static file server; the site has no backend."""

    def log_message(self, *args):
        pass


def run():
    """Check the numbers shown against gap.json, the controls, downloads and mobile width."""
    g = json.loads((ROOT / 'data/processed/gap.json').read_text())
    t = next(p for p in g['periods'] if p['y1'] == 2024)
    s = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    u = f'http://127.0.0.1:{s.server_port}/site/'
    e, x, k = [], [], []
    with sync_playwright() as p:
        b = p.chromium.launch(channel='msedge', headless=True)
        for scheme in ['light', 'dark']:
            page = b.new_page(viewport={'width': 1440, 'height': 1000}, color_scheme=scheme)
            page.on('pageerror', lambda m: e.append(str(m)))
            page.on('console', lambda m: e.append(m.text) if m.type == 'error' else None)
            page.on('requestfailed', lambda r: x.append(r.url))
            w = lambda pg=page: pg.wait_for_function('window.RENDERED === true', timeout=120000)
            page.goto(u)
            w()
            page.screenshot(path=str(ROOT / f'qa/desktop-{scheme}.png'), full_page=True)
            if scheme == 'dark':
                page.close()
                continue
            assert page.locator('#status').inner_text() == ''
            pooled = {r['year']: r for r in g['pooled']}
            tiles = page.locator('#tiles').inner_text()
            assert f"{pooled[2024]['b']:.1f}%" in tiles
            moved = sum(c['verdict'] != 'within noise' for c in t['counties'])
            assert f'{moved} of 30' in tiles
            assert f"{pooled[2011]['b']:.1f}%" in page.locator('#answer').inner_text()
            k.append('Headline numbers match gap.json')
            c = next(c for c in t['counties'] if c['fips'] == '53067')
            card = page.locator('#card').inner_text()
            assert 'Thurston' in card and f"{c['b1']:.1f}%" in card
            page.locator('#map path[data-f="08035"]').click()
            page.wait_for_function("document.getElementById('card').innerText.includes('Douglas')")
            assert 'county=08035' in page.url
            page.select_option('#county', '25001')
            page.wait_for_function(
                "document.getElementById('card').innerText.includes('Barnstable')")
            k.append('Map click and county list update the county card and URL')
            page.reload()
            w()
            assert page.locator('#county').input_value() == '25001'
            k.append('County restores from the URL')
            n = page.evaluate("document.getElementById('jobShare').data[1].x.length")
            assert n == 30
            old = page.locator('#jobsNote').inner_text()
            page.select_option('#period', '2011-2019')
            page.wait_for_function("document.getElementById('jobsNote').innerText !== "
                                   + json.dumps(old))
            assert '2011–2019' in page.locator('#jobsNote').inner_text()
            k.append('Period control redraws the jobs charts')
            final = page.evaluate("document.getElementById('board').data[0].x")
            page.select_option('#block', 'development')
            page.wait_for_function("JSON.stringify(document.getElementById('board').data[0].x)"
                                   " !== " + json.dumps(json.dumps(final)))
            k.append('Scoreboard switches between final test and earlier years')
            assert page.locator('#countyTable tbody tr').count() == 30
            assert page.locator('#holdouts tbody tr').count() == 4
            k.append('County table has 30 rows; holdout table has 4')
            for a in page.locator('a[download]').all():
                r = page.request.get(u + a.get_attribute('href'))
                assert r.status == 200 and len(r.body()) > 0, a.get_attribute('href')
            k.append('Every download returns a nonempty HTTP 200')
            page.set_viewport_size({'width': 390, 'height': 844})
            page.goto(u)
            w()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(ROOT / 'qa/mobile.png'), full_page=False)
            k.append('390 px mobile width has no horizontal overflow')
            page.close()
        b.close()
    s.shutdown()
    assert not e, e
    assert not x, x
    k.append('No console errors, page exceptions or failed requests, light and dark')
    report = {'browser': 'installed Microsoft Edge (Chromium)', 'checks': k}
    (ROOT / 'qa/browser.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    run()
