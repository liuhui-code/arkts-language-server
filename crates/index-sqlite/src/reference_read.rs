//! One reference algorithm for indexed legacy tables and snapshot-filtered views.
use rusqlite::{Connection, Statement};
use std::{borrow::Cow, ops::Deref};
#[derive(Clone, Copy)]
pub(super) enum ReferenceLayout {
    Legacy,
    Versioned,
}
pub(super) struct ReferenceRead<'a> {
    connection: &'a Connection,
    layout: ReferenceLayout,
}
impl<'a> ReferenceRead<'a> {
    pub fn new(connection: &'a Connection, layout: ReferenceLayout) -> Self {
        Self { connection, layout }
    }
    fn sql<'s>(&self, sql: &'s str) -> Cow<'s, str> {
        match self.layout {
            ReferenceLayout::Legacy => Cow::Borrowed(sql),
            ReferenceLayout::Versioned => {
                let mut sql = sql.to_owned();
                for index in [
                    "reference_occurrence_identities_name",
                    "reference_bindings_imported_name",
                    "reference_bindings_local_name",
                ] {
                    sql = sql.replace(&format!("INDEXED BY {index}"), "");
                }
                Cow::Owned(sql)
            }
        }
    }
    pub fn prepare(&self, sql: &str) -> rusqlite::Result<Statement<'_>> {
        self.connection.prepare(&self.sql(sql))
    }
}
impl Deref for ReferenceRead<'_> {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        self.connection
    }
}
