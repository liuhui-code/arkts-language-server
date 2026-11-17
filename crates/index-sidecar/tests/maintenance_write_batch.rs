use serde_json::json;
use std::fs;
#[allow(dead_code)]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, init, start, terminal};
#[test]
fn real_cold_and_changed_reconciliation_share_small_file_write_transactions() {
    let temp = TestDir::new("native-file-write-batch");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for i in 0..128 {
        fs::write(
            root.join(format!("{i:04}.ets")),
            format!("export class Before{i} {{}}\n"),
        )
        .unwrap();
    }
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let cold = terminal(&mut p);
    assert_eq!(cold["outcome"], "qualified");
    assert_eq!(cold["writtenDocuments"], 128);
    assert_eq!(
        cold["fileWriteWork"]["commitCallbacks"], 2,
        "cold must batch real file writes: {cold}"
    );
    for i in 0..65 {
        fs::write(
            root.join(format!("{i:04}.ets")),
            format!("export class After{i} {{}}\n"),
        )
        .unwrap();
    }
    start(&mut p, 3, 2);
    let changed = terminal(&mut p);
    assert_eq!(changed["outcome"], "qualified");
    assert_eq!(changed["writtenDocuments"], 65);
    assert_eq!(changed["fileWriteWork"]["commitCallbacks"], 2);
    for (id, query, expected) in [(4, "After", 65), (5, "Before", 63)] {
        let found = p.request(
            json!({"protocol":1,"id":id,"method":"search","params":{"query":query,"limit":1000}}),
        );
        assert_eq!(found["result"]["items"].as_array().unwrap().len(), expected);
        assert_eq!(found["result"]["qualification"], changed["qualification"]);
    }
    start(&mut p, 6, 3);
    let unchanged = terminal(&mut p);
    assert_eq!(unchanged["outcome"], "qualified");
    assert_eq!(unchanged["writtenDocuments"], 0);
    assert_eq!(unchanged["fileWriteWork"]["commitCallbacks"], 0);
    p.shutdown(7);
}
