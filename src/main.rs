//! Renter cost burden pipeline.
//! Legend: r repository root; c configuration; ca Canadian exports; us US exports;
//! p path; b bytes; h content hash; d delivered data; e process exit status.
mod canada;
mod kernel;
mod us;

use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    error::Error,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

type E = Box<dyn Error>;

fn read(p: impl AsRef<Path>) -> Result<Value, E> {
    Ok(serde_json::from_slice(&fs::read(p)?)?)
}

fn write(p: impl AsRef<Path>, d: &Value) -> Result<(), E> {
    let p = p.as_ref();
    if let Some(d) = p.parent() {
        fs::create_dir_all(d)?;
    }
    let b = serde_json::to_vec_pretty(d)?;
    // A failed serialization must leave the accepted artifact intact.
    let t = p.with_extension("json.pending");
    fs::write(&t, b)?;
    fs::rename(t, p)?;
    Ok(())
}

fn build(r: &Path) -> Result<(), E> {
    let c = read(r.join("config.json"))?;
    let ca = canada::run(r, false)?;
    let us = us::run(r, &c)?;
    let d = json!({"schema": 1, "ca": ca, "us": us,
        "notes": "Source reference years are not retrieval years. Countries have different populations and survey designs."});
    write(r.join("data/processed/us.json"), &d["us"])?;
    write(r.join("site/bundle.json"), &d)?;
    fs::create_dir_all(r.join("site/downloads"))?;
    for f in ["canada.json", "us.json"] {
        fs::copy(
            r.join("data/processed").join(f),
            r.join("site/downloads").join(f),
        )?;
    }
    let mut h = serde_json::Map::new();
    for f in [
        "config.json",
        "Cargo.toml",
        "Cargo.lock",
        "rust-toolchain.toml",
        "src/main.rs",
        "src/us.rs",
        "src/canada.rs",
        "src/kernel.rs",
        "site/index.html",
        "site/app.js",
        "site/style.css",
        "data/processed/acs.csv",
        "data/processed/cpi.csv",
        "data/processed/manifest.json",
        "data/processed/canada.json",
        "data/processed/predictions.csv",
        "site/bundle.json",
    ] {
        let b = fs::read(r.join(f))?;
        h.insert(f.to_string(), json!(format!("{:x}", Sha256::digest(&b))));
    }
    write(
        r.join("artifacts/rust-build.json"),
        &json!({"schema":1,"sha256":h,
        "command":"cargo run --release --locked -- build",
        "runtime":"Rust; model fitting remains the registered Python implementation"}),
    )?;
    println!(
        "Built site/bundle.json: {} Canadian and {} US observations",
        d["ca"]["observations"]
            .as_array()
            .ok_or("missing Canadian observations")?
            .len(),
        d["us"]["observations"]
            .as_array()
            .ok_or("missing US observations")?
            .len()
    );
    Ok(())
}

fn main() -> Result<(), E> {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let r = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    match a.first().map(String::as_str).unwrap_or("build") {
        "kernel" => kernel::run(),
        "build" => build(&r),
        "fetch-ca" => {
            canada::run(&r, true)?;
            Ok(())
        }
        "verify-us" => us::verify(&r),
        "refit-us" => {
            for m in ["models", "comparison", "gap", "build_site"] {
                let e = Command::new("python")
                    .args(["-m", &format!("analysis.{m}")])
                    .current_dir(&r)
                    .status()?;
                if !e.success() {
                    return Err(format!("US stage {m} failed: {e}").into());
                }
            }
            build(&r)
        }
        "help" | "--help" | "-h" => {
            println!(
                "renter-cost-burden [build | fetch-ca | verify-us | refit-us]\n\
                build: offline Rust analysis and site export\n\
                fetch-ca: explicitly download and process official Canadian sources\n\
                verify-us: independently compare Rust calculations with committed ACS exports\n\
                refit-us: rerun the registered Python study, then rebuild offline"
            );
            Ok(())
        }
        s => Err(format!("unknown command: {s}; use --help").into()),
    }
}
