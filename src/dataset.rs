//! Accepted observations and their measure contracts. No calculation sees unchecked rows.
//! Legend: p places; o observations; m measure specification; src source records.
use crate::{
    E,
    place::{self, Obs, Place, Registry},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Deserialize, Serialize)]
pub struct MeasureSpec {
    pub id: String,
    group: String,
    title: String,
    short: String,
    unit: String,
    format: String,
    source: String,
    universe: String,
    notes: String,
    min: f64,
    max: Option<f64>,
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    cats: serde_json::Map<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    default_cat: Option<String>,
    #[serde(default)]
    derived: bool,
}

pub struct Dataset {
    pub places: Vec<Place>,
    pub observations: Vec<Obs>,
    pub measures: Vec<MeasureSpec>,
}

impl Dataset {
    pub fn new(
        p: Vec<Place>,
        o: Vec<Obs>,
        meta: &Value,
        src: &Value,
        complete: bool,
    ) -> Result<Self, E> {
        let measures: Vec<MeasureSpec> = serde_json::from_value(meta["measures"].clone())?;
        let mut ids = BTreeSet::new();
        for m in &measures {
            if !ids.insert(m.id.as_str())
                || [
                    &m.id,
                    &m.group,
                    &m.title,
                    &m.short,
                    &m.source,
                    &m.universe,
                    &m.notes,
                ]
                .iter()
                .any(|s| s.trim().is_empty())
            {
                return Err(format!("incomplete or duplicate measure {}", m.id).into());
            }
            let unit = match m.format.as_str() {
                "pct" | "change" => m.unit == "%",
                "dollars" => m.unit == "$",
                "count" => matches!(m.unit.as_str(), "people" | "households" | "dwellings"),
                "index" => matches!(m.unit.as_str(), "2002=100" | "index"),
                "num1" => m.unit == "per 1,000",
                _ => false,
            };
            if !unit
                || !m.min.is_finite()
                || m.max.is_some_and(|x| !x.is_finite() || x < m.min)
                || m.cats
                    .iter()
                    .any(|(k, v)| k.is_empty() || v.as_str().is_none_or(|s| s.trim().is_empty()))
                || m.default_cat
                    .as_ref()
                    .is_some_and(|c| !m.cats.contains_key(c))
                || (!m.cats.is_empty() && m.default_cat.is_none())
            {
                return Err(format!("invalid measure contract {}", m.id).into());
            }
        }
        let mut r = Registry::default();
        let mut places = BTreeSet::new();
        for x in &p {
            if x.id.is_empty()
                || x.name.trim().is_empty()
                || !places.insert(&x.id)
                || !matches!(
                    x.level.as_str(),
                    "country"
                        | "province"
                        | "territory"
                        | "metro"
                        | "agglomeration"
                        | "metro_part"
                        | "centre"
                        | "aggregate"
                        | "division"
                        | "community"
                )
                || (!x.pr.is_empty() && !place::PROVINCES.iter().any(|pr| pr.0 == x.pr))
            {
                return Err(format!("invalid or duplicate place {}", x.id).into());
            }
            r.name(&x.id, &x.name, &x.level, &x.pr, 0);
        }
        place::validate(&o, &r)?;
        let mut sources = BTreeSet::new();
        for s in src["tables"].as_array().ok_or("missing source records")? {
            let id = s["id"]
                .as_str()
                .filter(|x| !x.is_empty())
                .ok_or("source without id")?;
            if !sources.insert(id) {
                return Err(format!("duplicate source {id}").into());
            }
        }
        let contracts: BTreeMap<_, _> = measures.iter().map(|m| (m.id.as_str(), m)).collect();
        let rows: BTreeMap<_, _> = o.iter().map(|x| (x.key(), x)).collect();
        for x in &o {
            let m = contracts
                .get(x.measure.as_str())
                .ok_or_else(|| format!("unknown measure {}", x.measure))?;
            if (m.cats.is_empty() && !x.cat.is_empty())
                || (!m.cats.is_empty() && !m.cats.contains_key(&x.cat))
            {
                return Err(format!("unknown category {} / {}", x.measure, x.cat).into());
            }
            if x.value
                .into_iter()
                .chain(x.lower)
                .chain(x.upper)
                .any(|v| v < m.min || m.max.is_some_and(|hi| v > hi))
            {
                return Err(format!("{:?} outside measure range", x.key()).into());
            }
            if m.derived != x.lineage.is_some()
                || (!m.derived && !sources.contains(x.source.as_str()))
            {
                return Err(format!("invalid source or calculation for {:?}", x.key()).into());
            }
            if let Some(l) = &x.lineage {
                if l.transform != x.measure || l.inputs.is_empty() || l.comparability.is_empty() {
                    return Err("incomplete calculation lineage".into());
                }
                for i in &l.inputs {
                    let key = (i.measure.clone(), i.cat.clone(), i.place.clone(), i.year);
                    let a = rows.get(&key).ok_or("unresolved calculation input")?;
                    if a.value.is_none()
                        || a.source != i.source
                        || a.vintage != i.vintage
                        || a.status != i.status
                    {
                        return Err(
                            "calculation input provenance differs from accepted cell".into()
                        );
                    }
                }
            }
        }
        if complete {
            for m in &measures {
                if !o.iter().any(|x| x.measure == m.id) {
                    return Err(format!("measure {} has no observations", m.id).into());
                }
            }
        }
        Ok(Self {
            places: p,
            observations: o,
            measures,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> (Vec<Place>, Vec<Obs>, Value, Value) {
        (
            vec![
                serde_json::from_value(
                    json!({"id":"pr-35","name":"Ontario","level":"province","pr":"35"}),
                )
                .unwrap(),
            ],
            vec![Obs::new("vacancy", "", "pr-35", 2025, Some(3.0), "table")],
            json!({"measures":[{"id":"vacancy","group":"Housing","title":"Vacancy","short":"Vacancy","unit":"%","format":"pct","source":"Survey","universe":"Rental units","notes":"Published estimates","min":0,"max":100}]}),
            json!({"tables":[{"id":"table"}]}),
        )
    }

    #[test]
    fn malformed_cells_never_enter_a_dataset() {
        let (p, o, m, s) = fixture();
        assert!(Dataset::new(p.clone(), o.clone(), &m, &s, true).is_ok());
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -5.0, 150.0] {
            let mut o = o.clone();
            o[0].value = Some(value);
            assert!(Dataset::new(p.clone(), o, &m, &s, true).is_err());
        }
        for flag in [
            "F",
            "x",
            "..",
            "...",
            "not available",
            "income data suppressed",
            "incompletely enumerated",
        ] {
            let mut o = o.clone();
            o[0].status = flag.into();
            assert!(Dataset::new(p.clone(), o, &m, &s, true).is_err());
        }
        let mut dup = o.clone();
        dup.push(o[0].clone());
        dup[1].value = Some(4.0);
        assert!(Dataset::new(p.clone(), dup, &m, &s, true).is_err());
        for (value, lo, hi) in [
            (Some(3.0), Some(2.0), None),
            (None, Some(2.0), Some(4.0)),
            (Some(3.0), Some(4.0), Some(5.0)),
        ] {
            let mut o = o.clone();
            o[0].value = value;
            o[0].lower = lo;
            o[0].upper = hi;
            assert!(Dataset::new(p.clone(), o, &m, &s, true).is_err());
        }
    }

    #[test]
    fn metadata_and_references_are_contracts() {
        let (p, o, m, s) = fixture();
        for field in ["unit", "universe", "min"] {
            let mut m = m.clone();
            m["measures"][0]
                .as_object_mut()
                .unwrap()
                .shift_remove(field);
            assert!(Dataset::new(p.clone(), o.clone(), &m, &s, true).is_err());
        }
        let mut bad = m.clone();
        bad["measures"][0]["unit"] = json!("dollars");
        assert!(Dataset::new(p.clone(), o.clone(), &bad, &s, true).is_err());
        for field in ["cat", "source", "place"] {
            let mut o = o.clone();
            match field {
                "cat" => o[0].cat = "unknown".into(),
                "source" => o[0].source = "unknown".into(),
                _ => o[0].place = "unknown".into(),
            }
            assert!(Dataset::new(p.clone(), o, &m, &s, true).is_err());
        }
        let mut places = p.clone();
        places.push(p[0].clone());
        assert!(Dataset::new(places, o, &m, &s, true).is_err());
    }

    #[test]
    fn negative_changes_follow_their_own_range() {
        let (p, mut o, mut m, s) = fixture();
        m["measures"][0]["format"] = json!("change");
        m["measures"][0]["min"] = json!(-100);
        m["measures"][0]
            .as_object_mut()
            .unwrap()
            .shift_remove("max");
        o[0].value = Some(-12.0);
        assert!(Dataset::new(p, o, &m, &s, true).is_ok());
    }
}
