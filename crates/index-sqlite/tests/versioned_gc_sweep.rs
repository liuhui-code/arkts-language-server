use arkts_index_sqlite::VersionedFacts;
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn a_zero_work_quantum_is_not_evidence_that_the_owner_sweep_has_finished() {
    let temp = temp_dir::TestDir::new("gc-owner-sweep");
    let path = temp.path().join("facts.sqlite3");
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let owners: Vec<_> = (0..66)
        .map(|_| VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap())
        .collect();
    let first = collector.collect_garbage(1).unwrap();
    assert_eq!(first.work_items, 0);
    assert!(!first.owner_scan_wrapped);
    assert_eq!(first.owners_examined, 1);
    let mut examined = first.owners_examined;
    let mut wrapped = false;
    for _ in 0..100 {
        let r = collector.collect_garbage(1).unwrap();
        assert_eq!(r.work_items, 0);
        examined += r.owners_examined;
        if r.owner_scan_wrapped {
            wrapped = true;
            break;
        }
    }
    assert!(wrapped);
    assert_eq!(examined, owners.len() + 1);
    drop(owners);
}
