//! Renter cost burden: Canadian housing atlas pipeline.
//! Legend: r repository root; p path; t table; g registry; o observations; s source records;
//! k reconciliation rows; d delivered JSON.
mod atlas;
mod cache;
mod census;
mod compute;
mod dataset;
mod generation;
mod geo;
mod history;
mod net;
mod place;
mod sources;
mod statcan;
#[cfg(test)]
mod tests;

use serde_json::{Value, json};
use std::{
    error::Error,
    fs,
    path::{Path, PathBuf},
};

pub type E = Box<dyn Error>;

pub fn read(p: impl AsRef<Path>) -> Result<Value, E> {
    Ok(serde_json::from_slice(&fs::read(p)?)?)
}

/// Write JSON through a temporary file, so a failed run leaves the accepted artifact intact.
pub fn write(p: impl AsRef<Path>, d: &Value) -> Result<(), E> {
    let p = p.as_ref();
    if let Some(d) = p.parent() {
        fs::create_dir_all(d)?;
    }
    let t = p.with_extension("json.pending");
    fs::write(&t, serde_json::to_vec(d)?)?;
    fs::rename(t, p)?;
    Ok(())
}

/// Read every official table from the cache (downloading what is missing) and write the
/// processed places, observations and source records.
fn fetch(r: &Path) -> Result<(), E> {
    let mut g = place::Registry::default();
    let mut o = Vec::new();
    let mut s = Vec::new();
    let open = |id: &str, s: &mut Vec<Value>| -> Result<statcan::Table, E> {
        let t = statcan::Table::open(r, id)?;
        s.push(t.source.clone());
        Ok(t)
    };
    // Census first: its 2021 names and classifications take precedence in the registry.
    o.extend(census::by_group(&mut open("98100252", &mut s)?, &mut g)?);
    let (c, k) = census::communities(&mut open("98100255", &mut s)?, &mut g)?;
    o.extend(c);
    let checks = census::reconcile(&o, &k)?;
    o.extend(sources::rents(&mut open("34100133", &mut s)?, &mut g)?);
    let mut v = [open("34100130", &mut s)?, open("34100131", &mut s)?];
    let (vac, n) = sources::vacancy(&mut v, &mut g)?;
    o.extend(vac);
    o.extend(sources::cpi(&mut open("18100005", &mut s)?, &mut g)?);
    o.extend(sources::income(&mut open("11100190", &mut s)?, &mut g)?);
    o.extend(sources::population(&mut open("17100005", &mut s)?, &mut g)?);
    o.extend(sources::population(&mut open("17100148", &mut s)?, &mut g)?);
    o.extend(sources::starts(&mut open("34100126", &mut s)?, &mut g)?);
    o.extend(sources::chs(&mut open("46100085", &mut s)?, &mut g)?);
    o.extend(sources::chs(&mut open("46100086", &mut s)?, &mut g)?);
    let (h, ho) = history::run(r, &mut g)?;
    s.push(h);
    o.extend(ho);
    // Population is published for both tables' Canada row; keep the first (provincial table).
    let mut seen = std::collections::BTreeSet::new();
    o.retain(|x| x.measure != "population" || seen.insert((x.place.clone(), x.year)));
    let base = r.join("data/processed");
    let stage = generation::Stage::new(&base)?;
    let old = generation::resolve(&base)?;
    copy_tree(&old.join("geo"), &stage.path().join("geo"))?;
    place::save(stage.path(), &g, &mut o)?;
    write(
        stage.path().join("sources.json"),
        &json!({"tables": s, "reconciliation": {"burden_98100252_vs_98100255": checks,
            "vacancy_metro_vs_agglomeration_table_conflicts": n}}),
    )?;
    validate_processed(r, stage.path())?;
    stage.commit(json!({"kind": "official tables"}))?;
    println!(
        "Wrote {} observations for {} places from {} sources",
        o.len(),
        g.len(),
        s.len()
    );
    Ok(())
}

fn copy_tree(from: &Path, to: &Path) -> Result<(), E> {
    fs::create_dir_all(to)?;
    for e in fs::read_dir(from)? {
        let e = e?;
        if e.file_type()?.is_dir() {
            copy_tree(&e.path(), &to.join(e.file_name()))?;
        } else if e.file_type()?.is_file() {
            fs::copy(e.path(), to.join(e.file_name()))?;
        } else {
            return Err("nonregular processed input".into());
        }
    }
    Ok(())
}

fn validate_processed(r: &Path, dir: &Path) -> Result<dataset::Dataset, E> {
    let (p, o) = place::load(dir)?;
    dataset::Dataset::new(
        p,
        o,
        &read(r.join("data/measures.json"))?,
        &read(dir.join("sources.json"))?,
        false,
    )
}

fn main() -> Result<(), E> {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let command = a.first().map(String::as_str).unwrap_or("build");
    if matches!(command, "help" | "--help" | "-h") {
        println!(
            "renter-cost-burden [build | fetch | fetch-geo] [--root PATH]\nDefault root: current directory. build is offline; fetch commands retrieve official inputs."
        );
        return Ok(());
    }
    let r = match a.get(1).map(String::as_str) {
        Some("--root") if a.len() == 3 => PathBuf::from(&a[2]),
        None => std::env::current_dir()?,
        _ => return Err("expected command [--root PATH]".into()),
    };
    let r = r.canonicalize()?;
    let _lease = generation::Lease::acquire(&r.join("data"))?;
    match command {
        "build" => atlas::build(&r),
        "fetch" => fetch(&r).and_then(|_| atlas::build(&r)),
        "fetch-geo" => {
            let base = r.join("data/processed");
            let old = generation::resolve(&base)?;
            let stage = generation::Stage::new(&base)?;
            for n in ["places.csv", "observations.csv", "sources.json"] {
                fs::copy(old.join(n), stage.path().join(n))?;
            }
            geo::run(&r, &stage.path().join("geo"))?;
            validate_processed(&r, stage.path())?;
            stage.commit(json!({"kind": "2021 boundaries"}))?;
            atlas::build(&r)
        }
        s => Err(format!("unknown command: {s}; use --help").into()),
    }
}
