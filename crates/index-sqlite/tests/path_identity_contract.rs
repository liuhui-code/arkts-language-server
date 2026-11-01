use arkts_index_sqlite::path_to_file_uri;
use std::path::Path;

#[test]
fn file_uri_vectors_preserve_filename_case_and_encoding() {
    let platform = if cfg!(windows) { "windows" } else { "unix" };
    let vectors = include_str!("../../../tests/fixtures/path-identity-vectors.tsv");
    let mut checked = 0;
    for row in vectors.lines() {
        let fields: Vec<_> = row.split('\t').collect();
        assert_eq!(fields.len(), 3);
        if fields[0] != platform {
            continue;
        }
        assert_eq!(path_to_file_uri(Path::new(fields[1])), fields[2]);
        checked += 1;
    }
    assert_eq!(checked, if cfg!(windows) { 6 } else { 3 });
}

/// Windows canonicalize returns extended-length paths for both drives and UNC.
/// Keep this at the public interface; Unix Path semantics cannot certify it.
#[cfg(windows)]
#[test]
fn canonical_windows_prefixes_keep_the_same_file_uri() {
    let vectors = include_str!("../../../tests/fixtures/path-identity-vectors.tsv");
    for row in vectors.lines() {
        let fields: Vec<_> = row.split('\t').collect();
        if fields[0] != "windows" {
            continue;
        }
        let extended = if let Some(unc) = fields[1].strip_prefix(r"\\") {
            format!(r"\\?\UNC\{unc}")
        } else {
            format!(r"\\?\{}", fields[1])
        };
        assert_eq!(
            path_to_file_uri(Path::new(&extended)),
            fields[2],
            "{extended}"
        );
    }
}
