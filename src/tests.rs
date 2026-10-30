//! Retrieval contracts exercised against a local HTTP server; no official-source dependency.
use crate::{cache, net};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    net::TcpListener,
    path::PathBuf,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

fn server(replies: Vec<(&'static str, &'static str)>) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/source", listener.local_addr().unwrap());
    let handle = thread::spawn(move || {
        for (status, body) in replies {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = BufReader::new(&stream);
            loop {
                let mut line = String::new();
                assert!(request.read_line(&mut line).unwrap() > 0);
                if line == "\r\n" {
                    break;
                }
            }
            write!(
                stream,
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        }
    });
    (url, handle)
}

fn directory() -> PathBuf {
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("target/retrieval-tests/{id}"))
}

#[test]
fn json_retries_status_html_and_arcgis_errors() {
    let (url, handle) = server(vec![
        ("503 Service Unavailable", "retry"),
        ("200 OK", "<html>bad node</html>"),
        ("200 OK", r#"{"error":{"code":500}}"#),
        ("200 OK", r#"{"features":[]}"#),
    ]);
    assert_eq!(
        net::json(&url, 5).unwrap(),
        serde_json::json!({"features": []})
    );
    handle.join().unwrap();
}

#[test]
fn bytes_retry_and_cache_preserves_accepted_provenance() {
    let (url, handle) = server(vec![
        ("503 Service Unavailable", "retry"),
        ("200 OK", "accepted"),
    ]);
    let p = directory().join("12345678-eng.zip");
    let first = cache::source(&p, &url, 5, |b| {
        assert_eq!(b, b"accepted");
        Ok(())
    })
    .unwrap();
    handle.join().unwrap();
    assert!(p.with_file_name("12345678.retrieval.json").exists());
    assert_eq!(first["bytes"], 8);
    assert_eq!(first["retrieved_basis"], "download completed");
    let again = cache::source(&p, &url, 5, |_| panic!("cached file downloaded again")).unwrap();
    assert_eq!(first, again);
    assert_eq!(fs::read(p).unwrap(), b"accepted");
}

#[test]
fn invalid_download_is_never_accepted() {
    let (url, handle) = server(vec![("200 OK", "invalid")]);
    let p = directory().join("comparison.csv");
    assert!(cache::source(&p, &url, 5, |_| Err("invalid source".into())).is_err());
    handle.join().unwrap();
    assert!(!p.exists());
    assert!(!p.with_extension("retrieval.json").exists());
}

#[test]
fn legacy_cache_uses_file_time_without_network() {
    let p = directory().join("comparison.csv");
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(&p, "cached").unwrap();
    let record =
        cache::source(&p, "http://127.0.0.1:1", 1, |_| panic!("cache revalidated")).unwrap();
    assert_eq!(record["retrieved_basis"], "cache file modification time");
    assert_eq!(record["bytes"], 6);
    assert!(p.with_extension("retrieval.json").exists());
}
