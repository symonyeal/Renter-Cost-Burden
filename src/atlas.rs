//! Offline build: derived series, headline facts and the site's data files.
//! Legend: r repository root; p places; o observations; v value lookup (measure, cat, place,
//! year); c CPI all-items; y year; b base year; pr province code; k place id; d delivered JSON;
//! f facts; q quantile; x/z values.
use crate::{
    E,
    place::{self, Obs, Place},
    read, write,
};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

type V = BTreeMap<(String, String, String, i32), f64>;

fn lookup(o: &[Obs]) -> V {
    o.iter()
        .filter_map(|x| {
            Some((
                (x.measure.clone(), x.cat.clone(), x.place.clone(), x.year),
                x.value?,
            ))
        })
        .collect()
}

fn get(v: &V, m: &str, cat: &str, k: &str, y: i32) -> Option<f64> {
    v.get(&(m.to_owned(), cat.to_owned(), k.to_owned(), y))
        .copied()
}

fn derived(m: &str, cat: &str, k: &str, y: i32, x: f64, src: &str) -> Obs {
    let mut o = Obs::new(m, cat, k, y, Some(x), src);
    o.status = "derived".into();
    o
}

/// Series computed from published values. Nothing is filled where an input is missing.
pub fn derive(p: &[Place], o: &[Obs]) -> Vec<Obs> {
    let v = lookup(o);
    let pr: BTreeMap<&str, &str> = p.iter().map(|x| (x.id.as_str(), x.pr.as_str())).collect();
    let b = o
        .iter()
        .filter(|x| x.measure == "cpi" && x.cat == "all" && x.place == "can" && x.value.is_some())
        .map(|x| x.year)
        .max()
        .unwrap_or(2025);
    let mut d = Vec::new();
    for x in o {
        let Some(z) = x.value else { continue };
        match x.measure.as_str() {
            "rent" => {
                // Deflated with the province's all-items CPI, in base-year dollars.
                let ppr = pr.get(x.place.as_str()).copied().unwrap_or_default();
                let g = format!("pr-{ppr}");
                if let (Some(c0), Some(c1)) = (
                    get(&v, "cpi", "all", &g, x.year),
                    get(&v, "cpi", "all", &g, b),
                ) {
                    d.push(derived(
                        "rent_real",
                        &x.cat,
                        &x.place,
                        x.year,
                        z * c1 / c0,
                        "derived: 34100133 x 18100005",
                    ));
                }
                if let Some(z0) = get(&v, "rent", &x.cat, &x.place, x.year - 1)
                    && z0 > 0.0
                {
                    d.push(derived(
                        "rent_change",
                        &x.cat,
                        &x.place,
                        x.year,
                        100.0 * (z / z0 - 1.0),
                        "derived: 34100133",
                    ));
                }
            }
            "cpi" if x.cat == "rent" => {
                if let Some(c) = get(&v, "cpi", "all", &x.place, x.year) {
                    d.push(derived(
                        "rent_relative",
                        "",
                        &x.place,
                        x.year,
                        100.0 * z / c,
                        "derived: 18100005",
                    ));
                }
                if let Some(z0) = get(&v, "cpi", "rent", &x.place, x.year - 1) {
                    d.push(derived(
                        "rent_inflation",
                        "",
                        &x.place,
                        x.year,
                        100.0 * (z / z0 - 1.0),
                        "derived: 18100005",
                    ));
                }
            }
            "starts" if x.cat == "total" => {
                if let Some(n) = get(&v, "population", "", &x.place, x.year)
                    && n > 0.0
                {
                    d.push(derived(
                        "starts_per_1000",
                        "",
                        &x.place,
                        x.year,
                        1000.0 * z / n,
                        "derived: 34100126 / 17100005",
                    ));
                }
                if let Some(a) = get(&v, "starts", "apartment", &x.place, x.year)
                    && z > 0.0
                {
                    d.push(derived(
                        "apartment_share",
                        "",
                        &x.place,
                        x.year,
                        100.0 * a / z,
                        "derived: 34100126",
                    ));
                }
            }
            _ => {}
        }
    }
    d
}

fn median(mut z: Vec<f64>) -> Option<f64> {
    if z.is_empty() {
        return None;
    }
    z.sort_by(f64::total_cmp);
    let n = z.len();
    Some(if n % 2 == 1 {
        z[n / 2]
    } else {
        (z[n / 2 - 1] + z[n / 2]) / 2.0
    })
}

fn last_year(v: &V, m: &str, cat: &str, k: &str) -> Option<i32> {
    v.keys()
        .filter(|x| x.0 == m && x.1 == cat && x.2 == k)
        .map(|x| x.3)
        .max()
}

/// Headline numbers for the lead, computed here so the page never hand-types a figure.
pub fn facts(p: &[Place], o: &[Obs]) -> Value {
    let v = lookup(o);
    let mut f = Map::new();
    let lvl: BTreeMap<&str, &str> = p
        .iter()
        .map(|x| (x.id.as_str(), x.level.as_str()))
        .collect();
    let name: BTreeMap<&str, &str> = p.iter().map(|x| (x.id.as_str(), x.name.as_str())).collect();
    if let Some(y1) = last_year(&v, "cpi", "rent", "can") {
        let y0 = 2000;
        if let (Some(r0), Some(r1), Some(a0), Some(a1)) = (
            get(&v, "cpi", "rent", "can", y0),
            get(&v, "cpi", "rent", "can", y1),
            get(&v, "cpi", "all", "can", y0),
            get(&v, "cpi", "all", "can", y1),
        ) {
            f.insert(
                "cpi_rent".into(),
                json!({"from": y0, "to": y1,
                "rent_pct": 100.0 * (r1 / r0 - 1.0), "all_pct": 100.0 * (a1 / a0 - 1.0)}),
            );
        }
    }
    // Real two-bedroom rent change in the typical metro area, same areas in both years.
    let metros: Vec<&str> = p
        .iter()
        .filter(|x| x.level == "metro")
        .map(|x| x.id.as_str())
        .collect();
    if let Some(y1) = v
        .keys()
        .filter(|x| x.0 == "rent_real" && x.1 == "2br")
        .map(|x| x.3)
        .max()
    {
        let y0 = y1 - 10;
        let z: Vec<f64> = metros
            .iter()
            .filter_map(|k| {
                Some(
                    100.0
                        * (get(&v, "rent_real", "2br", k, y1)?
                            / get(&v, "rent_real", "2br", k, y0)?
                            - 1.0),
                )
            })
            .collect();
        let n = z.len();
        if let Some(q) = median(z) {
            f.insert(
                "metro_real_rent".into(),
                json!({"from": y0, "to": y1, "median_pct": q, "areas": n}),
            );
        }
        let top = metros
            .iter()
            .filter_map(|k| Some((get(&v, "rent", "2br", k, y1)?, *k)))
            .max_by(|a, b| a.0.total_cmp(&b.0));
        if let Some((x, k)) = top {
            f.insert(
                "top_rent".into(),
                json!({"year": y1, "place": k, "name": name[k], "rent": x}),
            );
        }
    }
    if let (Some(a), Some(b)) = (
        get(&v, "burden_history", "", "can", 2016),
        get(&v, "burden_history", "", "can", 2021),
    ) {
        f.insert("burden".into(), json!({"2016": a, "2021": b}));
    }
    let cn: Vec<(i32, f64)> = v
        .iter()
        .filter(|x| x.0.0 == "core_need" && x.0.1 == "all" && x.0.2 == "can")
        .map(|x| (x.0.3, *x.1))
        .collect();
    if let (Some(a), Some(b)) = (cn.first(), cn.last()) {
        f.insert(
            "core_need".into(),
            json!({"from": a.0, "to": b.0, "from_pct": a.1, "to_pct": b.1}),
        );
    }
    let vac: Vec<(i32, f64)> = v
        .iter()
        .filter(|x| x.0.0 == "vacancy" && x.0.2 == "agg-cma")
        .map(|x| (x.0.3, *x.1))
        .collect();
    if let Some(l) = vac.last() {
        let lo = vac
            .iter()
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .copied()
            .unwrap_or(*l);
        f.insert(
            "vacancy".into(),
            json!({"year": l.0, "pct": l.1, "low_year": lo.0, "low_pct": lo.1}),
        );
    }
    // Communities with at least 5,000 renter households: rounding cannot drive the rank, and
    // student enclaves (Metro Vancouver A, the UBC lands, 63%) do not stand for a city.
    let top = v
        .iter()
        .filter(|x| x.0.0 == "burden" && lvl.get(x.0.2.as_str()) == Some(&"community"))
        .filter(|x| get(&v, "renter_households", "", &x.0.2, 2021).is_some_and(|n| n >= 5000.0))
        .max_by(|a, b| a.1.total_cmp(b.1));
    if let Some((k, x)) = top {
        f.insert(
            "top_community".into(),
            json!({"place": k.2, "name": name[k.2.as_str()], "pct": x}),
        );
    }
    Value::Object(f)
}

fn round(x: f64) -> Value {
    json!((x * 100.0).round() / 100.0)
}

/// `series[measure][cat][place]` = rows `[year, value]`, or `[year, value, lower, upper, status]`
/// when an interval or a flag exists.
fn series(o: &[Obs], keep: impl Fn(&str) -> bool) -> Value {
    let mut s: BTreeMap<&str, BTreeMap<&str, BTreeMap<&str, Vec<Value>>>> = BTreeMap::new();
    for x in o.iter().filter(|x| keep(&x.place)) {
        let mut row = vec![json!(x.year), x.value.map_or(Value::Null, round)];
        let flag =
            !x.status.is_empty() && x.status != "derived" && x.status != "published to one decimal";
        if x.lower.is_some() || x.upper.is_some() || flag {
            row.push(x.lower.map_or(Value::Null, round));
            row.push(x.upper.map_or(Value::Null, round));
            row.push(json!(if flag { x.status.as_str() } else { "" }));
        }
        s.entry(&x.measure)
            .or_default()
            .entry(&x.cat)
            .or_default()
            .entry(&x.place)
            .or_default()
            .push(Value::Array(row));
    }
    serde_json::to_value(s).unwrap_or_default()
}

pub fn build(r: &Path) -> Result<(), E> {
    let (p, mut o) = place::load(r)?;
    let meta = read(r.join("data/measures.json"))?;
    let src = read(r.join("data/processed/sources.json"))?;
    o.extend(derive(&p, &o));
    o.sort_by_key(Obs::key);
    let ids: BTreeSet<&str> = p.iter().map(|x| x.id.as_str()).collect();
    let used: BTreeSet<&str> = o.iter().map(|x| x.measure.as_str()).collect();
    let mut measures = Vec::new();
    for m in meta["measures"]
        .as_array()
        .ok_or("measures.json has no measures")?
    {
        let id = m["id"].as_str().ok_or("measure without id")?;
        if !used.contains(id) {
            return Err(format!("measures.json describes {id}, which has no observations").into());
        }
        let mut m = m.clone();
        let rows: Vec<&Obs> = o.iter().filter(|x| x.measure == id).collect();
        let years: BTreeSet<i32> = rows.iter().map(|x| x.year).collect();
        let levels: BTreeSet<&str> = rows
            .iter()
            .filter_map(|x| p.iter().find(|q| q.id == x.place).map(|q| q.level.as_str()))
            .collect();
        m["years"] = json!(years);
        m["levels"] = json!(levels);
        measures.push(m);
    }
    for m in &used {
        if !measures.iter().any(|x| x["id"] == *m) {
            return Err(format!("measure {m} has no entry in data/measures.json").into());
        }
    }
    for x in &o {
        if !ids.contains(x.place.as_str()) {
            return Err(format!("observation for unknown place {}", x.place).into());
        }
    }
    let local = |k: &str| k.starts_with("csd-") || k.starts_with("cd-");
    let places = |f: &dyn Fn(&str) -> bool| -> Value {
        p.iter()
            .filter(|x| f(&x.id))
            .map(|x| json!([x.id, x.name, x.level, x.pr, place::region(&x.pr)]))
            .collect()
    };
    let out = r.join("site/data");
    fs::create_dir_all(out.join("geo"))?;
    let atlas = json!({"schema": 2, "measures": measures, "places": places(&|k| !local(k)),
        "series": series(&o, |k| !local(k)), "facts": facts(&p, &o), "sources": src["tables"],
        "reconciliation": src["reconciliation"], "regions": meta["regions"]});
    write(out.join("atlas.json"), &atlas)?;
    write(
        out.join("local.json"),
        &json!({"places": places(&local), "series": series(&o, local)}),
    )?;
    let mut h = Map::new();
    let gdir = r.join("data/processed/geo");
    let mut files: Vec<_> = fs::read_dir(&gdir)?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .collect();
    files.sort();
    for f in files {
        let n = f
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or("bad geo file name")?
            .to_owned();
        if n.ends_with(".json") {
            fs::copy(&f, out.join("geo").join(&n))?;
        }
    }
    for n in ["places.csv", "observations.csv"] {
        fs::copy(r.join("data/processed").join(n), out.join(n))?;
    }
    for n in ["atlas.json", "local.json", "places.csv", "observations.csv"] {
        h.insert(
            n.into(),
            json!(format!("{:x}", Sha256::digest(fs::read(out.join(n))?))),
        );
    }
    write(
        out.join("manifest.json"),
        &json!({"sha256": h, "command": "cargo run --release --locked -- build"}),
    )?;
    println!(
        "Built site/data: {} observations ({} derived), {} places",
        o.len(),
        o.iter().filter(|x| x.status == "derived").count(),
        p.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pl(id: &str, pr: &str, level: &str) -> Place {
        serde_json::from_value(json!({"id": id, "name": id, "level": level, "pr": pr})).unwrap()
    }
    #[test]
    fn real_rent_uses_the_province_cpi_and_never_fills_gaps() {
        let p = [
            pl("m-1", "35", "metro"),
            pl("pr-35", "35", "province"),
            pl("can", "", "country"),
        ];
        let o = vec![
            Obs::new("cpi", "all", "can", 2025, Some(100.0), "t"),
            Obs::new("cpi", "all", "pr-35", 2024, Some(80.0), "t"),
            Obs::new("cpi", "all", "pr-35", 2025, Some(100.0), "t"),
            Obs::new("rent", "2br", "m-1", 2023, Some(900.0), "t"),
            Obs::new("rent", "2br", "m-1", 2024, Some(1000.0), "t"),
            Obs::new("rent", "2br", "m-1", 2025, Some(1100.0), "t"),
        ];
        let d = derive(&p, &o);
        let real: Vec<_> = d
            .iter()
            .filter(|x| x.measure == "rent_real")
            .map(|x| (x.year, x.value.unwrap()))
            .collect();
        // 2023 has no provincial CPI: no real value rather than a borrowed one.
        assert_eq!(real, vec![(2024, 1250.0), (2025, 1100.0)]);
        let ch: Vec<_> = d
            .iter()
            .filter(|x| x.measure == "rent_change")
            .map(|x| x.year)
            .collect();
        assert_eq!(ch, vec![2024, 2025]);
    }
    #[test]
    fn median_even_and_odd() {
        assert_eq!(median(vec![3.0, 1.0, 2.0]), Some(2.0));
        assert_eq!(median(vec![4.0, 1.0, 2.0, 3.0]), Some(2.5));
        assert_eq!(median(vec![]), None);
    }
}
