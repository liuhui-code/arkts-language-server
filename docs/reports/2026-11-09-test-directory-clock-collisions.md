# IDX-V1-OBS-009: clock-based temporary directories are not isolated

2026-11-09. Test tooling defect, no product cache policy change.

The new full candidate's default Rust all-targets419PASS/0FAIL/1existing ignored, release/style/Clippy and most
supplements passed. Experimental cache namespace failed at cache_cold_namespace.rs:25, fs::create_dir(cache),
before CacheLease/product code: another parallel test had already created cache-0 in the same TestDir root.
Both tests passed the same name to TestDir, whose original key was name/PID/SystemTime::now().as_nanos;
create_dir_all silently adopted a directory if those keys collided. System time values were not unique.

Independent public constructor control:32threads*32calls,837unique paths for1024live directories (FAIL).
Formal SQLite helper regression:765/1024 (FAIL); the same defect in shared Native helper:776/1024 (FAIL).
All created directories were kept alive until uniqueness was checked; no test was allowed to delete another's path.
No reduced thread count, sleep, retry-until-green or weaker product assertion was used.

Repair: each shared helper adds a process-local atomic sequence and atomically creates a new directory;
AlreadyExists selects another sequence instead of adopting existing data. Other filesystem errors still fail.
Native helper keeps canonical physical paths. The shared names used inside the actual namespace-race test remain
unchanged, so it still exercises two product actors racing on one intentionally shared cache.

Current focused SQLite15PASS (both namespace variants, use-record concurrency, migration3, SQL lifecycle2,
new1024-directory isolation); Native2PASS (real SQL progress and directory isolation). Strict full checks pending.
No library dependency, environment flag, product budget, timeout or source-path normalization change.

The failing full attempt was safely stopped: only its13verified descendants, PID/start identity checked,
zero remaining. Partial pnpm checkfast isNOT PASS. Original logs and experimentalFAIL retained. The queued
Photos run saw the failed gate and started no load. A fresh full candidate must now include this fixture repair.

Evidence: `.bench/index-versioned-maintenance-20261104/temp-directory-collision-20261109`,
`ix09-validation-final-{rust-workspace,experimental-cache-namespace,checkfast}.log`,
`ix09-validation-{owned-before-fixture-stop,fixture-stop}.json` and failed full receipt.
The product SQL-validation liveness fix is separateINIT002; its existing cancellation/corruption characterization
also permits removal of redundant cancellation flags, using authoritative SQLITE_INTERRUPT mapping.
Real corruption staysCorrupt. ADR0043/0028 constraints remain unchanged; no new architecture decision required.
