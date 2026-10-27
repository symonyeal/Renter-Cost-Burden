//! 2021 Census shelter-cost-to-income tables (25% sample), wide by tenure.
//! Legend: t table; r registry; w row; i column of the tenure count, i+1 its symbol;
//! b households spending 30%+; u under 30%; a all ratio categories; na not applicable;
//! c count cell; k place id; q geography quality; cat category within a measure.
//!
//! Burden = b / (b + u). Not-applicable households (non-positive income, on-reserve, farm)
//! are outside the universe. Counts are randomly rounded to multiples of five and small cells
//! can round to zero, so categories need not sum to the total: Bathurst couples with
//! children are 265 + 0 + 0 against 290; Midland renters under $10,000 are 0 + 0 + 0
//! against 30. Up to 25 households or 5% is rounding; beyond that a cell under 1,000
//! households is flagged and one above is an error. Counts are never adjusted.
use crate::{
    E,
    place::{Obs, Registry},
    statcan::{Table, number},
};
use std::collections::BTreeMap;

/// Place id and the vintage of its code.
type Key = (String, String);

const SMALL: &str = "rounded counts do not add up";

#[derive(Default, Clone)]
struct Cell {
    b: Option<f64>,
    u: Option<f64>,
    a: Option<f64>,
    na: Option<f64>,
    s: String,
}

impl Cell {
    fn set(&mut self, ratio: &str, v: Option<f64>, s: &str) -> Result<(), E> {
        let slot = match ratio {
            "Spending 30% or more of income on shelter costs" => &mut self.b,
            "Spending less than 30% of income on shelter costs" => &mut self.u,
            "Total - Shelter-cost-to-income ratio" => &mut self.a,
            "Not applicable" => &mut self.na,
            _ => return Ok(()),
        };
        if slot.is_some() {
            return Err(format!("duplicate Census cell for {ratio}").into());
        }
        *slot = v;
        if !s.is_empty() && self.s.is_empty() {
            self.s = s.to_owned();
        }
        Ok(())
    }
    fn rate(&self) -> Option<f64> {
        let (b, u) = (self.b?, self.u?);
        (b + u > 0.0).then(|| 100.0 * b / (b + u))
    }
    /// Ok(true) when a small cell's categories miss its total by more than rounding allows:
    /// kept, and flagged. A large cell that misses is a parsing error.
    fn reconcile(&self, k: &str) -> Result<bool, E> {
        if let (Some(b), Some(u), Some(a), Some(na)) = (self.b, self.u, self.a, self.na)
            && (b + u + na - a).abs() > 25f64.max(0.05 * a)
        {
            if a >= 1000.0 {
                return Err(format!("Census categories do not reconcile for {k}").into());
            }
            return Ok(true);
        }
        Ok(false)
    }
}

fn obs(m: &str, cat: &str, k: &(String, String), v: Option<f64>, s: &str, src: &str) -> Obs {
    let mut o = Obs::new(m, cat, &k.0, 2021, v, src);
    o.vintage = k.1.clone();
    o.status = if v.is_none() && s.is_empty() {
        "not available".into()
    } else {
        s.to_owned()
    };
    o
}

/// Short form of the Census data-quality note for a geography (empty when unflagged).
fn flag(t: &Table, d: &str) -> String {
    let n = t
        .quality
        .get(d)
        .and_then(|q| q["note"].as_str())
        .unwrap_or_default();
    let mut p = Vec::new();
    if n.contains("non-response rate higher") {
        p.push("non-response 50%+, use with caution");
    }
    if n.contains("Incompletely enumerated reserve or settlement") {
        p.push("incompletely enumerated");
    } else if n.contains("incompletely enumerated") {
        p.push("excludes incompletely enumerated reserves");
    }
    if n.contains("income data suppressed") {
        p.push("income data suppressed");
    }
    p.join("; ")
}

/// Household-type members of 98-10-0252 (member id, category); nested subtotals are left out.
const HOUSEHOLDS: [(u32, &str); 8] = [
    (2, "family"),
    (5, "couple"),
    (6, "couple_kids"),
    (7, "lone_parent"),
    (13, "multi_family"),
    (14, "non_family"),
    (15, "alone"),
    (16, "roommates"),
];

/// Income groups; the median and average rows of the same dimension are not counts.
const INCOMES: [(&str, &str); 11] = [
    ("Under $10,000", "i00"),
    ("$10,000 to $19,999", "i10"),
    ("$20,000 to $29,999", "i20"),
    ("$30,000 to $39,999", "i30"),
    ("$40,000 to $49,999", "i40"),
    ("$50,000 to $59,999", "i50"),
    ("$60,000 to $69,999", "i60"),
    ("$70,000 to $79,999", "i70"),
    ("$80,000 to $89,999", "i80"),
    ("$90,000 to $99,999", "i90"),
    ("$100,000 and over", "i100"),
];

/// 98-10-0252: renter burden overall, by household type and by household income group, for
/// Canada, provinces, territories, metros and agglomerations.
pub fn by_group(t: &mut Table, r: &mut Registry) -> Result<Vec<Obs>, E> {
    let i = t.column("Tenure (3):Renter")?;
    let mut c: BTreeMap<(String, String, String), (Cell, Key)> = BTreeMap::new();
    let mut d_of = BTreeMap::new();
    t.each(|w| {
        if w.get("Housing suitability (3)") != "Total - Housing suitability"
            || w.get("Dwelling condition (3)") != "Total - Dwelling condition"
            || w.get("Statistics (3C)") != "Number of private households"
        {
            return Ok(());
        }
        let inc = w.get("Household total income groups (14)");
        // Household types repeat names under different parents ("With children" twice);
        // the member id from the coordinate tells them apart.
        let hh: u32 = w
            .get("Coordinate")
            .split('.')
            .nth(2)
            .ok_or("Census coordinate without household member")?
            .parse()?;
        let (m, cat) = match (inc.starts_with("Total -"), hh == 1) {
            (true, true) => ("burden", ""),
            (true, false) => match HOUSEHOLDS.iter().find(|x| x.0 == hh) {
                Some(x) => ("burden_household", x.1),
                None => return Ok(()),
            },
            (false, true) => match INCOMES.iter().find(|x| x.0 == inc) {
                Some(x) => ("burden_income", x.1),
                None => return Ok(()),
            },
            _ => return Ok(()),
        };
        let Some(k) = r.dguid(w.get("DGUID"), w.get("GEO"), 2) else {
            return Ok(());
        };
        d_of.insert(k.0.clone(), w.get("DGUID").to_owned());
        let v = number(w.at(i), w.at(i + 1))?;
        let e = c
            .entry((m.to_owned(), cat.to_owned(), k.0.clone()))
            .or_insert_with(|| (Cell::default(), k.clone()));
        e.0.set(w.get("Shelter-cost-to-income ratio (5)"), v, w.at(i + 1))
    })?;
    let mut o = Vec::new();
    for ((m, cat, k), (cell, kv)) in c {
        let mut s = cell.s.clone();
        if s.is_empty() {
            s = flag(t, &d_of[&k]);
        }
        if cell.reconcile(&format!("{m}/{cat}/{k}"))? {
            s = SMALL.into();
        }
        o.push(obs(&m, &cat, &kv, cell.rate(), &s, "98100252"));
    }
    Ok(o)
}

/// 98-10-0255: renter burden for divisions and communities, burden of subsidized and
/// market renters, and the renter and subsidized shares, for every level. Also returns the
/// provincial renter burden from this table to reconcile with 98-10-0252.
pub fn communities(t: &mut Table, r: &mut Registry) -> Result<(Vec<Obs>, Vec<Obs>), E> {
    let col = |t: &mut Table, s: &str| {
        t.column(&format!(
            "Tenure including presence of mortgage payments and subsidized housing (8):{s}"
        ))
    };
    let ix = [
        col(t, "Total")?,
        col(t, "Renter")?,
        col(t, "Subsidized housing")?,
        col(t, "Not subsidized housing")?,
    ];
    let mut c: BTreeMap<String, ([Cell; 4], Key, String)> = BTreeMap::new();
    t.each(|w| {
        // Off reserve: the universe of 98-10-0252, so the two tables agree where they overlap.
        if w.get("Residence on or off reserve (3)") != "Off reserve"
            || !w
                .get("Household type including census family structure (9)")
                .starts_with("Total -")
            || w.get("Statistics (3C)") != "Number of private households"
        {
            return Ok(());
        }
        let d = w.get("DGUID");
        let Some(k) = r.dguid(d, w.get("GEO"), 2) else {
            return Ok(());
        };
        let e = c
            .entry(k.0.clone())
            .or_insert_with(|| (Default::default(), k.clone(), d.to_owned()));
        let ratio = w.get("Shelter-cost-to-income ratio (5)");
        for (j, &i) in ix.iter().enumerate() {
            e.0[j].set(ratio, number(w.at(i), w.at(i + 1))?, w.at(i + 1))?;
        }
        Ok(())
    })?;
    let (mut o, mut check) = (Vec::new(), Vec::new());
    for (k, (cells, kv, d)) in c {
        let mut small = [false; 4];
        for (j, cell) in cells.iter().enumerate() {
            small[j] = cell.reconcile(&format!("{k}/{j}"))?;
        }
        let [all, rent, sub, mkt] = &cells;
        let mut s = flag(t, &d);
        if s.is_empty() {
            s = rent.s.clone();
        }
        let s_of = |j: usize| {
            if small[j] {
                SMALL.to_owned()
            } else {
                s.clone()
            }
        };
        let lvl = k.split('-').next().unwrap_or_default();
        let b = obs("burden", "", &kv, rent.rate(), &s_of(1), "98100255");
        if matches!(lvl, "cd" | "csd") {
            o.push(b);
        } else {
            check.push(b);
        }
        o.push(obs(
            "burden_subsidy",
            "subsidized",
            &kv,
            sub.rate(),
            &s_of(2),
            "98100255",
        ));
        o.push(obs(
            "burden_subsidy",
            "market",
            &kv,
            mkt.rate(),
            &s_of(3),
            "98100255",
        ));
        let share = |n: Option<f64>, d: Option<f64>| match (n, d) {
            (Some(n), Some(d)) if d > 0.0 => Some(100.0 * n / d),
            _ => None,
        };
        o.push(obs(
            "renter_share",
            "",
            &kv,
            share(rent.a, all.a),
            &s,
            "98100255",
        ));
        o.push(obs(
            "subsidized_share",
            "",
            &kv,
            share(sub.a, rent.a),
            &s,
            "98100255",
        ));
        o.push(obs("renter_households", "", &kv, rent.a, &s, "98100255"));
    }
    Ok((o, check))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn burden_excludes_not_applicable_and_checks_rounding() {
        let mut c = Cell::default();
        c.set("Total - Shelter-cost-to-income ratio", Some(12215.0), "")
            .unwrap();
        c.set(
            "Spending 30% or more of income on shelter costs",
            Some(3930.0),
            "",
        )
        .unwrap();
        c.set(
            "Spending less than 30% of income on shelter costs",
            Some(8270.0),
            "",
        )
        .unwrap();
        c.set("Not applicable", Some(0.0), "").unwrap();
        assert_eq!(c.rate(), Some(100.0 * 3930.0 / 12200.0));
        assert!(!c.reconcile("fixture").unwrap());
        assert!(c.set("Not applicable", Some(5.0), "").is_err());
        c.na = Some(1000.0);
        assert!(c.reconcile("fixture").is_err());
        let small = Cell {
            b: Some(0.0),
            u: Some(0.0),
            a: Some(30.0),
            na: Some(0.0),
            s: String::new(),
        };
        assert!(small.reconcile("fixture").unwrap());
        let z = Cell {
            b: Some(0.0),
            u: Some(0.0),
            ..Default::default()
        };
        assert_eq!(z.rate(), None);
    }
}
