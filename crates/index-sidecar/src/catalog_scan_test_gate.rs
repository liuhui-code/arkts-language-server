//! Debug-only I/O fault injection exercises the scanner's real error branches.
use std::{io, path::Path};
pub(super) fn fails(_kind: &str, _path: &Path) -> bool {
    #[cfg(debug_assertions)]
    {
        let matches = std::env::var("ARKTS_INDEX_TEST_SCAN_ERROR_KIND")
            .ok()
            .as_deref()
            == Some(_kind)
            && std::env::var_os("ARKTS_INDEX_TEST_SCAN_ERROR_PATH")
                .as_deref()
                .map(Path::new)
                == Some(_path);
        if matches {
            super::stream_gate::trace("scan_error", _kind);
        }
        matches
    }
    #[cfg(not(debug_assertions))]
    false
}
pub(super) fn io<T>(
    kind: &str,
    path: &Path,
    operation: impl FnOnce() -> io::Result<T>,
) -> io::Result<T> {
    if fails(kind, path) {
        Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "injected catalog scan failure",
        ))
    } else {
        operation()
    }
}
