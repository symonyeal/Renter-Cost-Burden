/* D3 chart forms. Every mark colour is a var() string so a theme toggle re-colours without redrawing.
   Legend: el container; W width; H height; M margins; x/y scales; s series {k, name, color, rows}; r row
   [year, value, lower, upper, status]; m measure (formatting); h hover handler; dash dashed for gaps. */
import { fmt, esc, tip, untip, width } from './util.js';
import { scaleFor, colorOf, legend } from './colors.js';

const M = { t: 12, r: 120, b: 28, l: 52 };
function svg(el, W, H, label) {
  return d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('role', 'img').attr('aria-label', label);
}
function yAxis(g, y, W, m, M_, ticks = 5) {
  g.append('g').attr('class', 'axis gridline').attr('transform', `translate(${M_.l},0)`)
    .call(d3.axisLeft(y).ticks(ticks).tickSize(-(W - M_.l - M_.r)).tickFormat(v => fmt(m, v, true)))
    .call(a => a.select('.domain').remove());
}
function xAxisYears(g, x, H, M_, W) {
  const n = Math.max(3, Math.floor((W - M_.l - M_.r) / 70));
  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - M_.b})`)
    .call(d3.axisBottom(x).ticks(n).tickFormat(d3.format('d')).tickSizeOuter(0));
}
/* Spread end labels so they do not overlap. */
function dodge(items, minGap, lo, hi) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
  const over = items.length ? items[items.length - 1].y - hi : 0;
  if (over > 0) for (const it of items) it.y -= over;
  for (let i = items.length - 2; i >= 0; i--) if (items[i + 1].y - items[i].y < minGap) items[i].y = items[i + 1].y - minGap;
  for (const it of items) it.y = Math.max(lo, it.y);
  return items;
}

/* Multi-series line chart with direct end labels and a year crosshair. Gaps in a series stay gaps. */
export function lines(el, series, m, { H = 320, zero = false, yLabel = '', dots = false, refY = null, refLabel = '' } = {}) {
  const W = width(el), M_ = { ...M, r: Math.min(150, W * 0.28) };
  const all = series.flatMap(s => s.rows.filter(r => r[1] != null));
  if (!all.length) return false;
  const x = d3.scaleLinear().domain(d3.extent(all, r => r[0])).range([M_.l, W - M_.r]);
  const ext = d3.extent(all, r => r[1]);
  const y = d3.scaleLinear().domain(zero ? [Math.min(0, ext[0]), ext[1]] : ext).nice().range([H - M_.b, M_.t]);
  const sv = svg(el, W, H, yLabel);
  yAxis(sv, y, W, m, M_); xAxisYears(sv, x, H, M_, W);
  if (refY != null && refY >= y.domain()[0] && refY <= y.domain()[1]) {
    sv.append('line').attr('x1', M_.l).attr('x2', W - M_.r).attr('y1', y(refY)).attr('y2', y(refY)).attr('stroke', 'var(--ink-2)').attr('stroke-dasharray', '4 3');
    if (refLabel) sv.append('text').attr('class', 'lbl muted').attr('x', M_.l + 4).attr('y', y(refY) - 4).text(refLabel);
  }
  const line = d3.line().defined(r => r[1] != null).x(r => x(r[0])).y(r => y(r[1]));
  const gs = sv.append('g');
  for (const s of series) {
    gs.append('path').attr('class', 'ln').attr('stroke', s.color).attr('d', line(s.rows)).attr('data-k', s.k);
    if (dots || s.rows.filter(r => r[1] != null).length < 3) gs.selectAll(null).data(s.rows.filter(r => r[1] != null)).join('circle')
      .attr('cx', r => x(r[0])).attr('cy', r => y(r[1])).attr('r', 3.5).attr('fill', s.color).attr('stroke', 'var(--surface)');
  }
  const ends = dodge(series.map(s => { const l = s.rows.filter(r => r[1] != null).at(-1); return l ? { s, x: x(l[0]), y: y(l[1]), v: l[1] } : null; }).filter(Boolean), 14, M_.t + 6, H - M_.b);
  sv.append('g').selectAll('text').data(ends).join('text').attr('class', 'lbl').attr('x', W - M_.r + 8).attr('y', d => d.y + 4)
    .text(d => `${d.s.name} ${fmt(m, d.v, true)}`).each(function (d) { trim(this, M_.r - 10); });
  // Crosshair
  const yrs = [...new Set(all.map(r => r[0]))].sort(d3.ascending);
  const cross = sv.append('line').attr('y1', M_.t).attr('y2', H - M_.b).attr('stroke', 'var(--ink-2)').attr('opacity', 0);
  sv.append('rect').attr('x', M_.l).attr('y', M_.t).attr('width', W - M_.l - M_.r).attr('height', H - M_.t - M_.b).attr('fill', 'transparent')
    .on('pointermove', e => {
      const [px] = d3.pointer(e), yr = yrs[d3.minIndex(yrs, v => Math.abs(x(v) - px))];
      cross.attr('x1', x(yr)).attr('x2', x(yr)).attr('opacity', 0.6);
      const lines_ = series.map(s => [s, s.rows.find(r => r[0] === yr)]).filter(([, r]) => r && r[1] != null).sort((a, b) => b[1][1] - a[1][1]);
      tip(e, `<b>${yr}</b>` + lines_.map(([s, r]) => `<div><span style="color:${s.color}">■</span> ${esc(s.name)} <strong>${esc(fmt(m, r[1]))}</strong>${r[2] != null && r[3] != null ? ` <small>${esc(fmt(m, r[2]))}–${esc(fmt(m, r[3]))}</small>` : ''}</div>`).join(''));
    })
    .on('pointerleave', () => { cross.attr('opacity', 0); untip(); });
  return true;
}
function trim(t, maxW) {
  let s = t.textContent;
  while (t.getComputedTextLength && t.getComputedTextLength() > maxW && s.length > 4) { s = s.slice(0, -2); t.textContent = s + '…'; }
}

/* Heat map: rows × years. colorOf(v) gives a var() string. */
export function heat(el, rowsData, years, colorOf, m, { onRow, cellH = 14, label = '' } = {}) {
  const W0 = width(el), Ml = Math.min(180, W0 * 0.32), Mr = 8, Mt = 22;
  const cw = Math.max(5, (W0 - Ml - Mr) / years.length), W = Ml + Mr + cw * years.length, H = Mt + rowsData.length * cellH + 4;
  const sv = svg(el, W, H, label);
  const x = y => Ml + (y - years[0]) * cw;
  const step = cw < 10 ? 10 : 5;
  sv.append('g').selectAll('text').data(years.filter(y => y % step === 0)).join('text').attr('class', 'lbl muted').attr('x', y => x(y) + cw / 2).attr('y', 14).attr('text-anchor', 'middle').text(y => y);
  const g = sv.append('g').attr('transform', `translate(0,${Mt})`);
  const rg = g.selectAll('g').data(rowsData).join('g').attr('transform', (d, i) => `translate(0,${i * cellH})`);
  rg.append('rect').attr('x', 0).attr('width', 4).attr('height', cellH - 2).attr('fill', d => d.color || 'transparent');
  rg.append('text').attr('class', 'lbl').attr('x', 10).attr('y', cellH - 4).attr('font-size', Math.min(12, cellH - 2)).text(d => d.name).each(function () { trim(this, Ml - 14); })
    .style('cursor', onRow ? 'pointer' : null).on('click', (e, d) => onRow?.(d.k));
  rg.each(function (d) {
    const byY = new Map(d.rows.map(r => [r[0], r]));
    d3.select(this).selectAll('rect.cell').data(years).join('rect').attr('class', 'cell')
      .attr('x', y => x(y)).attr('width', Math.max(1, cw - 1)).attr('height', cellH - 2)
      .attr('fill', y => { const r = byY.get(y); return r && r[1] != null ? colorOf(r[1]) : 'transparent'; })
      .on('pointermove', (e, y) => { const r = byY.get(y); tip(e, `<b>${esc(d.name)}</b><small>${y}</small><span class="v">${r && r[1] != null ? esc(fmt(m, r[1])) : 'Not published'}</span>${d.extra ? `<small>${esc(d.extra(y))}</small>` : ''}`); })
      .on('pointerleave', untip).on('click', () => onRow?.(d.k));
  });
  return sv;
}

/* A heat chart owns its scrolling surface, classification and matching legend. */
export function heatPanel(el, data, years, m, c, options = {}) {
  const S = scaleFor(m, c, data.map(d => d.k));
  const wrap = document.createElement('div'); wrap.className = 'scroll-x'; el.append(wrap);
  heat(wrap, data, years, v => colorOf(S, v), m, options);
  const key = document.createElement('div'); key.className = 'legend'; el.append(key);
  legend(key, m, S);
}

/* Bump chart of ranks. Highlighted series coloured; others recessive. */
export function bump(el, series, years, { highlight = new Map(), label = '', topN = 12 } = {}) {
  const W = width(el), M_ = { t: 14, r: 160, b: 28, l: 34 };
  const n = d3.max(series, s => d3.max(s.ranks, r => r[1])) || 1;
  const H = M_.t + M_.b + n * 13;
  const x = d3.scaleLinear().domain(d3.extent(years)).range([M_.l, W - M_.r]);
  const y = d3.scaleLinear().domain([1, n]).range([M_.t, H - M_.b]);
  const sv = svg(el, W, H, label);
  xAxisYears(sv, x, H, M_, W);
  sv.append('g').attr('class', 'axis').attr('transform', `translate(${M_.l},0)`).call(d3.axisLeft(y).tickValues([1, 5, 10, 15, 20, 25, 30, 35, 40].filter(v => v <= n)).tickSizeOuter(0)).call(a => a.select('.domain').remove());
  const line = d3.line().defined(r => r[1] != null).x(r => x(r[0])).y(r => y(r[1])).curve(d3.curveMonotoneX);
  const ord = [...series].sort((a, b) => (highlight.has(a.k) ? 1 : 0) - (highlight.has(b.k) ? 1 : 0));
  const g = sv.append('g');
  for (const s of ord) {
    const hl = highlight.get(s.k);
    g.append('path').attr('class', 'ln').attr('d', line(s.ranks)).attr('stroke', hl || s.color).attr('stroke-width', hl ? 3 : 1.5).attr('opacity', hl ? 1 : 0.55)
      .on('pointermove', e => tip(e, `<b>${esc(s.name)}</b><small>${s.ranks.filter(r => r[1]).map(r => `${r[0]}: #${r[1]}`).slice(-6).join(' · ')}</small>`)).on('pointerleave', untip);
  }
  const last = years[years.length - 1];
  const ends = series.map(s => ({ s, r: s.ranks.find(r => r[0] === last)?.[1] })).filter(d => d.r && (d.r <= topN || highlight.has(d.s.k)));
  sv.append('g').selectAll('text').data(ends).join('text').attr('class', d => 'lbl' + (highlight.has(d.s.k) ? ' big' : '')).attr('x', W - M_.r + 6).attr('y', d => y(d.r) + 4)
    .text(d => `${d.r}. ${d.s.name}`).each(function () { trim(this, M_.r - 8); });
  return sv;
}

/* Scatter with optional labels for highlighted points. */
export function scatter(el, pts, { xm, ym, xLabel, yLabel, H = 380, label = '', onPick } = {}) {
  const W = width(el), M_ = { t: 12, r: 24, b: 44, l: 56 };
  const x = d3.scaleLinear().domain(d3.extent(pts, p => p.x)).nice().range([M_.l, W - M_.r]);
  const y = d3.scaleLinear().domain(d3.extent(pts, p => p.y)).nice().range([H - M_.b, M_.t]);
  const sv = svg(el, W, H, label);
  yAxis(sv, y, W, ym, M_);
  sv.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - M_.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(v => fmt(xm, v, true)).tickSizeOuter(0));
  sv.append('text').attr('class', 'lbl muted').attr('x', W - M_.r).attr('y', H - 8).attr('text-anchor', 'end').text(xLabel);
  sv.append('text').attr('class', 'lbl muted').attr('x', M_.l).attr('y', M_.t + 2).attr('dy', -2).text(yLabel);
  if (y.domain()[0] < 0 && y.domain()[1] > 0) sv.append('line').attr('x1', M_.l).attr('x2', W - M_.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--ink-2)');
  sv.append('g').selectAll('circle').data(pts).join('circle').attr('cx', p => x(p.x)).attr('cy', p => y(p.y)).attr('r', p => p.hl ? 7 : 5.5)
    .attr('fill', p => p.color).attr('stroke', p => p.hl ? 'var(--ink)' : 'var(--surface)').attr('stroke-width', p => p.hl ? 2 : 1)
    .style('cursor', 'pointer')
    .on('pointermove', (e, p) => tip(e, `<b>${esc(p.name)}</b><small>${esc(xLabel)}: ${esc(fmt(xm, p.x))}</small><small>${esc(yLabel)}: ${esc(fmt(ym, p.y))}</small>`))
    .on('pointerleave', untip).on('click', (e, p) => onPick?.(p.k));
  sv.append('g').selectAll('text').data(pts.filter(p => p.hl || p.label)).join('text').attr('class', 'lbl').attr('x', p => x(p.x) + 9).attr('y', p => y(p.y) + 4).text(p => p.name);
  return sv;
}

/* Small multiples on one shared y scale. panels: [{name, series:[{name,color,rows}]}] */
export function multiples(el, panels, m, { cols = 4, H = 150, ref = 100, label = '' } = {}) {
  const W = width(el), c = W < 560 ? 2 : W < 860 ? 3 : cols, pw = W / c, ph = H, rowsN = Math.ceil(panels.length / c);
  const all = panels.flatMap(p => p.series.flatMap(s => s.rows.filter(r => r[1] != null)));
  const x = d3.scaleLinear().domain(d3.extent(all, r => r[0]));
  const yd = d3.extent(all, r => r[1]);
  const sv = svg(el, W, rowsN * (ph + 34), label);
  panels.forEach((p, i) => {
    const gx = (i % c) * pw, gy = Math.floor(i / c) * (ph + 34);
    const M_ = { t: 22, r: 10, b: 20, l: 40 };
    const xs = x.copy().range([gx + M_.l, gx + pw - M_.r]);
    const ys = d3.scaleLinear().domain(yd).nice().range([gy + ph - M_.b + 14, gy + M_.t]);
    const g = sv.append('g');
    g.append('text').attr('class', 'lbl big').attr('x', gx + M_.l).attr('y', gy + 14).text(p.name);
    g.append('g').attr('class', 'axis gridline').attr('transform', `translate(${gx + M_.l},0)`).call(d3.axisLeft(ys).ticks(3).tickSize(-(pw - M_.l - M_.r))).call(a => a.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${gy + ph - M_.b + 14})`).call(d3.axisBottom(xs).ticks(3).tickFormat(d3.format('d')).tickSizeOuter(0));
    if (ref != null) g.append('line').attr('x1', gx + M_.l).attr('x2', gx + pw - M_.r).attr('y1', ys(ref)).attr('y2', ys(ref)).attr('stroke', 'var(--ink-2)').attr('stroke-dasharray', '3 3');
    const line = d3.line().defined(r => r[1] != null).x(r => xs(r[0])).y(r => ys(r[1]));
    for (const s of p.series) g.append('path').attr('class', 'ln').attr('stroke', s.color).attr('d', line(s.rows));
    g.append('rect').attr('x', gx + M_.l).attr('y', gy + M_.t).attr('width', pw - M_.l - M_.r).attr('height', ph - M_.t - M_.b + 14).attr('fill', 'transparent')
      .on('pointermove', e => {
        const [px] = d3.pointer(e), yr = Math.round(xs.invert(px));
        tip(e, `<b>${esc(p.name)} · ${yr}</b>` + p.series.map(s => { const r = s.rows.find(r => r[0] === yr); return `<div><span style="color:${s.color}">■</span> ${esc(s.name)} <strong>${r && r[1] != null ? esc(fmt(m, r[1])) : '–'}</strong></div>`; }).join(''));
      }).on('pointerleave', untip);
  });
  return sv;
}

/* Horizontal bars, sorted or in given order; one colour. */
export function hbars(el, items, m, { color = 'var(--accent)', label = '', ref = null, refLabel = '' } = {}) {
  const W = width(el), bh = 24, M_ = { t: 6, r: 56, b: 6, l: Math.min(220, W * 0.42) };
  const H = M_.t + M_.b + items.length * bh;
  const x = d3.scaleLinear().domain([0, d3.max(items, d => d.v) || 1]).nice().range([M_.l, W - M_.r]);
  const sv = svg(el, W, H, label);
  const g = sv.selectAll('g').data(items).join('g').attr('transform', (d, i) => `translate(0,${M_.t + i * bh})`);
  g.append('text').attr('class', 'lbl').attr('x', M_.l - 8).attr('y', bh / 2 + 4).attr('text-anchor', 'end').text(d => d.name).each(function () { trim(this, M_.l - 12); });
  g.append('rect').attr('x', M_.l).attr('y', 4).attr('height', bh - 8).attr('width', d => d.v == null ? 0 : Math.max(1, x(d.v) - M_.l)).attr('fill', d => d.color || color).attr('rx', 1)
    .on('pointermove', (e, d) => tip(e, `<b>${esc(d.name)}</b><span class="v">${esc(fmt(m, d.v))}</span>${d.note ? `<small>${esc(d.note)}</small>` : ''}`)).on('pointerleave', untip);
  g.append('text').attr('class', 'lbl').attr('x', d => d.v == null ? M_.l + 4 : x(d.v) + 6).attr('y', bh / 2 + 4).text(d => d.v == null ? 'not published' : fmt(m, d.v));
  if (ref != null) {
    sv.append('line').attr('x1', x(ref)).attr('x2', x(ref)).attr('y1', 0).attr('y2', H).attr('stroke', 'var(--ink)').attr('stroke-dasharray', '3 3');
    if (refLabel) sv.append('text').attr('class', 'lbl muted').attr('x', x(ref) + 4).attr('y', H - 4).text(refLabel);
  }
  return sv;
}

/* Vertical bars for ordered categories (income bands). */
export function vbars(el, items, m, { color = 'var(--accent)', H = 260, label = '', ref = null, refLabel = '' } = {}) {
  const W = width(el), M_ = { t: 18, r: 8, b: 44, l: 44 };
  const x = d3.scaleBand().domain(items.map(d => d.name)).range([M_.l, W - M_.r]).padding(0.18);
  const y = d3.scaleLinear().domain([0, d3.max(items, d => d.v) || 1]).nice().range([H - M_.b, M_.t]);
  const sv = svg(el, W, H, label);
  yAxis(sv, y, W, m, M_, 4);
  sv.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - M_.b})`).call(d3.axisBottom(x).tickSizeOuter(0))
    .selectAll('text').attr('transform', W < 600 ? 'rotate(-35)' : null).attr('text-anchor', W < 600 ? 'end' : 'middle');
  sv.selectAll('rect.b').data(items).join('rect').attr('class', 'b').attr('x', d => x(d.name)).attr('width', x.bandwidth())
    .attr('y', d => y(d.v ?? 0)).attr('height', d => y(0) - y(d.v ?? 0)).attr('fill', color).attr('rx', 1)
    .on('pointermove', (e, d) => tip(e, `<b>${esc(d.name)}</b><span class="v">${esc(fmt(m, d.v))}</span>`)).on('pointerleave', untip);
  if (x.bandwidth() > 26) sv.selectAll('text.v').data(items).join('text').attr('class', 'lbl v').attr('x', d => x(d.name) + x.bandwidth() / 2).attr('y', d => y(d.v ?? 0) - 4).attr('text-anchor', 'middle').attr('font-size', 11).text(d => d.v == null ? '' : Math.round(d.v));
  if (ref != null) {
    sv.append('line').attr('x1', M_.l).attr('x2', W - M_.r).attr('y1', y(ref)).attr('y2', y(ref)).attr('stroke', 'var(--ink)').attr('stroke-dasharray', '4 3');
    sv.append('text').attr('class', 'lbl muted').attr('x', W - M_.r).attr('y', y(ref) - 5).attr('text-anchor', 'end').text(refLabel);
  }
  return sv;
}

/* Strip plot: one row per group, dots jittered deterministically, sized by weight. */
export function strip(el, groups, m, { label = '', onPick, xLabel = '' } = {}) {
  const W = width(el), rh = 46, M_ = { t: 8, r: 16, b: 34, l: Math.min(170, W * 0.3) };
  const H = M_.t + M_.b + groups.length * rh;
  const all = groups.flatMap(g => g.pts);
  const x = d3.scaleLinear().domain([0, Math.min(100, d3.max(all, p => p.v) || 100)]).nice().range([M_.l, W - M_.r]);
  const r = d3.scaleSqrt().domain([0, d3.max(all, p => p.w) || 1]).range([1.6, 11]);
  const sv = svg(el, W, H, label);
  sv.append('g').attr('class', 'axis gridline').attr('transform', `translate(0,${H - M_.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(v => fmt(m, v, true)).tickSize(-(H - M_.t - M_.b))).call(a => a.select('.domain').remove());
  sv.append('text').attr('class', 'lbl muted').attr('x', W - M_.r).attr('y', H - 4).attr('text-anchor', 'end').text(xLabel);
  groups.forEach((g, i) => {
    const cy = M_.t + i * rh + rh / 2;
    sv.append('text').attr('class', 'lbl').attr('x', M_.l - 10).attr('y', cy + 4).attr('text-anchor', 'end').text(g.name).each(function () { trim(this, M_.l - 14); });
    if (g.ref != null) sv.append('line').attr('x1', x(g.ref)).attr('x2', x(g.ref)).attr('y1', cy - rh / 2 + 4).attr('y2', cy + rh / 2 - 4).attr('stroke', 'var(--ink)').attr('stroke-width', 2);
    const pts = [...g.pts].sort((a, b) => b.w - a.w);
    sv.append('g').selectAll('circle').data(pts).join('circle')
      .attr('cx', p => x(p.v)).attr('cy', p => cy + (hash(p.k) - 0.5) * (rh - 14)).attr('r', p => r(p.w))
      .attr('fill', g.color).attr('fill-opacity', 0.55).attr('stroke', g.color).attr('stroke-width', 0.8).style('cursor', 'pointer')
      .on('pointermove', (e, p) => tip(e, `<b>${esc(p.name)}</b><span class="v">${esc(fmt(m, p.v))}</span><small>${esc(p.note || '')}</small>`))
      .on('pointerleave', untip).on('click', (e, p) => onPick?.(p.k));
  });
  return sv;
}
function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; }

/* Estimates with intervals: rows = places, one dot per year (ordinal colours). No lines between years. */
export function intervals(el, rowsData, yearsC, m, { label = '' } = {}) {
  const W = width(el), rh = 30, M_ = { t: 28, r: 20, b: 30, l: Math.min(190, W * 0.34) };
  const H = M_.t + M_.b + rowsData.length * rh;
  const all = rowsData.flatMap(r => r.rows).filter(r => r[1] != null);
  const x = d3.scaleLinear().domain([0, d3.max(all, r => r[3] ?? r[1])]).nice().range([M_.l, W - M_.r]);
  const sv = svg(el, W, H, label);
  sv.append('g').attr('class', 'axis gridline').attr('transform', `translate(0,${H - M_.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(v => fmt(m, v, true)).tickSize(-(H - M_.t - M_.b))).call(a => a.select('.domain').remove());
  const ys = [...yearsC.keys()], off = d3.scaleBand().domain(ys).range([-rh / 2 + 5, rh / 2 - 5]);
  ys.forEach((yr, i) => {
    sv.append('circle').attr('cx', M_.l + i * 64 + 6).attr('cy', 12).attr('r', 5).attr('fill', yearsC.get(yr));
    sv.append('text').attr('class', 'lbl').attr('x', M_.l + i * 64 + 15).attr('y', 16).text(yr);
  });
  rowsData.forEach((d, i) => {
    const cy = M_.t + i * rh + rh / 2;
    sv.append('text').attr('class', 'lbl').attr('x', M_.l - 10).attr('y', cy + 4).attr('text-anchor', 'end').text(d.name);
    for (const r of d.rows) {
      if (r[1] == null) continue;
      const yy = cy + off(r[0]) + off.bandwidth() / 2, c = yearsC.get(r[0]);
      if (r[2] != null && r[3] != null) sv.append('line').attr('x1', x(r[2])).attr('x2', x(r[3])).attr('y1', yy).attr('y2', yy).attr('stroke', c).attr('stroke-width', 2).attr('opacity', 0.6);
      sv.append('circle').attr('cx', x(r[1])).attr('cy', yy).attr('r', 4).attr('fill', c).attr('stroke', 'var(--surface)')
        .on('pointermove', e => tip(e, `<b>${esc(d.name)} · ${r[0]}</b><span class="v">${esc(fmt(m, r[1]))}</span>${r[2] != null ? `<small>95% interval ${esc(fmt(m, r[2]))} to ${esc(fmt(m, r[3]))}</small>` : ''}${r[4] ? `<small>Quality ${esc(r[4])}</small>` : ''}`))
        .on('pointerleave', untip);
    }
  });
  return sv;
}

/* Stacked area for dwelling types over years. layers: [{name, color, rows}] with a common year set. */
export function stacked(el, layers, m, { H = 300, label = '' } = {}) {
  const W = width(el), M_ = { ...M, r: Math.min(150, W * 0.26) };
  const years = [...new Set(layers.flatMap(l => l.rows.map(r => r[0])))].sort(d3.ascending);
  const table = years.map(y => Object.fromEntries([['year', y], ...layers.map(l => [l.name, l.rows.find(r => r[0] === y)?.[1] ?? 0])]));
  const st = d3.stack().keys(layers.map(l => l.name))(table);
  const x = d3.scaleLinear().domain(d3.extent(years)).range([M_.l, W - M_.r]);
  const y = d3.scaleLinear().domain([0, d3.max(st.at(-1), d => d[1]) || 1]).nice().range([H - M_.b, M_.t]);
  const sv = svg(el, W, H, label);
  yAxis(sv, y, W, m, M_); xAxisYears(sv, x, H, M_, W);
  const area = d3.area().x(d => x(d.data.year)).y0(d => y(d[0])).y1(d => y(d[1]));
  sv.append('g').selectAll('path').data(st).join('path').attr('d', area).attr('fill', (d, i) => layers[i].color).attr('stroke', 'var(--surface)').attr('stroke-width', 1);
  const ends = dodge(st.map((s, i) => { const d = s.at(-1); return { name: layers[i].name, y: y((d[0] + d[1]) / 2), v: d[1] - d[0], c: layers[i].color }; }), 14, M_.t, H - M_.b);
  sv.append('g').selectAll('text').data(ends).join('text').attr('class', 'lbl').attr('x', W - M_.r + 8).attr('y', d => d.y + 4).text(d => `${d.name} ${fmt(m, d.v, true)}`);
  const cross = sv.append('line').attr('y1', M_.t).attr('y2', H - M_.b).attr('stroke', 'var(--ink-2)').attr('opacity', 0);
  sv.append('rect').attr('x', M_.l).attr('y', M_.t).attr('width', W - M_.l - M_.r).attr('height', H - M_.t - M_.b).attr('fill', 'transparent')
    .on('pointermove', e => {
      const yr = Math.round(x.invert(d3.pointer(e)[0])), row = table.find(t => t.year === yr);
      if (!row) return;
      cross.attr('x1', x(yr)).attr('x2', x(yr)).attr('opacity', 0.6);
      tip(e, `<b>${yr}</b>` + [...layers].reverse().map(l => `<div><span style="color:${l.color}">■</span> ${esc(l.name)} <strong>${esc(fmt(m, row[l.name]))}</strong></div>`).join(''));
    }).on('pointerleave', () => { cross.attr('opacity', 0); untip(); });
  return sv;
}

/* Slope chart between two years. */
export function slope(el, series, m, y0, y1, { label = '' } = {}) {
  const W = width(el), H = 320, M_ = { t: 24, r: Math.min(190, W * 0.38), b: 16, l: Math.min(190, W * 0.38) };
  const vs = series.flatMap(s => [s.a, s.b]).filter(v => v != null);
  const y = d3.scaleLinear().domain(d3.extent(vs)).nice().range([H - M_.b, M_.t]);
  const sv = svg(el, W, H, label);
  sv.append('text').attr('class', 'lbl big').attr('x', M_.l).attr('y', 12).attr('text-anchor', 'middle').text(y0);
  sv.append('text').attr('class', 'lbl big').attr('x', W - M_.r).attr('y', 12).attr('text-anchor', 'middle').text(y1);
  for (const s of series) {
    sv.append('line').attr('x1', M_.l).attr('x2', W - M_.r).attr('y1', y(s.a)).attr('y2', y(s.b)).attr('stroke', s.color).attr('stroke-width', 2.5);
    for (const [cx, v] of [[M_.l, s.a], [W - M_.r, s.b]]) sv.append('circle').attr('cx', cx).attr('cy', y(v)).attr('r', 4.5).attr('fill', s.color).attr('stroke', 'var(--surface)');
  }
  const L = dodge(series.map(s => ({ s, y: y(s.a) })), 14, M_.t, H - M_.b), R = dodge(series.map(s => ({ s, y: y(s.b) })), 14, M_.t, H - M_.b);
  sv.append('g').selectAll('text').data(L).join('text').attr('class', 'lbl').attr('x', M_.l - 10).attr('y', d => d.y + 4).attr('text-anchor', 'end').text(d => `${d.s.name} ${fmt(m, d.s.a)}`).each(function () { trim(this, M_.l - 12); });
  sv.append('g').selectAll('text').data(R).join('text').attr('class', 'lbl').attr('x', W - M_.r + 10).attr('y', d => d.y + 4).text(d => `${fmt(m, d.s.b)} ${d.s.name}`).each(function () { trim(this, M_.r - 12); });
  return sv;
}
