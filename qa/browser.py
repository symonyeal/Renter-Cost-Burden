"""Exercise static research controls in Edge, desktop/mobile, under a repository subpath."""
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    """Quiet HTTP transport for the committed site; no application backend."""

    def log_message(self, *args):
        pass


def run():
    """Assert substantive state changes, exact predictors, HTTP assets and viewport integrity."""
    server = ThreadingHTTPServer(('127.0.0.1', 0),
                                functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/site/'
    errors, failed, checks = [], [], []
    with sync_playwright() as p:
        b = p.chromium.launch(channel='msedge', headless=True)
        page = b.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda e: errors.append(e.text) if e.type == 'error' else None)
        page.on('requestfailed', lambda r: failed.append(r.url))
        page.goto(url)
        page.wait_for_function('window.RENDERED === true', timeout=120000)
        assert page.locator('#status').inner_text() == ''
        observed = page.evaluate('scores(results())')
        expected = page.evaluate("DATA.metrics.find(r => r.regime==='temporal' && "
                                 "r.experiment==='all' && r.model==='linear' && "
                                 "r.block==='final test' && !r.weighted)")
        assert abs(observed['mae'] - expected['mae']) < 1e-7
        assert abs(observed['rmse'] - expected['rmse']) < 1e-7
        checks.append('Initial static bundle and all plots load below /site/ subpath')
        page.screenshot(path=str(ROOT / 'qa/desktop.png'), full_page=False)

        def choose(id, value):
            page.select_option('#' + id, value)
            page.wait_for_function('window.RENDERED === true', timeout=60000)

        choose('county', '08031')
        assert 'Denver' in page.locator('#countyDetail').inner_text()
        assert 'Denver' in page.locator('#scenarioInputs').inner_text()
        choose('region', '08')
        assert page.evaluate("document.getElementById('scatter').data[0].x.length") == 10
        page.locator('#search').fill('Pueblo')
        page.wait_for_function("document.getElementById('scatter').data[0].x.length === 1")
        page.locator('#search').fill('no matching county')
        page.wait_for_function("document.getElementById('scatter').data[0].x.length === 0")
        assert 'No counties' in page.locator('#evidenceNote').inner_text()
        page.locator('#search').fill('')
        choose('evidenceYear', '2021')
        assert '2019→2021' in page.locator('#evidenceNote').inner_text()
        checks.append('Linked county, state, year, search and empty evidence state')
        choose('compare1', '08031')
        choose('compare2', '25025')
        choose('compare3', '')
        assert page.evaluate("document.getElementById('path_jobs').data.length") == 2
        checks.append('Two-county paths update with common scales and ACS gap')
        choose('county', '25025')
        choose('flowYear', '2008')
        assert 'unavailable' in page.locator('#flowFacts').inner_text()
        assert page.evaluate("document.getElementById('flows').data.length") == 0
        choose('flowYear', '2019')
        choose('flowDirection', 'origins')
        assert 'Primary jobs' in page.locator('#flowTable').inner_text()
        checks.append('Worker direction/year and missing Massachusetts coverage state')
        choose('regime', 'holdout_08')
        choose('model', 'trees')
        choose('modelYear', '2024')
        assert page.evaluate("document.getElementById('predictions').data[1].x.length") == 10
        choose('weight', 'renters')
        choose('stratum', 'large')
        assert page.evaluate("document.getElementById('predictions').data[1].x.length") == 5
        choose('stratum', 'all')
        choose('experiment', 'housing')
        page.locator('#commutingToggle').click()
        page.wait_for_function("document.getElementById('experiment').value === 'all'")
        page.locator('#commutingToggle').click()
        page.wait_for_function("document.getElementById('experiment').value === 'employment'")
        choose('model', 'persistence')
        checks.append('Regime/model/year/weight/stratum and separately trained ablation controls')
        old = page.locator('#scenarioResults').inner_text()
        page.locator('#s_real_rent').evaluate(
            "e => {e.value=+e.value*1.2;"
            "e.dispatchEvent(new Event('input',{bubbles:true}));}")
        page.wait_for_function("document.getElementById('scenarioResults').innerText !== "
                               + json.dumps(old))
        page.locator('#scenarioReset').click()
        page.wait_for_function("document.getElementById('scenarioResults').innerText === "
                               + json.dumps(old))
        page.locator('#calcIncome').fill('40000')
        assert '54.0%' in page.locator('#calcOutput').inner_text()
        page.locator('#calcIncome').fill('0')
        assert 'Enter positive' in page.locator('#calcOutput').inner_text()
        checks.append('Conditional scenario, reset, household arithmetic and invalid-input state')
        saved = page.url
        page.locator('nav a[href="#models"]').click()
        assert page.url.endswith('#models')
        page.reload()
        page.wait_for_function('window.RENDERED === true', timeout=60000)
        assert page.locator('#county').input_value() == '25025'
        assert page.locator('#regime').input_value() == 'holdout_08'
        assert page.locator('#experiment').input_value() == 'employment'
        assert 'county=25025' in saved
        checks.append('Shareable URL restores county and principal filters')
        for a in page.locator('a[download]').all():
            response = page.request.get(url + a.get_attribute('href'))
            assert response.status == 200 and len(response.body()) > 0
        checks.append('Every offered download returns nonempty HTTP 200')
        page.locator('#county').focus()
        page.keyboard.press('ArrowDown')
        page.keyboard.press('Enter')
        page.wait_for_function('window.RENDERED === true', timeout=60000)
        page.locator('#region').focus()
        page.keyboard.press('Tab')
        assert page.evaluate('document.activeElement.id') == 'search'
        checks.append('Native select keyboard operation and labelled input tab sequence')
        page.locator('#reset').click()
        page.wait_for_function('window.RENDERED === true', timeout=60000)
        assert page.locator('#county').input_value() == '53033'
        assert '?' not in page.url
        checks.append('Global reset clears URL filters; native section hash survives reload')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.goto(url)
        page.wait_for_function('window.RENDERED === true', timeout=60000)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.screenshot(path=str(ROOT / 'qa/mobile.png'), full_page=False)
        page.locator('#models').scroll_into_view_if_needed()
        page.screenshot(path=str(ROOT / 'qa/mobile-models.png'), full_page=False)
        checks.append('390px mobile viewport has no horizontal document overflow')
        assert not errors, errors
        assert not failed, failed
        checks.append('No browser console errors, page exceptions or failed requests')
        b.close()
    server.shutdown()
    report = {'browser': 'installed Microsoft Edge (Chromium)', 'checks': checks,
              'console_errors': errors, 'request_failures': failed}
    (ROOT / 'qa/browser.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    run()
