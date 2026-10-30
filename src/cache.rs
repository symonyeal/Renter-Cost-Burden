//! Validated source cache and provenance shared by the table and historical-release readers.
//! Legend: p cache path; u download URL; b body; stamp retrieval record; h SHA-256 digest.
use crate::{E, net, read, write};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

/// Reuse `p`, or validate a download before accepting it. The source record describes the
/// accepted bytes, never a later request; pre-existing caches use their modification time.
pub fn source(
    p: &Path,
    u: &str,
    timeout: u64,
    validate: impl FnOnce(&[u8]) -> Result<(), E>,
) -> Result<Value, E> {
    let id = p
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("bad cache filename")?;
    let stamp = p.with_file_name(format!("{}.retrieval.json", id.trim_end_matches("-eng")));
    if !p.exists() {
        eprintln!("download {u}");
        let b = net::bytes(u, timeout)?;
        validate(&b)?;
        if let Some(dir) = p.parent() {
            fs::create_dir_all(dir)?;
        }
        fs::write(p, b)?;
        write(
            &stamp,
            &json!({"retrieved": Utc::now().to_rfc3339(), "basis": "download completed"}),
        )?;
    }
    if !stamp.exists() {
        let d: DateTime<Utc> = fs::metadata(p)?.modified()?.into();
        write(
            &stamp,
            &json!({"retrieved": d.to_rfc3339(), "basis": "cache file modification time"}),
        )?;
    }
    let time = read(stamp)?;
    let mut h = Sha256::new();
    std::io::copy(&mut fs::File::open(p)?, &mut h)?;
    Ok(
        json!({"download": u, "retrieved": time["retrieved"], "retrieved_basis": time["basis"],
        "sha256": format!("{:x}", h.finalize()), "bytes": fs::metadata(p)?.len()}),
    )
}
