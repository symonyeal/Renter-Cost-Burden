//! Published observations to derived series and headline facts; no I/O or export format.
//! Legend: p places; o observations; v values keyed by (measure, category, place, year);
//! b CPI base year; pr province; z observed value; f headline facts.
use crate::place::{Obs, Place};
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

/// Add derived observations in natural-key order and compute facts from the complete set.
pub fn enrich(p: &[Place], o: &mut Vec<Obs>) -> Value {
    o.extend(derive(p, o));
    o.sort_by_key(Obs::key);
    facts(p, o)
}

type V = BTreeMap<(String, String, String, i32), f64>;

fn lookup(o: &[Obs]) -> V {
    o.iter().filter_map(|x| Some((x.key(), x.value?))).collect()
}

fn get(v: &V, m: &str, cat: &str, k: &str, y: i32) -> Option<f64> {
    v.get(&(m.to_owned(), cat.to_owned(), k.to_owned(), y))
        .copied()
}

fn derived(m: &str, cat: &str, k: &str, y: i32, x: f64, src: &str) -> Obs {
    let mut o = Obs::new(m, cat, k, y, Some(x), src);
    o.status = "derived".into();
    o
}

/// Series computed from published values. Nothing is filled where an input is missing.
fn derive(p: &[Place], o: &[Obs]) -> Vec<Obs> {
    let v = lookup(o);
    let pr: BTreeMap<&str, &str> = p.iter().map(|x| (x.id.as_str(), x.pr.as_str())).collect();
    let b = o
        .iter()
        .filter(|x| x.measure == "cpi" && x.cat == "all" && x.place == "can" && x.value.is_some())
        .map(|x| x.year)
        .max()
        .unwrap_or(2025);
    let mut d = Vec::new();
    for x in o {
        let Some(z) = x.value else { continue };
        match x.measure.as_str() {
            "rent" => {
                // Deflated with the province's all-items CPI, in base-year dollars.
                let ppr = pr.get(x.place.as_str()).copied().unwrap_or_default();
                let g = format!("pr-{ppr}");
                if let (Some(c0), Some(c1)) = (
                    get(&v, "cpi", "all", &g, x.year),
                    get(&v, "cpi", "all", &g, b),
                ) {
                    d.push(derived(
                        "rent_real",
                        &x.cat,
                        &x.place,
                        x.year,
                        z * c1 / c0,
                        "derived: 34100133 x 18100005",
                    ));
                }
                if let Some(z0) = get(&v, "rent", &x.cat, &x.place, x.year - 1)
                    && z0 > 0.0
                {
                    d.push(derived(
                        "rent_change",
                        &x.cat,
                        &x.place,
                        x.year,
                        100.0 * (z / z0 - 1.0),
                        "derived: 34100133",
                    ));
                }
            }
            "cpi" if x.cat == "rent" => {
                if let Some(c) = get(&v, "cpi", "all", &x.place, x.year) {
                    d.push(derived(
                        "rent_relative",
                        "",
                        &x.place,
                        x.year,
                        100.0 * z / c,
                        "derived: 18100005",
                    ));
                }
                if let Some(z0) = get(&v, "cpi", "rent", &x.place, x.year - 1) {
                    d.push(derived(
                        "rent_inflation",
                        "",
                        &x.place,
                        x.year,
                        100.0 * (z / z0 - 1.0),
                        "derived: 18100005",
                    ));
                }
            }
            "starts" if x.cat == "total" => {
                if let Some(n) = get(&v, "population", "", &x.place, x.year)
                    && n > 0.0
                {
                    d.push(derived(
                        "starts_per_1000",
                        "",
                        &x.place,
                        x.year,
                        1000.0 * z / n,
                        "derived: 34100126 / 17100005",
                    ));
                }
                if let Some(a) = get(&v, "starts", "apartment", &x.place, x.year)
                    && z > 0.0
                {
                    d.push(derived(
                        "apartment_share",
                        "",
                        &x.place,
                        x.year,
                        100.0 * a / z,
                        "derived: 34100126",
                    ));
                }
            }
            _ => {}
        }
    }
    d
}

fn median(mut z: Vec<f64>) -> Option<f64> {
    if z.is_empty() {
        return None;
    }
    z.sort_by(f64::total_cmp);
    let n = z.len();
    Some(if n % 2 == 1 {
        z[n / 2]
    } else {
        (z[n / 2 - 1] + z[n / 2]) / 2.0
    })
}

fn last_year(v: &V, m: &str, cat: &str, k: &str) -> Option<i32> {
    v.keys()
        .filter(|x| x.0 == m && x.1 == cat && x.2 == k)
        .map(|x| x.3)
        .max()
}

/// Headline numbers for the lead, computed here so the page never hand-types a figure.
fn facts(p: &[Place], o: &[Obs]) -> Value {
    let v = lookup(o);
    let mut f = Map::new();
    let lvl: BTreeMap<&str, &str> = p
        .iter()
        .map(|x| (x.id.as_str(), x.level.as_str()))
        .collect();
    let name: BTreeMap<&str, &str> = p.iter().map(|x| (x.id.as_str(), x.name.as_str())).collect();
    if let Some(y1) = last_year(&v, "cpi", "rent", "can") {
        let y0 = 2000;
        if let (Some(r0), Some(r1), Some(a0), Some(a1)) = (
            get(&v, "cpi", "rent", "can", y0),
            get(&v, "cpi", "rent", "can", y1),
            get(&v, "cpi", "all", "can", y0),
            get(&v, "cpi", "all", "can", y1),
        ) {
            f.insert(
                "cpi_rent".into(),
                json!({"from": y0, "to": y1,
                "rent_pct": 100.0 * (r1 / r0 - 1.0), "all_pct": 100.0 * (a1 / a0 - 1.0)}),
            );
        }
    }
    // Real two-bedroom rent change in the typical metro area, same areas in both years.
    let metros: Vec<&str> = p
        .iter()
        .filter(|x| x.level == "metro")
        .map(|x| x.id.as_str())
        .collect();
    if let Some(y1) = v
        .keys()
        .filter(|x| x.0 == "rent_real" && x.1 == "2br")
        .map(|x| x.3)
        .max()
    {
        let y0 = y1 - 10;
        let z: Vec<f64> = metros
            .iter()
            .filter_map(|k| {
                Some(
                    100.0
                        * (get(&v, "rent_real", "2br", k, y1)?
                            / get(&v, "rent_real", "2br", k, y0)?
                            - 1.0),
                )
            })
            .collect();
        let n = z.len();
        if let Some(q) = median(z) {
            f.insert(
                "metro_real_rent".into(),
                json!({"from": y0, "to": y1, "median_pct": q, "areas": n}),
            );
        }
        let top = metros
            .iter()
            .filter_map(|k| Some((get(&v, "rent", "2br", k, y1)?, *k)))
            .max_by(|a, b| a.0.total_cmp(&b.0));
        if let Some((x, k)) = top {
            f.insert(
                "top_rent".into(),
                json!({"year": y1, "place": k, "name": name[k], "rent": x}),
            );
        }
    }
    if let (Some(a), Some(b)) = (
        get(&v, "burden_history", "", "can", 2016),
        get(&v, "burden_history", "", "can", 2021),
    ) {
        f.insert("burden".into(), json!({"2016": a, "2021": b}));
    }
    let cn: Vec<(i32, f64)> = v
        .iter()
        .filter(|x| x.0.0 == "core_need" && x.0.1 == "all" && x.0.2 == "can")
        .map(|x| (x.0.3, *x.1))
        .collect();
    if let (Some(a), Some(b)) = (cn.first(), cn.last()) {
        f.insert(
            "core_need".into(),
            json!({"from": a.0, "to": b.0, "from_pct": a.1, "to_pct": b.1}),
        );
    }
    let vac: Vec<(i32, f64)> = v
        .iter()
        .filter(|x| x.0.0 == "vacancy" && x.0.2 == "agg-cma")
        .map(|x| (x.0.3, *x.1))
        .collect();
    if let Some(l) = vac.last() {
        let lo = vac
            .iter()
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .copied()
            .unwrap_or(*l);
        f.insert(
            "vacancy".into(),
            json!({"year": l.0, "pct": l.1, "low_year": lo.0, "low_pct": lo.1}),
        );
    }
    // Communities with at least 5,000 renter households: rounding cannot drive the rank, and
    // student enclaves (Metro Vancouver A, the UBC lands, 63%) do not stand for a city.
    let top = v
        .iter()
        .filter(|x| x.0.0 == "burden" && lvl.get(x.0.2.as_str()) == Some(&"community"))
        .filter(|x| get(&v, "renter_households", "", &x.0.2, 2021).is_some_and(|n| n >= 5000.0))
        .max_by(|a, b| a.1.total_cmp(b.1));
    if let Some((k, x)) = top {
        f.insert(
            "top_community".into(),
            json!({"place": k.2, "name": name[k.2.as_str()], "pct": x}),
        );
    }
    Value::Object(f)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pl(id: &str, pr: &str, level: &str) -> Place {
        serde_json::from_value(json!({"id": id, "name": id, "level": level, "pr": pr})).unwrap()
    }
    #[test]
    fn real_rent_uses_the_province_cpi_and_never_fills_gaps() {
        let p = [
            pl("m-1", "35", "metro"),
            pl("pr-35", "35", "province"),
            pl("can", "", "country"),
        ];
        let o = vec![
            Obs::new("cpi", "all", "can", 2025, Some(100.0), "t"),
            Obs::new("cpi", "all", "pr-35", 2024, Some(80.0), "t"),
            Obs::new("cpi", "all", "pr-35", 2025, Some(100.0), "t"),
            Obs::new("rent", "2br", "m-1", 2023, Some(900.0), "t"),
            Obs::new("rent", "2br", "m-1", 2024, Some(1000.0), "t"),
            Obs::new("rent", "2br", "m-1", 2025, Some(1100.0), "t"),
        ];
        let d = derive(&p, &o);
        let real: Vec<_> = d
            .iter()
            .filter(|x| x.measure == "rent_real")
            .map(|x| (x.year, x.value.unwrap()))
            .collect();
        // 2023 has no provincial CPI: no real value rather than a borrowed one.
        assert_eq!(real, vec![(2024, 1250.0), (2025, 1100.0)]);
        let ch: Vec<_> = d
            .iter()
            .filter(|x| x.measure == "rent_change")
            .map(|x| x.year)
            .collect();
        assert_eq!(ch, vec![2024, 2025]);
    }
    #[test]
    fn median_even_and_odd() {
        assert_eq!(median(vec![3.0, 1.0, 2.0]), Some(2.0));
        assert_eq!(median(vec![4.0, 1.0, 2.0, 3.0]), Some(2.5));
        assert_eq!(median(vec![]), None);
    }
}
