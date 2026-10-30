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

fn request<T>(
    u: &str,
    t: u64,
    delay_ms: u64,
    parse: impl Fn(reqwest::blocking::Response) -> Result<T, E>,
) -> Result<T, E> {
    let c = client(t)?;
    let mut last = String::new();
    for k in 1..=TRIES {
        match c
            .get(u)
            .send()
            .and_then(|r| r.error_for_status())
            .map_err(E::from)
            .and_then(&parse)
        {
            Ok(v) => return Ok(v),
            Err(e) => last = e.to_string(),
        }
        sleep(Duration::from_millis(delay_ms * u64::from(k)));
    }
    Err(format!("{u}: {last}").into())
}

/// Bytes from `u`, retried on transport errors and non-success status.
pub fn bytes(u: &str, t: u64) -> Result<Vec<u8>, E> {
    let mut r = request(u, t, 1000, Ok)?;
    let mut b = Vec::new();
    r.read_to_end(&mut b)?;
    Ok(b)
}

/// JSON from an ArcGIS REST endpoint. Some nodes behind StatCan's load balancer answer
/// with an HTML error page or a JSON `error`; those are retried like transport failures.
pub fn json(u: &str, t: u64) -> Result<Value, E> {
    request(u, t, 500, |r| {
        let b = r.bytes()?;
        let v: Value = serde_json::from_slice(&b)
            .map_err(|_| format!("non-JSON reply ({} bytes)", b.len()))?;
        if let Some(e) = v.get("error") {
            return Err(e.to_string().into());
        }
        Ok(v)
    })
}
