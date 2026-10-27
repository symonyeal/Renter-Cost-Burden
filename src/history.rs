//! Census 2016 and 2021 renter burden on common 2021 boundaries (The Daily, 2022-09-21, table 4).
//! Legend: b source bytes; h source row; g geography; y year; v published percent;
//! r registry; k place id; p cache path.
//!
//! Kept apart from the detailed 2021 counts: the release is earlier and published to one
//! decimal, so its 2021 values can differ from a count reconstruction. Never spliced.
use crate::{
    E, net,
    place::{Obs, PROVINCES, Registry},
};
use chrono::Utc;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, path::Path};

pub const ID: &str = "census-comparison-2016-2021";
const URL: &str = "https://www150.statcan.gc.ca/n1/daily-quotidien/220921/t004b-eng.csv";

/// (geography, is metro section, 2016 value, 2021 value) rows of the renter columns.
fn parse(b: &[u8]) -> Result<Vec<(String, bool, f64, f64)>, E> {
    let text = std::str::from_utf8(b)?.trim_start_matches('\u{feff}');
    let mut c = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(text.as_bytes());
    let (mut header, mut years, mut metros) = (false, false, false);
    let mut d = Vec::new();
    let mut seen = BTreeSet::new();
    for h in c.records() {
        let h = h?;
        if h.get(5).is_some_and(|s| s.contains("Renter households")) {
            header = true;
            continue;
        }
        if header && !years && h.get(5).is_some_and(|s| s.trim() == "2016") {
            if h.get(6).is_none_or(|s| s.trim() != "2021") {
                return Err("unexpected comparison year columns".into());
            }
            years = true;
            continue;
        }
        let g = h.get(0).unwrap_or_default().trim();
        if g == "Census metropolitan areas" {
            metros = true;
            continue;
        }
        if !years || h.len() < 7 || h[5].parse::<f64>().is_err() {
            continue;
        }
        let (a, b): (f64, f64) = (h[5].parse()?, h[6].parse()?);
        for v in [a, b] {
            if !(0.0..=100.0).contains(&v) {
                return Err(format!("comparison value outside 0-100: {g}").into());
            }
        }
        if !seen.insert(g.to_owned()) {
            return Err(format!("duplicate comparison geography {g}").into());
        }
        d.push((g.to_owned(), metros, a, b));
    }
    if !header || !years || !d.iter().any(|x| x.0 == "Canada") {
        return Err("Census comparison headers or national row missing".into());
    }
    if d.iter().filter(|x| !x.1).count() != 14 {
        return Err("comparison needs Canada and 13 provinces/territories".into());
    }
    Ok(d)
}

/// Observations keyed to registered places. Metros match the 2021 Census table by name and
/// must all resolve; run after the Census adapters.
pub fn run(root: &Path, r: &mut Registry) -> Result<(Value, Vec<Obs>), E> {
    let dir = root.join("data/raw/canada");
    let p = dir.join(format!("{ID}.csv"));
    let stamp = dir.join(format!("{ID}.retrieval.json"));
    if !p.exists() {
        let b = net::bytes(URL, 120)?;
        parse(&b)?;
        fs::create_dir_all(&dir)?;
        fs::write(&p, &b)?;
        crate::write(
            &stamp,
            &json!({"retrieved": Utc::now().to_rfc3339(), "basis": "download completed"}),
        )?;
    }
    let b = fs::read(&p)?;
    let mut o = Vec::new();
    for (g, metro, a, b2) in parse(&b)? {
        let k = if g == "Canada" {
            "can".to_owned()
        } else if !metro {
            let pr = PROVINCES
                .iter()
                .find(|x| x.1 == g)
                .ok_or_else(|| format!("unknown province {g}"))?
                .0;
            format!("pr-{pr}")
        } else {
            r.find(&g, &["metro", "agglomeration"])
                .ok_or_else(|| format!("comparison metro {g} matches no 2021 Census place"))?
        };
        for (y, v) in [(2016, a), (2021, b2)] {
            let mut x = Obs::new("burden_history", "", &k, y, Some(v), ID);
            x.status = "published to one decimal".into();
            x.vintage = "2021".into();
            o.push(x);
        }
    }
    let t = crate::read(&stamp)?;
    let source = json!({"id": ID, "title": "Percent of households spending 30% or more of income on shelter cost by tenure, 2016 and 2021 (The Daily, table 4)",
        "url": "https://www150.statcan.gc.ca/n1/daily-quotidien/220921/t004b-eng.htm",
        "download": URL, "retrieved": t["retrieved"], "retrieved_basis": t["basis"],
        "sha256": format!("{:x}", Sha256::digest(&b)), "bytes": b.len()});
    Ok((source, o))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_missing_and_swapped_year_headers() {
        assert!(parse(b"fixture,1,2,3,4,5,6\n").is_err());
        assert!(parse(b",,,,,Renter households,\n,,,,,2021,2016\n").is_err());
    }
}
