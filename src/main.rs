//! Renter cost burden: Canadian housing atlas pipeline.
//! Legend: r repository root; p path; t table; g registry; o observations; s source records;
//! k reconciliation rows; d delivered JSON.
mod atlas;
mod census;
mod geo;
mod history;
mod net;
mod place;
mod sources;
mod statcan;

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
    let mut checks = Vec::new();
    for x in &k {
        let y = o
            .iter()
            .find(|y| y.measure == "burden" && y.cat.is_empty() && y.place == x.place);
        let (a, b) = (x.value, y.and_then(|y| y.value));
        let n = o
            .iter()
            .find(|y| y.measure == "renter_households" && y.place == x.place)
            .and_then(|y| y.value)
            .unwrap_or(1.0);
        // Same 25% sample, tabulated and rounded separately: the rates may differ by what
        // ten households of rounding move (Yukon: 24.89% vs 24.95% of about 5,500 renters).
        if let (Some(a), Some(b)) = (a, b)
            && (a - b).abs() > 1000.0 / n
        {
            return Err(format!(
                "98-10-0252 and 98-10-0255 disagree for {}: {b} vs {a}",
                x.place
            )
            .into());
        }
        checks.push(json!({"place": x.place, "98100252": b, "98100255": a}));
    }
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
    fs::create_dir_all(r.join("data/processed"))?;
    place::save(r, &g, &mut o)?;
    write(
        r.join("data/processed/sources.json"),
        &json!({"tables": s, "reconciliation": {"burden_98100252_vs_98100255": checks,
            "vacancy_metro_vs_agglomeration_table_conflicts": n}}),
    )?;
    println!(
        "Wrote {} observations for {} places from {} sources",
        o.len(),
        g.m.len(),
        s.len()
    );
    Ok(())
}

fn main() -> Result<(), E> {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let r = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    match a.first().map(String::as_str).unwrap_or("build") {
        "build" => atlas::build(&r),
        "fetch" => fetch(&r).and_then(|_| atlas::build(&r)),
        "fetch-geo" => geo::run(&r).and_then(|_| atlas::build(&r)),
        "help" | "--help" | "-h" => {
            println!(
                "renter-cost-burden [build | fetch | fetch-geo]\n\
                build: offline; derived series and site data from data/processed\n\
                fetch: read official tables (cached in data/raw, downloaded when missing), then build\n\
                fetch-geo: retrieve 2021 boundaries from Statistics Canada, then build"
            );
            Ok(())
        }
        s => Err(format!("unknown command: {s}; use --help").into()),
    }
}
