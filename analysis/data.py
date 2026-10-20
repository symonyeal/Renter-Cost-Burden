"""Official county estimates and workplace/residence job counts; no synthetic observations."""
import hashlib
import io
import json
import re
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
C = json.loads((ROOT / 'config.json').read_text())
RAW = ROOT / C['paths']['raw']
OUT = ROOT / C['paths']['processed']
MID = ROOT / C['paths']['interim']
ACS = 'https://www2.census.gov/programs-surveys/acs/summary_file'
LODES = 'https://lehd.ces.census.gov/data/lodes/LODES8'
TIGER = ('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/'
         'MapServer/1/query?')
TABLES = ['B01003', 'B25001', 'B25064', 'B25119', 'B25070']


def write(p, x):
    """Write text, a DataFrame (CSV) or a JSON object with LF endings on every OS."""
    if isinstance(x, pd.DataFrame):
        x.to_csv(p, index=False, lineterminator='\n')
    else:
        p.write_text(x if isinstance(x, str) else json.dumps(x, indent=2), encoding='utf-8',
                     newline='\n')


def fetch(u):
    """Cache URL bytes and its retrieval metadata; a cached file is immutable."""
    RAW.mkdir(parents=True, exist_ok=True)
    name = urlsplit(u).path.rsplit('/', 1)[-1] or 'index'
    p = RAW / (hashlib.sha256(u.encode()).hexdigest()[:16] + '-' + name)
    if not p.exists():
        for k in range(4):
            try:
                with urllib.request.urlopen(u, timeout=120) as r:
                    b = r.read()
                    modified = r.headers.get('Last-Modified')
                p.write_bytes(b)
                write(p.with_suffix(p.suffix + '.json'), {
                    'url': u, 'retrieved': datetime.now(UTC).isoformat(),
                    'last_modified': modified, 'bytes': len(b),
                    'sha256': hashlib.sha256(b).hexdigest(), 'cache': p.name,
                    'vintage': 'current download; not archived historical vintage',
                })
                break
            except OSError:
                if k == 3:
                    raise
                time.sleep(2 ** k)
    return p


def source_manifest():
    """Reference periods and declared release lags supplement object-level retrieval metadata."""
    rows = [json.loads(p.read_text()) for p in sorted(RAW.glob('*.json'))]
    for r in rows:
        u = r['url']
        source = ('ACS' if 'summary_file' in u else 'LODES8' if 'lehd.ces' in u
                  else 'QCEW' if '/cew/' in u else 'CPI-U' if 'fredgraph' in u else 'TIGERweb')
        years = re.findall(r'(?<!\d)(20\d{2})(?!\d)', u)
        r.update(source=source, reference_period=int(years[0]) if years else None,
                 publication_date=None,
                 release_rule={'ACS': 'reference year + 1', 'QCEW': 'reference year + 2',
                               'LODES8': 'reference year + 4'}.get(source, 'See METHODS.md'))
    return rows


def read_table(y, t):
    """Read county E/M columns from the official table-based ACS one-year file."""
    d = 'prototype' if y < 2021 else 'table-based-SF/data'
    p = fetch(f'{ACS}/{y}/{d}/1YRData/acsdt1y{y}-{t.lower()}.dat')
    x = pd.read_csv(p, sep='|', dtype=str)
    x.columns = [re.sub(r'_(\d+)M$', r'_MOE\1', re.sub(r'_(\d+)E$', r'_\1',
                 c.lstrip('#').replace('_E', '_').replace('_M', '_MOE')))
                 for c in x.columns]
    x = x[x.GEO_ID.str.match(r'^050(?:00|0000)US\d{5}$')].copy()
    x['fips'] = x.GEO_ID.str[-5:]
    return x.drop(columns='GEO_ID').set_index('fips')


def old_acs(y):
    """Sequence start positions are one-based; column six is LOGRECNO."""
    doc = f'{ACS}/{y}/documentation' + ('/1_year' if y <= 2012 else '')
    fn = ('Sequence_Number_and_Table_Number_Lookup.txt' if y <= 2012
          else 'ACS_1yr_Seq_Table_Number_Lookup.txt')
    p = fetch(f'{doc}/user_tools/{fn}')
    lookup = pd.read_csv(p, dtype=str, encoding='latin1')
    lookup = lookup.rename(columns={'seq': 'Sequence Number', 'position': 'Start Position',
                                    'cells': 'Total Cells in Table'})
    lookup = lookup.replace('.', np.nan)
    fn = 'Mini_Geofile.xls' if y <= 2012 else '1_year_Mini_Geo.xlsx'
    p = fetch(f'{doc}/geography/{fn}')
    book = pd.ExcelFile(p)
    out = []
    for st, (_, name) in C['states'].items():
        sheet = next(s for s in book.sheet_names if s.lower() == st)
        g = pd.read_excel(book, sheet_name=sheet, dtype=str)
        g.columns = [str(c).strip().upper() for c in g.columns]
        g = g.rename(columns={'GEOGRAPHY ID': 'GEOID', 'LOGICAL RECORD NUMBER': 'LOGRECNO',
                              'GEOGRAPHY NAME': 'NAME'})
        gc = next(c for c in g if c in ('GEOID', 'GEO_ID'))
        lc = next(c for c in g if 'LOGRECNO' in c)
        g = g[g[gc].str.match(r'^050(?:00|0000)US\d{5}$', na=False)].copy()
        g['fips'] = g[gc].str[-5:]
        g[lc] = g[lc].str.zfill(7)
        zips = {}
        parts = []
        for t in TABLES:
            r = lookup[(lookup['Table ID'] == t) & lookup['Start Position'].notna()].iloc[0]
            seq = str(r['Sequence Number']).zfill(4)
            a = int(r['Start Position']) - 1
            n = int(r['Total Cells in Table'].split()[0])
            if seq not in zips:
                u = f'{ACS}/{y}/data/1_year_seq_by_state/{name}/{y}1{st}{seq}000.zip'
                zips[seq] = zipfile.ZipFile(fetch(u))
            cols = {}
            for prefix, suffix in [('e', ''), ('m', 'MOE')]:
                z = zips[seq]
                b = z.read(f'{prefix}{y}1{st}{seq}000.txt')
                d = pd.read_csv(io.BytesIO(b), header=None, dtype=str)
                d = d.set_index(5)
                for k in range(n):
                    cols[f'{t}_{suffix}{k + 1:03}'] = g[lc].map(d[a + k])
            q = pd.DataFrame(cols, index=g.index)
            q['fips'] = g.fips
            parts.append(q.set_index('fips'))
        q = pd.concat(parts, axis=1)
        nc = next(c for c in g if 'NAME' in c)
        q['name'] = g.set_index('fips')[nc]
        out.append(q)
    return pd.concat(out)


def margin(d):
    """90% margin of burden, pp. The numerator is a subset of the denominator, so the Census
    proportion formula applies: sqrt(mN² − p² mD²)/D. Where the radicand is negative the
    Census ratio formula sqrt(mN² + p² mD²)/D is used instead (ACS handbook, chapter 8)."""
    num, den = d.burden_numerator, d.burden_denominator
    mn = np.sqrt(sum(d[f'B25070_MOE{k:03}'] ** 2 for k in range(7, 11)))
    md = np.sqrt(d.B25070_MOE001 ** 2 + d.B25070_MOE011 ** 2)
    p = num / den
    r = mn ** 2 - p ** 2 * md ** 2
    return 100 * np.sqrt(r.where(r >= 0, mn ** 2 + p ** 2 * md ** 2)) / den


def acs_year(y):
    """Published categories define burden; negative Census sentinels remain in raw columns."""
    if y < 2018:
        d = old_acs(y)
    else:
        d = pd.concat([read_table(y, t) for t in TABLES], axis=1)
        d = d[d.index.str[:2].isin([s[0] for s in C['states'].values()])]
    for c in d.columns.difference(['name']):
        d[c] = pd.to_numeric(d[c], errors='coerce')
    d['year'] = y
    return d.reset_index()


def qcew(y, fips):
    """Ownership 0/all industries for totals; ownership 5/private supersectors for shares."""
    p = fetch(f'https://data.bls.gov/cew/data/api/{y}/a/area/{fips}.csv')
    d = pd.read_csv(p, dtype={'industry_code': str, 'area_fips': str})
    return qcew_row(d, y, fips)


def qcew_row(d, y, fips):
    """Extract consistent ownership/industry rows from either official QCEW format."""
    r = d[(d.own_code == 0) & (d.industry_code == '10')].iloc[0]
    a = {'fips': fips, 'year': y, 'qcew_suppressed': r.disclosure_code == 'N'}
    for c, v in [('jobs', 'annual_avg_emplvl'), ('pay', 'avg_annual_pay'),
                 ('establishments', 'annual_avg_estabs')]:
        a[c] = np.nan if a['qcew_suppressed'] else r[v]
    for c, code in [('goods_share', '101'), ('services_share', '102')]:
        s = d[(d.own_code == 5) & (d.industry_code == code)]
        a[c + '_missing'] = not len(s)
        a[c + '_suppressed'] = bool(len(s) and s.iloc[0].disclosure_code == 'N')
        a[c] = (s.iloc[0].annual_avg_emplvl / a['jobs']
                if len(s) and s.iloc[0].disclosure_code != 'N' else np.nan)
    return a


def old_qcew(y, fs):
    """Stream historical single-file archives; the API starts in 2014."""
    dest = MID / f'qcew-{y}.csv'
    if dest.exists():
        d = pd.read_csv(dest, dtype={'fips': str}, float_precision='round_trip')
        if 'goods_share_suppressed' in d:
            return d.to_dict('records')
    p = fetch(f'https://data.bls.gov/cew/data/files/{y}/csv/{y}_annual_singlefile.zip')
    pieces = []
    with zipfile.ZipFile(p) as z, z.open(z.namelist()[0]) as stream:
        for d in pd.read_csv(stream, dtype={'area_fips': str, 'industry_code': str},
                             chunksize=200000):
            pieces.append(d[d.area_fips.isin(fs) & d.industry_code.isin(['10', '101', '102'])])
    d = pd.concat(pieces)
    rows = [qcew_row(d[d.area_fips == f], y, f) for f in fs]
    write(dest, pd.DataFrame(rows))
    return rows


def lodes(y, st, counties):
    """County primary jobs, LODES8 2020 blocks. WAC/RAC include interstate relationships."""
    dest = MID / f'lodes-{st}-{y}.json'
    if dest.exists():
        return json.loads(dest.read_text())
    if st == 'ma' and y < 2011:
        write(dest, '[]')
        print('LODES documented coverage exclusion:', st, y, flush=True)
        return []
    totals = {}
    for typ, block in [('wac', 'w_geocode'), ('rac', 'h_geocode')]:
        p = fetch(f'{LODES}/{st}/{typ}/{st}_{typ}_S000_JT01_{y}.csv.gz')
        a = pd.Series(dtype=float)
        for d in pd.read_csv(p, usecols=[block, 'C000'], dtype={block: str}, chunksize=300000):
            s = d.groupby(d[block].str[:5]).C000.sum()
            a = a.add(s, fill_value=0)
        totals[typ] = a
    if totals['wac'].empty:
        write(dest, '[]')
        print('LODES has no workplace rows:', st, y, flush=True)
        return []
    p = fetch(f'{LODES}/{st}/od/{st}_od_main_JT01_{y}.csv.gz')
    flows = pd.Series(dtype=float)
    for d in pd.read_csv(p, usecols=['w_geocode', 'h_geocode', 'S000'],
                         dtype={'w_geocode': str, 'h_geocode': str}, chunksize=300000):
        d['w'] = d.w_geocode.str[:5]
        d['h'] = d.h_geocode.str[:5]
        s = d.groupby(['h', 'w']).S000.sum()
        flows = s if flows.empty else flows.add(s, fill_value=0)
    rows = []
    for f in counties:
        internal = flows.get((f, f), 0)
        w, h = float(totals['wac'][f]), float(totals['rac'][f])
        outbound = [(b, float(n)) for (a, b), n in flows.items() if a == f and b != f]
        inbound = [(a, float(n)) for (a, b), n in flows.items() if b == f and a != f]
        out_state = max(0, h - internal - sum(n for _, n in outbound))
        in_state = max(0, w - internal - sum(n for _, n in inbound))
        rows.append({'fips': f, 'year': y, 'work_jobs': w, 'resident_jobs': h,
                     'internal': internal, 'inbound': 1 - internal / w,
                     'outbound': 1 - internal / h, 'retention': internal / h,
                     'destinations': sorted(outbound, key=lambda x: -x[1])[:10],
                     'origins': sorted(inbound, key=lambda x: -x[1])[:10],
                     'out_state': out_state, 'in_state': in_state,
                     'main_total': float(flows.sum()),
                     'wac_total': float(totals['wac'].sum()),
                     'rac_total': float(totals['rac'].sum())})
    write(dest, json.dumps(rows))
    print('LODES aggregate', st, y, len(rows), flush=True)
    return rows


def run():
    """Fetch and validate the fixed sample, preserving all raw published categories."""
    OUT.mkdir(parents=True, exist_ok=True)
    MID.mkdir(parents=True, exist_ok=True)
    fetch(f'{ACS}/2023/table-based-SF/documentation/ACS20231YR_Table_Shells.txt')
    fetch(f'{LODES}/LODESTechDoc8.4.pdf')
    fetch('https://lehd.ces.census.gov/doc/OnTheMapDataNotices.pdf')
    for st in C['states']:
        fetch(f'{LODES}/{st}/version.txt')
    y0, y1 = C['acs_years']
    ys = [y for y in range(y0, y1 + 1) if y != 2020]
    print('ACS baseline', flush=True)
    a = acs_year(C['sample_year'])
    sample = pd.concat([a[a.fips.str.startswith(s[0])].nlargest(
        C['counties_per_state'], 'B01003_001') for s in C['states'].values()])
    write(OUT / 'sample.csv', sample[['fips', 'name', 'B01003_001']])
    names = sample.set_index('fips')['name'].to_dict()
    fs = list(names)
    print('Fixed sample:', len(fs), names, flush=True)
    with ThreadPoolExecutor(5) as pool:
        frames = list(pool.map(acs_year, ys))
    d = pd.concat(frames)
    d = d[d.fips.isin(fs)].copy()
    d['name'] = d.fips.map(names)
    num = d[[f'B25070_{k:03}' for k in range(7, 11)]].sum(axis=1, min_count=4)
    den = d.B25070_001 - d.B25070_011
    assert (den > 0).all()
    assert np.allclose(d[[f'B25070_{k:03}' for k in range(2, 12)]].sum(axis=1),
                       d.B25070_001)
    d['burden'] = 100 * num / den
    d['burden_numerator'], d['burden_denominator'] = num, den
    d['renters'] = d.B25070_001
    d['burden_moe'] = margin(d)
    for c, v in [('population', 'B01003_001'), ('housing', 'B25001_001'),
                 ('rent', 'B25064_001'), ('income', 'B25119_003')]:
        d[c] = d[v].where(d[v] >= 0)
    d['acs_missing'] = d[['rent', 'income', 'population', 'housing']].isna().any(axis=1)
    write(OUT / 'acs.csv', d)
    p = fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS')
    cpi = pd.read_csv(p)
    cpi['year'] = pd.to_datetime(cpi.observation_date).dt.year
    cpi = cpi.groupby('year').CPIAUCNS.agg(['mean', 'count'])
    cpi = cpi[cpi['count'] == 12]['mean']
    write(OUT / 'cpi.csv', cpi.reset_index())
    print('QCEW county-year files', flush=True)
    q = []
    for y in range(2010, 2014):
        print('QCEW historical archive', y, flush=True)
        q.extend(old_qcew(y, fs))
    tasks = [(y, f) for y in range(2014, 2024) for f in fs]
    with ThreadPoolExecutor(8) as pool:
        q.extend(pool.map(lambda a: qcew(*a), tasks))
    write(OUT / 'qcew.csv', pd.DataFrame(q))
    print('LODES chunks; raw downloads can exceed 1 GB', flush=True)
    tasks = [(y, st, [f for f in fs if f.startswith(v[0])])
             for y in range(2008, 2020) for st, v in C['states'].items()]
    with ThreadPoolExecutor(3) as pool:
        rows = list(pool.map(lambda a: lodes(*a), tasks))
    write(OUT / 'lodes.json', json.dumps([r for part in rows for r in part]))
    where = 'GEOID IN (' + ','.join(f"'{f}'" for f in fs) + ')'
    geo = json.loads(fetch(TIGER + urlencode({
        'where': where, 'outFields': 'GEOID,NAME,STATE', 'returnGeometry': 'true',
        'outSR': '4326', 'maxAllowableOffset': '.015', 'f': 'geojson'})).read_text())
    assert len(geo['features']) == len(fs)
    write(OUT / 'counties.geojson', json.dumps(geo))
    manifest = source_manifest()
    write(OUT / 'manifest.json', manifest)
    print('Sources cached:', len(manifest), flush=True)


if __name__ == '__main__':
    run()
