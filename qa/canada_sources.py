"""Independently check Canadian exports against cached official source cells.

Legend: d Canadian export; s source; z ZIP; r CSV row; a indexed observations;
k natural key; n number of checked source cells; h SHA-256 digest.
"""
import csv
import hashlib
import io
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run():
    d = json.loads((ROOT / 'data/processed/canada.json').read_text(encoding='utf-8'))
    a = {(r['source'], r['geo'], r['year'], r['measure']): r for r in d['observations']}
    n = {}
    for s in d['sources']:
        if s.get('format', '').startswith('CSV'):
            path = ROOT / 'data/raw/canada' / s['cache']
            assert hashlib.sha256(path.read_bytes()).hexdigest() == s['sha256']
            n[s['id']] = 0
            rows = csv.reader(io.StringIO(path.read_bytes().decode('utf-8-sig')))
            for r in rows:
                if len(r) < 7:
                    continue
                for i, year in [(5, 2016), (6, 2021)]:
                    k = (s['id'], r[0], year, 'burden_history')
                    if k in a:
                        assert a[k]['value'] == float(r[i]), k
                        n[s['id']] += 1
            expected_count = len([r for r in d['observations'] if r['source'] == s['id']])
            assert n[s['id']] == expected_count > 0, (s['id'], n[s['id']], expected_count)
            continue
        path = ROOT / 'data/raw/canada' / f'{s["id"]}-eng.zip'
        assert path.exists(), f'Fetch the optional official source cache first: {path}'
        with path.open('rb') as stream:
            h = hashlib.file_digest(stream, 'sha256').hexdigest()
        assert h == s['sha256'], s['id']
        n[s['id']] = 0
        with zipfile.ZipFile(path) as z:
            rows = csv.DictReader(io.TextIOWrapper(z.open(s['id'] + '.csv'),
                                                  encoding='utf-8-sig'))
            for r in rows:
                if s['id'] == '98100252':
                    # Read Canada as an independent source spot check; unit tests cover
                    # the adapter's denominator and the full export's geography membership.
                    if r['GEO'] != 'Canada':
                        if n[s['id']]:
                            break
                        continue
                    if any(r[k] != v for k, v in {
                        'Household total income groups (14)': 'Total - Total income of household',
                        'Household type including census family structure (16)':
                            'Total - Household type including census family structure',
                        'Housing suitability (3)': 'Total - Housing suitability',
                        'Dwelling condition (3)': 'Total - Dwelling condition',
                        'Statistics (3C)': 'Number of private households',
                    }.items()):
                        continue
                    component = {
                        'Spending less than 30% of income on shelter costs': 'under30',
                        'Spending 30% or more of income on shelter costs': 'burdened',
                        'Not applicable': 'not_applicable',
                        'Total - Shelter-cost-to-income ratio': 'total',
                    }.get(r['Shelter-cost-to-income ratio (5)'])
                    if component:
                        o = a[(s['id'], 'Canada', 2021, 'burden')]
                        assert o['components'][component]['value'] == float(
                            r['Tenure (3):Renter[3]'])
                        n[s['id']] += 1
                    continue
                year = int(r['REF_DATE'])
                if year < d['first_year']:
                    continue
                if s['id'] == '46100085':
                    if r['Tenure including first-time homebuyer and social and affordable housing '
                         'status'] != 'Renter':
                        continue
                    stat = {
                        'Percentage of households in core housing need': 'value',
                        'Low 95% confidence interval, percentage of households': 'lower',
                        'High 95% confidence interval, percentage of households': 'upper',
                    }.get(r['Core housing need statistics'])
                    if stat is None:
                        continue
                    m = 'core_need'
                elif s['id'] == '34100133':
                    if (r['Type of structure'] !=
                            'Row and apartment structures of three units and over'
                            or r['Type of unit'] != 'Two bedroom units'):
                        continue
                    stat, m = 'value', 'rent'
                else:
                    stat, m = 'value', 'vacancy'
                k = (s['id'], r['GEO'], year, m)
                if k not in a:
                    continue
                expected = float(r['VALUE']) if r['VALUE'] else None
                assert a[k][stat] == expected, (k, stat)
                assert a[k][stat + '_status'] == r['STATUS'], k
                n[s['id']] += 1
        assert n[s['id']] > 0, s['id']
    assert n['98100252'] == 4
    print(json.dumps({'source_sha256_matches': len(n), 'source_cells_checked': n}, indent=2))


if __name__ == '__main__':
    run()
