use std::{fs::OpenOptions, io::Write};

/// Detailed batch/checkpoint records are opt-in; protocol clients need not drain
/// an unbounded volume of operational output during a large initial catalog.
pub(super) fn record(event: String) {
    let Some(path) =
        std::env::var_os("ARKTS_INDEX_CATALOG_BUILD_TRACE_FILE").filter(|p| !p.is_empty())
    else {
        return;
    };
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let line = format!(
            "{{\"processId\":{},{}\n",
            std::process::id(),
            event.strip_prefix('{').unwrap_or(&event)
        );
        let _ = file.write_all(line.as_bytes());
    }
}
