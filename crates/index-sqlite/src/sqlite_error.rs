use super::*;
pub(crate) fn map_sqlite_error(error: rusqlite::Error) -> StoreError {
    let kind = match &error {
        rusqlite::Error::SqliteFailure(sqlite_error, _) => match sqlite_error.code {
            ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => StoreErrorKind::Busy,
            ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase => StoreErrorKind::Corrupt,
            ErrorCode::CannotOpen | ErrorCode::ReadOnly => StoreErrorKind::Io,
            ErrorCode::OperationInterrupted => StoreErrorKind::Cancelled,
            _ => StoreErrorKind::Internal,
        },
        _ => StoreErrorKind::Internal,
    };
    StoreError::new(kind, format!("SQLite index error: {error}"))
}
