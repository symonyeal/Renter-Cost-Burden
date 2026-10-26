//! Published Census comparison, kept apart from the detailed 2021 count reconstruction.
//! Legend: r repository; b source bytes; h source row; g geography; y year;
//! v published percent; d observations; p cache path; i CSV column index.
use crate::E;
use chrono::Utc;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, path::Path, time::Duration};

const ID: &str = "census-comparison-2016-2021";
const URL: &str = "https://www150.statcan.gc.ca/n1/daily-quotidien/220921/t004b-eng.csv";

fn parse(b: &[u8]) -> Result<Vec<Value>, E> {
    let text = std::str::from_utf8(b)?.trim_start_matches('\u{feff}');
    let mut csv = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(text.as_bytes());
    let mut header = false;
    let mut years = false;
    let mut metros = false;
    let mut d = Vec::new();
    let mut keys = BTreeSet::new();
    for h in csv.records() {
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
        if !years || h.len() < 7 || h.get(5).unwrap_or_default().parse::<f64>().is_err() {
            continue;
        }
        let level = if g == "Canada" {
            "country"
        } else if metros {
            "metro"
        } else if matches!(g, "Yukon" | "Northwest Territories" | "Nunavut") {
            "territory"
        } else {
            "province"
        };
        // IDs are explicitly scoped to this common-boundary publication. They do not
        // pretend that a name-only match harmonizes a different source's geography.
        let id = format!("{ID}:{g}");
        for (i, y) in [(5, 2016), (6, 2021)] {
            let v: f64 = h[i].parse()?;
            if !v.is_finite() || !(0.0..=100.0).contains(&v) || !keys.insert((g.to_owned(), y)) {
                return Err(format!("invalid/duplicate comparison value {g}/{y}").into());
            }
            d.push(json!({"geo":g,"geo_id":id,"level":level,"year":y,
                "measure":"burden_history","value":v,"lower":null,"upper":null,
                "status":"published to one decimal","source":ID,
                "geography_vintage":2021,"income_year":y-1}));
        }
    }
    if !header || !years || !d.iter().any(|o| o["geo"] == "Canada") {
        return Err("Census comparison headers or national observations missing".into());
    }
    let pt = d
        .iter()
        .filter(|o| o["year"] == 2016 && o["level"] != "metro")
        .count();
    if pt != 14 {
        return Err(
            format!("comparison needs national + 13 provinces/territories; got {pt}").into(),
        );
    }
    Ok(d)
}

pub fn run(r: &Path) -> Result<(Value, Vec<Value>), E> {
    let dir = r.join("data/raw/canada");
    fs::create_dir_all(&dir)?;
    let p = dir.join(format!("{ID}.csv"));
    let stamp = dir.join(format!("{ID}.retrieval.json"));
    if !p.exists() {
        let b = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(90))
            .build()?
            .get(URL)
            .send()?
            .error_for_status()?
            .bytes()?;
        parse(&b)?;
        fs::write(&p, &b)?;
        crate::write(
            &stamp,
            &json!({"retrieved":Utc::now().to_rfc3339(),"timestamp_basis":"download completed"}),
        )?;
    }
    let b = fs::read(&p)?;
    let d = parse(&b)?;
    let time = crate::read(&stamp)?;
    let source = json!({"id":ID,"title":"Census renter burden, 2016 and 2021 (common 2021 boundaries)",
        "url":"https://www150.statcan.gc.ca/n1/daily-quotidien/220921/t004b-eng.htm",
        "download_url":URL,"format":"CSV (UTF-8 with BOM)","cache":format!("{ID}.csv"),
        "retrieved":time["retrieved"],"timestamp_basis":time["timestamp_basis"],
        "sha256":format!("{:x}",Sha256::digest(&b)),"bytes":b.len(),"release_date":"2022-09-21"});
    Ok((source, d))
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
