'use strict';
let DATA;
const $ = id => document.getElementById(id);
const fmt = (x, n = 1) => (x == null || !Number.isFinite(+x) ? 'Unavailable' : (+x).toFixed(n));
const esc = x =>
  String(x ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const names = {},
  states = { '08': 'Colorado', 25: 'Massachusetts', 53: 'Washington' };
const labels = { linear: 'Panel regression', trees: 'Boosted trees', persistence: 'Persistence' };
const experiments = {
  core: 'Core history',
  housing: '+ Housing & income',
  employment: '+ Employment',
  all: '+ Commuting (all)',
  no_housing: 'All except housing',
  no_employment: 'All except employment',
};
const featureNames = {
  latest: 'Latest observed burden',
  burden_change: 'Prior burden change (pp/year)',
  log_population: 'Log population',
  real_rent: 'Real median gross rent ($/month)',
  real_income: 'Real renter household income ($/year)',
  rent_growth: 'Real rent growth (%/year)',
  income_growth: 'Real income growth (%/year)',
  housing_growth: 'Housing-stock growth (%/year)',
  job_growth: 'Covered employment growth (%/year)',
  pay_growth: 'Real average-pay growth (%/year)',
  goods_share: 'Private goods jobs / all covered jobs',
  services_share: 'Private service jobs / all jobs',
  inbound: 'Inbound primary-worker share',
  outbound: 'Outbound primary-worker share',
};
const theme = getComputedStyle(document.documentElement);
const color = key => theme.getPropertyValue('--' + key).trim();
const colors = ['c1', 'c2', 'c3'].map(color);
function options(id, rows) {
  $(id).innerHTML = rows.map(([v, s]) => `<option value="${esc(v)}">${esc(s)}</option>`).join('');
}
function table(id, heads, rows) {
  $(id).innerHTML = rows.length
    ? `<table><thead><tr>${heads.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="empty">No eligible observations for this selection.</p>';
}
function facts(id, rows) {
  $(id).innerHTML = rows
    .map(([a, b]) => `<div><b>${esc(a)}</b><span>${esc(b)}</span></div>`)
    .join('');
}
function plot(id, traces, extra = {}) {
  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: 'Arial, sans-serif', size: 12, color: color('text') },
    margin: { t: 48, b: 62, l: 60, r: 22 },
    hovermode: 'closest',
    title: { font: { size: 15 }, x: 0.02 },
    showlegend: false,
    xaxis: { zeroline: false, gridcolor: color('border'), automargin: true },
    yaxis: { zeroline: false, gridcolor: color('border'), automargin: true },
    ...extra,
  };
  return Plotly.react(id, traces, layout, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
  });
}
function selected() {
  return $('county').value;
}
function link(f) {
  if (!names[f]) return;
  $('county').value = f;
  $('search').value = '';
  save();
  render().catch(fail);
}
function wirePlot(id) {
  const el = $(id);
  if (el.removeAllListeners) el.removeAllListeners('plotly_click');
  el.on('plotly_click', e => {
    const f = e.points[0].customdata;
    link(Array.isArray(f) ? f[0] : f);
  });
}
function save() {
  const u = new URL(location.href);
  for (const id of [
    'county',
    'evidenceYear',
    'region',
    'regime',
    'model',
    'modelYear',
    'weight',
    'stratum',
    'experiment',
    'flowYear',
    'flowDirection',
    'compare1',
    'compare2',
    'compare3',
  ]) {
    u.searchParams.set(id, $(id).value);
  }
  history.replaceState(null, '', u);
}
function restore() {
  const p = new URL(location.href).searchParams;
  for (const [id, v] of p) {
    const el = $(id);
    if (el && el.tagName === 'SELECT' && [...el.options].some(o => o.value === v)) el.value = v;
  }
}
function scores(rows) {
  if (!rows.length) return null;
  const w = rows.map(r => ($('weight').value === 'renters' ? r.weight : 1)),
    den = w.reduce((a, b) => a + b, 0),
    avg = f => rows.reduce((s, r, i) => s + w[i] * f(r), 0) / den,
    sign = x => (Math.abs(x) <= DATA.config.direction_tolerance ? 0 : Math.sign(x)),
    intervals = rows.filter(r => r.lo != null),
    wi = intervals.map(r => ($('weight').value === 'renters' ? r.weight : 1)),
    di = wi.reduce((a, b) => a + b, 0);
  return {
    n: rows.length,
    mae: avg(r => Math.abs(r.pred - r.y)),
    rmse: Math.sqrt(avg(r => (r.pred - r.y) ** 2)),
    gain: avg(r => Math.abs(r.latest - r.y) - Math.abs(r.pred - r.y)),
    direction: avg(r => (sign(r.pred - r.latest) === sign(r.y - r.latest) ? 1 : 0)),
    coverage: di
      ? intervals.reduce((s, r, i) => s + wi[i] * (r.y >= r.lo && r.y <= r.hi ? 1 : 0), 0) / di
      : null,
    width: di ? intervals.reduce((s, r, i) => s + wi[i] * (r.hi - r.lo), 0) / di : null,
    ni: intervals.length,
  };
}
function median(xs) {
  const a = [...xs].sort((a, b) => a - b);
  return a[Math.floor(a.length / 2)];
}
function results(model = $('model').value, experiment = $('experiment').value) {
  let d = DATA.predictions.filter(
    r =>
      r.regime === $('regime').value &&
      r.model === model &&
      r.experiment === (model === 'persistence' ? 'all' : experiment),
  );
  const year = $('modelYear').value;
  d = d.filter(
    r => year === 'all' || (year === 'final' ? r.block === 'final test' : r.target_year === +year),
  );
  const s = $('stratum').value,
    pop = median(d.map(r => r.log_population)),
    burden = median(d.map(r => r.latest)),
    moe = median(d.map(r => r.target_moe));
  if (s === 'large') d = d.filter(r => r.log_population >= pop);
  if (s === 'small') d = d.filter(r => r.log_population < pop);
  if (s === 'high') d = d.filter(r => r.latest >= burden);
  if (s === 'low') d = d.filter(r => r.latest < burden);
  if (s === 'reliable') d = d.filter(r => r.target_moe <= moe);
  if (s === 'noisy') d = d.filter(r => r.target_moe > moe);
  return d;
}
async function hero() {
  const d = DATA.metrics
    .filter(
      r =>
        r.regime === 'temporal' &&
        r.experiment === 'all' &&
        r.block === 'final test' &&
        !r.weighted,
    )
    .sort((a, b) => a.mae - b.mae);
  const baseline = d.find(r => r.model === 'persistence'),
    best = d[0];
  $('heroTitle').textContent =
    `Final temporal test: ${best.model === 'persistence' ? 'persistence' : labels[best.model].toLowerCase()} wins.`;
  $('finding').textContent =
    best.model === 'persistence'
      ? `Neither all-source fitted model beat persistence. Carrying forward the latest burden gave the lowest final test error: ${fmt(best.mae, 2)} percentage points.`
      : `${labels[best.model]} reduced final test error by ${fmt(baseline.mae - best.mae, 2)} percentage points against persistence. The result comes from 30 counties, not a national sample.`;
  await plot(
    'heroChart',
    [
      {
        type: 'bar',
        orientation: 'h',
        x: d.map(r => r.mae),
        y: d.map(r => labels[r.model]),
        marker: { color: d.map((r, i) => (i === 0 ? color('accent') : color('context'))) },
        text: d.map(r => `${fmt(r.mae, 2)} pp`),
        textposition: 'outside',
        cliponaxis: false,
        hovertemplate: '%{y}<br>MAE %{x:.3f} pp<br>2023–2024 · held out<extra></extra>',
      },
    ],
    {
      margin: { t: 10, b: 45, l: 115, r: 55 },
      xaxis: {
        title: { text: 'Mean absolute error (percentage points)' },
        range: [0, Math.max(...d.map(r => r.mae)) * 1.35],
        gridcolor: color('border'),
      },
      yaxis: { autorange: 'reversed' },
    },
  );
  facts('heroMetrics', [
    [fmt(best.mae, 2) + ' pp', 'Lowest final temporal MAE'],
    [String(baseline.n), 'Final county-targets'],
    ['3', 'Geographic holdout groups'],
  ]);
}
function map(rows) {
  const byFips = Object.fromEntries(rows.map(r => [r.fips, r])),
    f = selected(),
    parts = [];
  for (const [i, st] of Object.keys(states).entries()) {
    const gs = DATA.geometry.features.filter(g => g.properties.GEOID.startsWith(st));
    const rings = gs.flatMap(g =>
      g.geometry.type === 'Polygon' ? g.geometry.coordinates : g.geometry.coordinates.flat(),
    );
    const points = rings.flat(),
      xs = points.map(p => p[0]),
      ys = points.map(p => p[1]);
    const xmin = Math.min(...xs),
      xmax = Math.max(...xs),
      ymin = Math.min(...ys),
      ymax = Math.max(...ys),
      scale = Math.min(145 / (xmax - xmin), 210 / (ymax - ymin)),
      project = p => [i * 175 + 12 + (p[0] - xmin) * scale, 65 + (ymax - p[1]) * scale];
    parts.push(
      `<text x="${i * 175 + 12}" y="27" font-size="13" fill="${color('text')}">${states[st]}</text>`,
    );
    for (const g of gs) {
      const r = byFips[g.properties.GEOID],
        v = r?.housing_growth,
        polygons =
          g.geometry.type === 'Polygon' ? [g.geometry.coordinates] : g.geometry.coordinates,
        path = polygons
          .map(poly =>
            poly
              .map(
                ring =>
                  ring
                    .map((p, j) => {
                      const [x, y] = project(p);
                      return `${j ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
                    })
                    .join(' ') + 'Z',
              )
              .join(' '),
          )
          .join(' '),
        shade =
          v == null
            ? color('border')
            : v >= 0
              ? `hsl(184 36% ${85 - Math.min(v, 5) * 9}%)`
              : `hsl(12 59% ${85 - Math.min(-v, 5) * 9}%)`;
      parts.push(`<path d="${path}" fill="${shade}" data-fips="${g.properties.GEOID}"
        class="${g.properties.GEOID === f ? 'selected' : ''}" tabindex="0" role="button"
        aria-label="${esc(names[g.properties.GEOID])}: housing growth ${fmt(v)} percent per year">
        <title>${esc(names[g.properties.GEOID])} · ${$('evidenceYear').value} target
        · housing ${fmt(v)}%/year · observed predictor</title></path>`);
    }
  }
  $('map').innerHTML =
    `<svg viewBox="0 0 530 300" role="group" aria-label="Thirty sampled county boundaries">${parts.join('')}</svg>`;
  $('map')
    .querySelectorAll('path')
    .forEach(p => {
      p.onclick = () => link(p.dataset.fips);
      p.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          link(p.dataset.fips);
        }
      };
    });
}
async function evidence() {
  let d = DATA.scientificPanel.filter(r => r.target_year === +$('evidenceYear').value);
  d = d.filter(
    r =>
      ($('region').value === 'all' || r.state === $('region').value) &&
      names[r.fips].toLowerCase().includes($('search').value.toLowerCase()),
  );
  map(d);
  await plot(
    'scatter',
    [
      {
        type: 'scatter',
        mode: 'markers',
        x: d.map(r => r.job_growth),
        y: d.map(r => r.y - r.latest),
        customdata: d.map(r => r.fips),
        text: d.map(
          r =>
            `${names[r.fips]}<br>QCEW ${r.qcew_year} growth<br>Burden ${r.acs_year}→${r.target_year}<br>Observed target; lagged predictors`,
        ),
        marker: {
          size: d.map(r => (r.fips === selected() ? 16 : 9)),
          color: d.map(r => r.housing_growth),
          colorscale: 'RdBu',
          cmid: 0,
          cmin: -5,
          cmax: 5,
          line: { color: color('text'), width: d.map(r => (r.fips === selected() ? 2 : 0)) },
          showscale: true,
          colorbar: {
            title: { text: 'Housing<br>%/year', font: { size: 12 } },
            thickness: 9,
            len: 0.6,
          },
        },
        hovertemplate: '%{text}<br>Jobs %{x:.2f}%/year<br>Burden change %{y:.2f} pp<extra></extra>',
      },
    ],
    {
      title: { text: 'Do job gains coincide with rising renter burden?' },
      margin: { t: 50, b: 70, l: 60, r: 70 },
      xaxis: {
        title: { text: 'Lagged covered employment growth (%/year)' },
        range: [-18, 18],
        gridcolor: color('border'),
        zeroline: true,
      },
      yaxis: {
        title: { text: 'Change from latest burden (pp)' },
        range: [-12, 12],
        gridcolor: color('border'),
        zeroline: true,
      },
    },
  );
  wirePlot('scatter');
  $('evidenceNote').textContent = d.length
    ? `${d.length} counties · target ${d[0].target_year}; burden change ${d[0].acs_year}→${d[0].target_year} (${d[0].target_year - d[0].acs_year} years); QCEW ${d[0].qcew_year}. ACS/QCEW observed data. Fixed chart ranges preserve comparisons.`
    : 'No counties match these filters.';
  const r = DATA.scientificPanel.find(
    r => r.fips === selected() && r.target_year === +$('evidenceYear').value,
  );
  $('countyDetail').innerHTML =
    `<h3>${esc(names[selected()])}</h3>${d.some(x => x.fips === selected()) ? '' : '<span class="badge">Selected county is outside the current chart filters.</span>'}<span>Observed ${r.target_year} burden <b>${fmt(r.y)}%</b> · approximate 90% sampling margin ±${fmt(r.target_moe)} pp</span><span>Change since ${r.acs_year}: <b>${fmt(r.y - r.latest)} pp over ${r.target_year - r.acs_year} years</b></span>`;
  table(
    'evidenceTable',
    [
      'County',
      'Target',
      'Burden %',
      'Change pp',
      'Interval years',
      'Jobs %/year',
      'Housing %/year',
    ],
    d.map(r => [
      `<button data-county="${r.fips}">${esc(names[r.fips])}</button>`,
      r.target_year,
      fmt(r.y),
      fmt(r.y - r.latest),
      r.target_year - r.acs_year,
      fmt(r.job_growth),
      fmt(r.housing_growth),
    ]),
  );
}
async function places() {
  const fs = [
    ...new Set(['compare1', 'compare2', 'compare3'].map(id => $(id).value).filter(Boolean)),
  ];
  const defs = [
    ['jobs', 'Covered workplace jobs'],
    ['real_pay', 'Real average workplace pay'],
    ['real_income', 'Real median renter household income'],
    ['housing', 'Total housing stock'],
    ['burden', 'Renter burden, with approximate ACS sampling margins'],
  ];
  const all = fs.flatMap(f => DATA.paths.filter(r => r.fips === f));
  let max = 110,
    min = 90;
  for (const f of fs) {
    const rows = all.filter(r => r.fips === f),
      base = rows.find(r => r.year === 2011);
    for (const [key] of defs.slice(0, 4))
      for (const r of rows)
        if (r[key] != null) {
          max = Math.max(max, (100 * r[key]) / base[key]);
          min = Math.min(min, (100 * r[key]) / base[key]);
        }
  }
  for (const [key, title] of defs) {
    const traces = fs.map((f, i) => {
      const rows = all.filter(r => r.fips === f),
        base = rows.find(r => r.year === 2011),
        full = Array.from({ length: 14 }, (_, i) => 2011 + i),
        by = Object.fromEntries(rows.map(r => [r.year, r]));
      return {
        type: 'scatter',
        mode: 'lines+markers',
        name: names[f].split(',')[0],
        x: full,
        y: full.map(y =>
          by[y] ? (key === 'burden' ? by[y][key] : (100 * by[y][key]) / base[key]) : null,
        ),
        connectgaps: false,
        line: { color: colors[i], width: 2, dash: ['solid', 'dash', 'dot'][i] },
        marker: { size: 4 },
        error_y:
          key === 'burden'
            ? {
                type: 'data',
                array: full.map(y => by[y]?.burden_moe || 0),
                visible: true,
                color: colors[i],
                thickness: 0.7,
                width: 2,
              }
            : undefined,
        hovertemplate: `${esc(names[f])}<br>%{x} · observed<br>%{y:.1f} ${key === 'burden' ? '%' : 'index (2011=100)'}<extra></extra>`,
      };
    });
    await plot('path_' + key, traces, {
      title: { text: title },
      showlegend: true,
      legend: { orientation: 'h', y: 1.13, font: { size: 12 } },
      margin: { t: 75, l: 54, b: 45, r: 15 },
      yaxis: {
        range: key === 'burden' ? [25, 70] : [Math.floor(min / 10) * 10, Math.ceil(max / 10) * 10],
        title: { text: key === 'burden' ? 'Burden (%)' : 'Index, 2011 = 100' },
        gridcolor: color('border'),
      },
      xaxis: { range: [2011, 2024], dtick: 3, gridcolor: color('border') },
    });
  }
  table(
    'placesTable',
    [
      'County',
      'Year',
      'Jobs',
      'Real pay $',
      'Real renter income $',
      'Units',
      'Burden %',
      '90% margin pp',
    ],
    all.map(r => [
      esc(names[r.fips]),
      r.year,
      fmt(r.jobs, 0),
      fmt(r.real_pay, 0),
      fmt(r.real_income, 0),
      fmt(r.housing, 0),
      fmt(r.burden),
      fmt(r.burden_moe),
    ]),
  );
}
async function workers() {
  const r = DATA.lodes.find(r => r.fips === selected() && r.year === +$('flowYear').value);
  if (!r) {
    $('flowFacts').textContent =
      'Comparable LODES workplace coverage is unavailable for this county/year. Massachusetts starts in 2011.';
    await plot('flows', [], { title: { text: 'No comparable published workplace coverage' } });
    table('flowTable', ['Relationship', 'Primary jobs'], []);
    return;
  }
  facts('flowFacts', [
    [fmt(100 * r.inbound) + '%', 'Workplace jobs filled from outside county'],
    [fmt(100 * r.outbound) + '%', 'Residents working outside county'],
    [fmt(100 * r.retention) + '%', 'Resident home-work retention'],
    [r.year, 'LODES8 · primary jobs'],
  ]);
  const dir = $('flowDirection').value,
    out = dir === 'destinations',
    den = out ? r.resident_jobs : r.work_jobs,
    rows = [
      ['Same county', r.internal],
      ...r[dir].slice(0, 6).map(([f, n]) => [names[f] || `County FIPS ${f}`, n]),
      ['Outside state / unranked residual', out ? r.out_state : r.in_state],
    ];
  const rest = den - rows.reduce((s, r) => s + r[1], 0);
  if (rest > 0) rows.push(['Other within-state counties', rest]);
  await plot(
    'flows',
    [
      {
        type: 'bar',
        orientation: 'h',
        x: rows.map(r => (r[1] / den) * 100),
        y: rows.map(r => r[0].replace(' County', '')),
        marker: { color: rows.map((_, i) => (i === 0 ? color('accent') : color('context'))) },
        hovertemplate: `%{y}<br>%{x:.1f}% of ${out ? 'resident' : 'workplace'} primary jobs<br>${r.year} · observed LODES<extra></extra>`,
      },
    ],
    {
      title: {
        text: `${names[selected()].split(',')[0]} · ${out ? 'workplaces of residents' : 'residences of workers'}`,
      },
      margin: { t: 50, b: 50, l: 185, r: 15 },
      xaxis: { title: { text: 'Share of primary jobs (%)' }, range: [0, 100] },
      yaxis: { autorange: 'reversed' },
    },
  );
  table(
    'flowTable',
    [out ? 'Work destination' : 'Worker residence', 'Primary jobs', 'Share'],
    rows.map(([s, n]) => [esc(s), fmt(n, 0), fmt((100 * n) / den) + '%']),
  );
}
async function models() {
  const d = results(),
    s = scores(d);
  if (!s) {
    $('scores').textContent = 'No eligible held-out observations.';
    return;
  }
  facts('scores', [
    [fmt(s.mae, 2) + ' pp', 'MAE · smaller is better'],
    [fmt(s.rmse, 2) + ' pp', 'RMSE'],
    [(s.gain > 0 ? '+' : '') + fmt(s.gain, 2) + ' pp', 'MAE gain over persistence'],
    [fmt(100 * s.direction) + '%', 'Change direction accuracy'],
    [s.n, 'Held-out county-targets'],
  ]);
  await plot(
    'predictions',
    [
      {
        type: 'scatter',
        mode: 'lines',
        x: [20, 75],
        y: [20, 75],
        line: { color: color('muted'), dash: 'dot' },
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'markers',
        x: d.map(r => r.y),
        y: d.map(r => r.pred),
        customdata: d.map(r => r.fips),
        error_y: {
          type: 'data',
          symmetric: false,
          array: d.map(r => (r.hi == null ? 0 : r.hi - r.pred)),
          arrayminus: d.map(r => (r.lo == null ? 0 : r.pred - r.lo)),
          color: color('context'),
          thickness: 0.7,
          width: 1,
        },
        marker: { color: color('accent'), size: 7, opacity: 0.8 },
        text: d.map(
          r =>
            `${names[r.fips]}<br>${r.target_year} · ${r.block}<br>Origin ${r.origin} · latest ACS ${r.acs_year}<br>${r.lo == null ? 'Interval unavailable' : `80% interval ${fmt(r.lo)}–${fmt(r.hi)}%`}`,
        ),
        hovertemplate: '%{text}<br>Observed %{x:.2f}%<br>Predicted %{y:.2f}%<extra></extra>',
      },
    ],
    {
      title: { text: 'Predictions should lie near the identity line' },
      xaxis: {
        title: { text: 'Observed burden (%)' },
        range: [20, 75],
        gridcolor: color('border'),
      },
      yaxis: {
        title: { text: 'Predicted burden (%)' },
        range: [20, 75],
        gridcolor: color('border'),
      },
    },
  );
  wirePlot('predictions');
  await plot(
    'residuals',
    [
      {
        type: 'scatter',
        mode: 'markers',
        x: d.map(r => r.latest),
        y: d.map(r => r.residual),
        customdata: d.map(r => r.fips),
        marker: { color: color('c2'), size: 7 },
        text: d.map(
          r => `${names[r.fips]} · ${r.target_year}<br>Held-out prediction − observation`,
        ),
        hovertemplate: '%{text}<br>Latest burden %{x:.2f}%<br>Error %{y:.2f} pp<extra></extra>',
      },
    ],
    {
      title: { text: 'Where does the model over- or underpredict?' },
      xaxis: { title: { text: 'Latest observed burden (%)' }, range: [20, 75] },
      yaxis: {
        title: { text: 'Prediction − observation (pp)' },
        range: [-15, 15],
        zeroline: true,
        zerolinecolor: color('text'),
        gridcolor: color('border'),
      },
    },
  );
  wirePlot('residuals');
  table(
    'worst',
    ['County', 'Target', 'Observed %', 'Predicted %', 'Error pp'],
    [...d]
      .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
      .slice(0, 8)
      .map(r => [
        `<button data-county="${r.fips}">${esc(names[r.fips])}</button>`,
        r.target_year,
        fmt(r.y),
        fmt(r.pred),
        fmt(r.residual),
      ]),
  );
  $('modelNote').textContent =
    `${labels[$('model').value]} · ${experiments[$('experiment').value]} · ${s.n} held-out rows · ${$('regime').selectedOptions[0].textContent}. Signed residuals are predicted minus observed. No training diagnostics are mixed into this view. Source: ACS/QCEW/LODES/CPI. Direction tolerance ±${DATA.config.direction_tolerance} pp; changes are from the latest published ACS estimate, usually over two years.`;
  $('intervalNote').textContent =
    `Observed coverage ${s.coverage == null ? 'unavailable' : fmt(100 * s.coverage) + '%'}; mean interval width ${fmt(s.width)} pp, among ${s.ni} rows with calibrated intervals. ${s.n - s.ni} rows have no interval.`;
  const years = [...new Set(d.map(r => r.target_year))].sort();
  table(
    'yearScores',
    ['Target year', 'n', 'MAE pp', 'Gain pp'],
    years.map(y => {
      const z = scores(d.filter(r => r.target_year === y));
      return [y, z.n, fmt(z.mae, 2), fmt(z.gain, 2)];
    }),
  );
}
async function ablations() {
  const model = $('model').value === 'persistence' ? 'linear' : $('model').value,
    rows = Object.keys(experiments)
      .map(e => [e, scores(results(model, e))])
      .filter(r => r[1]),
    selectedExp = $('experiment').value;
  await plot(
    'ablations',
    [
      {
        type: 'bar',
        orientation: 'h',
        x: rows.map(r => r[1].mae),
        y: rows.map(r => experiments[r[0]]),
        text: rows.map(r => fmt(r[1].mae, 2)),
        textposition: 'outside',
        cliponaxis: false,
        marker: {
          color: rows.map(r => (r[0] === selectedExp ? color('accent') : color('context'))),
        },
        hovertemplate: '%{y}<br>Held-out MAE %{x:.3f} pp<extra></extra>',
      },
    ],
    {
      title: { text: `${labels[model]} · actual refitted experiments` },
      margin: { t: 50, l: 155, r: 45, b: 45 },
      xaxis: {
        title: { text: 'Mean absolute error (pp)' },
        range: [0, Math.max(...rows.map(r => r[1].mae)) * 1.3],
      },
      yaxis: { autorange: 'reversed' },
    },
  );
  const all = rows.find(r => r[0] === 'all')[1],
    without = rows.find(r => r[0] === 'employment')[1],
    delta = all.mae - without.mae;
  $('ablationHeadline').textContent =
    `Commuting ${delta < 0 ? 'reduces' : 'increases'} MAE by ${fmt(Math.abs(delta), 3)} pp in this view.`;
  const pair = DATA.paired.find(
    r => r.regime === $('regime').value && r.model === model && r.experiment === 'employment',
  );
  $('pairedNote').textContent =
    `Final-block paired difference (all − employment): ${fmt(pair.delta, 3)} pp, 80% interval [${fmt(pair.lo, 3)}, ${fmt(pair.hi, 3)}], ${pair.clusters} county clusters. ${pair.hi < 0 ? 'This interval supports a commuting gain within this sample.' : pair.lo > 0 ? 'This interval supports worse prediction after adding commuting.' : 'This interval includes zero; added predictive value is inconclusive.'} ${$('model').value === 'persistence' ? 'Ablations show panel regression because persistence has no fitted feature groups.' : ''}`;
  table(
    'ablationTable',
    [
      'Feature set',
      'n',
      'MAE pp',
      'Gain over persistence pp',
      'All − this set, final county-equal pp (80% CI)',
    ],
    rows.map(([e, s]) => {
      const p = DATA.paired.find(
        r => r.regime === $('regime').value && r.model === model && r.experiment === e,
      );
      return [
        esc(experiments[e]),
        s.n,
        fmt(s.mae, 3),
        fmt(s.gain, 3),
        p ? `${fmt(p.delta, 3)} [${fmt(p.lo, 3)}, ${fmt(p.hi, 3)}]` : '0 (reference)',
      ];
    }),
  );
  const on = selectedExp === 'all';
  $('commutingToggle').setAttribute('aria-pressed', on);
  $('commutingToggle').textContent = on ? 'Commuting: included' : 'Compare with commuting included';
}
function scenarioInputs() {
  const row = DATA.scenarios.rows.find(r => r.fips === selected());
  const defs = ['real_rent', 'real_income', 'job_growth', 'housing_growth'];
  $('scenarioInputs').innerHTML =
    `<h3>${esc(names[selected()])}</h3><p class="note">Observed input periods: ACS ${row.acs_year}, QCEW ${row.qcew_year}, LODES ${row.lodes_year}.</p>` +
    defs
      .map(f => {
        const [lo, hi] = DATA.scenarios.ranges[f],
          min = f.startsWith('real') ? lo * 0.7 : lo - 5,
          max = hi * 1.3 + 5;
        return `<div class="scenario-control"><label for="s_${f}">${featureNames[f]}: <b id="v_${f}">${fmt(row[f])}</b></label><input id="s_${f}" data-feature="${f}" type="range" min="${min}" max="${max}" step="any" value="${row[f]}"><small>Historical fitting range ${fmt(lo)} to ${fmt(hi)} · observed ${fmt(row[f])}</small></div>`;
      })
      .join('');
  $('scenarioInputs')
    .querySelectorAll('input')
    .forEach(el => (el.oninput = () => scenario()));
  return scenario();
}
async function scenario() {
  const row = DATA.scenarios.rows.find(r => r.fips === selected()),
    values = {};
  $('scenarioInputs')
    .querySelectorAll('input')
    .forEach(el => {
      const f = el.dataset.feature;
      values[f] = +el.value;
      $('v_' + f).textContent = fmt(+el.value, f.startsWith('real') ? 0 : 1);
    });
  const x = Model.adjust(row, values),
    linear = Model.evaluate(DATA.scenarios.linear, x),
    trees = Model.evaluate(DATA.scenarios.trees, x),
    baseL = Model.evaluate(DATA.scenarios.linear, row),
    baseT = Model.evaluate(DATA.scenarios.trees, row);
  facts('scenarioResults', [
    [fmt(linear) + '%', 'Panel regression · ' + fmt(linear - baseL) + ' pp from observed inputs'],
    [fmt(trees) + '%', 'Boosted trees · ' + fmt(trees - baseT) + ' pp from observed inputs'],
  ]);
  const S = DATA.scenarios.support,
    fs = DATA.scenarios.linear.features,
    z = fs.map((f, i) => ((x[f] ?? S.impute[i]) - S.mean[i]) / S.scale[i]),
    distance = Math.min(...S.z.map(a => Math.sqrt(a.reduce((s, v, i) => s + (v - z[i]) ** 2, 0)))),
    outside = fs.filter(
      f => x[f] < DATA.scenarios.ranges[f][0] || x[f] > DATA.scenarios.ranges[f][1],
    );
  $('support').textContent =
    outside.length || distance > S.threshold
      ? `Unsupported-input warning: ${outside.length ? 'outside historical range: ' + outside.map(f => featureNames[f]).join(', ') + '. ' : ''}Nearest fitting-vector distance ${fmt(distance, 2)}; historical 95th-percentile threshold ${fmt(S.threshold, 2)}. Prediction is extrapolative.`
      : `Within the declared support heuristic. Nearest fitting-vector distance ${fmt(distance, 2)}; threshold ${fmt(S.threshold, 2)}. This does not establish causal plausibility.`;
  await plot(
    'scenarioChart',
    [
      {
        type: 'bar',
        x: ['Panel regression', 'Boosted trees'],
        y: [linear, trees],
        marker: { color: colors.slice(0, 2) },
        hovertemplate: '%{x}<br>Conditional scenario %{y:.2f}%<br>Target 2024<extra></extra>',
      },
    ],
    {
      margin: { t: 20, b: 45, l: 50, r: 15 },
      yaxis: { title: { text: 'Burden (%)' }, range: [0, 100] },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          y0: row.y,
          y1: row.y,
          line: { color: color('text'), dash: 'dot' },
        },
      ],
      annotations: [
        {
          xref: 'paper',
          x: 1,
          y: row.y,
          text: 'Observed 2024',
          showarrow: false,
          yshift: 12,
          font: { size: 12 },
        },
      ],
    },
  );
}
function calculator() {
  const income = +$('calcIncome').value,
    cost = +$('calcCost').value,
    gi = +$('calcIncomeGrowth').value / 100,
    gc = +$('calcCostGrowth').value / 100;
  if (!(income > 0 && cost >= 0 && gi > -0.999 && gc > -0.999)) {
    $('calcOutput').textContent = 'Enter positive income, nonnegative cost and growth above −100%.';
    return;
  }
  table(
    'calcOutput',
    ['Assumed year', 'Annual income $', 'Monthly gross cost $', 'Housing-cost share'],
    [0, 1, 2, 3].map(k => [
      k,
      fmt(income * (1 + gi) ** k, 0),
      fmt(cost * (1 + gc) ** k, 0),
      fmt(((1200 * cost) / income) * ((1 + gc) / (1 + gi)) ** k) + '%',
    ]),
  );
}
function methods() {
  table(
    'dictionary',
    ['Group', 'Feature', 'Origin rule'],
    Object.entries(DATA.config.groups).flatMap(([g, fs]) =>
      fs.map(f => [
        g,
        featureNames[f],
        g === 'employment'
          ? 'QCEW t−2; growth vs t−3'
          : g === 'commuting'
            ? 'LODES t−4'
            : 'Latest ACS ≤ t−1',
      ]),
    ),
  );
  const total = DATA.sources.reduce((s, r) => s + r.bytes, 0);
  $('coverageText').textContent =
    `${DATA.paths.filter(r => r.burden != null).length} ACS county-years; 2011–2024 except 2020. Fixed 2011 top-ten selection per state. ${DATA.lodes.length} LODES county-years, 2008–2019; Massachusetts coverage starts in 2011. Raw cache ${(total / 1e9).toFixed(2)} GB; streamed in 300,000-row chunks. No targets interpolated. Historical publication dates are unavailable; lags are conservative assumptions. Last-Modified is not treated as a release date.`;
  table(
    'sourceTable',
    ['Source', 'Definition / access'],
    [
      [
        '<a href="https://www.census.gov/programs-surveys/acs/data/summary-file.html">Census ACS</a>',
        'Official one-year published counts, medians and margins',
      ],
      [
        '<a href="https://www.bls.gov/cew/">BLS QCEW</a>',
        'Covered workplace jobs; average annual pay; private broad industries',
      ],
      [
        '<a href="https://lehd.ces.census.gov/data/lodes/LODES8/LODESTechDoc8.4.pdf">Census LODES8</a>',
        'JT01 primary jobs; WAC/RAC totals and within-state OD',
      ],
      [
        '<a href="https://fred.stlouisfed.org/series/CPIAUCNS">FRED / BLS CPI-U</a>',
        'Annual average of twelve months; 2023 monetary base',
      ],
      [
        '<a href="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer">Census TIGERweb</a>',
        'Simplified official county geometry; stable sampled county boundaries',
      ],
      [
        '<a href="downloads/manifest.json">Object-level provenance</a>',
        `${DATA.sources.length} cached objects with retrieval timestamp, URL, SHA-256, file size and modification metadata`,
      ],
    ],
  );
}
async function render() {
  window.RENDERED = false;
  await Promise.all([evidence(), places(), workers(), models(), ablations()]);
  await scenarioInputs();
  document
    .querySelectorAll('[data-county]')
    .forEach(b => (b.onclick = () => link(b.dataset.county)));
  window.RENDERED = true;
}
async function start() {
  try {
    const r = await fetch('data.json');
    if (!r.ok) throw Error(`Research data HTTP ${r.status}`);
    DATA = await r.json();
    window.DATA = DATA;
    DATA.sample.forEach(r => (names[r.fips] = r.name));
    const countyRows = DATA.sample
      .map(r => [r.fips, r.name])
      .sort((a, b) => a[1].localeCompare(b[1]));
    options('county', countyRows);
    $('county').value = '53033';
    options(
      'evidenceYear',
      DATA.config.evaluation_years.map(y => [y, y]),
    );
    $('evidenceYear').value = '2024';
    options(
      'flowYear',
      [...new Set(DATA.lodes.map(r => r.year))].sort((a, b) => b - a).map(y => [y, y]),
    );
    for (const y of DATA.config.evaluation_years)
      $('modelYear').add(new Option(`${y} · ${y >= 2023 ? 'final test' : 'development'}`, y));
    for (let i = 1; i <= 3; i++) {
      $('compareControls').insertAdjacentHTML(
        'beforeend',
        `<label>County ${i}<select id="compare${i}"></select></label>`,
      );
      options('compare' + i, [['', 'None'], ...countyRows]);
      $('compare' + i).value = ['53033', '08031', '25025'][i - 1];
    }
    $('compareCharts').innerHTML = ['jobs', 'real_pay', 'real_income', 'housing', 'burden']
      .map(k => `<div id="path_${k}" class="chart"></div>`)
      .join('');
    DATA.scientificPanel = DATA.predictions.filter(
      r => r.regime === 'temporal' && r.model === 'persistence',
    );
    restore();
    methods();
    calculator();
    await hero();
    await render();
    for (const id of [
      'county',
      'evidenceYear',
      'region',
      'regime',
      'model',
      'modelYear',
      'weight',
      'stratum',
      'experiment',
      'flowYear',
      'flowDirection',
      'compare1',
      'compare2',
      'compare3',
    ])
      $(id).onchange = () => {
        save();
        render().catch(fail);
      };
    $('search').oninput = () => evidence().catch(fail);
    $('commutingToggle').onclick = () => {
      $('experiment').value = $('experiment').value === 'all' ? 'employment' : 'all';
      save();
      Promise.all([models(), ablations()]).catch(fail);
    };
    $('scenarioReset').onclick = scenarioInputs;
    ['calcIncome', 'calcCost', 'calcIncomeGrowth', 'calcCostGrowth'].forEach(
      id => ($(id).oninput = calculator),
    );
    $('reset').onclick = () => {
      history.replaceState(null, '', location.pathname + '#evidence');
      location.reload();
    };
    $('status').textContent = '';
  } catch (e) {
    fail(e);
  }
}
function fail(e) {
  console.error(e);
  $('status').textContent =
    `Research view unavailable: ${e.message}. Serve this directory over HTTP; see README.`;
}
start();
