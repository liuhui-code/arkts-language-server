//! Read-only composition: inner read ports borrow the established data snapshot.
use rusqlite::{Connection, Transaction};
use std::ops::Deref;
pub(crate) enum Snapshot<'a> {
    Owned(Transaction<'a>),
    Borrowed(&'a Connection),
}
impl<'a> Snapshot<'a> {
    pub fn begin(connection: &'a Connection) -> rusqlite::Result<Self> {
        if connection.is_autocommit() {
            Self::own(connection)
        } else {
            Ok(Self::Borrowed(connection))
        }
    }
    pub fn own(connection: &'a Connection) -> rusqlite::Result<Self> {
        connection.unchecked_transaction().map(Self::Owned)
    }
    pub fn commit(self) -> rusqlite::Result<()> {
        match self {
            Self::Owned(tx) => tx.commit(),
            Self::Borrowed(_) => Ok(()),
        }
    }
}
impl Deref for Snapshot<'_> {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        match self {
            Self::Owned(tx) => tx,
            Self::Borrowed(connection) => connection,
        }
    }
}
