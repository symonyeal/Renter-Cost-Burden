/* Legend: b bundle, c country, m measure, g geography, r observation, s selection.
   Source populations and geography IDs remain distinct; no interpolation across absent years. */
'use strict';
const $ = id => document.getElementById(id);
let b, s = {
        country: 'ca',
        measure: '',
        place: ''
    },
    rows = [];
const names = {
    ca: 'Canada',
    us: 'United States'
};
const num = v => Number.isFinite(v);
const fmt = v => num(v) ? v.toLocaleString('en-CA', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
}) : 'Not published';
const source = id => (b[s.country].sources || []).find(r => r.id === id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, x => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
} [x]));

function writeUrl() {
    const u = new URL(location.href);
    u.searchParams.set('country', s.country);
    u.searchParams.set('measure', s.measure);
    u.searchParams.set('place', s.place);
    history.pushState(null, '', u);
}

function readUrl() {
    const q = new URLSearchParams(location.search);
    s = {
        country: q.get('country') === 'us' ? 'us' : 'ca',
        measure: q.get('measure') || '',
        place: q.get('place') || ''
    };
}

function controls() {
    const c = b[s.country],
        ms = c.measures.filter(m => c.observations.some(r => r.measure === m.id));
    if (!ms.length) throw Error('No measures were published for this country.');
    if (!ms.some(m => m.id === s.measure)) s.measure = ms[0].id;
    $('measure').innerHTML = ms.map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('');
    $('measure').value = s.measure;
    const rank = r => ['country', 'sample'].includes(r.level) ? 0 : 1;
    const gs = [...new Map(c.observations.filter(r => r.measure === s.measure).map(r => [String(r.geo_id), r])).values()].sort((a, z) => rank(a) - rank(z) || a.geo.localeCompare(z.geo));
    if (!gs.some(r => String(r.geo_id) === s.place)) s.place = String(gs[0].geo_id);
    $('place').innerHTML = gs.map(r => `<option value="${esc(r.geo_id)}">${esc(r.geo)} · ${esc(r.level.replaceAll('_',' '))}</option>`).join('');
    $('place').value = s.place;
    document.querySelectorAll('[data-country]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.country === s.country)));
    render();
}

function render() {
    const c = b[s.country],
        m = c.measures.find(m => m.id === s.measure);
    rows = c.observations.filter(r => r.measure === s.measure && String(r.geo_id) === s.place).sort((a, z) => a.year - z.year);
    const valid = rows.filter(r => num(r.value)),
        latest = valid.at(-1),
        first = valid[0],
        g = rows[0];
    $('scope').textContent = s.country === 'ca' ? 'Canada · descriptive housing indicators' : 'United States · 30 counties in Colorado, Massachusetts & Washington';
    $('placeLabel').textContent = g.geo + ' · ' + g.level.replaceAll('_', ' ');
    $('finding').textContent = latest ? `${m.title} in ${latest.year}` : 'No numeric estimate published';
    $('definition').textContent = latest && valid.length > 1 ? `${valid.length} published observations, ${first.year}–${latest.year}.` : 'The selected source provides a single published period.';
    $('value').textContent = latest ? fmt(latest.value) + (m.unit === 'percent' || m.unit === '%' ? '%' : '') : '—';
    $('period').textContent = latest ? `${latest.year} · ${m.unit}` : m.unit;
    $('universe').textContent = 'Population: ' + m.universe;
    $('measureNotes').textContent = Array.isArray(m.notes) ? m.notes.join(' ') : m.notes || '';
    const quality = g.quality;
    $('geographyQuality').textContent = quality ?
        `Census geography quality code: ${quality.data_quality_flag || 'not supplied'}. ` +
        `Long-form nonresponse: ${quality.long_form_nonresponse_percent ?? 'not supplied'}%. ` +
        (quality.data_quality_note && quality.data_quality_note !== '...' ? quality.data_quality_note :
            'See the source table for quality-code definitions.') : '';
    $('unitHeader').textContent = m.unit;
    $('observations').querySelector('tbody').innerHTML = rows.map(r => {
        const src = source(r.source),
            lo = r.lower ?? r.lo,
            hi = r.upper ?? r.hi;
        return `<tr data-year="${r.year}" data-value="${r.value??''}"><th scope="row">${r.year}</th><td>${fmt(r.value)}</td><td>${num(lo)&&num(hi)?fmt(lo)+'–'+fmt(hi):'Not supplied'}</td><td>${esc(r.status||'No flag supplied')}</td><td>${src?`<a href="${esc(src.url)}">${esc(src.title)}</a>`:esc(r.source)}</td></tr>`;
    }).join('');
    const cov = c.coverage || {},
        notes = [cov.summary, ...(Array.isArray(cov.notes) ? cov.notes : [cov.notes]), ...(cov.limits || [])].filter(Boolean);
    $('coverage').innerHTML = notes.map(n => `<p>${esc(n)}</p>`).join('') + (s.country === 'us' ? '<p>This fixed 30-county sample is a regional study. It does not represent the United States.</p>' : '<p>Measures cover different years, geographies and renter populations. Census burden, survey core housing need and CMHC rental-market measures answer different questions.</p>');
    $('studyLink').innerHTML = s.country === 'us' ? '<a href="us/index.html">Read the US study & forecast evaluation ↗</a>' : 'Canadian analysis describes published observations; no Canadian forecast is fitted.';
    const ids = new Set(rows.map(r => r.source));
    $('sources').innerHTML = c.sources.filter(r => ids.has(r.id)).map(r => `<li><a href="${esc(r.url)}">${esc(r.title)}</a>${r.retrieved?`<br>Retrieved ${esc(r.retrieved.slice(0,10))}`:''}</li>`).join('');
    draw(m, valid);
    comparePlaces(c, m, g, latest);
    window.RENDERED = true;
}

function comparePlaces(c, m, g, latest) {
    const year = latest?.year ?? rows.at(-1).year;
    const provincial = ['country', 'province', 'territory'].includes(g.level);
    const levels = s.country === 'us' ? ['county'] : provincial ? ['province', 'territory'] :
        g.level.startsWith('aggregate_') ? ['metro', 'agglomeration'] : [g.level];
    const data = c.observations.filter(r => r.measure === m.id && r.year === year &&
        r.source === g.source && levels.includes(r.level)).sort((a, z) =>
        (num(z.value) ? z.value : -Infinity) - (num(a.value) ? a.value : -Infinity) || a.geo.localeCompare(z.geo));
    $('compareHeading').textContent = `Compare places in ${year}`;
    $('compareNote').textContent = `${m.title}, ${m.unit}. Same source and geography level${provincial && s.country === 'ca' ? ' (provinces and territories)' : ''}. ` +
        'Ordered by the published estimate; this is not a statistical ranking. Missing estimates remain in the list.';
    $('comparison').querySelector('tbody')?.remove();
    const body = document.createElement('tbody');
    body.innerHTML = data.map(r => {
        const lo = r.lower ?? r.lo, hi = r.upper ?? r.hi;
        return `<tr><th scope="row"><button class="place-link" data-place="${esc(r.geo_id)}">${esc(r.geo)}</button></th>` +
            `<td>${fmt(r.value)}</td><td>${num(lo) && num(hi) ? fmt(lo) + '–' + fmt(hi) : 'Not supplied'}</td></tr>`;
    }).join('');
    $('comparison').append(body);
    body.querySelectorAll('button').forEach(el => el.onclick = () => {
        s.place = el.dataset.place;
        controls();
        writeUrl();
        $('place').focus();
    });
}

function draw(m, valid) {
    const w = Math.max(300, $('chart').clientWidth),
        h = w < 500 ? 235 : 300,
        p = {
            l: 48,
            r: 28,
            t: 24,
            b: 38
        };
    $('chart').style.minHeight = '';
    if (!valid.length) {
        $('chart').innerHTML = '<p>No numeric observations for this selection.</p>';
        $('chartNote').textContent = 'Withheld values appear in the table.';
        return;
    }
    if (m.id === 'burden' && valid.length === 1) {
        const r = valid[0], width = w - p.l - p.r, end = p.l + width * r.value / 100;
        $('chart').style.minHeight = '0';
        $('chart').innerHTML = `<svg viewBox="0 0 ${w} 112" role="img" aria-label="${esc(m.title)}: ${fmt(r.value)} percent in ${r.year}">` +
            `<title>${fmt(r.value)}% of eligible renter households in ${r.year}</title>` +
            `<rect class="share-track" x="${p.l}" y="32" width="${width}" height="14"/>` +
            `<rect class="share-value" x="${p.l}" y="32" width="${end-p.l}" height="14"/>` +
            [0,25,50,75,100].map(v => `<text x="${p.l+width*v/100}" y="76" text-anchor="middle">${v}%</text>`).join('') + '</svg>';
        $('chartNote').textContent = `Share of eligible renter households, ${r.year}. ` +
            `One Census observation; no annual trend or ratio sampling interval is available. Source: ${source(r.source)?.title || r.source}.`;
        return;
    }
    const years = rows.map(r => +r.year),
        min = Math.min(...years),
        max = Math.max(...years),
        fullScale = m.id === 'burden',
        peak = Math.max(...valid.map(r => r.upper ?? r.hi ?? r.value), 0.01) * 1.08,
        base = 10 ** Math.floor(Math.log10(peak / 4)),
        step = [1, 2, 2.5, 5, 10].find(v => v * base >= peak / 4) * base,
        top = fullScale ? 100 : 4 * step;
    const x = y => min === max ? w / 2 : p.l + (y - min) / (max - min) * (w - p.l - p.r),
        y = v => h - p.b - v / (top || 1) * (h - p.t - p.b);
    let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(m.title)} over published years"><title>${esc(m.title)}. Exact values follow in the table.</title>`;
    for (let i = 0; i <= 4; i++) {
        const v = top * i / 4;
        svg += `<line class="chart-grid" x1="${p.l}" x2="${w-p.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${p.l-8}" y="${y(v)+5}" text-anchor="end">${v.toLocaleString('en-CA',{maximumFractionDigits:2})}</text>`;
    }
    const ticks = [...new Set([min, ...years.filter((v, i) => i % Math.max(1, Math.ceil(years.length / (w < 500 ? 3 : 7))) === 0), max])];
    ticks.forEach(v => svg += `<text x="${x(v)}" y="${h-8}" text-anchor="middle">${v}</text>`);
    // A missing row or a missing calendar year breaks the path. No silent gap filling.
    let prev = null;
    valid.forEach(r => {
        if (prev && +r.year === +prev.year + 1) svg += `<path class="series" d="M${x(prev.year)},${y(prev.value)} L${x(r.year)},${y(r.value)}"/>`;
        const lo = r.lower ?? r.lo,
            hi = r.upper ?? r.hi;
        if (num(lo) && num(hi)) svg += `<path class="interval" d="M${x(r.year)},${y(lo)} V${y(hi)} M${x(r.year)-4},${y(lo)} h8 M${x(r.year)-4},${y(hi)} h8"/>`;
        svg += `<circle class="point" cx="${x(r.year)}" cy="${y(r.value)}" r="4"><title>${r.year}: ${fmt(r.value)} ${esc(m.unit)}; ${esc(r.status||'no flag supplied')}</title></circle>`;
        prev = r;
    });
    $('chart').innerHTML = svg + '</svg>';
    const labels = [...new Set(rows.map(r => source(r.source)?.title || r.source))];
    const intervalNote = s.country === 'us' && m.id === 'burden' ?
        'Bars show approximate 90% sampling intervals. ' : m.id === 'core_need' ?
        'Bars show published 95% sampling intervals. ' : 'No sampling interval is supplied for this measure. ';
    $('chartNote').textContent = `${m.unit}. ${fullScale?'Scale: 0–100%. ':'Scale starts at zero. '}Dots are estimates; lines join consecutive years only. ${intervalNote}Source: ${labels.join('; ')}.`;
}

function csv() {
    const c = b[s.country],
        m = c.measures.find(m => m.id === s.measure),
        fields = ['country', 'geo', 'geo_id', 'level', 'year', 'measure', 'unit', 'value', 'lower', 'upper', 'status', 'source', 'source_title', 'source_url'];
    const quote = v => '"' + String(v ?? '').replaceAll('"', '""') + '"';
    const text = [fields.join(','), ...rows.map(r => {
        const entry = {...r, country: names[s.country], unit: m.unit,
            source_title: source(r.source)?.title, source_url: source(r.source)?.url};
        return fields.map(k => quote(entry[k])).join(',');
    })].join('\r\n');
    const a = document.createElement('a'),
        u = URL.createObjectURL(new Blob([text], {
            type: 'text/csv;charset=utf-8'
        }));
    a.href = u;
    a.download = `${s.country}-${s.measure}-${s.place}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const themes = ['system', 'light', 'dark'];
let theme;
try {
    theme = localStorage.getItem('theme') || 'system';
} catch {
    theme = 'system';
}

function applyTheme() {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    $('theme').textContent = 'Theme: ' + theme;
    try {
        localStorage.setItem('theme', theme);
    } catch {
        /* Storage may be disabled. */ }
}
applyTheme();
$('theme').onclick = () => {
    theme = themes[(themes.indexOf(theme) + 1) % themes.length];
    applyTheme();
};
document.querySelectorAll('[data-country]').forEach(el => el.onclick = () => {
    s = {
        country: el.dataset.country,
        measure: s.measure,
        place: ''
    };
    controls();
    writeUrl();
});
$('measure').onchange = () => {
    s.measure = $('measure').value;
    controls();
    writeUrl();
};
$('place').onchange = () => {
    s.place = $('place').value;
    render();
    writeUrl();
};
$('csv').onclick = csv;
window.onpopstate = () => {
    readUrl();
    controls();
};
window.addEventListener('resize', () => {
    if (b) render();
});
fetch('bundle.json').then(r => {
    if (!r.ok) throw Error(`Data request returned ${r.status}`);
    return r.json();
}).then(data => {
    b = data;
    readUrl();
    controls();
    $('status').textContent = '';
    $('content').hidden = false;
    render();
    $('built').textContent = b.built ? 'Data build: ' + (typeof b.built === 'string' ? b.built : JSON.stringify(b.built)) : '';
}).catch(e => {
    $('status').textContent = 'The data could not be loaded. Reload to retry. ' + e.message;
    window.RENDERED = false;
});
