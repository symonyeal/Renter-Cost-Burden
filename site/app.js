'use strict';
// Legend
//   D      data.json bundle          G   D.gap (county results, noise, added-later forecasts)
//   T      2011–2024 period          E   2011–2019 period
//   f      county FIPS               c   one county's row in a period
//   b      share stretched, %        db  change in b, points; m_db its 90% survey margin
//   gap    rent growth minus renter income growth, log points
//   per10  slope per 10 units of x; lo, hi its 80% county bootstrap range
let D, G, T, E;
const $ = id => document.getElementById(id);
const N = {};
const ST = { '08': 'Colorado', 25: 'Massachusetts', 53: 'Washington' };
const css = getComputedStyle(document.documentElement);
const v = k => css.getPropertyValue('--' + k).trim();
const fx = (x, n = 1) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toFixed(n));
const sg = (x, n = 1) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(n);
const usd = x => '$' + Math.round(x).toLocaleString('en-US');
const short = f => N[f].replace(' County', '').split(',')[0];
const esc = x =>
  String(x ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function table(id, h, rows) {
  $(id).innerHTML =
    `<table><thead><tr>${h.map(x => `<th scope="col">${esc(x)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
// Chart titles are HTML captions above the chart, so they wrap on narrow screens.
function plot(id, tr, lay = {}) {
  const ax = { gridcolor: v('grid'), zeroline: false, automargin: true, linecolor: v('border') },
    t = lay.title?.text;
  if (t) {
    let h = $(id + 'T');
    if (!h) {
      const box = document.createElement('div');
      h = document.createElement('p');
      h.id = id + 'T';
      h.className = 'ct';
      $(id).before(box);
      box.append(h, $(id));
    }
    h.textContent = t;
    lay = { ...lay, title: undefined, margin: { t: 12, b: 56, l: 56, r: 16, ...lay.margin, t: lay.margin?.t > 44 ? lay.margin.t - 32 : 12 } };
  }
  return Plotly.react(
    id,
    tr,
    {
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: v('font'), size: 13, color: v('text') },
      margin: { t: 44, b: 56, l: 56, r: 16 },
      hovermode: 'closest',
      showlegend: false,
      title: { font: { size: 15 }, x: 0, xref: 'paper' },
      ...lay,
      xaxis: { ...ax, ...lay.xaxis },
      yaxis: { ...ax, ...lay.yaxis },
    },
    { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['select2d', 'lasso2d'] },
  );
}
function hex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((q, i) => Math.round(q + (y[i] - q) * t)).join(',')})`;
}
// Diverging fill: rises warm, falls cool, ±12 points saturates.
const fill = db => mix(v('surface'), db >= 0 ? v('up') : v('down'), Math.min(1, Math.abs(db) / 12));
const verdict = c => (c.verdict === 'up' ? 'up' : c.verdict === 'down' ? 'down' : 'flat');
const said = c =>
  c.verdict === 'within noise' ? 'within survey error' : `${c.verdict}, beyond survey error`;
const fit = (p, x, y) => {
  const s = p.slopes.find(s => s.x === x && s.y === y),
    xs = p.counties.map(c => c[x]),
    ys = p.counties.map(c => c[y]),
    mx = xs.reduce((a, b) => a + b) / xs.length,
    my = ys.reduce((a, b) => a + b) / ys.length,
    lo = Math.min(...xs),
    hi = Math.max(...xs);
  return { s, x: [lo, hi], y: [lo, hi].map(q => my + (s.per10 / 10) * (q - mx)) };
};
function link(f) {
  if (!N[f]) return;
  $('county').value = f;
  const u = new URL(location.href);
  u.searchParams.set('county', f);
  history.replaceState(null, '', u);
  counties().catch(fail);
}
function wire(id) {
  const el = $(id);
  if (el.removeAllListeners) el.removeAllListeners('plotly_click');
  el.on('plotly_click', e => link(e.points[0].customdata));
}

async function summary() {
  const P = Object.fromEntries(G.pooled.map(r => [r.year, r])),
    m = T.median,
    moved = T.counties.filter(c => c.verdict !== 'within noise'),
    o = G.one_year,
    js = T.slopes.find(s => s.x === 'jobs_pct' && s.y === 'rent_pct'),
    ji = T.slopes.find(s => s.x === 'jobs_pct' && s.y === 'inc_pct'),
    gs = T.slopes.find(s => s.x === 'gap' && s.y === 'db'),
    pf = D.metrics.find(
      r => r.regime === 'temporal' && r.experiment === 'all' && r.model === 'persistence' &&
        r.block === 'final test' && !r.weighted,
    );
  $('answer').textContent =
    `Mostly, yes. ${fx(P[2011].b)}% of renter households paid 30% or more of their income on ` +
    `rent and utilities in 2011, and ${fx(P[2024].b)}% in 2024. After inflation, rent rose ` +
    `${fx(m.rent_pct, 0)}% in the median county and renter income ${fx(m.inc_pct, 0)}%. ` +
    `The exceptions are counties where rent outran income.`;
  $('tiles').innerHTML = [
    [fx(P[2024].b) + '%', 'of renter households stretched, 2024'],
    [sg(m.rent_pct, 0) + '%', 'rent, median county, after inflation'],
    [sg(m.inc_pct, 0) + '%', 'renter income, median county, after inflation'],
    [`${moved.length} of 30`, 'counties changed by more than survey error'],
  ]
    .map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`)
    .join('');
  const F = [
    ['counties', `The share rose by more than survey error in ${moved.filter(c => c.verdict === 'up').map(c => short(c.fips)).join(', ')}, and fell in ${moved.filter(c => c.verdict === 'down').map(c => short(c.fips)).join(', ')}.`],
    ['rent', `Each 10 points by which rent outgrew renter income came with a ${fx(gs.per10)}-point rise in the share stretched.`],
    ['jobs', `Per 10% more jobs, rent rose ${fx(js.per10)}% and renter income ${fx(ji.per10)}%.`],
    ['forecast', `A county's share moves about ${fx(o.rms_change)} points a year; survey error alone moves it ${fx(o.rms_noise)}. Carrying last year's value forward missed by ${fx(pf.mae, 2)} points, and no model did better.`],
  ];
  $('findings').innerHTML = F.map(([h, t]) => `<li>${esc(t)} <a href="#${h}">More</a></li>`).join('');
  const ys = Array.from({ length: 14 }, (_, i) => 2011 + i),
    b = ys.map(y => P[y]?.b ?? null),
    band = s => ({
      x: [...s, ...[...s].reverse()],
      y: [...s.map(y => P[y].b + P[y].moe), ...[...s].reverse().map(y => P[y].b - P[y].moe)],
      fill: 'toself', mode: 'lines', line: { width: 0 }, hoverinfo: 'skip',
      fillcolor: mix(v('surface'), v('a'), 0.25),
    });
  await plot(
    'trend',
    [
      band(ys.filter(y => y < 2020)),
      band(ys.filter(y => y > 2020)),
      {
        x: ys, y: b, mode: 'lines+markers', line: { color: v('a'), width: 2.5 },
        marker: { size: 6 }, connectgaps: false,
        hovertemplate: '%{x}: %{y:.1f}%<extra></extra>',
      },
    ],
    {
      margin: { t: 12, b: 36, l: 44, r: 10 },
      yaxis: { range: [46, 55], ticksuffix: '%' },
      xaxis: { dtick: 2 },
    },
  );
}

function map() {
  const by = Object.fromEntries(T.counties.map(c => [c.fips, c])),
    f = $('county').value,
    out = [];
  for (const [i, st] of ['53', '08', '25'].entries()) {
    const gs = D.geometry.features.filter(g => g.properties.GEOID.startsWith(st)),
      pts = gs.flatMap(g => (g.geometry.type === 'Polygon' ? [g.geometry.coordinates] : g.geometry.coordinates)).flat(2),
      xs = pts.map(p => p[0]),
      ys = pts.map(p => p[1]),
      x0 = Math.min(...xs),
      y1 = Math.max(...ys),
      k = Math.min(190 / (Math.max(...xs) - x0), 200 / (y1 - Math.min(...ys))),
      pr = p => [i * 210 + 6 + (p[0] - x0) * k, 30 + (y1 - p[1]) * k];
    out.push(`<text x="${i * 210 + 6}" y="18" font-size="13" fill="${v('muted')}">${ST[st]}</text>`);
    for (const g of gs) {
      const id = g.properties.GEOID,
        c = by[id],
        polys = g.geometry.type === 'Polygon' ? [g.geometry.coordinates] : g.geometry.coordinates,
        d = polys
          .map(poly => poly.map(r => r.map((p, j) => (j ? 'L' : 'M') + pr(p).map(q => q.toFixed(1)).join(',')).join('') + 'Z').join(''))
          .join('');
      out.push(
        `<path d="${d}" fill="${fill(c.db)}" data-f="${id}" tabindex="0" role="button"` +
          ` class="${c.verdict !== 'within noise' ? 'moved' : ''} ${id === f ? 'selected' : ''}"` +
          ` aria-label="${esc(N[id])}: ${sg(c.db)} points, ${said(c)}"><title>${esc(N[id])}: ${sg(c.db)} points, ${said(c)}</title></path>`,
      );
    }
  }
  $('map').innerHTML = `<svg viewBox="0 0 630 240" role="group" aria-label="Map of the 30 counties coloured by change in share stretched">${out.join('')}</svg>`;
  $('map').querySelectorAll('path').forEach(p => {
    p.onclick = () => link(p.dataset.f);
    p.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        link(p.dataset.f);
      }
    };
  });
  $('mapKey').innerHTML =
    `<span>Fell 12</span><i style="background:linear-gradient(90deg,${fill(-12)},${fill(0)},${fill(12)})"></i><span>Rose 12 points</span>`;
}

async function counties() {
  const f = $('county').value,
    c = T.counties.find(c => c.fips === f),
    w = D.flows.filter(r => r.fips === f).sort((a, b) => b.year - a.year)[0],
    rows = D.paths.filter(r => r.fips === f),
    P = Object.fromEntries(G.pooled.map(r => [r.year, r]));
  map();
  $('card').innerHTML =
    `<h3>${esc(N[f])}</h3>` +
    `<p class="big">Share stretched: <b>${fx(c.b0)}%</b> in 2011, <b>${fx(c.b1)}%</b> in 2024. ` +
    `Change ${sg(c.db)} ± ${fx(c.m_db)} points <span class="badge ${verdict(c)}">${said(c)}</span></p>` +
    `<dl><dt>Median rent</dt><dd>${usd(c.R0)} → ${usd(c.R1)} a month (${sg(c.rent_pct)}%)</dd>` +
    `<dt>Median renter income</dt><dd>${usd(c.I0)} → ${usd(c.I1)} a year (${sg(c.inc_pct)}%)</dd>` +
    `<dt>Rent minus income</dt><dd>${sg(c.gap)} log points</dd>` +
    `<dt>Jobs at workplaces</dt><dd>${Math.round(c.J0).toLocaleString('en-US')} → ${Math.round(c.J1).toLocaleString('en-US')} (${sg(c.jobs_pct)}%, 2011–${c.j1})</dd>` +
    `<dt>Average workplace pay</dt><dd>${sg(c.pay_pct)}%, 2011–${c.j1}</dd>` +
    (w
      ? `<dt>Commuting, ${w.year}</dt><dd>${fx(100 * w.inbound, 0)}% of jobs here are held by people living in another county; ${fx(100 * w.outbound, 0)}% of working residents work in another county</dd>`
      : '') +
    `</dl><p class="note">Dollars are ${G.base_year} dollars. Margins are Census 90% survey margins.</p>`;
  const ys = Array.from({ length: 14 }, (_, i) => 2011 + i),
    by = Object.fromEntries(rows.map(r => [r.year, r]));
  await plot(
    'countyShare',
    [
      {
        x: ys, y: ys.map(y => P[y]?.b ?? null), mode: 'lines', name: 'All 30 counties',
        line: { color: v('flat'), width: 2, dash: 'dot' }, connectgaps: false,
        hovertemplate: 'All 30 counties, %{x}: %{y:.1f}%<extra></extra>',
      },
      {
        x: ys, y: ys.map(y => by[y]?.burden ?? null), mode: 'lines+markers', name: short(f),
        line: { color: v('a'), width: 2.5 }, connectgaps: false,
        error_y: { type: 'data', array: ys.map(y => by[y]?.burden_moe ?? 0), color: v('a'), thickness: 1, width: 3 },
        hovertemplate: `${esc(short(f))}, %{x}: %{y:.1f}%<extra></extra>`,
      },
    ],
    {
      title: { text: `Share stretched in ${short(f)}, with survey margins` },
      showlegend: true,
      legend: { orientation: 'h', y: -0.15 },
      yaxis: { ticksuffix: '%' },
      xaxis: { dtick: 2 },
    },
  );
  const b0 = by[2011],
    idx = k => ys.map(y => (by[y]?.[k] != null ? (100 * by[y][k]) / b0[k] : null));
  await plot(
    'countyIndex',
    [
      ['real_rent', 'Median rent', 'b', 'solid'],
      ['real_income', 'Median renter income', 'a', 'solid'],
      ['jobs', 'Jobs at workplaces', 'c', 'dot'],
    ].map(([k, n, col, dash]) => ({
      x: ys, y: idx(k), name: n, mode: 'lines+markers', connectgaps: false,
      line: { color: v(col), width: 2.2, dash }, marker: { size: 4 },
      hovertemplate: `${n}, %{x}: %{y:.0f}<extra></extra>`,
    })),
    {
      title: { text: 'Rent, renter income and jobs, 2011 = 100, after inflation' },
      showlegend: true,
      legend: { orientation: 'h', y: -0.15 },
      xaxis: { dtick: 2 },
    },
  );
}

function countyTable() {
  table(
    'countyTable',
    ['County', '2011', '2024', 'Change ± margin', 'Verdict', 'Rent', 'Renter income', 'Jobs'],
    [...T.counties]
      .sort((a, b) => b.db - a.db)
      .map(c => [
        `<button data-county="${c.fips}">${esc(N[c.fips])}</button>`,
        fx(c.b0) + '%',
        fx(c.b1) + '%',
        `${sg(c.db)} ± ${fx(c.m_db)}`,
        said(c),
        sg(c.rent_pct) + '%',
        sg(c.inc_pct) + '%',
        sg(c.jobs_pct) + '%',
      ]),
  );
  document.querySelectorAll('[data-county]').forEach(b => (b.onclick = () => link(b.dataset.county)));
}

const dot = (p, x, y, t) => ({
  type: 'scatter',
  mode: 'markers',
  x: p.counties.map(c => c[x]),
  y: p.counties.map(c => c[y]),
  customdata: p.counties.map(c => c.fips),
  text: p.counties.map(c => `${N[c.fips]}<br>${t(c)}`),
  hovertemplate: '%{text}<extra></extra>',
  marker: {
    size: 10,
    color: p.counties.map(c => v(verdict(c))),
    line: { color: v('surface'), width: 1 },
  },
});

async function rent() {
  const gs = fit(T, 'gap', 'db');
  $('rentNote').textContent =
    `Each dot is a county, 2011–2024. Red: share rose beyond survey error. Teal: fell beyond survey error. ` +
    `Rent grew faster than renter income in ${T.rent_outran_income} of 30 counties. Each 10 points of gap came with ` +
    `${fx(gs.s.per10)} more points stretched (80% range ${fx(gs.s.lo)} to ${fx(gs.s.hi)}; correlation ${fx(gs.s.r, 2)}). ` +
    `Median renter income describes whoever rents that year, so part of its rise may be a change in who rents.`;
  await plot(
    'rentIncome',
    [
      {
        x: [0, 65], y: [0, 65], mode: 'lines', hoverinfo: 'skip',
        line: { color: v('muted'), dash: 'dot', width: 1 },
      },
      dot(T, 'inc_pct', 'rent_pct', c => `Rent ${sg(c.rent_pct)}%, renter income ${sg(c.inc_pct)}%`),
    ],
    {
      title: { text: 'Above the line, rent outgrew renter income' },
      xaxis: { title: { text: 'Renter income growth, %' }, range: [0, 65] },
      yaxis: { title: { text: 'Rent growth, %' }, range: [-5, 65] },
    },
  );
  await plot(
    'gapShare',
    [
      { x: gs.x, y: gs.y, mode: 'lines', hoverinfo: 'skip', line: { color: v('muted'), width: 1.5 } },
      dot(T, 'gap', 'db', c => `Gap ${sg(c.gap)}, share ${sg(c.db)} points`),
    ],
    {
      title: { text: 'Change in share stretched against the rent-income gap' },
      xaxis: { title: { text: 'Rent growth minus income growth, log points' }, zeroline: true, zerolinecolor: v('border') },
      yaxis: { title: { text: 'Change in share, points' }, zeroline: true, zerolinecolor: v('border') },
    },
  );
  wire('rentIncome');
  wire('gapShare');
}

async function jobs() {
  const p = $('period').value === '2011-2019' ? E : T,
    S = (q, y) => q.slopes.find(s => s.x === 'jobs_pct' && s.y === y),
    js = fit(p, 'jobs_pct', 'db');
  $('jobsNote').textContent =
    `Slopes across the 30 counties, with 80% bootstrap ranges. Jobs are counted at workplaces, 2011–${p.j1}. ` +
    `Per 10% more jobs the share stretched changed ${sg(js.s.per10)} points (${fx(js.s.lo)} to ${fx(js.s.hi)}); ` +
    (js.s.resolved ? 'the range excludes zero. ' : 'the range includes zero, so this does not resolve. ') +
    'These are associations, not causes.';
  const per = [T, E],
    nm = ['2011–2024', '2011–2019'],
    rows = [['rent_pct', 'Rent'], ['inc_pct', 'Renter income']];
  await plot(
    'jobSlopes',
    per.map((q, i) => ({
      type: 'scatter',
      mode: 'markers',
      orientation: 'h',
      name: nm[i],
      y: rows.map(r => r[1]),
      x: rows.map(r => S(q, r[0]).per10),
      error_x: {
        type: 'data', symmetric: false,
        array: rows.map(r => S(q, r[0]).hi - S(q, r[0]).per10),
        arrayminus: rows.map(r => S(q, r[0]).per10 - S(q, r[0]).lo),
        color: v(i ? 'c' : 'a'), thickness: 2, width: 0,
      },
      marker: { size: 11, color: v(i ? 'c' : 'a'), opacity: q === p ? 1 : 0.45 },
      offsetgroup: i,
      hovertemplate: `${nm[i]}: %{y} %{x:+.1f}% per 10% more jobs<extra></extra>`,
    })),
    {
      title: { text: 'Change per 10% more jobs, %' },
      showlegend: true,
      legend: { orientation: 'h', y: -0.2 },
      margin: { t: 44, b: 70, l: 110, r: 16 },
      xaxis: { zeroline: true, zerolinecolor: v('muted'), ticksuffix: '%' },
      yaxis: { autorange: 'reversed' },
      scattermode: 'group',
    },
  );
  await plot(
    'jobShare',
    [
      { x: js.x, y: js.y, mode: 'lines', hoverinfo: 'skip', line: { color: v('muted'), width: 1.5 } },
      dot(p, 'jobs_pct', 'db', c => `Jobs ${sg(c.jobs_pct)}%, share ${sg(c.db)} points`),
    ],
    {
      title: { text: `Job growth and change in share stretched, ${$('period').selectedOptions[0].text.split(',')[0]}` },
      xaxis: { title: { text: `Job growth, 2011–${p.j1}, %` } },
      yaxis: { title: { text: 'Change in share, points' }, zeroline: true, zerolinecolor: v('border') },
    },
  );
  wire('jobShare');
}

async function forecast() {
  const o = G.one_year,
    k = $('block').value;
  $('noiseNote').textContent =
    `Across ${o.n} one-year changes, a county's share moved ${fx(o.rms_change)} points in a typical year (root mean square). ` +
    `Sampling error alone would move it ${fx(o.rms_noise)}. One county's year-to-year movement is no larger than survey noise, ` +
    `so a forecast has nothing to follow. Over 2011–2024, about ${fx(100 * T.noise.real_share, 0)}% of the spread between counties is real.`;
  const xs = Array.from({ length: 121 }, (_, i) => -15 + i / 4),
    phi = (x, s) => Math.exp(-0.5 * (x / s) ** 2) / (s * Math.sqrt(2 * Math.PI)),
    dens = xs.map(x => o.pairs.reduce((a, p) => a + phi(x, p.s), 0) / o.pairs.length);
  await plot(
    'noise',
    [
      {
        type: 'histogram', x: o.pairs.map(p => p.d), histnorm: 'probability density',
        xbins: { start: -15, end: 15, size: 1 }, name: 'Observed one-year changes',
        marker: { color: mix(v('surface'), v('a'), 0.55), line: { color: v('surface'), width: 1 } },
        hovertemplate: '%{x} points<extra>Observed</extra>',
      },
      {
        x: xs, y: dens, mode: 'lines', name: 'Survey error alone',
        line: { color: v('b'), width: 2.5 }, hoverinfo: 'skip',
      },
    ],
    {
      title: { text: 'One-year changes in a county share, against survey error alone' },
      showlegend: true,
      legend: { orientation: 'h', y: 1, yanchor: 'bottom', x: 0 },
      margin: { t: 70, b: 56, l: 40, r: 16 },
      bargap: 0,
      xaxis: { title: { text: 'Change from the year before, points' }, range: [-15, 15] },
      yaxis: { title: { text: 'Density' }, showticklabels: false },
    },
  );
  const M = D.metrics.filter(
      r => r.regime === 'temporal' && r.experiment === 'all' && r.block === k && !r.weighted,
    ),
    B = G.baselines.score.filter(r => r.block === k && r.model !== 'persistence'),
    rows = [...M.map(r => [r.model, r.mae]), ...B.map(r => [r.model, r.mae])].sort((a, b) => a[1] - b[1]),
    late = m => m === 'mean3' || m === 'pooled';
  await plot(
    'board',
    [
      {
        type: 'bar', orientation: 'h',
        x: rows.map(r => r[1]),
        y: rows.map(r => D.labels[r[0]].replace(' (added later)', late(r[0]) ? '*' : '')),
        text: rows.map(r => fx(r[1], 2)), textposition: 'outside', cliponaxis: false,
        marker: {
          color: rows.map(r => (r[0] === 'persistence' ? v('a') : late(r[0]) ? mix(v('surface'), v('c'), 0.6) : v('flat'))),
        },
        hovertemplate: '%{y}<br>Average miss %{x:.2f} points<extra></extra>',
      },
    ],
    {
      margin: { t: 10, b: 44, l: 250, r: 40 },
      xaxis: { title: { text: 'Average miss, points' }, range: [0, 4.4] },
      yaxis: { autorange: 'reversed' },
    },
  );
  const n = M[0].n,
    m3 = G.baselines.paired.find(r => r.model === 'mean3' && r.block === k);
  $('boardNote').textContent =
    `${n} county-years. * Added after the final test had been scored. ` +
    `Three-year average minus carrying forward: ${sg(m3.delta_mae, 2)} points (80% range ${sg(m3.lo, 2)} to ${sg(m3.hi, 2)}). ` +
    'The pooling model judged every county deviation from its usual level to be survey noise.';
  const H = ['temporal', 'holdout_08', 'holdout_25', 'holdout_53'],
    mae = (g, m) =>
      D.metrics.find(
        r => r.regime === g && r.experiment === 'all' && r.model === m && r.block === 'final test' && !r.weighted,
      ).mae;
  table(
    'holdouts',
    ['Scored on', 'Carry forward', 'Regression', 'Boosted trees'],
    H.map(g => [
      g === 'temporal' ? 'All three states' : ST[g.split('_')[1]] + ' (left out)',
      fx(mae(g, 'persistence'), 2),
      fx(mae(g, 'linear'), 2),
      fx(mae(g, 'trees'), 2),
    ]),
  );
  const C = D.paired.filter(r => r.experiment === 'employment'),
    t = C.filter(r => r.regime === 'temporal'),
    h = C.filter(r => r.regime !== 'temporal');
  $('commuting').innerHTML =
    t
      .map(
        r =>
          `<p><b>${esc(D.labels[r.model])}:</b> ${r.delta < 0 ? 'commuting lowered' : 'commuting raised'} the average miss by ${fx(Math.abs(r.delta), 2)} points (80% range ${sg(r.lo, 2)} to ${sg(r.hi, 2)}).</p>`,
      )
      .join('') +
    `<p>With a whole state left out, commuting raised the average miss in ${h.filter(r => r.delta > 0).length} of ${h.length} cases; in ${h.filter(r => r.lo > 0).length} the whole 80% range is above zero.</p>`;
}

function sources() {
  table(
    'sources',
    ['Source', 'Used for'],
    [
      ['<a href="https://www.census.gov/programs-surveys/acs/data/summary-file.html">Census ACS one-year</a>', 'Share stretched, rent, renter income, population, housing units, survey margins'],
      ['<a href="https://www.bls.gov/cew/">BLS QCEW</a>', 'Jobs and average pay at workplaces'],
      ['<a href="https://lehd.ces.census.gov/data/lodes/LODES8/LODESTechDoc8.4.pdf">Census LODES8</a>', 'Where workers live and work, primary jobs'],
      ['<a href="https://fred.stlouisfed.org/series/CPIAUCNS">BLS CPI-U via FRED</a>', 'Inflation adjustment, annual average'],
      ['<a href="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer">Census TIGERweb</a>', 'County boundaries'],
      ['<a href="downloads/manifest.json">Source checksums</a>', `${D.sources.length} downloaded files with retrieval time, size and SHA-256`],
    ],
  );
}

async function start() {
  try {
    window.RENDERED = false;
    const r = await fetch('data.json');
    if (!r.ok) throw Error(`data.json HTTP ${r.status}`);
    D = await r.json();
    window.D = D;
    G = D.gap;
    T = G.periods.find(p => p.y1 === 2024);
    E = G.periods.find(p => p.y1 === 2019);
    D.sample.forEach(r => (N[r.fips] = r.name));
    $('county').innerHTML = D.sample
      .map(r => [r.fips, r.name])
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([f, n]) => `<option value="${f}">${esc(n)}</option>`)
      .join('');
    const q = new URL(location.href).searchParams.get('county');
    $('county').value = N[q] ? q : '53067';
    const up = T.counties.filter(c => c.verdict !== 'within noise').length;
    $('countiesTitle').textContent = `${up} of 30 counties changed by more than the survey can miss`;
    await summary();
    await counties();
    countyTable();
    await rent();
    await jobs();
    await forecast();
    sources();
    $('county').onchange = () => link($('county').value);
    $('period').onchange = () => jobs().catch(fail);
    $('block').onchange = () => forecast().catch(fail);
    $('status').textContent = '';
    window.RENDERED = true;
  } catch (e) {
    fail(e);
  }
}
function fail(e) {
  console.error(e);
  $('status').textContent = `Could not load the data: ${e.message}. Serve this folder over HTTP; see the README.`;
}
start();
