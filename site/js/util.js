/* Shared data access, formatting, colour and tooltip helpers.
   Legend: A atlas.json; L local.json (divisions, communities); P place map id -> {id,name,level,pr,reg};
   m measure id; c category; k place id; r row [year, value, lower, upper, status]; y year; v value. */
export const PR = {
  '10': ['Newfoundland and Labrador', 'N.L.'], '11': ['Prince Edward Island', 'P.E.I.'], '12': ['Nova Scotia', 'N.S.'],
  '13': ['New Brunswick', 'N.B.'], '24': ['Quebec', 'Que.'], '35': ['Ontario', 'Ont.'], '46': ['Manitoba', 'Man.'],
  '47': ['Saskatchewan', 'Sask.'], '48': ['Alberta', 'Alta.'], '59': ['British Columbia', 'B.C.'], '60': ['Yukon', 'Y.T.'],
  '61': ['Northwest Territories', 'N.W.T.'], '62': ['Nunavut', 'Nvt.']
};
export const REGION_ORDER = ['bc', 'pra', 'nor', 'on', 'qc', 'atl'];
export const LEVEL_NAME = {
  country: 'Country', province: 'Province', territory: 'Territory', metro: 'Metro area', agglomeration: 'Agglomeration',
  metro_part: 'Metro area part', centre: 'Rental centre', aggregate: 'Group', division: 'Census division', community: 'Community'
};
export const STATUS = {
  A: 'Excellent quality', B: 'Very good quality', C: 'Good quality', D: 'Acceptable quality', E: 'Use with caution',
  F: 'Too unreliable to publish', x: 'Suppressed (confidentiality)', '..': 'Not available', '...': 'Not applicable',
  'not available': 'Not published'
};

export const D = { A: null, L: null, P: new Map() };

export function load(A, L) {
  D.A = A; D.L = L;
  for (const [id, name, level, pr, reg] of [...A.places, ...(L ? L.places : [])]) D.P.set(id, { id, name, level, pr, reg });
}
export const meas = m => D.A.measures.find(x => x.id === m);
export function rows(m, c, k) {
  const src = (k.startsWith('csd-') || k.startsWith('cd-')) ? D.L?.series : D.A.series;
  return src?.[m]?.[c ?? '']?.[k] || [];
}
export function at(m, c, k, y) { const r = rows(m, c, k).find(r => r[0] === y); return r ? r[1] : null; }
export function row(m, c, k, y) { return rows(m, c, k).find(r => r[0] === y) || null; }
export function latest(m, c, k) {
  const rs = rows(m, c, k).filter(r => r[1] != null);
  return rs.length ? rs[rs.length - 1] : null;
}
/** Every place with a value for (m, c), from the atlas and (for local levels) local.json. */
export function placesWith(m, c) {
  const out = [];
  for (const src of [D.A.series, D.L?.series]) for (const k of Object.keys(src?.[m]?.[c ?? ''] || {})) out.push(k);
  return out;
}
export function cats(m) {
  const me = meas(m);
  const have = Object.keys(D.A.series[m] || D.L?.series?.[m] || {});
  const order = me?.cats ? Object.keys(me.cats) : have;
  return order.filter(c => have.includes(c) || D.L?.series?.[m]?.[c]);
}
export function defCat(m) { const me = meas(m), cs = cats(m); return cs.includes(me?.default_cat) ? me.default_cat : cs[0] ?? ''; }
export function catLabel(m, c) { return meas(m)?.cats?.[c] ?? c; }

export function placeName(k, long = false) {
  const p = D.P.get(k);
  if (!p) return k;
  if (['country', 'province', 'territory', 'aggregate'].includes(p.level) || !PR[p.pr]) return p.name;
  return `${p.name}, ${PR[p.pr][long ? 0 : 1]}`;
}
export const regionVar = k => { const p = D.P.get(k); return p?.reg ? `var(--r-${p.reg})` : 'var(--ink-2)'; };
export const slotVar = i => `var(--q${(i % 6) + 1})`;

const nf0 = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export function fmt(m, v, short = false) {
  if (v == null || !Number.isFinite(v)) return '–';
  const f = meas(m)?.format;
  if (f === 'dollars') return '$' + nf0.format(v);
  if (f === 'pct') return nf1.format(v) + '%';
  if (f === 'change') return (v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v)) + '%';
  if (f === 'index') return nf1.format(v);
  if (f === 'count') return short && v >= 1e6 ? nf1.format(v / 1e6) + 'M' : short && v >= 1e4 ? nf0.format(v / 1e3) + 'k' : nf0.format(v);
  if (f === 'num1') return nf1.format(v);
  return nf1.format(v);
}
export const pct = (v, d = 1) => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
export function statusText(s) { return s ? (STATUS[s] || s) : ''; }

/* Tooltip: follows the pointer, flips at viewport edges. Content is HTML built from escaped text. */
const tipEl = () => document.getElementById('tip');
export function tip(ev, html) {
  const t = tipEl(); t.innerHTML = html; t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight, pad = 14;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
  t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
}
export function untip() { tipEl().hidden = true; }

/* Inline sparkline of a full series; gaps stay gaps. */
export function spark(rs, w = 120, h = 28, color = 'var(--accent)', mark = null) {
  const pts = rs.filter(r => r[1] != null);
  if (pts.length < 2) return '';
  const x = d3.scaleLinear().domain(d3.extent(pts, r => r[0])).range([2, w - 2]);
  const y = d3.scaleLinear().domain(d3.extent(pts, r => r[1])).nice().range([h - 2, 2]);
  const line = d3.line().defined(r => r[1] != null).x(r => x(r[0])).y(r => y(r[1]));
  const m = mark != null ? pts.find(r => r[0] === mark) : null;
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${line(rs)}" fill="none" stroke="${color}" stroke-width="1.5"/>${m ? `<circle cx="${x(m[0])}" cy="${y(m[1])}" r="2.5" fill="${color}"/>` : ''}</svg>`;
}

/* Chart frame: title (the finding), measure line, svg, source caption. */
export function frame(el, title, sub, source) {
  el.innerHTML = `<h3>${esc(title)}</h3>${sub ? `<p class="ms">${esc(sub)}</p>` : ''}<div class="plot"></div>${source ? `<figcaption>${esc(source)}</figcaption>` : ''}`;
  return el.querySelector('.plot');
}
export function width(el, min = 300) { return Math.max(min, Math.floor(el.getBoundingClientRect().width || el.parentElement.getBoundingClientRect().width || 600)); }
export function empty(el, text) { el.innerHTML += `<p class="empty">${esc(text)}</p>`; }

/* Read CSS custom property lists for scales; marks still get var() strings so a theme toggle re-colours them. */
export const SEQ = [0, 1, 2, 3, 4, 5, 6].map(i => `var(--seq-${i})`);
export const DIV = ['var(--div-lo2)', 'var(--div-lo1)', 'var(--div-mid)', 'var(--div-hi1)', 'var(--div-hi2)'];
