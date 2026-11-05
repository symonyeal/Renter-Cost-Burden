//! Complete filesystem generations, with one manifest as the acceptance boundary.
//! Legend: base generation store; stage unpublished directory; id SHA-256 of the complete
//! file inventory and semantic inputs. Callers hold a Lease through staging and commitment.
//! Rename establishes atomic visibility; directory/power-loss durability is not claimed.
use crate::E;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// An operating-system file lock releases on process exit, including a crash.
pub struct Lease {
    _file: File,
}

impl Lease {
    pub fn acquire(root: &Path) -> Result<Self, E> {
        fs::create_dir_all(root)?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join(".writer.lock"))?;
        file.try_lock()
            .map_err(|e| format!("writer lease unavailable at {}: {e}", root.display()))?;
        Ok(Self { _file: file })
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    schema: u32,
    generation: String,
    sha256: BTreeMap<String, String>,
    inputs: Value,
}

fn canonical(v: Value) -> Value {
    match v {
        Value::Object(m) => {
            let m: BTreeMap<_, _> = m.into_iter().map(|(k, v)| (k, canonical(v))).collect();
            serde_json::to_value(m).expect("JSON values serialize")
        }
        Value::Array(a) => Value::Array(a.into_iter().map(canonical).collect()),
        v => v,
    }
}

fn identity(h: &BTreeMap<String, String>, inputs: &Value) -> Result<String, E> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&canonical(
            json!({"sha256": h, "inputs": inputs}),
        ))?)
    ))
}

/// Inventory every regular file. Symlinks cannot introduce mutable external state.
pub fn hashes(root: &Path) -> Result<BTreeMap<String, String>, E> {
    fn visit(root: &Path, dir: &Path, h: &mut BTreeMap<String, String>) -> Result<(), E> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let p = entry.path();
            let kind = entry.file_type()?;
            if kind.is_dir() {
                visit(root, &p, h)?;
            } else if kind.is_file() {
                let name = p
                    .strip_prefix(root)?
                    .to_str()
                    .ok_or("non-UTF-8 generation filename")?
                    .replace('\\', "/");
                h.insert(name, format!("{:x}", Sha256::digest(fs::read(p)?)));
            } else {
                return Err(
                    format!("generation contains a nonregular file: {}", p.display()).into(),
                );
            }
        }
        Ok(())
    }
    let mut h = BTreeMap::new();
    visit(root, root, &mut h)?;
    if h.is_empty() {
        return Err("empty generation".into());
    }
    Ok(h)
}

pub struct Stage {
    base: PathBuf,
    path: PathBuf,
}

impl Stage {
    pub fn new(base: &Path) -> Result<Self, E> {
        fs::create_dir_all(base)?;
        let serial = SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let time = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let path = base.join(format!(".staging-{}-{time}-{serial}", std::process::id()));
        fs::create_dir(&path)?;
        Ok(Self {
            base: base.to_owned(),
            path,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Publish only a complete staged tree. Previous generations and failed stages remain
    /// available for recovery; the accepted pointer changes in one final file replacement.
    pub fn commit(self, inputs: Value) -> Result<PathBuf, E> {
        let sha256 = hashes(&self.path)?;
        let inputs = canonical(inputs);
        let generation = identity(&sha256, &inputs)?;
        let manifest = Manifest {
            schema: 3,
            generation,
            sha256,
            inputs,
        };
        let generations = self.base.join("generations");
        fs::create_dir_all(&generations)?;
        let out = generations.join(&manifest.generation);
        if out.exists() {
            if hashes(&out)? != manifest.sha256 {
                return Err("existing generation failed integrity verification".into());
            }
        } else {
            fs::rename(&self.path, &out)?;
        }
        // The stage's unique name also isolates failed manifest writes between attempts.
        let pending = self.path.with_extension("manifest.pending");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&pending)?;
        file.write_all(&serde_json::to_vec(&manifest)?)?;
        file.sync_all()?;
        drop(file);
        fs::rename(pending, self.base.join("manifest.json"))?;
        Ok(out)
    }
}

/// Pin and verify a complete generation. The committed CSV corpus predating manifests is
/// accepted only as the explicit three-file legacy layout; it still needs domain validation.
pub fn resolve(base: &Path) -> Result<PathBuf, E> {
    let pointer = base.join("manifest.json");
    if !pointer.exists() {
        if ["places.csv", "observations.csv", "sources.json"]
            .iter()
            .all(|n| base.join(n).is_file())
        {
            return Ok(base.to_owned());
        }
        return Err(format!("no accepted generation at {}", base.display()).into());
    }
    let m: Manifest = serde_json::from_slice(&fs::read(pointer)?)?;
    if m.schema != 3
        || m.generation.len() != 64
        || !m.generation.bytes().all(|b| b.is_ascii_hexdigit())
        || identity(&m.sha256, &m.inputs)? != m.generation
    {
        return Err("invalid generation manifest".into());
    }
    let path = base.join("generations").join(&m.generation);
    if hashes(&path)? != m.sha256 {
        return Err("generation inventory or hashes differ from the accepted manifest".into());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn directory() -> PathBuf {
        let root = std::env::var_os("RENTER_TEST_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("target/generation-tests"));
        Stage::new(&root).unwrap().path
    }

    #[test]
    fn interrupted_writes_keep_the_previous_complete_generation() {
        let root = directory();
        let _lease = Lease::acquire(&root).unwrap();
        let stage = Stage::new(&root).unwrap();
        fs::write(stage.path().join("first.csv"), "accepted").unwrap();
        let accepted = stage.commit(json!({"source": "fixture"})).unwrap();
        let pointer = fs::read(root.join("manifest.json")).unwrap();
        let stage = Stage::new(&root).unwrap();
        for n in ["places.csv", "observations.csv", "sources.json", "geo.json"] {
            fs::write(stage.path().join(n), n).unwrap();
            assert_eq!(resolve(&root).unwrap(), accepted);
            assert_eq!(fs::read(root.join("manifest.json")).unwrap(), pointer);
        }
        // A failure at the final publication step also retains the previous pointer.
        let pending = stage.path().with_extension("manifest.pending");
        fs::write(pending, "injected collision").unwrap();
        assert!(stage.commit(json!({"source": "replacement"})).is_err());
        assert_eq!(resolve(&root).unwrap(), accepted);
        assert_eq!(fs::read(root.join("manifest.json")).unwrap(), pointer);
    }

    #[test]
    fn writer_lease_conflicts_and_releases() {
        let root = directory();
        let lease = Lease::acquire(&root).unwrap();
        assert!(Lease::acquire(&root).is_err());
        drop(lease);
        assert!(Lease::acquire(&root).is_ok());
    }

    #[test]
    fn full_inventory_and_existing_generations_are_verified() {
        let root = directory();
        let _lease = Lease::acquire(&root).unwrap();
        let stage = Stage::new(&root).unwrap();
        fs::write(stage.path().join("value.csv"), "accepted").unwrap();
        let accepted = stage.commit(json!({"revision": "v1"})).unwrap();
        assert_eq!(resolve(&root).unwrap(), accepted);
        let again = Stage::new(&root).unwrap();
        fs::write(again.path().join("value.csv"), "accepted").unwrap();
        assert_eq!(again.commit(json!({"revision": "v1"})).unwrap(), accepted);
        fs::write(accepted.join("unexpected.csv"), "extra").unwrap();
        assert!(resolve(&root).is_err());
        let stage = Stage::new(&root).unwrap();
        fs::write(stage.path().join("value.csv"), "accepted").unwrap();
        assert!(stage.commit(json!({"revision": "v1"})).is_err());
    }

    #[test]
    fn semantic_inputs_select_a_new_generation_and_legacy_is_explicit() {
        let root = directory();
        assert!(resolve(&root).is_err());
        for n in ["places.csv", "observations.csv", "sources.json"] {
            fs::write(root.join(n), n).unwrap();
        }
        assert_eq!(resolve(&root).unwrap(), root);
        let make = |inputs| {
            let stage = Stage::new(&root).unwrap();
            fs::write(stage.path().join("value.csv"), "same").unwrap();
            stage.commit(inputs).unwrap()
        };
        let old = make(json!({"code": "old"}));
        let new = make(json!({"code": "new"}));
        assert_ne!(old, new);
        assert!(old.exists());
        assert_eq!(resolve(&root).unwrap(), new);
        let mut m: Value =
            serde_json::from_slice(&fs::read(root.join("manifest.json")).unwrap()).unwrap();
        m["schema"] = json!(999);
        fs::write(root.join("manifest.json"), serde_json::to_vec(&m).unwrap()).unwrap();
        assert!(resolve(&root).is_err());
    }
}
