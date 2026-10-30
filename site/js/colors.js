/* Shared threshold scales and legends for maps and heat charts. */
import { meas, rows, fmt, esc, SEQ, DIV } from './util.js';

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
