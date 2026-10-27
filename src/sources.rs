//! Official table adapters. Each reads one cached StatCan table and returns observations.
//! Legend: t table; r registry; w row; k place id; v vintage; y year; x value; s status;
//! cat category within a measure; o observations; n count of resolved source conflicts.
use crate::{
    E,
    place::{Obs, Registry},
    statcan::{Row, Table},
};
use std::collections::BTreeMap;

/// Place for a row: DGUID when published, else a source-scoped name.
fn place(
    r: &mut Registry,
    w: &Row,
    scope: &str,
    level: &str,
    prio: u8,
) -> Option<(String, String)> {
    let d = w.get("DGUID");
    if d.is_empty() {
        Some((r.named(scope, w.get("GEO"), level), String::new()))
    } else {
        r.dguid(d, w.get("GEO"), prio)
    }
}

fn push(
    o: &mut Vec<Obs>,
    m: &str,
    cat: &str,
    kv: &(String, String),
    y: i32,
    x: (Option<f64>, String),
    src: &str,
) {
    let mut b = Obs::new(m, cat, &kv.0, y, x.0, src);
    b.status = x.1;
    b.vintage = kv.1.clone();
    o.push(b);
}

/// CMHC average rents, row and apartment structures of three or more units, by bedroom count.
pub fn rents(t: &mut Table, r: &mut Registry) -> Result<Vec<Obs>, E> {
    let mut o = Vec::new();
    t.each(|w| {
        if w.get("Type of structure") != "Row and apartment structures of three units and over" {
            return Ok(());
        }
        let cat = match w.get("Type of unit") {
            "Bachelor units" => "0br",
            "One bedroom units" => "1br",
            "Two bedroom units" => "2br",
            "Three bedroom units" => "3br",
            s => return Err(format!("unknown unit type {s}").into()),
        };
        if let Some(k) = place(r, w, "cmhc", "centre", 1) {
            push(&mut o, "rent", cat, &k, w.year()?, w.value()?, "34100133");
        }
        Ok(())
    })?;
    Ok(o)
}

/// CMHC vacancy, all bedroom sizes, metros (0130) then agglomerations of 50,000+ (0131).
/// Some metros appear in both tables; the metro table is kept and conflicts counted.
pub fn vacancy(ts: &mut [Table], r: &mut Registry) -> Result<(Vec<Obs>, usize), E> {
    let mut m: BTreeMap<(String, i32), Obs> = BTreeMap::new();
    let mut n = 0;
    for t in ts.iter_mut() {
        let id = t.id.clone();
        t.each(|w| {
            let g = w.get("GEO");
            let k = if g == "Census metropolitan areas" {
                r.name(
                    "agg-cma",
                    "All census metropolitan areas",
                    "aggregate",
                    "",
                    2,
                );
                ("agg-cma".to_owned(), String::new())
            } else if g.starts_with("All census agglomerations") {
                r.name(
                    "agg-ca",
                    "All census agglomerations of 50,000+",
                    "aggregate",
                    "",
                    2,
                );
                ("agg-ca".to_owned(), String::new())
            } else {
                match place(r, w, "cmhc", "centre", 1) {
                    Some(k) => k,
                    None => return Ok(()),
                }
            };
            let y = w.year()?;
            let mut v = Vec::new();
            push(&mut v, "vacancy", "", &k, y, w.value()?, &id);
            let b = v.remove(0);
            match m.get(&(k.0.clone(), y)) {
                Some(a) if a.value != b.value => n += 1,
                Some(_) => {}
                None => {
                    m.insert((k.0, y), b);
                }
            }
            Ok(())
        })?;
    }
    Ok((m.into_values().collect(), n))
}

/// Consumer Price Index, annual average, 2002=100.
pub fn cpi(t: &mut Table, r: &mut Registry) -> Result<Vec<Obs>, E> {
    let mut o = Vec::new();
    t.each(|w| {
        let cat = match w.get("Products and product groups") {
            "All-items" => "all",
            "Shelter" => "shelter",
            "Rented accommodation" => "rented",
            "Rent" => "rent",
            _ => return Ok(()),
        };
        if w.get("UOM") != "2002=100" {
            return Ok(());
        }
        if let Some(k) = place(r, w, "cpi", "centre", 1) {
            push(&mut o, "cpi", cat, &k, w.year()?, w.value()?, "18100005");
        }
        Ok(())
    })?;
    Ok(o)
}

/// Canadian Income Survey median after-tax income, constant dollars.
pub fn income(t: &mut Table, r: &mut Registry) -> Result<Vec<Obs>, E> {
    let mut o = Vec::new();
    t.each(|w| {
        if w.get("Income concept") != "Median after-tax income" {
            return Ok(());
        }
        let cat = match w.get("Economic family type") {
            "Economic families and persons not in an economic family" => "all",
            "Persons not in an economic family" => "unattached",
            "One-parent families" => "lone_parent",
            _ => return Ok(()),
        };
        if let Some(k) = place(r, w, "cis", "centre", 1) {
            push(&mut o, "income", cat, &k, w.year()?, w.value()?, "11100190");
        }
        Ok(())
    })?;
    Ok(o)
}

/// Population on July 1; provinces from 1971, metros and agglomerations from 2001.
pub fn population(t: &mut Table, r: &mut Registry) -> Result<Vec<Obs>, E> {
    let mut o = Vec::new();
    let id = t.id.clone();
    t.each(|w| {
        if !w.get("Gender").starts_with("Total") || w.get("Age group") != "All ages" {
            return Ok(());
        }
        // Unlabelled groupings ("All census agglomerations, Ontario") carry no DGUID.
        if w.get("DGUID").is_empty() {
            return Ok(());
        }
        if let Some(k) = r.dguid(w.get("DGUID"), w.get("GEO"), 1) {
            push(&mut o, "population", "", &k, w.year()?, w.value()?, &id);
        }
        Ok(())
    })?;
    Ok(o)
}

/// CMHC housing starts by dwelling type and total completions.
pub fn starts(t: &mut Table, r: &mut Registry) -> Result<Vec<Obs>, E> {
    let mut o = Vec::new();
    t.each(|w| {
        let cat = match w.get("Type of unit") {
            "Total units" => "total",
            "Single-detached" => "single",
            "Semi-detached" => "semi",
            "Row" => "row",
            "Apartment and other unit types" => "apartment",
            _ => return Ok(()),
        };
        let m = match w.get("Housing estimates") {
            "Housing starts" => "starts",
            "Housing completions" if cat == "total" => "completions",
            _ => return Ok(()),
        };
        if let Some(k) = place(r, w, "cmhc", "centre", 1) {
            push(&mut o, m, cat, &k, w.year()?, w.value()?, "34100126");
        }
        Ok(())
    })?;
    Ok(o)
}

fn tenure(s: &str) -> Option<&'static str> {
    match s {
        "Renter" => Some("all"),
        "Renter in social and affordable housing" => Some("social"),
        "Renter not in social and affordable housing" => Some("market"),
        _ => None,
    }
}

const SIZES: [(&str, &str); 4] = [
    ("Large urban population centres", "large"),
    ("Medium population centres", "medium"),
    ("Small population centres", "small"),
    ("Rural areas", "rural"),
];

/// Canadian Housing Survey: renters in core housing need with 95% intervals (0085) and the
/// thresholds they fall below (0086). Provinces only; territories are surveyed separately.
pub fn chs(t: &mut Table, r: &mut Registry) -> Result<Vec<Obs>, E> {
    let mut m: BTreeMap<(String, String, String, i32), Obs> = BTreeMap::new();
    let id = t.id.clone();
    t.each(|w| {
        let Some(ten) = tenure(
            w.get("Tenure including first-time homebuyer and social and affordable housing status"),
        ) else {
            return Ok(());
        };
        let (measure, cat) = if id == "46100085" {
            ("core_need", ten.to_owned())
        } else {
            if ten != "all" {
                return Ok(());
            }
            let c = match w.get("Core housing need") {
                "Below affordability threshold only" => "afford",
                "Below suitability threshold only" => "suit",
                "Below adequacy threshold only" => "adeq",
                "Below affordability and suitability thresholds" => "afford_suit",
                "Below affordability and adequacy thresholds" => "afford_adeq",
                "Below suitability and adequacy thresholds" => "suit_adeq",
                "Below affordability, suitability and adequacy thresholds" => "all3",
                _ => return Ok(()),
            };
            ("core_need_dims", c.to_owned())
        };
        let stat = w.get("Core housing need statistics").to_owned() + w.get("Statistics");
        let slot = match stat.as_str() {
            "Percentage of households in core housing need" | "Percentage of households" => 0,
            "Low 95% confidence interval, percentage of households" => 1,
            "High 95% confidence interval, percentage of households" => 2,
            _ => return Ok(()),
        };
        let g = w.get("GEO");
        let (measure, cat, k) = if w.get("DGUID").is_empty() {
            // Population-centre size groups, by province or nationally ("Total, rural areas").
            if measure != "core_need" || ten != "all" {
                return Ok(());
            }
            let Some((name, size)) = SIZES
                .iter()
                .find(|(n, _)| g.starts_with(n) || g.eq_ignore_ascii_case(&format!("Total, {n}")))
            else {
                return Ok(());
            };
            let k = if g.starts_with("Total") {
                "can".to_owned()
            } else {
                match crate::place::province_of(g) {
                    Some(pr) => format!("pr-{pr}"),
                    None => return Err(format!("CHS group without province: {g} ({name})").into()),
                }
            };
            ("core_need_size", size.to_string(), (k, "2021".to_owned()))
        } else {
            match r.dguid(w.get("DGUID"), g, 1) {
                Some(k) => (measure, cat, k),
                None => return Ok(()),
            }
        };
        let y = w.year()?;
        let x = w.value()?;
        let e = m
            .entry((measure.to_owned(), cat.clone(), k.0.clone(), y))
            .or_insert_with(|| {
                let mut b = Obs::new(measure, &cat, &k.0, y, None, &id);
                b.vintage = k.1.clone();
                b
            });
        match slot {
            0 => {
                e.value = x.0;
                e.status = x.1;
            }
            1 => e.lower = x.0,
            _ => e.upper = x.0,
        }
        Ok(())
    })?;
    Ok(m.into_values().collect())
}

#[cfg(test)]
mod tests {
    #[test]
    fn tenure_labels() {
        assert_eq!(super::tenure("Renter"), Some("all"));
        assert_eq!(super::tenure("Owner"), None);
    }
}
