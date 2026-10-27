"""Independent check of data/processed/observations.csv against the raw Statistics Canada files.

Re-reads the cached ZIPs (data/raw/canada, created by `cargo run -- fetch`) with the standard library
and compares cell by cell; it shares no code with the Rust adapters. Exits nonzero on any mismatch.
Legend: o observations keyed (measure, cat, place, year); k place id; n compared cells; bad mismatches.
"""

import csv
import io
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/canada"


def place(d):
    """Place id from a DGUID: vintage dropped, codes zero-padded as the pipeline documents."""
    if len(d) == 7 and d.isdigit():
        return "csd-" + d
    t, c = d[4:9], d[9:]
    if t == "A0000":
        return "can"
    if t == "A0002":
        return "pr-" + c[-2:]
    if t in ("S0503", "S0504"):
        return "m-" + c.zfill(3)
    if t == "A0005":
        return "csd-" + c.zfill(7)
    if t in ("S0505", "S0506"):
        return "mp-" + c
    return None


def rows(t):
    z = zipfile.ZipFile(RAW / f"{t}-eng.zip")
    return csv.DictReader(io.TextIOWrapper(z.open(f"{t}.csv"), encoding="utf-8-sig"))


def main():
    o = {}
    with open(ROOT / "data/processed/observations.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            o[(r["measure"], r["cat"], r["place"], int(r["year"]))] = r
    n, bad = 0, []

    def same(key, v):
        nonlocal n
        n += 1
        got = o.get(key)
        g = float(got["value"]) if got and got["value"] else None
        if (g is None) != (v is None) or (g is not None and abs(g - v) > 1e-9):
            bad.append((key, v, g))

    units = {"Two bedroom units": "2br", "One bedroom units": "1br", "Bachelor units": "0br", "Three bedroom units": "3br"}
    for r in rows("34100133"):
        if r["Type of structure"] == "Row and apartment structures of three units and over" and r["DGUID"]:
            k = place(r["DGUID"])
            if k:
                same(("rent", units[r["Type of unit"]], k, int(r["REF_DATE"])), float(r["VALUE"]) if r["VALUE"] else None)
    for r in rows("46100085"):
        if (r["Tenure including first-time homebuyer and social and affordable housing status"] == "Renter" and r["DGUID"]
                and r["Core housing need statistics"] == "Percentage of households in core housing need"):
            same(("core_need", "all", place(r["DGUID"]), int(r["REF_DATE"])), float(r["VALUE"]) if r["VALUE"] else None)
    for r in rows("18100005"):
        if r["Products and product groups"] in ("Rent", "All-items") and r["UOM"] == "2002=100" and r["DGUID"]:
            k = place(r["DGUID"])
            if k in ("can",) or (k or "").startswith("pr-"):
                same(("cpi", "rent" if r["Products and product groups"] == "Rent" else "all", k, int(r["REF_DATE"])),
                     float(r["VALUE"]) if r["VALUE"] else None)
    # Census: renter burden recomputed from counts for Canada, provinces and territories.
    cnt = {}
    for r in rows("98100252"):
        if (r.get("Household total income groups (14)", "").startswith("Total -")
                and r.get("Coordinate", "").split(".")[2:3] == ["1"]
                and r.get("Housing suitability (3)") == "Total - Housing suitability"
                and r.get("Dwelling condition (3)") == "Total - Dwelling condition"
                and r.get("Statistics (3C)") == "Number of private households"):
            k = place(r["DGUID"])
            if k == "can" or (k or "").startswith("pr-"):
                cnt[(k, r["Shelter-cost-to-income ratio (5)"])] = float(r["Tenure (3):Renter[3]"])
    for k in sorted({k for k, _ in cnt}):
        b = cnt[(k, "Spending 30% or more of income on shelter costs")]
        u = cnt[(k, "Spending less than 30% of income on shelter costs")]
        same(("burden", "", k, 2021), 100 * b / (b + u))
    # The Daily comparison: 110 published cells.
    text = (RAW / "census-comparison-2016-2021.csv").read_bytes().decode("utf-8-sig")
    names = {}
    with open(ROOT / "data/processed/places.csv", encoding="utf-8") as f:
        for p in csv.DictReader(f):
            if p["level"] in ("country", "province", "territory", "metro"):
                names.setdefault(p["name"].replace("–", "-"), p["id"])
    started = False
    for r in csv.reader(io.StringIO(text)):
        if len(r) > 6 and r[5].strip() == "2016":
            started = True
            continue
        if started and len(r) > 6 and r[0].strip() not in ("", "Census metropolitan areas"):
            try:
                a, b = float(r[5]), float(r[6])
            except ValueError:
                continue
            g = r[0].split(",")[0].strip().replace("–", "-")
            k = names.get(g)
            if not k:
                bad.append(("unmatched comparison geography", g, None))
                continue
            same(("burden_history", "", k, 2016), a)
            same(("burden_history", "", k, 2021), b)
    print(f"compared {n} cells; {len(bad)} mismatches")
    for x in bad[:20]:
        print("  ", x)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
