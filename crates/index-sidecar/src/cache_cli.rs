use arkts_index_sqlite::cache_gc::{Policy, collect};
use std::path::PathBuf;

pub fn run() -> Option<Result<(), String>> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some("--cache-gc") {
        return None;
    }
    Some((|| {
        let mut policy = Policy::new(PathBuf::new());
        let mut automatic = false;
        let mut interval_ms = 3_600_000;
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--cache-dir" => {
                    policy.cache = PathBuf::from(args.next().ok_or("missing cache directory")?)
                }
                "--include-legacy" => policy.include_legacy = true,
                "--apply" => policy.apply = true,
                "--orphan-grace-ms" => policy.grace_ms = number(args.next())?,
                "--idle-ms" => policy.idle_ms = number(args.next())?,
                "--identity-copy-max-bytes" => policy.identity_copy_bytes = number(args.next())?,
                "--max-bytes" => policy.max_bytes = Some(number(args.next())?),
                "--limit" => {
                    policy.limit =
                        usize::try_from(number(args.next())?).map_err(|e| e.to_string())?
                }
                "--after-key" => policy.after = args.next().ok_or("missing cursor")?,
                "--automatic" => automatic = true,
                "--interval-ms" => interval_ms = number(args.next())?,
                _ => return Err(format!("unknown cache option: {arg}")),
            }
        }
        if !policy.cache.is_absolute() {
            return Err("cache directory must be absolute".into());
        }
        let report = if automatic {
            arkts_index_sqlite::cache_gc::automatic::run(&policy, interval_ms)?
        } else {
            collect(&policy)?
        };
        println!(
            "{}",
            serde_json::to_string(&report).map_err(|e| e.to_string())?
        );
        Ok(())
    })())
}

fn number(value: Option<String>) -> Result<u64, String> {
    value
        .ok_or("missing numeric value")?
        .parse()
        .map_err(|e| format!("invalid numeric value: {e}"))
}
