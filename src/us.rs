//! US descriptive analysis from the registered ACS sample, METHODS.md definitions.
//! Legend: a ACS row; c configuration; d output; f county FIPS; y year; n burden
//! numerator; z eligible denominator; p proportion; mn/md numerator/denominator
//! margins; b burden percent; m 90% margin; r rent; i income; x CPI multiplier;
//! h CSV headers; k field name; q pooled annual counts; e error.
use crate::{E, read};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

type Row = BTreeMap<String, String>;

fn rows(p: &Path) -> Result<Vec<Row>, E> {
    let mut d = csv::Reader::from_path(p)?;
    let h = d.headers()?.clone();
    d.records()
        .map(|a| {
            let a = a?;
            Ok(h.iter()
                .zip(a.iter())
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect())
        })
        .collect()
}

fn num(a: &Row, k: &str) -> Result<f64, E> {
    let x: f64 = a
        .get(k)
        .ok_or_else(|| format!("missing field {k}"))?
        .parse()?;
    if !x.is_finite() {
        return Err(format!("nonfinite {k}").into());
    }
    Ok(x)
}

fn sq(x: f64) -> f64 {
    x * x
}

fn burden(n: f64, z: f64, mn: f64, md: f64) -> Result<(f64, f64), E> {
    if z <= 0.0 || n < 0.0 || n > z {
        return Err("invalid burden counts".into());
    }
    let p = n / z;
    let e = sq(mn) - sq(p) * sq(md);
    let e = if e < 0.0 { sq(mn) + sq(p) * sq(md) } else { e };
    Ok((100.0 * n / z, 100.0 * e.sqrt() / z))
}

fn calc(a: &Row) -> Result<(f64, f64, f64, f64), E> {
    let n = [7, 8, 9, 10]
        .into_iter()
        .map(|k| num(a, &format!("B25070_{k:03}")))
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .sum();
    let z = num(a, "B25070_001")? - num(a, "B25070_011")?;
    let mn = [7, 8, 9, 10]
        .into_iter()
        .map(|k| num(a, &format!("B25070_MOE{k:03}")).map(sq))
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .sum::<f64>()
        .sqrt();
    let md = (sq(num(a, "B25070_MOE001")?) + sq(num(a, "B25070_MOE011")?)).sqrt();
    let (b, m) = burden(n, z, mn, md)?;
    Ok((n, z, b, m))
}

fn obs(a: &Row, y: i32, k: &str, v: Option<f64>, m: Option<f64>) -> Value {
    let mut d = json!({"geo":a["name"], "geo_id":a["fips"], "level":"county",
        "year":y,"measure":k,"value":v,"status":if v.is_some(){"published"}else{"missing"},
        "source":"acs"});
    if let (Some(v), Some(m)) = (v, m) {
        d["margin"] = json!(m);
        d["lower"] = json!((v - m).max(0.0));
        d["upper"] = json!((v + m).min(100.0));
        d["interval"] = json!("90% approximate ACS sampling interval");
    }
    d
}

pub fn run(r: &Path, c: &Value) -> Result<Value, E> {
    let a = rows(&r.join("data/processed/acs.csv"))?;
    if a.is_empty() {
        return Err("empty US sample".into());
    }
    let cpi: BTreeMap<i32, f64> = rows(&r.join("data/processed/cpi.csv"))?
        .iter()
        .map(|a| Ok((a["year"].parse()?, num(a, "mean")?)))
        .collect::<Result<_, E>>()?;
    let y0 = c["base_year"].as_i64().ok_or("missing base year")? as i32;
    let base = *cpi.get(&y0).ok_or("missing base CPI")?;
    let mut d = Vec::new();
    let mut keys = BTreeSet::new();
    let mut q: BTreeMap<i32, Vec<&Row>> = BTreeMap::new();
    for a in &a {
        let y: i32 = a["year"].parse()?;
        let f = &a["fips"];
        if f.len() != 5 || !f.bytes().all(|x| x.is_ascii_digit()) || y == 2020 {
            return Err(format!("invalid US county/year {f}/{y}").into());
        }
        if !keys.insert((f.clone(), y)) {
            return Err("duplicate US county/year".into());
        }
        let (_, _, b, m) = calc(a)?;
        let x = base / cpi.get(&y).ok_or("missing reference CPI")?;
        d.push(obs(a, y, "burden", Some(b), Some(m)));
        for (k, src) in [("rent", "rent"), ("income", "income")] {
            let v = a[src]
                .parse::<f64>()
                .ok()
                .filter(|v| v.is_finite() && *v >= 0.0)
                .map(|v| v * x);
            d.push(obs(a, y, k, v, None));
        }
        q.entry(y).or_default().push(a);
    }
    let mut pooled = Vec::new();
    for (y, aa) in q {
        let n = aa
            .iter()
            .map(|a| num(a, "burden_numerator"))
            .collect::<Result<Vec<_>, _>>()?
            .iter()
            .sum();
        let z = aa
            .iter()
            .map(|a| num(a, "burden_denominator"))
            .collect::<Result<Vec<_>, _>>()?
            .iter()
            .sum();
        let mut mm = BTreeMap::new();
        for k in [1, 7, 8, 9, 10, 11] {
            let m = aa
                .iter()
                .map(|a| num(a, &format!("B25070_MOE{k:03}")).map(sq))
                .collect::<Result<Vec<_>, _>>()?
                .iter()
                .sum::<f64>()
                .sqrt();
            mm.insert(k, m);
        }
        let mn = [7, 8, 9, 10].iter().map(|k| sq(mm[k])).sum::<f64>().sqrt();
        let md = (sq(mm[&1]) + sq(mm[&11])).sqrt();
        let (b, m) = burden(n, z, mn, md)?;
        let mut o = json!({"geo":"30-county US study sample", "geo_id":"us-sample",
            "level":"sample", "year":y,"measure":"burden","value":b,
            "lower":(b-m).max(0.0),"upper":(b+m).min(100.0),"status":"derived",
            "source":"acs","interval":"90% approximate ACS sampling interval"});
        o["numerator"] = json!(n);
        o["denominator"] = json!(z);
        pooled.push(o.clone());
        d.push(o);
    }
    let mut changes = Vec::new();
    let ys = &c["acs_years"];
    let y0 = ys[0].as_i64().ok_or("missing first ACS year")? as i32;
    let y1 = ys[1].as_i64().ok_or("missing last ACS year")? as i32;
    for f in keys.iter().map(|(f, _)| f).collect::<BTreeSet<_>>() {
        let p = |y, k| {
            d.iter()
                .find(|o| o["geo_id"] == *f && o["year"] == y && o["measure"] == k)
        };
        if let (Some(a), Some(b)) = (p(y0, "burden"), p(y1, "burden")) {
            let g = |k| -> Option<f64> {
                Some(100.0 * (p(y1, k)?["value"].as_f64()? / p(y0, k)?["value"].as_f64()? - 1.0))
            };
            let aa = d
                .iter()
                .find(|o| o["geo_id"] == *f && o["year"] == y0 && o["measure"] == "burden")
                .unwrap();
            let db = b["value"].as_f64().unwrap() - a["value"].as_f64().unwrap();
            let m0 = a["margin"].as_f64().unwrap();
            let m1 = b["margin"].as_f64().unwrap();
            let m = 1.645 * (m0 / 1.645).hypot(m1 / 1.645);
            changes.push(json!({"geo_id":f,"geo":aa["geo"],"y0":y0,"y1":y1,
                "burden_change":db,"margin":m,"rent_growth":g("rent"),"income_growth":g("income"),
                "verdict":if db>m {"up"} else if db < -m {"down"} else {"within noise"}}));
        }
    }
    let manifest = read(r.join("data/processed/manifest.json"))?;
    Ok(json!({"sources":[
        {"id":"acs","title":"US Census ACS one-year estimates","url":"https://www.census.gov/programs-surveys/acs/data/summary-file.html",
         "notes":"B25070 burden; B25064 gross rent; B25119 renter household income; no standard 2020 estimates."},
        {"id":"cpi","title":"BLS CPI-U via FRED","url":"https://fred.stlouisfed.org/series/CPIAUCNS"}],
        "measures":[
        {"id":"burden","title":"Renters spending at least 30% of income on shelter","unit":"%","universe":"Renter households with a computed gross-rent-to-income ratio; rent includes utilities.","notes":"90% approximate sampling intervals; sample aggregate weights household counts, not county percentages."},
        {"id":"rent","title":"Median gross rent","unit":format!("USD/month ({} dollars)",c["base_year"]),"universe":"Renter-occupied housing units paying cash rent; county median.","notes":"National CPI-U adjustment; not a local cost-of-living adjustment. County medians are not averaged."},
        {"id":"income","title":"Median renter household income","unit":format!("USD/year ({} dollars)",c["base_year"]),"universe":"Renter households in each county.","notes":"Population composition can change; growth does not measure individual raises."}],
        "observations":d,"pooled":pooled,"changes":changes,
        "coverage":{"summary":"Fixed 30-county sample: ten largest 2011 counties each in Colorado, Massachusetts and Washington. Not nationally representative. 2011–2024, excluding 2020.",
                    "counties":keys.iter().map(|(f,_)|f).collect::<BTreeSet<_>>().len(),"county_years":keys.len(),
                    "limits":["No causal claims.","No interpolated 2020 estimates.","Canadian and US survey universes, dates and currency differ."]},
        "manifest":manifest}))
}

fn exact(a: f64, b: f64) -> bool {
    a.to_bits() == b.to_bits()
}

pub fn verify(r: &Path) -> Result<(), E> {
    let a = rows(&r.join("data/processed/acs.csv"))?;
    if a.is_empty() {
        return Err("empty comparison".into());
    }
    if exact(1.0, 1.0000000000000002) {
        return Err("known-bad comparator accepted".into());
    }
    let mut differences = Vec::new();
    let mut max: f64 = 0.0;
    for a in &a {
        let (n, z, b, m) = calc(a)?;
        for (k, v) in [
            ("burden_numerator", n),
            ("burden_denominator", z),
            ("burden", b),
            ("burden_moe", m),
        ] {
            let old = num(a, k)?;
            max = max.max((old - v).abs());
            if !exact(old, v) {
                differences
                    .push(json!({"fips":a["fips"],"year":a["year"],"field":k,"old":old,"rust":v}));
            }
        }
    }
    let d = json!({"county_years":a.len(),"fields":4,"bit_differences":differences.len(),
        "max_absolute_difference":max,"known_bad_rejected":true,"differences":differences});
    crate::write(r.join("artifacts/us-parity.json"), &d)?;
    println!(
        "{} county-years, 4 burden fields; {} bit differences; max abs difference {max:e}",
        a.len(),
        differences.len()
    );
    if !differences.is_empty() {
        return Err("US burden parity differs; see artifacts/us-parity.json".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn eligible_counts_and_fallback() {
        let (b, m) = burden(30.0, 100.0, 2.0, 10.0).unwrap();
        assert_eq!(b, 30.0);
        assert_eq!(m, 13.0_f64.sqrt());
        assert!(burden(0.0, 0.0, 1.0, 1.0).is_err());
        assert!(burden(101.0, 100.0, 1.0, 1.0).is_err());
    }
    #[test]
    fn exact_comparator_detects_last_bit() {
        assert!(exact(0.5, 0.5));
        assert!(!exact(0.5, f64::from_bits(0.5_f64.to_bits() + 1)));
    }
}
