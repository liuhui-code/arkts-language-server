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
    assert_eq!(checked, 3);
}
