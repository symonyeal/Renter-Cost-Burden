/* Interactive choropleth on Statistics Canada Lambert (EPSG:3347) coordinates, already projected, so no
   reprojection: x east, y north in km; y is negated for SVG.
   Legend: G geometry cache by layer file; f feature {id, of, n, pr, r, c}; q quantum (m); s state;
   T thresholds; C colours; lv map level; k place id; y year; z zoom transform. */
import { D, meas, rows, at, row, placesWith, cats, defCat, catLabel, placeName, fmt, esc, tip, untip, spark, SEQ, DIV, statusText, PR, LEVEL_NAME } from './util.js';

const G = new Map();
let POINTS = null;
async function geo(name) {
  if (!G.has(name)) G.set(name, fetch(`data/geo/${name}.json`).then(r => { if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`); return r.json(); }).then(decode));
  return G.get(name);
}
async function points() { return POINTS ??= await fetch('data/geo/points.json').then(r => r.json()); }

function decode(g) {
  const q = g.q / 1000;
  for (const f of g.features) {
    let d = '';
    for (const r of f.r) {
      let x = 0, y = 0;
      for (let i = 0; i < r.length; i += 2) {
        x += r[i]; y += r[i + 1];
        d += (i ? 'L' : 'M') + (x * q).toFixed(1) + ',' + (-y * q).toFixed(1);
      }
      d += 'Z';
    }
    f.d = d;
    f.cx = f.c[0] * q; f.cy = -f.c[1] * q;
    f.key = f.of || f.id;
    delete f.r;
  }
  g.bbox = bboxOf(g.features);
  return g;
}
function bboxOf(fs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of fs) for (const m of f.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) {
    const x = +m[1], y = +m[2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/* Which map levels can show a measure, from the places that have data. */
export function levelsFor(m, c) {
  const ks = placesWith(m, c);
  const lv = [];
  if (ks.some(k => k.startsWith('pr-'))) lv.push('province');
  if (ks.some(k => k.startsWith('m-') || k.startsWith('mp-'))) lv.push('metro');
  if (ks.some(k => k.startsWith('cd-'))) lv.push('division');
  if (ks.filter(k => k.startsWith('csd-')).length > 500) lv.push('community');
  return lv;
}
export const LEVEL_LABEL = { province: 'Provinces', metro: 'Metro areas', division: 'Divisions', community: 'Communities' };

/* Colour scale for a measure at a level, fixed across years so the time-lapse compares like with like. */
const CHANGE_T = [-3, -1, 1, 3, 6, 10];
const CHANGE_C = [DIV[0], DIV[1], DIV[2], 'var(--seq-1)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-6)'];
export function scaleFor(m, c, keys, year = null) {
  const me = meas(m);
  if (me.format === 'change') return { T: CHANGE_T, C: CHANGE_C, diverging: true };
  const vs = [];
  for (const k of keys) for (const r of rows(m, c, k)) if (r[1] != null && (year == null || r[0] === year)) vs.push(r[1]);
  vs.sort(d3.ascending);
  const T = [];
  for (let i = 1; i < 7; i++) {
    const v = d3.quantileSorted(vs, i / 7);
    const step = v >= 1000 ? 50 : v >= 100 ? 5 : v >= 10 ? 1 : 0.1;
    const t = Math.round(v / step) * step;
    if (!T.length || t > T[T.length - 1]) T.push(+t.toFixed(1));
  }
  return { T, C: SEQ.slice(7 - T.length - 1), diverging: false };
}
export const colorOf = (S, v) => v == null ? 'var(--none)' : S.C[d3.bisectRight(S.T, v)];

export function legend(el, m, S) {
  const n = S.C.length, w = Math.min(560, el.getBoundingClientRect().width || 560), bw = (w - 84) / n;
  const lab = t => fmt(m, t, true);
  el.innerHTML = `<svg width="${w}" height="34" role="img" aria-label="Colour key">${S.C.map((c, i) =>
    `<rect x="${i * bw}" y="2" width="${bw - 2}" height="12" fill="${c}"/>`).join('')}
    ${S.T.map((t, i) => `<text x="${(i + 1) * bw - 1}" y="28" text-anchor="middle" fill="var(--ink-2)" font-size="11">${esc(lab(t))}</text>`).join('')}
    <rect x="${n * bw + 14}" y="2" width="14" height="12" fill="var(--none)"/><text x="${n * bw + 32}" y="12" fill="var(--ink-2)" font-size="11">No data</text></svg>`;
}

export class AtlasMap {
  constructor(el, onPick) {
    this.el = el; this.onPick = onPick; this.sel = new Set();
    this.svg = d3.select(el).append('svg').attr('role', 'img');
    this.g = this.svg.append('g');
    this.base = this.g.append('g'); this.fill = this.g.append('g'); this.lines = this.g.append('g'); this.dots = this.g.append('g');
    this.note = d3.select(el).append('p').attr('class', 'note').attr('hidden', true);
    const zb = d3.select(el).append('div').attr('class', 'zoom');
    zb.append('button').attr('type', 'button').attr('aria-label', 'Zoom in').text('+').on('click', () => this.svg.transition().duration(250).call(this.zoom.scaleBy, 1.8));
    zb.append('button').attr('type', 'button').attr('aria-label', 'Zoom out').text('−').on('click', () => this.svg.transition().duration(250).call(this.zoom.scaleBy, 1 / 1.8));
    zb.append('button').attr('type', 'button').attr('aria-label', 'Reset view').text('⟲').on('click', () => this.reset());
    this.zoom = d3.zoom().scaleExtent([1, 60]).on('zoom', e => {
      this.g.attr('transform', e.transform); this.k = e.transform.k;
      this.dots.selectAll('circle').attr('r', d => d.rr / Math.sqrt(this.k)).attr('stroke-width', 1 / this.k);
    });
    this.svg.call(this.zoom).on('dblclick.zoom', null);
    this.k = 1;
  }

  async draw(s) {
    const { m, c, y, lv, pr } = s;
    const me = meas(m);
    const file = lv === 'province' ? 'pr' : lv === 'division' ? 'cd' : lv === 'community' ? `csd-${pr}` : 'cma';
    const [g, prov] = await Promise.all([geo(file), geo('pr')]);
    const keyOk = k => lv === 'province' ? k.startsWith('pr-') : lv === 'metro' ? (k.startsWith('m-') || k.startsWith('mp-') || k.startsWith('csd-')) : lv === 'division' ? k.startsWith('cd-') : k.startsWith('csd-');
    let keys = placesWith(m, c).filter(keyOk);
    // Communities: the chosen province only, and the scale and ranking use communities with 250+
    // renter households, where rounding cannot move a rate by more than a couple of points.
    if (lv === 'community') keys = keys.filter(k => D.P.get(k)?.pr === pr);
    const reliable = lv === 'community' ? keys.filter(k => (at('renter_households', '', k, 2021) ?? 0) >= 250) : keys;
    // Default: classes from this year's values, so each year shows its own spread. "Same scale every
    // year" fixes the classes over all years, so the time-lapse shows levels rising.
    const S = scaleFor(m, c, reliable.length ? reliable : keys, s.fixed ? null : y);
    this.S = S;
    const box = lv === 'community' ? g.bbox : prov.bbox;
    const [x0, y0, x1, y1] = box, pad = (x1 - x0) * 0.02;
    const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
    if (this.vbKey !== file) { this.svg.attr('viewBox', vb.join(' ')); this.vbKey = file; this.svg.call(this.zoom.transform, d3.zoomIdentity); }
    this.svg.attr('aria-label', `${me.title}, ${LEVEL_LABEL[lv]}, ${y}`);
    const val = k => at(m, c, k, y);
    const self = this;
    const hover = function (e, f) {
      const k = f.key, r = row(m, c, k, y), rs = rows(m, c, k);
      const extra = lv === 'community' ? renters(k) : '';
      tip(e, `<b>${esc(placeName(k, true))}</b><small>${esc(LEVEL_NAME[D.P.get(k)?.level] || '')}</small>
        <span class="v">${r && r[1] != null ? esc(fmt(m, r[1])) : 'No data'}</span> <small>${esc(me.short)}${me.cats ? ' · ' + esc(catLabel(m, c)) : ''}, ${y}${r?.[4] ? ' · ' + esc(statusText(r[4])) : ''}</small>
        ${extra}${spark(rs, 200, 40, 'var(--accent)', y)}`);
    };
    // Base: provinces in neutral, so metro and community layers sit on a map of Canada.
    const baseFs = lv === 'province' ? [] : lv === 'community' ? prov.features.filter(f => f.pr === pr) : prov.features;
    this.base.selectAll('path').data(baseFs, f => f.id).join('path').attr('class', 'feat base').attr('d', f => f.d);
    const fs = g.features;
    this.fill.selectAll('path').data(fs, f => f.id).join('path')
      .attr('class', f => 'feat' + (this.sel.has(f.key) ? ' sel' : ''))
      .attr('d', f => f.d).attr('fill', f => colorOf(S, val(f.key)))
      .on('pointermove', hover).on('pointerleave', untip)
      .on('click', (e, f) => self.onPick(f.key));
    this.lines.selectAll('path').data(lv === 'province' || lv === 'community' ? [] : prov.features, f => f.id).join('path').attr('class', 'prov-line').attr('d', f => f.d);
    // Metro level: a dot per area so small areas stay visible at national scale; CMHC centres coded as
    // communities have no metro polygon and appear as dots only.
    let dots = [];
    if (lv === 'metro') {
      const P = await points();
      // Radius in screen pixels: km per pixel from the viewBox and the rendered width.
      const kpp = vb[2] / (this.el.getBoundingClientRect().width || 800);
      dots = keys.filter(k => P[k] && val(k) != null).map(k => ({ key: k, cx: P[k][0], cy: -P[k][1], rr: (k.startsWith('csd-') ? 4 : 5.5) * kpp }));
      dots.sort((a, b) => d3.descending(a.rr, b.rr));
    }
    this.dots.selectAll('circle').data(dots, d => d.key).join('circle')
      .attr('class', d => 'dot' + (this.sel.has(d.key) ? ' sel' : ''))
      .attr('cx', d => d.cx).attr('cy', d => d.cy).attr('r', d => d.rr / Math.sqrt(this.k)).attr('stroke-width', 1 / this.k)
      .attr('fill', d => colorOf(S, val(d.key)))
      .on('pointermove', hover).on('pointerleave', untip).on('click', (e, d) => self.onPick(d.key));
    const n = keys.filter(k => val(k) != null).length;
    this.note.attr('hidden', n ? true : null).text(n ? '' : `No ${me.short.toLowerCase()} published for ${LEVEL_LABEL[lv].toLowerCase()} in ${y}.`);
    return { S, keys: reliable };
  }

  select(set) {
    this.sel = new Set(set);
    this.fill.selectAll('path').classed('sel', f => this.sel.has(f.key));
    this.dots.selectAll('circle').classed('sel', d => this.sel.has(d.key));
  }
  reset() { this.svg.transition().duration(300).call(this.zoom.transform, d3.zoomIdentity); }
}

function renters(k) {
  const v = at('renter_households', '', k, 2021);
  return v == null ? '' : `<small>${fmt('renter_households', v)} renter households${v < 250 ? ' · few renters: rounding moves the rate by several points' : ''}</small>`;
}
