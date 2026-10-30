//! Statistics Canada full-table CSV downloads: cache, provenance and row access.
//! Legend: t table id (8 digits); z ZIP archive; h header index; r CSV record; s status flag;
//! q geography quality attributes from the metadata file, keyed by DGUID.
use crate::{E, cache};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    fs::File,
    io::{Cursor, Read},
    path::Path,
};

pub struct Table {
    pub id: String,
    pub source: Value,
    pub quality: BTreeMap<String, Value>,
    z: zip::ZipArchive<File>,
}

pub struct Row<'a> {
    h: &'a HashMap<String, usize>,
    r: &'a csv::StringRecord,
}

impl Row<'_> {
    pub fn get(&self, k: &str) -> &str {
        self.h
            .get(k)
            .and_then(|&i| self.r.get(i))
            .unwrap_or_default()
    }
    pub fn year(&self) -> Result<i32, E> {
        let d = self.get("REF_DATE");
        Ok(d.get(..4)
            .ok_or_else(|| format!("bad REF_DATE {d}"))?
            .parse()?)
    }
    pub fn at(&self, i: usize) -> &str {
        self.r.get(i).unwrap_or_default()
    }
    /// VALUE with its STATUS; a suppressed cell stays None with the flag kept.
    pub fn value(&self) -> Result<(Option<f64>, String), E> {
        let s = self.get("STATUS");
        Ok((number(self.get("VALUE"), s)?, s.to_owned()))
    }
}

/// Parse a published cell. Empty is unavailable; a number beside an unavailable flag is an error.
pub fn number(v: &str, s: &str) -> Result<Option<f64>, E> {
    if v.is_empty() {
        return Ok(None);
    }
    if matches!(s, "x" | "F" | ".." | "...") {
        return Err(format!("nonempty value {v} has unavailable status {s}").into());
    }
    let x: f64 = v.parse()?;
    if !x.is_finite() {
        return Err(format!("non-finite value {v}").into());
    }
    Ok(Some(x))
}

fn metadata(b: &[u8]) -> Result<(String, BTreeMap<String, Value>), E> {
    let mut r = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(b);
    let rows: Vec<_> = r.records().collect::<Result<_, _>>()?;
    let title = rows
        .get(1)
        .and_then(|r| r.get(0))
        .unwrap_or_default()
        .to_owned();
    let mut attrs: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    let mut section = false;
    for r in &rows {
        if r.get(0) == Some("Dimension ID") {
            section = r.get(2) == Some("Attribute Key");
            continue;
        }
        if section
            && r.get(0) == Some("1")
            && let (Some(id), Some(k), Some(v)) = (r.get(1), r.get(3), r.get(6))
        {
            attrs
                .entry(id.to_owned())
                .or_default()
                .insert(k.to_owned(), v.to_owned());
        }
    }
    let mut q = BTreeMap::new();
    for a in attrs.values() {
        if let Some(d) = a.get("DGUID") {
            let code = a.get("DQF_CODE").filter(|s| s.chars().any(|c| c != '0'));
            if let Some(c) = code {
                q.insert(d.clone(), json!({"dqf": c, "note": a.get("DQF_NOTE")}));
            }
        }
    }
    Ok((title, q))
}

impl Table {
    /// Open the cached ZIP for `t`, downloading it first when absent.
    pub fn open(root: &Path, t: &str) -> Result<Table, E> {
        let dir = root.join("data/raw/canada");
        let p = dir.join(format!("{t}-eng.zip"));
        let url = format!("https://www150.statcan.gc.ca/n1/tbl/csv/{t}-eng.zip");
        let provenance = cache::source(&p, &url, 600, |b| {
            zip::ZipArchive::new(Cursor::new(b))?;
            Ok(())
        })?;
        let mut z = zip::ZipArchive::new(File::open(&p)?)?;
        let mut m = Vec::new();
        z.by_name(&format!("{t}_MetaData.csv"))?
            .read_to_end(&mut m)?;
        let (title, quality) = metadata(&m)?;
        let mut source = json!({"id": t, "title": title.trim_start_matches('\u{feff}'),
            "url": format!("https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={t}01")});
        source
            .as_object_mut()
            .unwrap()
            .extend(provenance.as_object().unwrap().clone());
        Ok(Table {
            id: t.to_owned(),
            source,
            quality,
            z,
        })
    }

    /// Stream every data row through `f`.
    pub fn each(&mut self, mut f: impl FnMut(&Row) -> Result<(), E>) -> Result<(), E> {
        let name = format!("{}.csv", self.id);
        let mut r = csv::ReaderBuilder::new()
            .flexible(true)
            .from_reader(self.z.by_name(&name)?);
        let h: HashMap<String, usize> = r
            .headers()?
            .iter()
            .enumerate()
            .map(|(i, s)| (s.trim_start_matches('\u{feff}').to_owned(), i))
            .collect();
        let mut rec = csv::StringRecord::new();
        while r.read_record(&mut rec)? {
            // Footnote rows after the data have too few fields.
            if rec.len() < 4 {
                continue;
            }
            f(&Row { h: &h, r: &rec })?;
        }
        Ok(())
    }

    /// Column index whose header starts with `prefix` (Census wide tables).
    pub fn column(&mut self, prefix: &str) -> Result<usize, E> {
        let name = format!("{}.csv", self.id);
        let mut r = csv::Reader::from_reader(self.z.by_name(&name)?);
        r.headers()?
            .iter()
            .position(|s| s.trim_start_matches('\u{feff}').starts_with(prefix))
            .ok_or_else(|| format!("{}: no column {prefix}", self.id).into())
    }
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
        assert!(number("NaN", "").is_err());
        assert_eq!(number("-1.5", "").unwrap(), Some(-1.5));
    }
}
