//! Offline export. Only a validated complete generation becomes visible.
//! Legend: r runtime root; p places; o observations; row wire cell with provenance.
use crate::{
    E, compute,
    dataset::Dataset,
    generation,
    place::{self, Obs},
    read, write,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

fn round(x: f64) -> Value {
    json!((x * 100.0).round() / 100.0)
}

/// Schema 3 rows always have eight fields, with explicit null intervals and lineage.
fn series(o: &[Obs], keep: impl Fn(&str) -> bool) -> Value {
    let mut s: BTreeMap<&str, BTreeMap<&str, BTreeMap<&str, Vec<Value>>>> = BTreeMap::new();
    for x in o.iter().filter(|x| keep(&x.place)) {
        s.entry(&x.measure)
            .or_default()
            .entry(&x.cat)
            .or_default()
            .entry(&x.place)
            .or_default()
            .push(json!([
                x.year,
                x.value.map(round),
                x.lower.map(round),
                x.upper.map(round),
                x.status,
                x.source,
                x.vintage,
                x.lineage
            ]));
    }
    serde_json::to_value(s).expect("finite observations serialize")
}

fn code_hash() -> String {
    let mut h = Sha256::new();
    for s in [
        include_str!("atlas.rs"),
        include_str!("main.rs"),
        include_str!("compute.rs"),
        include_str!("dataset.rs"),
        include_str!("place.rs"),
        include_str!("generation.rs"),
        include_str!("sources.rs"),
        include_str!("statcan.rs"),
        include_str!("census.rs"),
        include_str!("history.rs"),
        include_str!("geo.rs"),
        include_str!("cache.rs"),
        include_str!("net.rs"),
        include_str!("../Cargo.toml"),
        include_str!("../Cargo.lock"),
    ] {
        h.update((s.len() as u64).to_le_bytes());
        h.update(s);
    }
    format!("{:x}", h.finalize())
}

fn processed_hashes(dir: &Path) -> Result<BTreeMap<String, String>, E> {
    let mut h = BTreeMap::new();
    for n in ["places.csv", "observations.csv", "sources.json"] {
        h.insert(
            n.to_owned(),
            format!("{:x}", Sha256::digest(fs::read(dir.join(n))?)),
        );
    }
    for (n, digest) in generation::hashes(&dir.join("geo"))? {
        h.insert(format!("geo/{n}"), digest);
    }
    Ok(h)
}

pub fn build(r: &Path) -> Result<(), E> {
    let dir = generation::resolve(&r.join("data/processed"))?;
    let meta = read(r.join("data/measures.json"))?;
    let src = read(dir.join("sources.json"))?;
    let provinces = read(r.join("site/provinces.json"))?;
    if provinces != serde_json::to_value(&*place::PROVINCES)? {
        return Err("province metadata differs from this executable".into());
    }
    let d = crate::validate_processed(r, &dir)?;
    let mut o = d.observations;
    let facts = compute::enrich(&d.places, &mut o);
    let d = Dataset::new(d.places, o, &meta, &src, true)?;
    let (p, o) = (&d.places, &d.observations);
    let places_by_id: BTreeMap<_, _> = p.iter().map(|x| (x.id.as_str(), x)).collect();
    let mut measures = Vec::new();
    for m in &d.measures {
        let rows: Vec<_> = o.iter().filter(|x| x.measure == m.id).collect();
        let years: BTreeSet<_> = rows.iter().map(|x| x.year).collect();
        let levels: BTreeSet<_> = rows
            .iter()
            .map(|x| places_by_id[x.place.as_str()].level.as_str())
            .collect();
        let mut m = serde_json::to_value(m)?;
        m["years"] = json!(years);
        m["levels"] = json!(levels);
        measures.push(m);
    }
    let local = |k: &str| k.starts_with("csd-") || k.starts_with("cd-");
    let places = |f: &dyn Fn(&str) -> bool| -> Value {
        p.iter()
            .filter(|x| f(&x.id))
            .map(|x| json!([x.id, x.name, x.level, x.pr, place::region(&x.pr)]))
            .collect()
    };
    let stage = generation::Stage::new(&r.join("site/data"))?;
    let out = stage.path();
    write(
        out.join("atlas.json"),
        &json!({"schema":3,"measures":measures,"places":places(&|k| !local(k)),
        "series":series(o, |k| !local(k)),"facts":facts,"sources":src["tables"],
        "reconciliation":src["reconciliation"],"regions":meta["regions"]}),
    )?;
    write(
        out.join("local.json"),
        &json!({"schema":3,"places":places(&local),"series":series(o,local)}),
    )?;
    write(out.join("provinces.json"), &provinces)?;
    crate::copy_tree(&dir.join("geo"), &out.join("geo"))?;
    fs::copy(dir.join("places.csv"), out.join("places.csv"))?;
    let mut csv = csv::Writer::from_path(out.join("observations.csv"))?;
    for x in o {
        csv.serialize(x)?;
    }
    csv.flush()?;
    let mut lineage = csv::Writer::from_path(out.join("lineage.csv"))?;
    lineage.write_record(["measure", "cat", "place", "year", "lineage"])?;
    for x in o.iter().filter(|x| x.lineage.is_some()) {
        lineage.write_record([
            &x.measure,
            &x.cat,
            &x.place,
            &x.year.to_string(),
            &serde_json::to_string(&x.lineage)?,
        ])?;
    }
    lineage.flush()?;
    drop(csv);
    drop(lineage);
    let accepted = stage.commit(json!({"processed":processed_hashes(&dir)?,
        "measures":format!("{:x}",Sha256::digest(fs::read(r.join("data/measures.json"))?)),
        "provinces":format!("{:x}",Sha256::digest(fs::read(r.join("site/provinces.json"))?)),"code":code_hash()}))?;
    println!(
        "Built {}: {} observations ({} derived), {} places",
        accepted.display(),
        o.len(),
        o.iter().filter(|x| x.lineage.is_some()).count(),
        p.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_offline_input_leaves_accepted_export_unchanged() {
        let base = std::env::var_os("RENTER_TEST_ROOT")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| "target/atlas-tests".into());
        let root = generation::Stage::new(&base).unwrap();
        let r = root.path();
        let dir = r.join("data/processed");
        fs::create_dir_all(dir.join("geo")).unwrap();
        fs::write(dir.join("geo/fixture.json"), "{}").unwrap();
        fs::create_dir_all(r.join("site")).unwrap();
        write(
            r.join("site/provinces.json"),
            &serde_json::to_value(&*place::PROVINCES).unwrap(),
        )
        .unwrap();
        let mut meta: Value = serde_json::from_str(include_str!("../data/measures.json")).unwrap();
        meta["measures"] = json!([meta["measures"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["id"] == "vacancy")
            .unwrap()]);
        write(r.join("data/measures.json"), &meta).unwrap();
        write(
            dir.join("sources.json"),
            &json!({"tables":[{"id":"survey"}]}),
        )
        .unwrap();
        fs::write(
            dir.join("places.csv"),
            "id,name,level,pr\npr-35,Ontario,province,35\n",
        )
        .unwrap();
        let header = "measure,cat,place,year,value,lower,upper,status,source,vintage\n";
        let valid = "vacancy,,pr-35,2025,3,,,,survey,2021\n";
        fs::write(dir.join("observations.csv"), format!("{header}{valid}")).unwrap();
        build(r).unwrap();
        let pointer = fs::read(r.join("site/data/manifest.json")).unwrap();
        let accepted = generation::resolve(&r.join("site/data")).unwrap();
        for bad in [
            format!("{valid}vacancy,,pr-35,2025,4,,,,survey,2021\n"),
            "vacancy,,pr-35,2025,-5,,,,survey,2021\n".into(),
            "vacancy,,pr-35,2025,NaN,,,,survey,2021\n".into(),
        ] {
            fs::write(dir.join("observations.csv"), format!("{header}{bad}")).unwrap();
            assert!(build(r).is_err());
            assert_eq!(
                fs::read(r.join("site/data/manifest.json")).unwrap(),
                pointer
            );
            assert_eq!(generation::resolve(&r.join("site/data")).unwrap(), accepted);
        }
        fs::write(dir.join("observations.csv"), format!("{header}{valid}")).unwrap();
        meta["measures"] = json!([{"id":"vacancy"}]);
        write(r.join("data/measures.json"), &meta).unwrap();
        assert!(build(r).is_err());
        assert_eq!(
            fs::read(r.join("site/data/manifest.json")).unwrap(),
            pointer
        );
    }
}
