#[path = "support/temp_dir.rs"]
mod support;
use std::{
    collections::BTreeSet,
    sync::{Arc, Barrier},
};
#[test]
fn simultaneous_public_test_directories_never_share_a_path() {
    let barrier = Arc::new(Barrier::new(32));
    let threads: Vec<_> = (0..32)
        .map(|_| {
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut keep = Vec::new();
                for _ in 0..32 {
                    barrier.wait();
                    keep.push(support::TestDir::new("simultaneous-uniqueness-diagnostic"));
                }
                keep
            })
        })
        .collect();
    let keep: Vec<_> = threads
        .into_iter()
        .flat_map(|t| t.join().unwrap())
        .collect();
    let unique: BTreeSet<_> = keep.iter().map(|d| d.path().to_path_buf()).collect();
    assert_eq!(
        unique.len(),
        keep.len(),
        "clock-based create_dir_all must not adopt another test's directory"
    );
}
