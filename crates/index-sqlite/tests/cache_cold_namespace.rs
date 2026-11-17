//! Cold concurrent managed-cache creators, through the public lifecycle API.
use arkts_index_sqlite::{cache_gc::lease::CacheLease, workspace_cache_location};
use std::{
    fs,
    sync::{Arc, Barrier},
};
#[path = "support/temp_dir.rs"]
mod temp_dir;

#[test]
fn independent_workspaces_can_create_the_same_cold_cache_namespace_concurrently() {
    concurrent_cold_acquisition(false);
}

#[test]
fn independent_workspaces_can_create_cold_lease_namespace_with_existing_workspaces() {
    concurrent_cold_acquisition(true);
}

fn concurrent_cold_acquisition(workspaces_exist: bool) {
    let temp = temp_dir::TestDir::new("cold-cache-namespace");
    let mut errors = Vec::new();
    for trial in 0..64 {
        let cache = temp.path().join(format!("cache-{trial}"));
        fs::create_dir(&cache).unwrap();
        if workspaces_exist {
            fs::create_dir(cache.join("workspaces")).unwrap();
        }
        let barrier = Arc::new(Barrier::new(2));
        let handles: Vec<_> = (0..2)
            .map(|actor| {
                let root = temp.path().join(format!("workspace-{trial}-{actor}"));
                fs::create_dir(&root).unwrap();
                let location = workspace_cache_location(&cache, &root).unwrap();
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    let lease =
                        CacheLease::acquire(&location.database_path, &location.workspace_identity)
                            .map_err(|error| format!("trial={trial} actor={actor}: {error:?}"))?
                            .expect("managed workspace owns a use lease");
                    lease
                        .record_use()
                        .map_err(|error| format!("trial={trial} actor={actor}: {error}"))
                })
            })
            .collect();
        for handle in handles {
            if let Err(error) = handle.join().unwrap() {
                errors.push(error);
            }
        }
    }
    assert!(
        errors.is_empty(),
        "cold namespace creators must both succeed: count={}, sample={:?}",
        errors.len(),
        &errors[..errors.len().min(8)]
    );
}

#[test]
fn existing_regular_files_never_qualify_as_cache_namespace_directories() {
    for name in ["workspaces", ".leases"] {
        let temp = temp_dir::TestDir::new("cold-cache-invalid-directory");
        let root = temp.path().join("source");
        fs::create_dir(&root).unwrap();
        let cache = temp.path().join("cache");
        fs::create_dir(&cache).unwrap();
        if name == ".leases" {
            fs::create_dir(cache.join("workspaces")).unwrap();
        }
        let invalid = cache.join(name);
        fs::write(&invalid, "preserve-invalid-object").unwrap();
        let location = workspace_cache_location(&cache, &root).unwrap();
        let error = CacheLease::acquire(&location.database_path, &location.workspace_identity)
            .err()
            .expect("an existing file must fail directory validation");
        assert!(error.to_string().contains("unsafe-directory"));
        assert_eq!(
            fs::read_to_string(invalid).unwrap(),
            "preserve-invalid-object"
        );
    }
}

#[cfg(unix)]
#[test]
fn existing_directory_symlinks_never_qualify_as_cache_namespace_directories() {
    use std::os::unix::fs::symlink;
    for name in ["workspaces", ".leases"] {
        let temp = temp_dir::TestDir::new("cold-cache-linked-directory");
        let root = temp.path().join("source");
        let outside = temp.path().join("outside");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("marker"), "keep").unwrap();
        let cache = temp.path().join("cache");
        fs::create_dir(&cache).unwrap();
        if name == ".leases" {
            fs::create_dir(cache.join("workspaces")).unwrap();
        }
        symlink(&outside, cache.join(name)).unwrap();
        let location = workspace_cache_location(&cache, &root).unwrap();
        assert!(
            CacheLease::acquire(&location.database_path, &location.workspace_identity).is_err()
        );
        assert_eq!(fs::read_to_string(outside.join("marker")).unwrap(), "keep");
        assert_eq!(fs::read_dir(outside).unwrap().count(), 1);
    }
}
