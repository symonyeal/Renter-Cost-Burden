/* Shared data access, formatting, colour and tooltip helpers.
   Legend: A atlas.json; L local.json (divisions, communities); P place map id -> {id,name,level,pr,reg};
   m measure id; c category; k place id; r row [year, value, lower, upper, status, source, vintage, lineage]; y year; v value. */
export let PR;
export let REGION_ORDER;
export const LEVEL_NAME = {
  country: 'Country', province: 'Province', territory: 'Territory', metro: 'Metro area', agglomeration: 'Agglomeration',
  metro_part: 'Metro area part', centre: 'Rental centre', aggregate: 'Group', division: 'Census division', community: 'Community'
};
export const STATUS = {
  A: 'Excellent quality', B: 'Very good quality', C: 'Good quality', D: 'Acceptable quality', E: 'Use with caution',
  F: 'Too unreliable to publish', x: 'Suppressed (confidentiality)', '..': 'Not available', '...': 'Not applicable',
  'not available': 'Not published'
};

export const D = { A: null, L: null, P: new Map(), manifest: null };

/** Resolve every data request against the manifest selected at page startup. */
export function dataUrl(name) {
  if (!D.manifest || !Object.hasOwn(D.manifest.sha256, name)) throw new Error(`Unlisted data file: ${name}`);
  return `data/generations/${D.manifest.generation}/${name}`;
}
export async function dataJson(name) {
  const url = dataUrl(name), response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
  if (hash !== D.manifest.sha256[name]) throw new Error(`${name}: data hash mismatch`);
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function openData() {
  const response = await fetch('data/manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.schema !== 3) throw new Error(`Unsupported data schema: ${manifest.schema}`);
  if (!/^[a-f0-9]{64}$/.test(manifest.generation) || !manifest.sha256 ||
      !Object.entries(manifest.sha256).every(([name, hash]) => /^(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+$/.test(name) && !name.split('/').includes('..') && /^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Invalid data manifest');
  }
  D.manifest = manifest;
  const [A, L, provinces] = await Promise.all(['atlas.json', 'local.json', 'provinces.json'].map(dataJson));
  load(A, L, provinces);
}

export function load(A, L, provinces) {
  if (A.schema !== 3 || L?.schema !== 3) throw new Error(`Unsupported atlas schema: ${A.schema}/${L?.schema}`);
  for (const part of [A, L]) {
    if (!Array.isArray(part.places) || !part.series || typeof part.series !== 'object') throw new Error('Invalid atlas structure');
    for (const cats of Object.values(part.series)) for (const places of Object.values(cats)) for (const rs of Object.values(places)) {
      let previous = -Infinity;
      if (!Array.isArray(rs)) throw new Error('Invalid observation series');
      for (const r of rs) {
        if (!Array.isArray(r) || r.length !== 8 || !Number.isInteger(r[0]) || r[0] <= previous ||
            !r.slice(1, 4).every(x => x === null || (typeof x === 'number' && Number.isFinite(x))) ||
            !r.slice(4, 7).every(x => typeof x === 'string') || !r[5] ||
            (r[2] === null) !== (r[3] === null) ||
            (r[2] !== null && (r[1] === null || r[2] > r[1] || r[3] < r[1]))) throw new Error('Invalid observation row');
        if (r[7] !== null && (!r[7] || typeof r[7].transform !== 'string' || typeof r[7].comparability !== 'string' ||
            !Array.isArray(r[7].inputs) || !r[7].inputs.length || !r[7].inputs.every(i =>
              ['measure', 'cat', 'place', 'source', 'vintage', 'status'].every(k => typeof i[k] === 'string') && Number.isInteger(i.year)))) throw new Error('Invalid calculation lineage');
        previous = r[0];
      }
    }
  }
  if (!Array.isArray(A.measures) || !Array.isArray(A.regions) || !Array.isArray(provinces) ||
      !provinces.every(p => Array.isArray(p) && p.length === 4 && p.every(x => typeof x === 'string'))) throw new Error('Invalid atlas metadata');
  D.A = A; D.L = L;
  D.P.clear();
  PR = Object.fromEntries(provinces.map(([id, name, short]) => [id, [name, short]]));
  REGION_ORDER = A.regions.map(r => r.id);
  for (const [id, name, level, pr, reg] of [...A.places, ...(L ? L.places : [])]) D.P.set(id, { id, name, level, pr, reg });
}
export const meas = m => D.A.measures.find(x => x.id === m);
export function rows(m, c, k) {
  const src = (k.startsWith('csd-') || k.startsWith('cd-')) ? D.L?.series : D.A.series;
  return src?.[m]?.[c ?? '']?.[k] || [];
}
export function at(m, c, k, y) { return row(m, c, k, y)?.[1] ?? null; }
export function row(m, c, k, y) { return rows(m, c, k).find(r => r[0] === y) || null; }
export function latest(m, c, k) {
  const rs = rows(m, c, k).filter(r => r[1] != null);
  return rs.length ? rs[rs.length - 1] : null;
}
/** Chart-ready series keep place labels and colour policy out of section renderers. */
export function series(m, c, keys, color = regionVar) {
  return keys.map((k, i) => ({ k, name: placeName(k), color: color(k, i), rows: rows(m, c, k) }));
}
/** Index published values to a chosen base year; never fill a missing observation. */
export function rebase(rs, year) {
  const b = rs.find(r => r[0] === year)?.[1];
  return b ? rs.filter(r => r[0] >= year && r[1] != null).map(r => [r[0], 100 * r[1] / b, null, null, r[4], r[5], r[6], r[7]]) : [];
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
  if (f === 'count') return short && v >= 1e6 ? nf1.format(v / 1e6) + 'M' : short && v >= 1e4 ? nf0.format(v / 1e3) + 'k' : nf0.format(v);
  return nf1.format(v);
}
export const pct = (v, d = 1) => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
export function statusText(s) { return s ? (STATUS[s] || s) : ''; }

/** Point-level source qualifications and the inputs of a derived value. */
export function provenance(r) {
  if (!r) return '';
  let html = r[4] ? `<small>${esc(statusText(r[4]))}</small>` : '';
  if (r[5]) html += `<small>Source: ${esc(r[5])}</small>`;
  if (r[6]) html += `<small>Geography vintage: ${esc(r[6])}</small>`;
  const lineage = r[7];
  if (lineage) {
    html += `<small>${esc(lineage.comparability)}</small>`;
    html += lineage.inputs.map(x => `<small>${esc(x.measure)}${x.cat ? ' / ' + esc(x.cat) : ''}, ${esc(x.place)}, ${x.year}: ${esc(x.source)}${x.vintage ? ' · geography ' + esc(x.vintage) : ''}${x.status ? ' · ' + esc(statusText(x.status)) : ''}</small>`).join('');
  }
  return html;
}

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
