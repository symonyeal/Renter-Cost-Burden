//! Place registry and observations.
//! Legend: d DGUID (vintage, type A/S, schema, code); v vintage year; c geographic code;
//! pr two-digit province/territory code; g source geography name; k place id; w name priority;
//! o observation; m measure; cat category within a measure; y reference year.
//!
//! A place id is the DGUID schema and code without the vintage (`m-535`, `csd-3520005`), so
//! sources using 2011, 2016 and 2021 codes join on one place. Boundaries can change between
//! vintages; each observation keeps the vintage it was published on.
use crate::E;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

pub const PROVINCES: [(&str, &str, &str, &str); 13] = [
    ("10", "Newfoundland and Labrador", "N.L.", "atl"),
    ("11", "Prince Edward Island", "P.E.I.", "atl"),
    ("12", "Nova Scotia", "N.S.", "atl"),
    ("13", "New Brunswick", "N.B.", "atl"),
    ("24", "Quebec", "Que.", "qc"),
    ("35", "Ontario", "Ont.", "on"),
    ("46", "Manitoba", "Man.", "pra"),
    ("47", "Saskatchewan", "Sask.", "pra"),
    ("48", "Alberta", "Alta.", "pra"),
    ("59", "British Columbia", "B.C.", "bc"),
    ("60", "Yukon", "Y.T.", "nor"),
    ("61", "Northwest Territories", "N.W.T.", "nor"),
    ("62", "Nunavut", "Nvt.", "nor"),
];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Place {
    pub id: String,
    pub name: String,
    pub level: String,
    pub pr: String,
    #[serde(skip)]
    w: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Obs {
    pub measure: String,
    pub cat: String,
    pub place: String,
    pub year: i32,
    pub value: Option<f64>,
    pub lower: Option<f64>,
    pub upper: Option<f64>,
    pub status: String,
    pub source: String,
    pub vintage: String,
}

impl Obs {
    pub fn new(m: &str, cat: &str, k: &str, y: i32, v: Option<f64>, src: &str) -> Obs {
        Obs {
            measure: m.into(),
            cat: cat.into(),
            place: k.into(),
            year: y,
            value: v,
            lower: None,
            upper: None,
            status: String::new(),
            source: src.into(),
            vintage: String::new(),
        }
    }
    pub fn key(&self) -> (String, String, String, i32) {
        (
            self.measure.clone(),
            self.cat.clone(),
            self.place.clone(),
            self.year,
        )
    }
}

/// Province code named by a source suffix such as ", B.C.", ", Ontario part, Ontario/Quebec".
pub fn province_of(g: &str) -> Option<&'static str> {
    let tail = g.rsplit(", ").next()?;
    let first = tail.split('/').next()?.trim();
    PROVINCES
        .iter()
        .find(|p| p.1 == first || p.2 == first)
        .map(|p| p.0)
        .or_else(|| PROVINCES.iter().find(|p| p.1 == g).map(|p| p.0))
}

pub fn region(pr: &str) -> &'static str {
    PROVINCES.iter().find(|p| p.0 == pr).map_or("", |p| p.3)
}

/// Display name: source suffixes and type tags removed, multi-place joins as an en dash.
pub fn clean(g: &str) -> String {
    let mut s = g.trim().to_owned();
    while let Some(i) = s.rfind(", ") {
        let tail = &s[i + 2..];
        let first = tail.split('/').next().unwrap_or_default().trim();
        if PROVINCES.iter().any(|p| p.1 == first || p.2 == first) {
            s.truncate(i);
        } else {
            break;
        }
    }
    for t in [" (CMA)", " (CA)", " (K)", " (B)", " (D)"] {
        s = s.replace(t, "");
    }
    s = s
        .replace(", Ontario part", " (Ontario part)")
        .replace(", Quebec part", " (Quebec part)");
    s = s.replace(" - ", "–");
    s
}

/// Comparison key for names published without codes.
pub fn key(g: &str) -> String {
    clean(g)
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

#[derive(Default)]
pub struct Registry {
    pub m: BTreeMap<String, Place>,
}

impl Registry {
    fn put(&mut self, k: &str, g: &str, level: &str, pr: &str, w: u8) {
        let p = self.m.entry(k.to_owned()).or_insert_with(|| Place {
            id: k.to_owned(),
            name: clean(g),
            level: level.to_owned(),
            pr: pr.to_owned(),
            w,
        });
        if w > p.w {
            p.name = clean(g);
            p.level = level.to_owned();
            p.w = w;
        }
        if p.pr.is_empty() {
            p.pr = pr.to_owned();
        }
    }

    /// Register the place named by DGUID `d` and source name `g`; None for regional groupings.
    pub fn dguid(&mut self, d: &str, g: &str, w: u8) -> Option<(String, String)> {
        let d = d.trim();
        // A bare seven-digit code is a census subdivision without its DGUID prefix.
        if d.len() == 7 && d.chars().all(|c| c.is_ascii_digit()) {
            let k = format!("csd-{d}");
            self.put(&k, g, "community", &d[..2], w);
            return Some((k, String::new()));
        }
        if d.len() < 10 {
            return None;
        }
        let (v, t) = (&d[..4], &d[4..9]);
        // Some tables drop leading zeros (46-10-0085 gives St. John's as 2021S05031).
        let w0 = match t {
            "S0503" | "S0504" => 3,
            "A0003" => 4,
            "A0005" => 7,
            _ => 0,
        };
        let c = format!("{:0>w0$}", &d[9..]);
        let c = c.as_str();
        let pr_name = province_of(g).unwrap_or_default();
        let (k, level, pr) = match t {
            "A0000" => ("can".to_owned(), "country", ""),
            "A0002" => {
                let c = &c[c.len() - 2..];
                let level = if c >= "60" { "territory" } else { "province" };
                (format!("pr-{c}"), level, c)
            }
            "A0003" => (format!("cd-{c}"), "division", &c[..2]),
            "A0005" => (format!("csd-{c}"), "community", &c[..2]),
            "S0503" => (format!("m-{c}"), "metro", pr_name),
            "S0504" => (format!("m-{c}"), "agglomeration", pr_name),
            // Part codes are province + CMA/CA code (35505: Ontario part of Ottawa–Gatineau).
            "S0505" | "S0506" => (format!("mp-{c}"), "metro_part", &c[..2]),
            _ => return None,
        };
        // 2021 classification wins: a 2011 agglomeration may be a metro area now.
        let w = if v == "2021" { w + 1 } else { w };
        self.put(&k, g, level, pr, w);
        Some((k, v.to_owned()))
    }

    /// A place published without a geographic code, scoped by `scope` so that names from
    /// different sources are never assumed to be the same area.
    pub fn named(&mut self, scope: &str, g: &str, level: &str) -> String {
        let k = format!("{scope}-{}", key(g));
        self.put(&k, g, level, province_of(g).unwrap_or_default(), 0);
        k
    }

    /// Existing place with level in `levels` whose cleaned name matches `g`.
    pub fn find(&self, g: &str, levels: &[&str]) -> Option<String> {
        let k = key(g);
        let hits: Vec<_> = self
            .m
            .values()
            .filter(|p| levels.contains(&p.level.as_str()) && key(&p.name) == k)
            .collect();
        (hits.len() == 1).then(|| hits[0].id.clone())
    }

    pub fn name(&mut self, k: &str, g: &str, level: &str, pr: &str, w: u8) {
        self.put(k, g, level, pr, w);
    }
}

pub fn save(root: &Path, r: &Registry, o: &mut [Obs]) -> Result<(), E> {
    o.sort_by(|a, b| a.key().cmp(&b.key()).then(a.source.cmp(&b.source)));
    validate(o, r)?;
    let used: BTreeSet<&str> = o.iter().map(|o| o.place.as_str()).collect();
    let mut w = csv::Writer::from_path(root.join("data/processed/places.csv"))?;
    for p in r.m.values().filter(|p| used.contains(p.id.as_str())) {
        w.serialize(p)?;
    }
    w.flush()?;
    let mut w = csv::Writer::from_path(root.join("data/processed/observations.csv"))?;
    for x in o.iter() {
        w.serialize(x)?;
    }
    w.flush()?;
    Ok(())
}

pub fn load(root: &Path) -> Result<(Vec<Place>, Vec<Obs>), E> {
    let p: Vec<Place> = csv::Reader::from_path(root.join("data/processed/places.csv"))?
        .deserialize()
        .collect::<Result<_, _>>()?;
    let o: Vec<Obs> = csv::Reader::from_path(root.join("data/processed/observations.csv"))?
        .deserialize()
        .collect::<Result<_, _>>()?;
    Ok((p, o))
}

/// Natural keys unique, every place registered, intervals contain estimates, ranges hold.
pub fn validate(o: &[Obs], r: &Registry) -> Result<(), E> {
    if o.is_empty() {
        return Err("no observations".into());
    }
    let mut seen = BTreeSet::new();
    for x in o {
        let k = x.key();
        if !seen.insert(k.clone()) {
            return Err(format!("duplicate observation {k:?}").into());
        }
        if !r.m.contains_key(&x.place) {
            return Err(format!("unregistered place {}", x.place).into());
        }
        if let Some(v) = x.value {
            let pct = x.measure.starts_with("burden")
                || x.measure.starts_with("core_need")
                || matches!(
                    x.measure.as_str(),
                    "vacancy" | "renter_share" | "subsidized_share"
                );
            if v < 0.0 || (pct && v > 100.0) {
                return Err(format!("{k:?} value {v} outside its range").into());
            }
            if let (Some(lo), Some(hi)) = (x.lower, x.upper)
                && (lo > v || hi < v)
            {
                return Err(format!("{k:?} interval does not contain its estimate").into());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dguid_ids_ignore_vintage_and_keep_levels() {
        let mut r = Registry::default();
        assert_eq!(
            r.dguid("2011S0504810", "Lethbridge, Alberta", 1).unwrap().0,
            "m-810"
        );
        assert_eq!(
            r.dguid("2021S0503810", "Lethbridge (CMA), Alta.", 1)
                .unwrap()
                .0,
            "m-810"
        );
        assert_eq!(r.m["m-810"].level, "metro");
        assert_eq!(r.m["m-810"].pr, "48");
        assert_eq!(
            r.dguid("2021S05031", "St. John's, Newfoundland and Labrador", 1)
                .unwrap()
                .0,
            "m-001"
        );
        assert_eq!(r.dguid("2021A000260", "Yukon", 1).unwrap().0, "pr-60");
        assert_eq!(r.m["pr-60"].level, "territory");
        assert_eq!(r.dguid("2475028", "Saint-Lin", 1).unwrap().0, "csd-2475028");
        assert_eq!(r.m["csd-2475028"].pr, "24");
        assert_eq!(r.dguid("2021A000011124", "Canada", 1).unwrap().0, "can");
        assert_eq!(r.dguid("2021A00001124", "Canada", 1).unwrap().0, "can");
        assert!(r.dguid("2021A00011", "Atlantic provinces", 1).is_none());
    }
    #[test]
    fn names_lose_suffixes_and_match_across_sources() {
        assert_eq!(
            clean("Abbotsford - Mission (CMA), B.C."),
            "Abbotsford–Mission"
        );
        assert_eq!(
            clean("Ottawa-Gatineau, Ontario part, Ontario/Quebec"),
            "Ottawa-Gatineau (Ontario part)"
        );
        assert_eq!(clean("Campbellton (CA), N.B./Que."), "Campbellton");
        assert_eq!(
            key("Kitchener–Cambridge–Waterloo"),
            key("Kitchener - Cambridge - Waterloo (CMA), Ont.")
        );
        assert_eq!(province_of("Halifax, Nova Scotia"), Some("12"));
        assert_eq!(
            province_of("Ottawa - Gatineau (CMA), Ont./Que."),
            Some("35")
        );
        assert_eq!(province_of("Ontario"), Some("35"));
    }
}
