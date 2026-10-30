//! Census 2021 cartographic boundaries: retrieval, island pruning and compact export.
//! Legend: l layer; o OBJECTID; f feature; g ring; p point (x, y metres, EPSG:3347 Statistics
//! Canada Lambert); t server generalization tolerance (m); q output quantum (m); a ring area
//! (m², signed); m minimum kept ring area; c label point; d delta-encoded ring; pr province code.
use crate::{E, net, read, write};
use serde_json::{Value, json};
use std::{collections::BTreeMap, fs, path::Path};

const SVC: &str =
    "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer";

struct Layer {
    key: &'static str,
    id: u8,
    fields: &'static str,
    name: &'static str,
    chunk: usize,
    t: u32,
    m: f64,
}

// Tolerances suit each map's zoom range: provinces and divisions are read nationally,
// metro areas and communities down to city scale. Neighbours are generalized separately,
// so a shared edge can differ by up to `t`; that stays under a pixel at each map's zoom
// limit and is hidden by the boundary stroke.
const LAYERS: [Layer; 4] = [
    Layer {
        key: "pr",
        id: 0,
        fields: "DGUID,PRUID,PRENAME",
        name: "PRENAME",
        chunk: 1,
        t: 1000,
        m: 30e6,
    },
    Layer {
        key: "cd",
        id: 4,
        fields: "DGUID,CDUID,CDNAME,PRUID",
        name: "CDNAME",
        chunk: 8,
        t: 800,
        m: 30e6,
    },
    Layer {
        key: "cma",
        id: 6,
        fields: "DGUID,CMAUID,CMANAME,CMATYPE,PRUID",
        name: "CMANAME",
        chunk: 20,
        t: 100,
        m: 0.2e6,
    },
    Layer {
        key: "csd",
        id: 9,
        fields: "DGUID,CSDUID,CSDNAME,CSDTYPE,PRUID",
        name: "CSDNAME",
        chunk: 40,
        t: 120,
        m: 0.2e6,
    },
];

fn area(g: &[[f64; 2]]) -> f64 {
    g.windows(2)
        .map(|w| w[0][0] * w[1][1] - w[1][0] * w[0][1])
        .sum::<f64>()
        / 2.0
}

/// Area-weighted centroid of the largest ring: a label point that is stable across runs.
fn label(g: &[[f64; 2]]) -> [f64; 2] {
    let a = area(g);
    if a.abs() < 1.0 {
        return g[0];
    }
    let (mut x, mut y) = (0.0, 0.0);
    for w in g.windows(2) {
        let k = w[0][0] * w[1][1] - w[1][0] * w[0][1];
        x += (w[0][0] + w[1][0]) * k;
        y += (w[0][1] + w[1][1]) * k;
    }
    [x / (6.0 * a), y / (6.0 * a)]
}

/// Quantize to `q` and delta-encode; consecutive duplicates after rounding are dropped.
fn encode(g: &[[f64; 2]], q: f64) -> Vec<i64> {
    let mut d = Vec::with_capacity(g.len() * 2);
    let (mut px, mut py) = (0i64, 0i64);
    let mut n = 0;
    for p in g {
        let (x, y) = ((p[0] / q).round() as i64, (p[1] / q).round() as i64);
        if n > 0 && x == px && y == py {
            continue;
        }
        d.push(x - px);
        d.push(y - py);
        (px, py) = (x, y);
        n += 1;
    }
    d
}

fn rings(f: &Value) -> Result<Vec<Vec<[f64; 2]>>, E> {
    let mut out = Vec::new();
    for g in f["geometry"]["rings"]
        .as_array()
        .ok_or("feature without rings")?
    {
        let mut r = Vec::new();
        for p in g.as_array().ok_or("ring is not an array")? {
            let x = p[0].as_f64().ok_or("bad x")?;
            let y = p[1].as_f64().ok_or("bad y")?;
            r.push([x, y]);
        }
        if r.len() >= 4 {
            out.push(r);
        }
    }
    Ok(out)
}

/// One cached chunk of features. A chunk the service keeps failing on (heavy geometry) is
/// split in half until single features remain.
fn chunk(dir: &Path, l: &Layer, c: &[i64], out: &mut Vec<Value>) -> Result<(), E> {
    let p = dir.join(format!("{}-{}.json", c[0], c[c.len() - 1]));
    let v = if p.exists() {
        read(&p)?
    } else {
        let list: Vec<String> = c.iter().map(i64::to_string).collect();
        let u = format!(
            "{SVC}/{}/query?objectIds={}&outFields={}&returnGeometry=true&outSR=3347&maxAllowableOffset={}&f=json",
            l.id,
            list.join("%2C"),
            l.fields,
            l.t
        );
        match net::json(&u, 600) {
            Ok(v) => {
                if v["features"].as_array().map(Vec::len) != Some(c.len()) {
                    return Err(format!("{} chunk {} returned a partial set", l.key, c[0]).into());
                }
                write(&p, &v)?;
                eprintln!("geo {}: objects {}-{}", l.key, c[0], c[c.len() - 1]);
                v
            }
            Err(e) if c.len() > 1 => {
                eprintln!(
                    "geo {}: splitting {}-{} after {e}",
                    l.key,
                    c[0],
                    c[c.len() - 1]
                );
                let (a, b) = c.split_at(c.len() / 2);
                chunk(dir, l, a, out)?;
                return chunk(dir, l, b, out);
            }
            Err(e) => return Err(e),
        }
    };
    out.extend(v["features"].as_array().cloned().unwrap_or_default());
    Ok(())
}

/// Download (or reuse) the raw chunks of one layer; returns the features in OBJECTID order.
fn fetch(root: &Path, l: &Layer) -> Result<Vec<Value>, E> {
    let dir = root.join("data/raw/geo").join(l.key);
    fs::create_dir_all(&dir)?;
    let ids = net::json(
        &format!("{SVC}/{}/query?where=1%3D1&returnIdsOnly=true&f=json", l.id),
        120,
    )?;
    let mut o: Vec<i64> = ids["objectIds"]
        .as_array()
        .ok_or("no object ids")?
        .iter()
        .filter_map(Value::as_i64)
        .collect();
    o.sort_unstable();
    let mut fs_ = Vec::new();
    for c in o.chunks(l.chunk) {
        chunk(&dir, l, c, &mut fs_)?;
    }
    Ok(fs_)
}

fn id(l: &Layer, a: &Value) -> String {
    let s = |k: &str| a[k].as_str().unwrap_or_default().to_owned();
    match l.key {
        "pr" => format!("pr-{}", s("PRUID")),
        "cd" => format!("cd-{}", s("CDUID")),
        "cma" => format!("m-{}", s("CMAUID")),
        _ => format!("csd-{}", s("CSDUID")),
    }
}

/// CMA/CA features are provincial parts; a metro area crossing a provincial boundary has two,
/// each drawn with the whole area's value (`of`).
fn split(fs_: &mut [Value]) {
    let mut n: BTreeMap<String, usize> = BTreeMap::new();
    for f in fs_.iter() {
        *n.entry(f["id"].as_str().unwrap_or_default().to_owned())
            .or_default() += 1;
    }
    for f in fs_.iter_mut() {
        let k = f["id"].as_str().unwrap_or_default().to_owned();
        if n[&k] > 1 {
            f["of"] = json!(k);
            f["id"] = json!(format!(
                "mp-{}{}",
                f["pr"].as_str().unwrap_or_default(),
                &k[2..]
            ));
        }
    }
}

/// Fetch every layer and write `data/processed/geo/*.json`. Raw chunks are cached.
pub fn run(root: &Path) -> Result<(), E> {
    let out = root.join("data/processed/geo");
    fs::create_dir_all(&out)?;
    // Label points of every feature in km, for dots and zoom targets without loading a layer.
    let mut pts = BTreeMap::new();
    for l in &LAYERS {
        let q = f64::from(l.t) / 4.0;
        let fs_ = fetch(root, l)?;
        let mut by_pr: BTreeMap<String, Vec<Value>> = BTreeMap::new();
        let (mut kept, mut dropped) = (0usize, 0usize);
        for f in &fs_ {
            let a = &f["attributes"];
            let mut g = rings(f)?;
            if g.is_empty() {
                return Err(format!("{} feature {} has no polygon", l.key, id(l, a)).into());
            }
            g.sort_by(|x, y| area(y).abs().total_cmp(&area(x).abs()));
            let c = label(&g[0]);
            // The largest ring always survives so no place disappears from its map.
            let n = g.len();
            g = g
                .into_iter()
                .enumerate()
                .filter(|(i, r)| *i == 0 || area(r).abs() >= l.m)
                .map(|(_, r)| r)
                .collect();
            kept += g.len();
            dropped += n - g.len();
            let d: Vec<Vec<i64>> = g
                .iter()
                .map(|r| encode(r, q))
                .filter(|d| d.len() >= 6)
                .collect();
            let pr = a["PRUID"].as_str().unwrap_or_default().to_owned();
            pts.insert(
                id(l, a),
                json!([(c[0] / 100.0).round() / 10.0, (c[1] / 100.0).round() / 10.0]),
            );
            let mut v = json!({"id": id(l, a), "n": a[l.name], "pr": pr,
                "c": [(c[0] / q).round() as i64, (c[1] / q).round() as i64], "r": d});
            if let Some(t) = a.get("CMATYPE").or(a.get("CSDTYPE")) {
                v["t"] = t.clone();
            }
            by_pr
                .entry(if l.key == "csd" { pr } else { String::new() })
                .or_default()
                .push(v);
        }
        for (pr, mut v) in by_pr {
            if l.key == "cma" {
                split(&mut v);
            }
            v.sort_by(|x, y| x["id"].as_str().cmp(&y["id"].as_str()));
            let name = if pr.is_empty() {
                l.key.to_owned()
            } else {
                format!("{}-{pr}", l.key)
            };
            write(
                out.join(format!("{name}.json")),
                &json!({"layer": l.key, "q": q, "tolerance_m": l.t, "min_ring_m2": l.m,
                    "source": format!("{SVC}/{}", l.id), "features": v}),
            )?;
        }
        eprintln!(
            "geo {}: {} features, {kept} rings kept, {dropped} small islands dropped",
            l.key,
            fs_.len()
        );
    }
    write(out.join("points.json"), &json!(pts))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn square_area_label_and_encoding() {
        let g = [
            [0.0, 0.0],
            [100.0, 0.0],
            [100.0, 100.0],
            [0.0, 100.0],
            [0.0, 0.0],
        ];
        assert_eq!(area(&g), 10_000.0);
        assert_eq!(label(&g), [50.0, 50.0]);
        // 25 m quantum: 100 m steps become 4; the closing point repeats the first.
        assert_eq!(encode(&g, 25.0), vec![0, 0, 4, 0, 0, 4, -4, 0, 0, -4]);
        // Points that collapse to one cell are written once.
        assert_eq!(
            encode(&[[0.0, 0.0], [1.0, 1.0], [50.0, 0.0]], 25.0),
            vec![0, 0, 2, 0]
        );
    }
}
