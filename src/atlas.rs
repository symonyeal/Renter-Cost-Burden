//! Offline export: metadata validation and the site's JSON, CSV and geometry files.
//! Legend: r repository root; p places; o observations; m measure metadata; k place id;
//! h output hashes; row compact observation [year, value, lower, upper, status].
use crate::{
    E, compute,
    place::{self, Obs},
    read, write,
};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

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
    let facts = compute::enrich(&p, &mut o);
    let places_by_id: BTreeMap<_, _> = p.iter().map(|x| (x.id.as_str(), x)).collect();
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
            .filter_map(|x| places_by_id.get(x.place.as_str()).map(|q| q.level.as_str()))
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
        if !places_by_id.contains_key(x.place.as_str()) {
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
        "series": series(&o, |k| !local(k)), "facts": facts, "sources": src["tables"],
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
