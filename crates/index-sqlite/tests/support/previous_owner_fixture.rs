//! Byte-for-byte database fixtures produced by the previous public API.
#[path = "temp_dir.rs"]
mod temp_dir;
use std::fs;
pub fn fixture() -> (temp_dir::TestDir, serde_json::Value) {
    #[cfg(not(feature = "experimental-occurrence-without-rowid"))]
    const INPUTS: (&[u8], &[u8], &[u8]) = (
        include_bytes!("../fixtures/owner-format8/data.dbfixture"),
        include_bytes!("../fixtures/owner-format8/control.dbfixture"),
        include_bytes!("../fixtures/owner-format8/fixture.json"),
    );
    #[cfg(feature = "experimental-occurrence-without-rowid")]
    const INPUTS: (&[u8], &[u8], &[u8]) = (
        include_bytes!("../fixtures/owner-format108/data.dbfixture"),
        include_bytes!("../fixtures/owner-format108/control.dbfixture"),
        include_bytes!("../fixtures/owner-format108/fixture.json"),
    );
    materialize(INPUTS)
}
/// Real format9/109 producer inputs, distinct from old8/108 lease layout.
pub fn fixture_slots() -> (temp_dir::TestDir, serde_json::Value) {
    #[cfg(not(feature = "experimental-occurrence-without-rowid"))]
    const INPUTS: (&[u8], &[u8], &[u8]) = (
        include_bytes!("../fixtures/owner-format9/data.dbfixture"),
        include_bytes!("../fixtures/owner-format9/control.dbfixture"),
        include_bytes!("../fixtures/owner-format9/fixture.json"),
    );
    #[cfg(feature = "experimental-occurrence-without-rowid")]
    const INPUTS: (&[u8], &[u8], &[u8]) = (
        include_bytes!("../fixtures/owner-format109/data.dbfixture"),
        include_bytes!("../fixtures/owner-format109/control.dbfixture"),
        include_bytes!("../fixtures/owner-format109/fixture.json"),
    );
    materialize(INPUTS)
}
fn materialize(inputs: (&[u8], &[u8], &[u8])) -> (temp_dir::TestDir, serde_json::Value) {
    let record: serde_json::Value = serde_json::from_slice(inputs.2).unwrap();
    let temp = temp_dir::TestDir::new("previous-owner-fixture");
    let store = record["store"].as_str().unwrap();
    assert_eq!(std::path::Path::new(store).components().count(), 1);
    fs::write(temp.path().join(store), inputs.0).unwrap();
    fs::write(temp.path().join("catalog-state.sqlite3"), inputs.1).unwrap();
    (temp, record)
}
