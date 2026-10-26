// Symbols: r = CSV record; h = header; z = ZIP archive; o = observation;
// n = burden numerator; d = eligible denominator; k = natural key; v = JSON value.
// Codes = source geography codes; Quality = Census disclosure metadata;
// Meta = parsed table metadata; Cache = opened archive and its provenance.
// Counts and flags remain source values; ratio intervals are not invented.
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fs::{self, File};
use std::io::{Cursor, Read};
use std::path::Path;
use std::time::Duration;

type Result<T> = std::result::Result<T, Box<dyn Error>>;
type Codes = BTreeMap<String, String>;
type Quality = BTreeMap<String, Value>;
type Meta = (String, Codes, Quality);
type Cache = (zip::ZipArchive<File>, Value, Codes, Quality);

const TABLES: [(&str, &str); 5] = [
    ("98100252", "2022-09-23"),
    ("46100085", "2026-09-21"),
    ("34100133", "2025-12-17"),
    ("34100130", "2025-12-17"),
    ("34100131", "2025-12-17"),
];

fn number(s: &str, status: &str) -> Result<Option<f64>> {
    if s.is_empty() {
        return Ok(None);
    }
    if matches!(status, "x" | "F" | ".." | "...") {
        return Err(format!("nonempty value {s} has unavailable status {status}").into());
    }
    let v: f64 = s.parse()?;
    if !v.is_finite() || v < 0.0 {
        return Err(format!("invalid Canadian observation {s}").into());
    }
    Ok(Some(v))
}

fn field<'a>(h: &csv::StringRecord, r: &'a csv::StringRecord, name: &str) -> Result<&'a str> {
    let i = h
        .iter()
        .position(|s| s == name)
        .ok_or_else(|| format!("missing column {name}"))?;
    Ok(r.get(i).unwrap_or_default())
}

fn metadata(bytes: &[u8]) -> Result<Meta> {
    let mut r = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(bytes);
    let rows: Vec<_> = r.records().collect::<std::result::Result<_, _>>()?;
    let title = rows
        .get(1)
        .and_then(|r| r.get(0))
        .unwrap_or_default()
        .to_owned();
    let mut codes = BTreeMap::new();
    let mut members: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    let mut section = "";
    for r in &rows {
        if r.get(0) == Some("Dimension ID") {
            section = if r.get(1) == Some("Member Name") {
                "members"
            } else if r.get(2) == Some("Attribute Key") {
                "attributes"
            } else {
                ""
            };
            continue;
        }
        if r.get(0) != Some("1") {
            continue;
        }
        if section == "members" {
            if let (Some(name), Some(code)) = (r.get(1), r.get(2))
                && !code.is_empty()
            {
                codes.insert(name.to_owned(), code.trim_matches(['[', ']']).to_owned());
            }
        } else if section == "attributes"
            && let (Some(id), Some(key), Some(v)) = (r.get(1), r.get(3), r.get(6))
        {
            members
                .entry(id.to_owned())
                .or_default()
                .insert(key.to_owned(), v.to_owned());
        }
    }
    let mut quality = BTreeMap::new();
    for attrs in members.values() {
        if let Some(id) = attrs.get("DGUID") {
            quality.insert(
                id.clone(),
                json!({
                    "level": attrs.get("GEO_TYPE_DESC"),
                    "data_quality_flag": attrs.get("DQF_CODE"),
                    "data_quality_note": attrs.get("DQF_NOTE"),
                    "long_form_nonresponse_percent": attrs.get("TNR_LONG_FORM"),
                }),
            );
        }
    }
    Ok((title, codes, quality))
}

fn level(id: &str, code: &str) -> &'static str {
    if code == "11124" || id.contains("A0000") {
        "country"
    } else if id.contains("A0002") || code.len() == 2 {
        if matches!(code, "60" | "61" | "62")
            || ["260", "261", "262"].iter().any(|s| id.ends_with(s))
        {
            "territory"
        } else {
            "province"
        }
    } else if id.contains("S0503") {
        "metro"
    } else if id.contains("S0504") {
        "agglomeration"
    } else {
        "rental_market_area"
    }
}

fn archive(root: &Path, table: &str, release: &str) -> Result<Cache> {
    let dir = root.join("data/raw/canada");
    fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{table}-eng.zip"));
    let url = format!("https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip");
    let stamp = dir.join(format!("{table}.retrieval.json"));
    if !path.exists() {
        let mut response = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()?
            .get(&url)
            .send()?
            .error_for_status()?;
        let mut bytes = Vec::new();
        response.read_to_end(&mut bytes)?;
        // A failed download never leaves a seemingly complete cache entry.
        zip::ZipArchive::new(Cursor::new(&bytes))?;
        fs::write(&path, bytes)?;
        fs::write(
            &stamp,
            serde_json::to_vec(
                &json!({"retrieved": Utc::now().to_rfc3339(), "timestamp_basis":"download completed"}),
            )?,
        )?;
    }
    let mut f = File::open(&path)?;
    let mut hash = Sha256::new();
    std::io::copy(&mut f, &mut hash)?;
    let sha = format!("{:x}", hash.finalize());
    let retrieved: Value = if stamp.exists() {
        serde_json::from_slice(&fs::read(&stamp)?)?
    } else {
        let date: DateTime<Utc> = fs::metadata(&path)?.modified()?.into();
        let v = json!({"retrieved":date.to_rfc3339(),"timestamp_basis":"cache file modification time; initial inspection download"});
        fs::write(&stamp, serde_json::to_vec(&v)?)?;
        v
    };
    let mut z = zip::ZipArchive::new(File::open(&path)?)?;
    let mut bytes = Vec::new();
    z.by_name(&format!("{table}_MetaData.csv"))?
        .read_to_end(&mut bytes)?;
    let (title, codes, quality) = metadata(&bytes)?;
    let source = json!({"id":table,"title":title,"url":format!("https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={table}01"),
        "download_url":url,"retrieved":retrieved["retrieved"],"timestamp_basis":retrieved["timestamp_basis"],
        "sha256":sha,"bytes":fs::metadata(path)?.len(),"release_date":release,
        "metadata_sha256":format!("{:x}",Sha256::digest(&bytes))});
    Ok((z, source, codes, quality))
}

fn census<R: Read>(
    reader: R,
    codes: &BTreeMap<String, String>,
    quality: &BTreeMap<String, Value>,
) -> Result<Vec<Value>> {
    let mut reader = csv::Reader::from_reader(reader);
    let h = reader.headers()?.clone();
    let mut cells: BTreeMap<String, Value> = BTreeMap::new();
    for r in reader.records() {
        let r = r?;
        if field(&h, &r, "Household total income groups (14)")?
            != "Total - Total income of household"
            || field(
                &h,
                &r,
                "Household type including census family structure (16)",
            )? != "Total - Household type including census family structure"
            || field(&h, &r, "Housing suitability (3)")? != "Total - Housing suitability"
            || field(&h, &r, "Dwelling condition (3)")? != "Total - Dwelling condition"
        {
            continue;
        }
        let ratio = match field(&h, &r, "Shelter-cost-to-income ratio (5)")? {
            "Spending 30% or more of income on shelter costs" => "burdened",
            "Spending less than 30% of income on shelter costs" => "under30",
            "Not applicable" => "not_applicable",
            "Total - Shelter-cost-to-income ratio" => "total",
            _ => continue,
        };
        let stat = match field(&h, &r, "Statistics (3C)")? {
            "Number of private households" => "value",
            "Confidence interval lower bound of number of private households" => "lower",
            "Confidence interval upper bound of number of private households" => "upper",
            s => return Err(format!("unknown Census statistic {s}").into()),
        };
        let id = field(&h, &r, "DGUID")?;
        let geo = field(&h, &r, "GEO")?;
        let code = codes.get(geo).map(String::as_str).unwrap_or_default();
        let o = cells.entry(id.to_owned()).or_insert_with(||json!({"geo":geo,"geo_id":id,"level":level(id,code),
            "year":2021,"measure":"burden","source":"98100252","quality":quality.get(id),"components":{}}));
        let i = h
            .iter()
            .position(|s| s == "Tenure (3):Renter[3]")
            .ok_or("missing renter count")?;
        let status = r.get(i + 1).unwrap_or_default();
        let v = number(r.get(i).unwrap_or_default(), status)?;
        let component = &mut o["components"][ratio];
        if component.is_null() {
            *component = json!({});
        }
        if component.get(stat).is_some() {
            return Err(format!("duplicate Census cell {id} {ratio} {stat}").into());
        }
        component[stat] = json!(v);
        component[format!("{stat}_status")] = json!(status);
    }
    let mut result = Vec::new();
    for mut o in cells.into_values() {
        let n = o["components"]["burdened"]["value"].as_f64();
        let under = o["components"]["under30"]["value"].as_f64();
        let d = n.zip(under).map(|(n, u)| n + u);
        o["numerator"] = json!(n);
        o["denominator"] = json!(d);
        o["value"] = json!(
            n.zip(d)
                .filter(|(_, d)| *d > 0.0)
                .map(|(n, d)| 100.0 * n / d)
        );
        o["status"] = if o["value"].is_null() {
            json!("unavailable")
        } else {
            json!("")
        };
        o["lower"] = Value::Null;
        o["upper"] = Value::Null;
        if let (Some(d), Some(total), Some(na)) = (
            d,
            o["components"]["total"]["value"].as_f64(),
            o["components"]["not_applicable"]["value"].as_f64(),
        ) {
            // Four independently random-rounded base-five counts can differ by
            // up to twenty; retain the discrepancy rather than adjusting counts.
            o["rounding_difference"] = json!(d + na - total);
            if (d + na - total).abs() > 20.0 {
                return Err(format!("Census categories do not reconcile: {}", o["geo"]).into());
            }
        }
        result.push(o);
    }
    for geo in [
        "Canada",
        "Newfoundland and Labrador",
        "Prince Edward Island",
        "Nova Scotia",
        "New Brunswick",
        "Quebec",
        "Ontario",
        "Manitoba",
        "Saskatchewan",
        "Alberta",
        "British Columbia",
        "Yukon",
        "Northwest Territories",
        "Nunavut",
    ] {
        if !result.iter().any(|o| o["geo"] == geo) {
            return Err(format!("missing expected Census geography {geo}").into());
        }
    }
    Ok(result)
}

fn survey<R: Read>(
    reader: R,
    table: &str,
    codes: &BTreeMap<String, String>,
    first_year: i64,
) -> Result<Vec<Value>> {
    let mut reader = csv::Reader::from_reader(reader);
    let h = reader.headers()?.clone();
    let mut result: BTreeMap<String, Value> = BTreeMap::new();
    for r in reader.records() {
        let r = r?;
        let geo = field(&h, &r, "GEO")?;
        let id = field(&h, &r, "DGUID")?;
        let code = codes.get(geo).map(String::as_str).unwrap_or_default();
        let year: i32 = field(&h, &r, "REF_DATE")?.parse()?;
        if i64::from(year) < first_year {
            continue;
        }
        let (measure, stat) = if table == "46100085" {
            if field(
                &h,
                &r,
                "Tenure including first-time homebuyer and social and affordable housing status",
            )? != "Renter"
                || !matches!(code.len(), 2 | 3 | 5)
                || code.is_empty()
            {
                continue;
            }
            let s = field(&h, &r, "Core housing need statistics")?;
            let stat = match s {
                "Percentage of households in core housing need" => "value",
                "Low 95% confidence interval, percentage of households" => "lower",
                "High 95% confidence interval, percentage of households" => "upper",
                _ => continue,
            };
            ("core_need", stat)
        } else if table == "34100133" {
            if field(&h, &r, "Type of structure")?
                != "Row and apartment structures of three units and over"
                || field(&h, &r, "Type of unit")? != "Two bedroom units"
            {
                continue;
            }
            ("rent", "value")
        } else {
            ("vacancy", "value")
        };
        let key = format!("{table}|{geo}|{year}|{measure}");
        let level = if table == "34100130" {
            if geo == "Census metropolitan areas" {
                "aggregate_metros"
            } else {
                "metro"
            }
        } else if table == "34100131" {
            if geo.starts_with("All census") {
                "aggregate_agglomerations"
            } else {
                "agglomeration"
            }
        } else if table == "46100085" && code.len() == 3 {
            "metro"
        } else {
            level(id, code)
        };
        let coordinate = field(&h, &r, "COORDINATE")?
            .split('.')
            .next()
            .unwrap_or(geo);
        let o=result.entry(key.clone()).or_insert_with(||json!({"geo":geo,"geo_id":if id.is_empty(){format!("{table}:{coordinate}")}else{id.to_owned()},
            "geo_code":code,"level":level,"year":year,"measure":measure,"source":table,
            "value":null,"lower":null,"upper":null,"status":"","terminated":field(&h,&r,"TERMINATED").unwrap_or_default()}));
        let status = field(&h, &r, "STATUS")?;
        let v = number(field(&h, &r, "VALUE")?, status)?;
        let flag = format!("{stat}_status");
        if o.get(&flag).is_some() {
            return Err(format!("duplicate Canadian observation {key} {stat}").into());
        }
        o[stat] = json!(v);
        o[&flag] = json!(status);
        if stat == "value" {
            o["status"] = json!(status);
        }
    }
    Ok(result.into_values().collect())
}

fn validate(observations: &[Value]) -> Result<()> {
    if observations.is_empty() {
        return Err("no Canadian observations".into());
    }
    let mut keys = BTreeSet::new();
    for o in observations {
        let key = format!(
            "{}|{}|{}|{}",
            o["source"], o["geo"], o["year"], o["measure"]
        );
        if !keys.insert(key.clone()) {
            return Err(format!("duplicate natural key {key}").into());
        }
        if let Some(v) = o["value"].as_f64() {
            if v < 0.0 || !v.is_finite() || (o["measure"] != "rent" && v > 100.0) {
                return Err(format!("value outside measure range {key}").into());
            }
            if let (Some(lo), Some(hi)) = (o["lower"].as_f64(), o["upper"].as_f64())
                && (lo > v || hi < v)
            {
                return Err(format!("interval does not contain estimate {key}").into());
            }
        }
    }
    for measure in ["burden_history", "burden", "core_need", "rent", "vacancy"] {
        if !observations
            .iter()
            .any(|o| o["measure"] == measure && o["value"].is_number())
        {
            return Err(format!("no published values for {measure}").into());
        }
    }
    Ok(())
}

/// Retrieve Canadian source caches, or read the committed offline export.
pub fn run(root: &Path, download: bool) -> Result<Value> {
    let c: Value = serde_json::from_slice(&fs::read(root.join("config.json"))?)?;
    let first_year = c["canada"]["first_year"].as_i64().unwrap_or(2011);
    let path = root.join("data/processed/canada.json");
    if !download {
        let v: Value = serde_json::from_slice(&fs::read(path)?)?;
        if v["first_year"].as_i64() != Some(first_year) {
            return Err(
                "Canadian collection window changed: run fetch-ca to regenerate the source export"
                    .into(),
            );
        }
        let observations = v["observations"]
            .as_array()
            .ok_or("missing Canadian observations")?;
        validate(observations)?;
        return Ok(v);
    }
    let mut sources = Vec::new();
    let mut observations = Vec::new();
    for (table, release) in TABLES {
        eprintln!("Canadian table {table}: reading cached or downloaded official CSV");
        let (mut z, source, codes, quality) = archive(root, table, release)?;
        let reader = z.by_name(&format!("{table}.csv"))?;
        let rows = if table == "98100252" {
            census(reader, &codes, &quality)?
        } else {
            survey(reader, table, &codes, first_year)?
        };
        if rows.is_empty() {
            return Err(format!("no selected rows from {table}").into());
        }
        eprintln!(
            "Canadian table {table}: {} exported observations",
            rows.len()
        );
        observations.extend(rows);
        sources.push(source);
    }
    let (source, history) = crate::history::run(root)?;
    sources.push(source);
    observations.extend(history);
    observations.sort_by_key(|o| {
        format!(
            "{}|{}|{}|{}",
            o["measure"], o["geo"], o["year"], o["source"]
        )
    });
    validate(&observations)?;
    let measures = json!([
        {"id":"burden_history","title":"Renter burden, 2016–2021 comparison","unit":"percent","universe":"Renter households in non-farm, off-reserve private dwellings with positive income; Census 2016 and 2021, common 2021 boundaries","notes":"Published percentages to one decimal, from the same comparison table in The Daily. Canada, all 13 provinces/territories and named metropolitan areas. Shelter costs are for the Census year; income is for the preceding year. This 2022 release can differ from later detailed-table revisions and count-based reconstruction; do not splice the two series. No annual interpolation or sampling intervals are supplied. Pandemic income support affects the 2020 income comparison."},
        {"id":"burden","title":"Renters spending 30% or more on shelter","unit":"percent","universe":"Renter households with positive income in off-reserve, non-farm private dwellings; 2021 Census 25% sample","notes":"2021 housing costs / 2020 before-tax household income. Denominator is published under-30% plus 30%-or-more renter counts; excludes not applicable. Published count bounds and quality flags retained; a ratio confidence interval is not available and is not synthesized. Census counts are rounded."},
        {"id":"core_need","title":"Renters in core housing need","unit":"percent","universe":"CHS renter households assessed for core housing need; provinces only","notes":"Not a burden rate. Assesses adequacy, suitability, affordability and cost of acceptable alternative local housing. Excludes nonpositive incomes and shelter-cost-to-income ratios >=100%; student household rules apply. Published 95% confidence intervals retained. 2021 Census geographic boundaries."},
        {"id":"rent","title":"Two-bedroom average monthly rent","unit":"CAD per month","universe":"CMHC privately initiated row and apartment structures with three or more units in surveyed areas of 10,000+ population","notes":"Nominal Canadian dollars, existing rental stock, not asking rent or renter household shelter costs. Changes can reflect dwelling composition. Geographic definitions change every five years; no constant-boundary growth estimate."},
        {"id":"vacancy","title":"Rental vacancy rate","unit":"percent","universe":"CMHC privately initiated row and apartment structures with three or more units; all bedroom sizes; surveyed CMAs and CAs of 50,000+","notes":"Vacancy uses all bedroom sizes and is context for two-bedroom rents; not an identical bedroom universe. Geographic definitions change every five years."}
    ]);
    let mut counts = BTreeMap::new();
    for measure in ["burden_history", "burden", "core_need", "rent", "vacancy"] {
        let rows: Vec<_> = observations
            .iter()
            .filter(|o| o["measure"] == measure)
            .collect();
        let geos: BTreeSet<_> = rows
            .iter()
            .map(|o| o["geo"].as_str().unwrap_or_default())
            .collect();
        let years: BTreeSet<_> = rows.iter().filter_map(|o| o["year"].as_i64()).collect();
        counts.insert(measure,json!({"observations":rows.len(),"geographies":geos.len(),"years":years,"unavailable":rows.iter().filter(|o|o["value"].is_null()).count()}));
    }
    let v = json!({"schema_version":1,"first_year":first_year,"country":"Canada","sources":sources,"measures":measures,"observations":observations,
        "coverage":{"by_measure":counts,"notes":[
            "Census burden covers Canada, all 10 provinces and 3 territories, and the 2021 table's metropolitan areas and agglomerations.",
            "CHS core housing need excludes the territories; Canada (provinces only) is not all of Canada. Named metropolitan areas only; provincial urban/rural aggregates are excluded.",
            "Rent and vacancy have separate source-supported geographies; absence of an area or a year is not zero. Suppressed and unavailable cells remain null with source status.",
            "Burden, core housing need, rent and vacancy have different populations and reference periods. No interpolation, Canadian forecasts or pooled Canada/US burden comparison.",
            "46-10-0084-01 was inspected and excluded: it contains dwelling, satisfaction and moving indicators, not shelter-cost burden. 46-10-0067-01 lacks a renter-tenure dimension."]}});
    fs::create_dir_all(root.join("data/processed"))?;
    fs::write(path, serde_json::to_vec(&v)?)?;
    Ok(v)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn disclosure_zero_and_invalid_values() {
        assert_eq!(number("0", "").unwrap(), Some(0.0));
        assert_eq!(number("", "F").unwrap(), None);
        assert_eq!(number("", "x").unwrap(), None);
        assert!(number("0", "x").is_err());
        assert!(number("-1", "").is_err());
        assert!(number("NaN", "").is_err());
    }
    #[test]
    fn geographic_levels_preserve_territories() {
        assert_eq!(level("2021A000260", "60"), "territory");
        assert_eq!(level("2021A000261", "61"), "territory");
        assert_eq!(level("2021S0503933", "933"), "metro");
        assert_eq!(level("2021S0504990", "990"), "agglomeration");
    }
    #[test]
    fn rejects_duplicate_and_out_of_range_exports() {
        let mut rows:Vec<_>=["burden_history","burden","core_need","rent","vacancy"].iter().map(|m|json!({"source":"test fixture","geo":"fixture","year":2021,"measure":m,"value":0})).collect();
        assert!(validate(&rows).is_ok());
        rows.push(rows[0].clone());
        assert!(validate(&rows).is_err());
        rows.pop();
        rows[0]["value"] = json!(101);
        assert!(validate(&rows).is_err());
        assert!(validate(&[]).is_err());
    }

    #[test]
    fn census_excludes_not_applicable_and_preserves_counts() {
        let mut w = csv::Writer::from_writer(Vec::new());
        w.write_record([
            "REF_DATE",
            "GEO",
            "DGUID",
            "Household total income groups (14)",
            "Household type including census family structure (16)",
            "Housing suitability (3)",
            "Dwelling condition (3)",
            "Statistics (3C)",
            "Shelter-cost-to-income ratio (5)",
            "Coordinate",
            "Tenure (3):Total - Tenure[1]",
            "Symbol",
            "Tenure (3):Owner[2]",
            "Symbol",
            "Tenure (3):Renter[3]",
            "Symbol",
        ])
        .unwrap();
        for geo in [
            "Canada",
            "Newfoundland and Labrador",
            "Prince Edward Island",
            "Nova Scotia",
            "New Brunswick",
            "Quebec",
            "Ontario",
            "Manitoba",
            "Saskatchewan",
            "Alberta",
            "British Columbia",
            "Yukon",
            "Northwest Territories",
            "Nunavut",
        ] {
            for (ratio, count) in [
                ("Total - Shelter-cost-to-income ratio", "12215"),
                ("Spending 30% or more of income on shelter costs", "3930"),
                ("Spending less than 30% of income on shelter costs", "8270"),
                ("Not applicable", "0"),
            ] {
                w.write_record([
                    "2021",
                    geo,
                    geo,
                    "Total - Total income of household",
                    "Total - Household type including census family structure",
                    "Total - Housing suitability",
                    "Total - Dwelling condition",
                    "Number of private households",
                    ratio,
                    "fixture",
                    "100",
                    "",
                    "0",
                    "",
                    count,
                    "",
                ])
                .unwrap();
            }
        }
        let bytes = w.into_inner().unwrap();
        let rows = census(Cursor::new(bytes), &BTreeMap::new(), &BTreeMap::new()).unwrap();
        assert_eq!(rows.len(), 14);
        assert_eq!(rows[0]["numerator"], 3930.0);
        assert_eq!(rows[0]["denominator"], 12200.0);
        assert_eq!(rows[0]["value"], 100.0 * 3930.0 / 12200.0);
        assert_eq!(rows[0]["components"]["not_applicable"]["value"], 0.0);
        assert!(rows[0]["lower"].is_null());
    }
}
