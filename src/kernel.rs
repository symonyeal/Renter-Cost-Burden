//! NumPy-compatible county bootstrap reductions.
//! Legend: v values; ix resampled county indices; n row length; s sum; r eight
//! partial sums; i position; k aligned split; q request; b input JSON bytes.
use serde::Deserialize;
use serde_json::json;
use std::{
    error::Error,
    io::{self, Read},
};

#[derive(Deserialize)]
struct Request {
    op: String,
    values: Vec<f64>,
    indices: Vec<Vec<usize>>,
}

// NumPy's contiguous float64 reduction uses eight accumulators through 128
// values, then splits on multiples of eight. Reassociation changes intervals.
fn sum(v: &[f64]) -> f64 {
    let n = v.len();
    if n < 8 {
        let mut s = -0.0;
        for &v in v {
            s += v;
        }
        s
    } else if n <= 128 {
        let mut r = [v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7]];
        let mut i = 8;
        while i <= n - 8 {
            for k in 0..8 {
                r[k] += v[i + k];
            }
            i += 8;
        }
        let mut s = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
        while i < n {
            s += v[i];
            i += 1;
        }
        s
    } else {
        let k = (n / 2) / 8 * 8;
        sum(&v[..k]) + sum(&v[k..])
    }
}

pub fn run() -> Result<(), Box<dyn Error>> {
    let mut b = String::new();
    io::stdin().read_to_string(&mut b)?;
    let q: Request = serde_json::from_str(&b)?;
    if q.op != "bootstrap" {
        return Err("unsupported kernel operation".into());
    }
    if q.values.is_empty() || q.values.iter().any(|v| !v.is_finite()) {
        return Err("bootstrap requires finite, nonempty values".into());
    }
    let mut means = Vec::with_capacity(q.indices.len());
    let mut v = Vec::with_capacity(q.values.len());
    for ix in q.indices {
        if ix.len() != q.values.len() {
            return Err("bootstrap row length mismatch".into());
        }
        v.clear();
        for i in ix {
            v.push(*q.values.get(i).ok_or("bootstrap index out of range")?);
        }
        // NumPy's reduce adds the pairwise block to its +0.0 identity.
        // See numpy/_core/src/umath/loops_arithm_fp.dispatch.c.src, reduce branch.
        means.push((0.0 + sum(&v)) / v.len() as f64);
    }
    println!(
        "{}",
        json!({"means": means, "mean": (0.0 + sum(&q.values)) / q.values.len() as f64})
    );
    Ok(())
}
