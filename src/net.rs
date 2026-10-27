//! HTTP retrieval with retries for official sources.
//! Legend: u URL; t timeout seconds; k attempt; b body bytes; v parsed JSON.
use crate::E;
use serde_json::Value;
use std::{io::Read, thread::sleep, time::Duration};

const TRIES: u32 = 10;

fn client(t: u64) -> Result<reqwest::blocking::Client, E> {
    Ok(reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(t))
        // A kept-alive connection stays on one load-balanced node; a retry must reconnect.
        .pool_max_idle_per_host(0)
        .user_agent("renter-cost-burden (+https://github.com/symonyeal/Renter-Cost-Burden)")
        .build()?)
}

/// Bytes from `u`, retried on transport errors and non-success status.
pub fn bytes(u: &str, t: u64) -> Result<Vec<u8>, E> {
    let c = client(t)?;
    let mut last = String::new();
    for k in 1..=TRIES {
        match c.get(u).send().and_then(|r| r.error_for_status()) {
            Ok(mut r) => {
                let mut b = Vec::new();
                r.read_to_end(&mut b)?;
                return Ok(b);
            }
            Err(e) => last = e.to_string(),
        }
        sleep(Duration::from_secs(u64::from(k)));
    }
    Err(format!("{u}: {last}").into())
}

/// JSON from an ArcGIS REST endpoint. Some nodes behind StatCan's load balancer answer
/// with an HTML error page or a JSON `error`; those are retried like transport failures.
pub fn json(u: &str, t: u64) -> Result<Value, E> {
    let c = client(t)?;
    let mut last = String::new();
    for k in 1..=TRIES {
        match c.get(u).send().and_then(|r| r.error_for_status()) {
            Ok(r) => match r.bytes() {
                Ok(b) => match serde_json::from_slice::<Value>(&b) {
                    Ok(v) if v.get("error").is_none() => return Ok(v),
                    Ok(v) => last = v["error"].to_string(),
                    Err(_) => last = format!("non-JSON reply ({} bytes)", b.len()),
                },
                Err(e) => last = e.to_string(),
            },
            Err(e) => last = e.to_string(),
        }
        sleep(Duration::from_millis(500 * u64::from(k)));
    }
    Err(format!("{u}: {last}").into())
}
