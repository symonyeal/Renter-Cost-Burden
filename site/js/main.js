/* Page wiring: state in the URL, map, comparison and the section charts.
   Legend: s state; A/L data files; k place id; ks place ids; m measure; c category; y year; F facts;
   $ element by id; sel compare selection (ordered, colour = slot). */
import { D, load, meas, rows, at, latest, series, rebase, placesWith, cats, defCat, catLabel, placeName, regionVar, slotVar, fmt, pct, esc, spark, frame, empty, PR, REGION_ORDER, LEVEL_NAME } from './util.js';
import { AtlasMap, levelsFor, LEVEL_LABEL } from './map.js';
import { legend, colorOf } from './colors.js';
import * as C from './charts.js';

const $ = id => document.getElementById(id);
const DEFAULT_PLACES = ['m-535', 'm-933', 'm-462', 'm-825', 'm-205'];
const PRESETS = [
  ['Largest metro areas', ['m-535', 'm-462', 'm-933', 'm-825', 'm-835', 'm-505']],
  ['Prairie cities', ['m-602', 'm-705', 'm-725', 'm-825', 'm-835']],
  ['Atlantic', ['m-001', 'm-205', 'm-305', 'm-310', 'm-320']],
  ['West vs East', ['pr-59', 'pr-48', 'pr-35', 'pr-24', 'pr-12']],
  ['Territories', ['pr-60', 'pr-61', 'pr-62']],
  ['Ontario metros', ['m-535', 'm-505', 'm-537', 'm-555', 'm-541', 'm-568']]
];
let s, map, F;

function readUrl() {
  const q = new URLSearchParams(location.search);
  s = {
    m: q.get('m') || 'rent', c: q.get('c'), y: +q.get('y') || null, lv: q.get('lv') || null, pr: q.get('pr') || '35',
    sel: (q.get('p') || DEFAULT_PLACES.join(',')).split(',').filter(k => D.P.has(k)).slice(0, 6),
    rm: q.get('rm') || 'rent_real', rc: q.get('rc') || '2br', hm: q.get('hm') || 'rent_change', hc: q.get('hc') || '2br', hs: q.get('hs') || 'last',
    base: +q.get('base') || 2000, sp: q.get('sp') || 'can', bp: q.get('bp') || 'can', fixed: q.get('fx') === '1'
  };
  if (!meas(s.m)) s.m = 'rent';
}
function writeUrl() {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ m: s.m, c: s.c, y: s.y, lv: s.lv, pr: s.pr, p: s.sel.join(','), rm: s.rm, rc: s.rc, hm: s.hm, hc: s.hc, hs: s.hs, base: s.base, sp: s.sp, bp: s.bp, fx: s.fixed ? 1 : '' })) if (v != null && v !== '') q.set(k, v);
  history.replaceState(null, '', '?' + q.toString() + location.hash);
}

/* ---------- theme ---------- */
function theme() {
  const b = $('theme'), order = ['system', 'light', 'dark'];
  let t = 'system';
  try { t = localStorage.getItem('rcb-theme') || 'system'; } catch { /* storage unavailable */ }
  const apply = () => { if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; b.textContent = `Theme: ${t}`; };
  apply();
  b.onclick = () => { t = order[(order.indexOf(t) + 1) % 3]; try { localStorage.setItem('rcb-theme', t); } catch { /* ignore */ } apply(); };
}

/* ---------- lead ---------- */
function lead() {
  const f = F, tiles = [];
  const b = f.burden, r = f.metro_real_rent, cn = f.core_need, v = f.vacancy, top = f.top_rent, tc = f.top_community, cp = f.cpi_rent;
  $('lead-title').textContent = b ? 'One renter household in three spends 30% or more of its income on shelter' : 'Renter housing costs in Canada';
  $('lead-deck').textContent = [
    r ? `In the typical metro area, two-bedroom rent rose ${Math.round(r.median_pct)}% more than prices from ${r.from} to ${r.to}.` : '',
    cp ? `Prices for the same rental units rose ${Math.round(cp.rent_pct)}% from ${cp.from} to ${cp.to}, about as fast as all consumer prices (${Math.round(cp.all_pct)}%); average rents rose faster because newer, dearer units entered the stock.` : '',
    'Below: every province, metro area and community the official tables cover.'].join(' ');
  if (b) tiles.push([`${b['2021'].toFixed(1)}%`, `of renter households spent 30%+ of income on shelter in 2021, down from ${b['2016'].toFixed(1)}% in 2016; 2020 incomes included pandemic benefits`]);
  if (r) tiles.push([`<em>+${r.median_pct.toFixed(0)}%</em>`, `real two-bedroom rent, ${r.from}–${r.to}, median of ${r.areas} metro areas, in ${r.to} dollars`]);
  if (cn) tiles.push([`${cn.to_pct.toFixed(1)}%`, `of renters in the provinces were in core housing need in ${cn.to} (${cn.from_pct.toFixed(1)}% in ${cn.from})`]);
  if (v) tiles.push([`${v.pct.toFixed(1)}%`, `rental vacancy across metro areas in ${v.year}; the low since 1992 was ${v.low_pct.toFixed(1)}% in ${v.low_year}`]);
  if (top) tiles.push([`$${Math.round(top.rent).toLocaleString('en-CA')}`, `average two-bedroom rent in ${top.name}, the highest metro area, ${top.year}`]);
  if (tc) tiles.push([`${tc.pct.toFixed(0)}%`, `of renters in ${placeName(tc.place)} spent 30%+ in 2021, the highest of communities with 5,000+ renter households`]);
  $('tiles').innerHTML = tiles.map(([n, t]) => `<div class="tile"><b>${n}</b><span>${esc(t)}</span></div>`).join('');
}

/* ---------- map ---------- */
const MAP_MEASURES = ['rent', 'rent_real', 'rent_change', 'vacancy', 'burden', 'burden_history', 'burden_subsidy', 'burden_income', 'burden_household', 'renter_share', 'subsidized_share', 'core_need', 'core_need_size', 'cpi', 'rent_relative', 'rent_inflation', 'income', 'population', 'starts_per_1000', 'apartment_share'];
function mapControls() {
  const groups = d3.group(MAP_MEASURES.map(meas).filter(Boolean), m => m.group);
  $('m-measure').innerHTML = [...groups].map(([g, ms]) => `<optgroup label="${esc(g)}">${ms.map(m => `<option value="${m.id}">${esc(m.title)}${/[0-9]{4}$/.test(m.title) ? '' : ` · ${m.years[0]}–${m.years.at(-1)}`}</option>`).join('')}</optgroup>`).join('');
  $('m-pr').innerHTML = Object.entries(PR).map(([k, v]) => `<option value="${k}">${esc(v[0])}</option>`).join('');
  $('m-measure').onchange = e => { s.m = e.target.value; s.c = null; drawMap(); };
  $('m-cat').onchange = e => { s.c = e.target.value; drawMap(); };
  $('m-pr').onchange = e => { s.pr = e.target.value; drawMap(); };
  const yr = $('year');
  yr.oninput = () => { s.y = +yr.value; drawMap(true); };
  let timer = null;
  $('play').onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $('play').textContent = '▶'; return; }
    const ys = meas(s.m).years;
    if (s.y === ys.at(-1)) s.y = ys[0];
    $('play').textContent = '❚❚';
    timer = setInterval(() => {
      const i = ys.indexOf(s.y);
      if (i >= ys.length - 1) { clearInterval(timer); timer = null; $('play').textContent = '▶'; return; }
      s.y = ys[i + 1]; yr.value = s.y; drawMap(true);
    }, 650);
  };
  $('rank-q').oninput = () => rank();
  $('m-fixed').checked = s.fixed;
  $('m-fixed').onchange = e => { s.fixed = e.target.checked; drawMap(true); };
}
let drawing = 0;
async function drawMap(quick = false) {
  const me = meas(s.m), cs = cats(s.m);
  if (!cs.includes(s.c)) s.c = defCat(s.m);
  const lvs = levelsFor(s.m, s.c);
  if (!lvs.includes(s.lv)) s.lv = lvs.includes('metro') ? 'metro' : lvs[0];
  const ys = me.years;
  if (!ys.includes(s.y)) s.y = ys.at(-1);
  if (!quick) {
    $('m-measure').value = s.m;
    $('m-cat-wrap').hidden = cs.length < 2;
    $('m-cat').innerHTML = cs.map(c => `<option value="${esc(c)}">${esc(catLabel(s.m, c))}</option>`).join('');
    $('m-cat').value = s.c;
    $('m-level').innerHTML = Object.entries(LEVEL_LABEL).map(([k, v]) => `<button type="button" role="radio" aria-checked="${k === s.lv}" ${lvs.includes(k) ? '' : 'disabled title="Not published at this level"'} data-lv="${k}">${v}</button>`).join('');
    $('m-level').querySelectorAll('button').forEach(b => b.onclick = () => { s.lv = b.dataset.lv; drawMap(); });
    $('m-pr-wrap').hidden = s.lv !== 'community';
    $('m-pr').value = s.pr;
    const yr = $('year');
    $('scrub').hidden = ys.length < 2;
    $('m-fixed-wrap').hidden = ys.length < 2 || me.format === 'change';
    yr.min = ys[0]; yr.max = ys.at(-1); yr.step = 1; yr.value = s.y;
    $('map-sub').textContent = `${me.title}${me.cats ? ' · ' + catLabel(s.m, s.c) : ''}. ${me.universe}`;
    $('map-source').textContent = `Source: ${me.source}. ${me.notes}`;
  }
  $('year-out').textContent = s.y;
  const n = ++drawing;
  try {
    const { S, keys } = await map.draw(s);
    if (n !== drawing) return;
    map.keys = keys;
    legend($('legend'), s.m, S);
    map.select(s.sel);
    rank();
  } catch (e) { $('map-source').textContent = `Map failed to load: ${e.message}`; }
  writeUrl();
}
function rank() {
  const q = $('rank-q').value.trim().toLowerCase();
  const ks = (map.keys || []).map(k => [k, at(s.m, s.c, k, s.y)]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  const max = d3.max(ks, d => Math.abs(d[1])) || 1;
  $('rank-title').textContent = s.lv === 'community' ? `Communities in ${PR[s.pr][0]} with 250+ renter households, ${s.y}` : `${s.lv === 'metro' ? 'Metro areas and agglomerations' : LEVEL_LABEL[s.lv]} ranked, ${s.y}`;
  const shown = ks.map((d, i) => [...d, i + 1]).filter(([k]) => !q || placeName(k, true).toLowerCase().includes(q)).slice(0, 400);
  $('rank-list').innerHTML = shown.map(([k, v, i]) => {
    const few = s.lv === 'community' ? at('renter_households', '', k, 2021) : null;
    return `<li><button type="button" data-k="${k}"><span class="n">${i}</span><span>${esc(placeName(k))}${few != null && few < 250 ? ' <span class="flag">· few renters</span>' : ''}</span><span class="v">${esc(fmt(s.m, v))}</span><span class="bar"><i style="width:${(100 * Math.abs(v) / max).toFixed(1)}%;background:${colorOf(map.S, v)}"></i></span></button></li>`;
  }).join('') || '<li class="hint">No values for this selection.</li>';
  $('rank-list').querySelectorAll('button').forEach(b => b.onclick = () => pick(b.dataset.k));
}

/* ---------- comparison ---------- */
function pick(k) {
  if (s.sel.includes(k)) s.sel = s.sel.filter(x => x !== k);
  else { s.sel.push(k); if (s.sel.length > 6) s.sel.shift(); }
  map.select(s.sel); compare(); writeUrl();
  document.querySelector(`#chips`).scrollIntoView({ block: 'nearest' });
}
function chips() {
  $('chips').innerHTML = s.sel.map((k, i) => `<span class="chip"><i style="background:${slotVar(i)}"></i>${esc(placeName(k))}<button type="button" aria-label="Remove ${esc(placeName(k))}" data-k="${k}">×</button></span>`).join('') || '<span class="hint">No places selected.</span>';
  $('chips').querySelectorAll('button').forEach(b => b.onclick = () => pick(b.dataset.k));
}
function search() {
  const inp = $('place-q'), ul = $('place-opts');
  const all = [...D.P.values()].filter(p => p.level !== 'aggregate' && p.level !== 'centre');
  let hits = [], cur = -1;
  const show = () => {
    ul.hidden = !hits.length; inp.setAttribute('aria-expanded', String(!!hits.length));
    ul.innerHTML = hits.map((p, i) => `<li role="option" id="opt-${i}" aria-selected="${i === cur}" data-k="${p.id}">${esc(placeName(p.id, true))}<span>${esc(LEVEL_NAME[p.level] || p.level)}</span></li>`).join('');
    ul.querySelectorAll('li').forEach(li => li.onmousedown = e => { e.preventDefault(); choose(li.dataset.k); });
  };
  const choose = k => { inp.value = ''; hits = []; show(); if (!s.sel.includes(k)) pick(k); };
  inp.oninput = () => {
    const q = inp.value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    cur = -1;
    if (q.length < 2) { hits = []; return show(); }
    const rank_ = { country: 0, province: 1, territory: 1, metro: 2, agglomeration: 3, division: 5, community: 4 };
    hits = all.map(p => [p, p.name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')]).filter(([, n]) => n.includes(q))
      .sort((a, b) => (a[1].startsWith(q) ? 0 : 1) - (b[1].startsWith(q) ? 0 : 1) || (rank_[a[0].level] ?? 9) - (rank_[b[0].level] ?? 9) || a[1].localeCompare(b[1])).slice(0, 12).map(d => d[0]);
    show();
  };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { cur = Math.min(hits.length - 1, cur + 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); show(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits.length) { choose(hits[Math.max(0, cur)].id); e.preventDefault(); }
    else if (e.key === 'Escape') { hits = []; show(); }
  };
  inp.onblur = () => setTimeout(() => { hits = []; show(); }, 100);
  $('presets').innerHTML = '<span class="hint">Try:</span>' + PRESETS.map(([n], i) => `<button type="button" data-i="${i}">${esc(n)}</button>`).join('');
  $('presets').querySelectorAll('button').forEach(b => b.onclick = () => { s.sel = PRESETS[+b.dataset.i][1].filter(k => D.P.has(k)); map.select(s.sel); compare(); writeUrl(); });
}

function cell(m, c, k, { change = 0 } = {}) {
  const l = latest(m, c, k);
  if (!l) return { html: '–', v: null };
  if (change) {
    const a = at(m, c, k, l[0] - change);
    if (a == null) return { html: '–', v: null };
    const v = 100 * (l[1] / a - 1);
    return { html: `${pct(v, 0)}<small>${l[0] - change}–${l[0]}</small>`, v };
  }
  return { html: `${esc(fmt(m, l[1]))}<small>${l[0]}${l[4] ? ' · ' + esc(l[4]) : ''}</small>`, v: l[1] };
}
function compare() {
  chips();
  const ks = s.sel, color = new Map(ks.map((k, i) => [k, slotVar(i)]));
  const ROWS = [
    ['Two-bedroom rent', k => cell('rent', '2br', k), k => rows('rent', '2br', k)],
    ['Real two-bedroom rent, 10-year change', k => cell('rent_real', '2br', k, { change: 10 })],
    ['Vacancy rate', k => cell('vacancy', '', k), k => rows('vacancy', '', k)],
    ['Rent price inflation (CPI rent)', k => cell('rent_inflation', '', k), k => rows('rent_inflation', '', k)],
    ['Renters spending 30%+, 2021', k => cell('burden', '', k)],
    ['Renters spending 30%+, 2016 → 2021', k => { const a = at('burden_history', '', k, 2016), b = at('burden_history', '', k, 2021); return { html: a == null ? '–' : `${a.toFixed(1)}% → ${b.toFixed(1)}%` }; }],
    ['Renters in core housing need', k => cell('core_need', 'all', k), k => rows('core_need', 'all', k)],
    ['Households that rent, 2021', k => cell('renter_share', '', k)],
    ['Renters in subsidized housing, 2021', k => cell('subsidized_share', '', k)],
    ['Renter households, 2021', k => cell('renter_households', '', k)],
    ['Median after-tax income', k => cell('income', 'all', k), k => rows('income', 'all', k)],
    ['Population', k => cell('population', '', k), k => rows('population', '', k)],
    ['Population growth since 2001', k => { const l = latest('population', '', k), a = at('population', '', k, 2001); return { html: l && a ? pct(100 * (l[1] / a - 1), 0) : '–' }; }]
  ];
  // Rows with nothing published for any selected place are left out rather than shown as dashes.
  const live = ROWS.filter(([, f]) => ks.some(k => f(k).html !== '–'));
  $('cmp-table').innerHTML = `<thead><tr><th scope="col">Measure</th>${ks.map(k => `<th scope="col"><i style="background:${color.get(k)}"></i>${esc(placeName(k))}</th>`).join('')}</tr></thead><tbody>${live.map(([name, f, sp]) =>
    `<tr><th scope="row">${esc(name)}</th>${ks.map(k => { const c = f(k); return `<td>${c.html}${sp ? spark(sp(k), 90, 22, color.get(k)) : ''}</td>`; }).join('')}</tr>`).join('')}</tbody>`;

  // Rent over time
  const el = $('c-rent'), me = meas(s.rm);
  const ser = series(s.rm, s.rc, ks, k => color.get(k)).filter(x => x.rows.length);
  const plot = frame(el, `${catLabel('rent', s.rc)} rent, ${s.rm === 'rent_real' ? `in ${me.years.at(-1)} dollars` : 'nominal dollars'}`, `CMHC October survey, purpose-built rentals. ${s.rm === 'rent_real' ? 'Deflated by provincial all-items CPI.' : ''}`, 'Source: Statistics Canada 34-10-0133' + (s.rm === 'rent_real' ? ', 18-10-0005' : ''));
  const tabs = document.createElement('div'); tabs.className = 'controls tabs';
  tabs.innerHTML = `<div class="seg" role="radiogroup" aria-label="Dollars">${[['rent_real', 'Inflation-adjusted'], ['rent', 'Nominal']].map(([v, n]) => `<button type="button" role="radio" aria-checked="${v === s.rm}" data-v="${v}">${n}</button>`).join('')}</div>
    <label>Bedrooms <select>${cats('rent').map(c => `<option value="${c}" ${c === s.rc ? 'selected' : ''}>${esc(catLabel('rent', c))}</option>`).join('')}</select></label>`;
  plot.before(tabs);
  tabs.querySelectorAll('button').forEach(b => b.onclick = () => { s.rm = b.dataset.v; compare(); writeUrl(); });
  tabs.querySelector('select').onchange = e => { s.rc = e.target.value; compare(); writeUrl(); };
  if (!C.lines(plot, ser, s.rm)) empty(el, 'No CMHC rent for the selected places. Provinces and territories have the CPI rent index instead (section 04).');
  const miss = ks.filter(k => !rows(s.rm, s.rc, k).length);
  if (ser.length && miss.length) empty(el, `No CMHC rent series for ${miss.map(k => placeName(k)).join(', ')}.`);

  // Vacancy
  const ev = $('c-vac');
  const vs = series('vacancy', '', ks, k => color.get(k)).filter(x => x.rows.length);
  const pv = frame(ev, 'Rental vacancy rate', 'Share of purpose-built units vacant and available in October, all bedroom sizes.', 'Source: Statistics Canada 34-10-0130, 34-10-0131');
  if (!C.lines(pv, vs, 'vacancy', { zero: true })) empty(ev, 'No vacancy series for the selected places (published for metro areas and agglomerations of 50,000+).');

  // Burden slope 2016 -> 2021
  const es = $('c-slope');
  const sl = ks.map(k => ({ k, name: placeName(k), color: color.get(k), a: at('burden_history', '', k, 2016), b: at('burden_history', '', k, 2021) })).filter(x => x.a != null);
  const ps = frame(es, 'Renters spending 30%+ on shelter, 2016 and 2021', 'Same boundaries both years. 2020 incomes included pandemic benefits, which lowered the 2021 rate.', 'Source: Statistics Canada, The Daily, 2022-09-21, table 4');
  if (sl.length) C.slope(ps, sl, 'burden_history', 2016, 2021); else empty(es, 'None of the selected places is in the 2016–2021 comparison (Canada, provinces, territories and 41 metro areas).');

  // Population indexed
  const ep = $('c-income');
  const idx = series('population', '', ks, k => color.get(k)).map(d => {
    const b = d.rows.find(r => r[0] === 2001)?.[1];
    return { ...d, rows: b ? d.rows.filter(r => r[0] >= 2001).map(r => [r[0], 100 * r[1] / b]) : [] };
  }).filter(x => x.rows.length);
  const pp = frame(ep, 'Population growth since 2001', 'July 1 population, 2001 = 100. Metro areas on 2021 boundaries.', 'Source: Statistics Canada 17-10-0005, 17-10-0148');
  if (!C.lines(pp, idx, 'rent_relative', { refY: 100 })) empty(ep, 'No population series for the selected places.');
}

/* ---------- rents section ---------- */
function rentsSection() {
  const metros = [...D.P.values()].filter(p => p.level === 'metro' && rows('rent', '2br', p.id).length);
  $('h-mode').innerHTML = [['rent_change', 'Yearly change'], ['rent_real', 'Real rent'], ['rent', 'Nominal rent']].map(([v, n]) => `<button type="button" role="radio" aria-checked="${v === s.hm}" data-v="${v}">${n}</button>`).join('');
  $('h-mode').querySelectorAll('button').forEach(b => b.onclick = () => { s.hm = b.dataset.v; rentsSection(); writeUrl(); });
  $('h-cat').innerHTML = cats('rent').map(c => `<option value="${c}">${esc(catLabel('rent', c))}</option>`).join('');
  $('h-cat').value = s.hc; $('h-cat').onchange = e => { s.hc = e.target.value; rentsSection(); writeUrl(); };
  $('h-sort').value = s.hs; $('h-sort').onchange = e => { s.hs = e.target.value; rentsSection(); writeUrl(); };
  const m = s.hm, c = s.hc;
  const ys = meas('rent').years;
  const growth = k => { const a = at('rent_real', c, k, 2015), b = latest('rent_real', c, k); return a && b ? b[1] / a - 1 : -Infinity; };
  const sorter = { last: (a, b) => (latest(m, c, b.id)?.[1] ?? -1e9) - (latest(m, c, a.id)?.[1] ?? -1e9), growth: (a, b) => growth(b.id) - growth(a.id), name: (a, b) => a.name.localeCompare(b.name), region: (a, b) => REGION_ORDER.indexOf(a.reg) - REGION_ORDER.indexOf(b.reg) || a.name.localeCompare(b.name) }[s.hs];
  const rd = metros.sort(sorter).map(p => ({ k: p.id, name: placeName(p.id), color: regionVar(p.id), rows: rows(m, c, p.id), extra: y => { const n = at('rent', c, p.id, y); return n == null ? '' : `Nominal ${fmt('rent', n)}`; } }));
  // Findings for the title from the data shown.
  const lastY = ys.at(-1);
  const withC = metros.filter(p => at('rent_change', c, p.id, lastY) != null), ups = withC.filter(p => at('rent_change', c, p.id, lastY) > 5).length;
  const el = $('c-heat');
  const title = m === 'rent_change' ? `In ${lastY}, ${ups} of ${withC.length} metro areas saw ${catLabel('rent', c).toLowerCase()} rents rise more than 5%` : `${catLabel('rent', c)} rent by metro area and year`;
  const p = frame(el, title, `${meas(m).title}, ${catLabel('rent', c).toLowerCase()} units. Blank cells: not published. Left bar: region.`, `Source: ${meas(m).source}`);
  const y0 = d3.min(rd, d => d.rows.find(r => r[1] != null)?.[0]) ?? ys[0];
  C.heatPanel(p, rd, d3.range(y0, lastY + 1), m, c, { onRow: pick, label: title });

  // Bump chart: rank by nominal 2BR rent since 2000
  const yrs = d3.range(2000, lastY + 1);
  const rk = new Map();
  for (const y of yrs) {
    const vals = metros.map(p => [p.id, at('rent', c, p.id, y)]).filter(d => d[1] != null).sort((a, b) => b[1] - a[1]);
    vals.forEach(([k], i) => { if (!rk.has(k)) rk.set(k, []); rk.get(k).push([y, i + 1]); });
  }
  const bser = metros.map(p => ({ k: p.id, name: placeName(p.id), color: 'var(--rule)', ranks: (rk.get(p.id) || []) }));
  const hl = new Map(metros.filter(p => (rk.get(p.id) || []).find(r => r[0] === lastY)?.[1] <= 6).map(p => [p.id, regionVar(p.id)]));
  s.sel.forEach((k, i) => { if (rk.has(k)) hl.set(k, slotVar(i)); });
  const leader = metros.find(p => rk.get(p.id)?.find(r => r[0] === lastY)?.[1] === 1);
  const eb = $('c-bump');
  const pb = frame(eb, leader ? `${placeName(leader.id)} has the highest ${catLabel('rent', c).toLowerCase()} rent; the order below it keeps changing` : 'Rank by rent', `Rank among ${metros.length} metro areas by average ${catLabel('rent', c).toLowerCase()} rent, 1 = highest. Top six in ${lastY} in region colours; your comparison places in their colours.`, 'Source: Statistics Canada 34-10-0133');
  C.bump(pb, bser, yrs, { highlight: hl, label: 'Rank over time', topN: 12 });

  // Scatter: vacancy vs rent change, same survey
  const es = $('c-scatter');
  const sy = lastY;
  const pts = metros.map(p => ({ k: p.id, name: placeName(p.id), x: at('vacancy', '', p.id, sy), y: at('rent_change', c, p.id, sy), color: regionVar(p.id), hl: s.sel.includes(p.id) })).filter(d => d.x != null && d.y != null);
  const corr = pts.length > 3 ? d3.mean(pts, d => d.x * d.y) - d3.mean(pts, d => d.x) * d3.mean(pts, d => d.y) : 0;
  const ps = frame(es, corr < 0 ? `Where more units sat empty in ${sy}, rents rose less` : `Vacancy and rent change, ${sy}: no downward pattern this year`, `Each dot is a metro area: October ${sy} vacancy rate against the change in ${catLabel('rent', c).toLowerCase()} rent from ${sy - 1}. Colour: region.`, 'Source: Statistics Canada 34-10-0130, 34-10-0133');
  const big = new Set([...pts].sort((a, b) => (latest('population', '', b.k)?.[1] || 0) - (latest('population', '', a.k)?.[1] || 0)).slice(0, 6).map(d => d.k));
  pts.forEach(d => { d.label = big.has(d.k); });
  C.scatter(ps, pts, { xm: 'vacancy', ym: 'rent_change', xLabel: 'Vacancy rate', yLabel: 'Rent change', onPick: pick, label: 'Vacancy against rent change' });
  regionKey(es);
}
function regionKey(el) {
  const d = document.createElement('p'); d.className = 'ms';
  d.innerHTML = D.A.regions.map(r => `<span style="white-space:nowrap;margin-right:14px"><span style="color:var(--r-${r.id})">●</span> ${esc(r.name)}</span>`).join('');
  el.querySelector('.plot').after(d);
}

/* ---------- prices and incomes ---------- */
function incomes() {
  const base = s.base;
  const ks = ['can', ...Object.keys(PR).map(p => 'pr-' + p)].filter(k => rows('rent_relative', '', k).length);
  const yrs = d3.range(1976, 2016);
  $('i-base').innerHTML = yrs.map(y => `<option ${y === base ? 'selected' : ''}>${y}</option>`).join('');
  $('i-base').onchange = e => { s.base = +e.target.value; incomes(); writeUrl(); };
  const panels = ks.map(k => ({ name: placeName(k), series: [
    { name: 'Real rent prices', color: 'var(--r-on)', rows: rebase(rows('rent_relative', '', k), base) },
    { name: 'Real median income', color: 'var(--r-qc)', rows: rebase(rows('income', 'all', k), base) }] }));
  const cr = panels[0].series[0].rows.at(-1), ci = panels[0].series[1].rows.at(-1);
  $('inc-title').textContent = cr && ci ? `Since ${base}, real rent prices in Canada ${cr[1] >= 100 ? 'rose' : 'fell'} ${Math.abs(cr[1] - 100).toFixed(0)}% and real median income ${ci[1] >= 100 ? 'rose' : 'fell'} ${Math.abs(ci[1] - 100).toFixed(0)}%` : 'Rent prices and incomes';
  const el = $('c-multiples');
  const p = frame(el, 'Rent prices and incomes, by province', `Index, ${base} = 100. Vermilion: CPI rent ÷ all-items CPI. Blue: median after-tax income, constant dollars (all families and unattached people). Shared scale.`, 'Source: Statistics Canada 18-10-0005, 11-10-0190');
  C.multiples(p, panels, 'rent_relative', { label: 'Small multiples of rent and income indices' });

  const eh = $('c-cpiheat');
  const cpiK = [...new Set(placesWith('rent_inflation', ''))].filter(k => D.P.has(k)).sort((a, b) => {
    const pa = D.P.get(a), pb = D.P.get(b), o = { country: 0, province: 1, territory: 1 };
    return (o[pa.level] ?? 2) - (o[pb.level] ?? 2) || REGION_ORDER.indexOf(pa.reg) - REGION_ORDER.indexOf(pb.reg) || pa.name.localeCompare(pb.name);
  });
  const ri = rows('rent_inflation', '', 'can').filter(r => r[1] != null), pk = ri.reduce((a, r) => r[1] > a[1] ? r : a, [0, -Infinity]), lr = ri.at(-1);
  const ph = frame(eh, pk[0] ? `Canada's rent prices rose fastest in ${pk[0]} (${fmt('rent_inflation', pk[1])}); in ${lr[0]} they rose ${fmt('rent_inflation', lr[1])}` : 'Rent price inflation', 'Yearly change in the CPI rent index. Rows: Canada, provinces, then cities. Left bar: region.', 'Source: Statistics Canada 18-10-0005');
  C.heatPanel(ph, series('rent_inflation', '', cpiK), d3.range(1950, 2026), 'rent_inflation', '', { onRow: pick, cellH: 13, label: 'Rent inflation heat map' });
}

/* ---------- who is stretched ---------- */
function stretched() {
  const opts = [...placesWith('burden_income', 'i00')].filter(k => D.P.has(k)).sort((a, b) => {
    const o = { country: 0, province: 1, territory: 1, metro: 2, agglomeration: 3 }, pa = D.P.get(a), pb = D.P.get(b);
    return (o[pa.level] ?? 4) - (o[pb.level] ?? 4) || pa.name.localeCompare(pb.name);
  });
  if (!opts.includes(s.sp)) s.sp = 'can';
  $('s-place').innerHTML = opts.map(k => `<option value="${k}" ${k === s.sp ? 'selected' : ''}>${esc(placeName(k, true))}</option>`).join('');
  $('s-place').onchange = e => { s.sp = e.target.value; stretched(); writeUrl(); };
  const k = s.sp, all = at('burden', '', k, 2021);
  const lo = at('burden_income', 'i10', k, 2021), hi = at('burden_income', 'i100', k, 2021);
  $('st-title').textContent = lo != null && hi != null ? `In ${placeName(k)}, ${lo.toFixed(0)}% of renters with $10,000–20,000 of income spent 30%+ on shelter; above $100,000, ${hi.toFixed(1)}%` : 'Renter burden by income and household';
  const ei = $('c-income-bars');
  const pi = frame(ei, 'Burden falls steeply with income', `Renters spending 30%+ by 2020 household income, ${placeName(k)}. Dashed line: all renters (${fmt('burden', all)}).`, 'Source: 2021 Census, 98-10-0252');
  C.vbars(pi, cats('burden_income').map(c => ({ name: catLabel('burden_income', c), v: at('burden_income', c, k, 2021) })), 'burden', { color: 'var(--r-on)', ref: all, refLabel: 'All renters' });
  const eh = $('c-hh-bars');
  const hh = cats('burden_household').map(c => ({ name: catLabel('burden_household', c), v: at('burden_household', c, k, 2021) })).filter(d => d.v != null).sort((a, b) => b.v - a.v);
  const ph = frame(eh, hh.length ? `${hh[0].name} are the most stretched household type` : 'By household type', `Renters spending 30%+ by household type, ${placeName(k)}. Dashed line: all renters.`, 'Source: 2021 Census, 98-10-0252');
  C.hbars(ph, hh, 'burden', { color: 'var(--r-qc)', ref: all, refLabel: 'All renters' });

  // Communities by province
  const es = $('c-strip');
  const groups = Object.keys(PR).map(pr => ({
    name: PR[pr][0], color: `var(--r-${D.P.get('pr-' + pr)?.reg})`, ref: at('burden', '', 'pr-' + pr, 2021),
    pts: (D.L?.places || []).filter(p => p[2] === 'community' && p[3] === pr).map(p => {
      const v = at('burden', '', p[0], 2021), w = at('renter_households', '', p[0], 2021);
      return v != null && w >= 250 ? { k: p[0], name: placeName(p[0], true), v, w, note: `${fmt('renter_households', w)} renter households` } : null;
    }).filter(Boolean)
  })).filter(g => g.pts.length);
  const n = d3.sum(groups, g => g.pts.length);
  const ps = frame(es, 'Within every province, communities range widely', `${n.toLocaleString('en-CA')} communities with 250+ renter households; dot area = renter households; black tick = province rate. Click a dot to compare it.`, 'Source: 2021 Census, 98-10-0255. Communities with fewer renters are on the map but not here: counts are rounded to multiples of 5 and small counts can round to 0, which moves their rates by several points.');
  C.strip(ps, groups, 'burden', { onPick: pick, xLabel: 'Renters spending 30%+', label: 'Communities by province' });
}

/* ---------- core housing need ---------- */
function need() {
  const yearsC = new Map([[2018, 'var(--yr-1)'], [2021, 'var(--yr-2)'], [2022, 'var(--yr-3)'], [2024, 'var(--yr-4)']]);
  const ks = ['can', ...Object.keys(PR).map(p => 'pr-' + p)].filter(k => rows('core_need', 'all', k).length);
  const rd = ks.map(k => ({ k, name: k === 'can' ? 'Canada (10 provinces)' : placeName(k), rows: rows('core_need', 'all', k) }))
    .sort((a, b) => (a.k === 'can' ? -1 : b.k === 'can' ? 1 : (b.rows.at(-1)?.[1] ?? 0) - (a.rows.at(-1)?.[1] ?? 0)));
  const pv = rd.filter(d => d.k !== 'can'), hiV = pv[0]?.rows.at(-1)?.[1], tops = pv.filter(d => d.rows.at(-1)?.[1] === hiV).map(d => d.name), cn = F.core_need;
  $('need-title').textContent = cn ? `About one renter household in five is in core housing need: ${cn.to_pct.toFixed(0)}% in ${cn.to}, highest in ${tops.join(' and ')} (${hiV?.toFixed(0)}%)` : 'Core housing need';
  const el = $('c-need');
  const p = frame(el, 'Renters in core housing need by province', 'Survey estimate and 95% confidence interval for each survey year; sorted by latest estimate.', 'Source: Statistics Canada 46-10-0085');
  C.intervals(p, rd, yearsC, 'core_need', { label: 'Core need by province' });
  const ed = $('c-dims');
  const ly = d3.max(rows('core_need_dims', 'afford', 'can'), r => r[0]);
  const dims = cats('core_need_dims').map(c => ({ name: catLabel('core_need_dims', c), v: at('core_need_dims', c, 'can', ly) })).filter(d => d.v != null).sort((a, b) => b.v - a.v);
  const pd = frame(ed, dims[0] ? `${dims[0].v.toFixed(0)}% are in need on affordability alone` : 'Why renters are in need', `Renter households in core housing need by the standards they fall below, Canada (provinces), ${ly}.`, 'Source: Statistics Canada 46-10-0086');
  C.hbars(pd, dims, 'core_need', { color: 'var(--r-nor)' });
  const ez = $('c-size');
  const sz = cats('core_need_size').map(c => ({ name: catLabel('core_need_size', c), rows: rows('core_need_size', c, 'can') })).filter(d => d.rows.length);
  const pz = frame(ez, 'Need is higher in large urban centres', 'Renters in core housing need by population-centre size, Canada (provinces).', 'Source: Statistics Canada 46-10-0085');
  C.intervals(pz, sz, yearsC, 'core_need', { label: 'Core need by community size' });
}

/* ---------- building ---------- */
function building() {
  const ks = ['can', ...Object.keys(PR).map(p => 'pr-' + p)].filter(k => rows('starts', 'total', k).length);
  const can = rows('starts_per_1000', '', 'can'), peak = can.reduce((a, r) => r[1] > a[1] ? r : a, [0, 0]), last = can.at(-1);
  $('b-title').textContent = last ? `Canada started ${last[1].toFixed(1)} homes per 1,000 residents in ${last[0]}, against a peak of ${peak[1].toFixed(1)} in ${peak[0]}` : 'Housing starts';
  const eh = $('c-startsheat');
  const ph = frame(eh, 'Housing starts per 1,000 residents', 'Rows: Canada and provinces; territories are not published. Hover for the number of starts.', 'Source: Statistics Canada 34-10-0126, 17-10-0005');
  C.heatPanel(ph, series('starts_per_1000', '', ks).map(d => ({ ...d, extra: y => { const n = at('starts', 'total', d.k, y); return n == null ? '' : `${fmt('starts', n)} starts`; } })), d3.range(1971, 2026), 'starts_per_1000', '', { cellH: 18, label: 'Starts per 1,000 heat map' });
  if (!ks.includes(s.bp)) s.bp = 'can';
  $('b-place').innerHTML = ks.map(k => `<option value="${k}" ${k === s.bp ? 'selected' : ''}>${esc(placeName(k))}</option>`).join('');
  $('b-place').onchange = e => { s.bp = e.target.value; building(); writeUrl(); };
  const layers = [['single', 'var(--r-pra)'], ['semi', 'var(--r-atl)'], ['row', 'var(--r-bc)'], ['apartment', 'var(--r-qc)']]
    .map(([c, color]) => ({ name: catLabel('starts', c), color, rows: rows('starts', c, s.bp) }));
  const ap = rows('apartment_share', '', s.bp), a1 = ap.at(-1), a0 = ap.find(r => r[0] === 1995);
  const es = $('c-stack');
  const p = frame(es, a1 && a0 ? `Apartments were ${a1[1].toFixed(0)}% of ${placeName(s.bp)} starts in ${a1[0]}, against ${a0[1].toFixed(0)}% in 1995` : 'Starts by dwelling type', `Housing starts by dwelling type, ${placeName(s.bp)}, 1955–${a1?.[0] ?? ''}.`, 'Source: Statistics Canada 34-10-0126');
  C.stacked(p, layers, 'starts', { label: 'Starts by type' });
}

/* ---------- sources ---------- */
function sources() {
  $('defs').innerHTML = D.A.measures.map(m => `<div><h4>${esc(m.title)}</h4><p><strong>Universe.</strong> ${esc(m.universe)}</p><p>${esc(m.notes)}</p><p><em>${esc(m.source)}</em> · ${m.years[0]}${m.years.length > 1 ? '–' + m.years.at(-1) : ''}</p></div>`).join('');
  $('src-table').innerHTML = `<thead><tr><th>Table</th><th>Retrieved</th><th>SHA-256</th></tr></thead><tbody>${D.A.sources.map(t =>
    `<tr><td><a href="${esc(t.url)}">${esc(t.title)}</a><small>${esc(t.id)} · <a href="${esc(t.download)}">CSV</a></small></td><td>${esc((t.retrieved || '').slice(0, 10))}</td><td><code>${esc((t.sha256 || '').slice(0, 12))}…</code></td></tr>`).join('')}</tbody>`;
}

/* ---------- boot ---------- */
async function main() {
  theme();
  try {
    const [A, L, provinces] = await Promise.all(['data/atlas.json', 'data/local.json', 'provinces.json'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); })));
    load(A, L, provinces);
  } catch (e) { $('status').textContent = `The data could not be loaded (${e.message}). Reload to retry.`; return; }
  F = D.A.facts;
  readUrl();
  $('status').hidden = true;
  document.querySelectorAll('main > section').forEach(x => x.hidden = false);
  lead();
  map = new AtlasMap($('map'), pick);
  mapControls(); search();
  await drawMap();
  const sections = [compare, rentsSection, incomes, stretched, need, building, sources];
  for (const f of sections) { try { f(); } catch (e) { console.error(f.name, e); } }
  let t;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { for (const f of sections) try { f(); } catch (e) { console.error(e); } legend($('legend'), s.m, map.S); }, 200); });
  window.RENDERED = true;
}
main();
