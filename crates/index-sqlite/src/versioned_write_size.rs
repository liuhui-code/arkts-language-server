//! Conservative application-record estimates, never physical WAL/RSS limits.
use super::file_writer::FileVersionWrite;
#[derive(Clone, Copy, Debug, Default)]
pub struct FileWriteSize {
    pub documents: usize,
    pub rows: usize,
    pub estimated_bytes: usize,
}
impl FileWriteSize {
    pub fn for_input(input: &FileVersionWrite<'_>, domain: &str) -> Self {
        let d = input.document;
        let heritage = d.class_heritage.as_ref();
        let provenance = d.class_binding_provenance.as_ref();
        let rows = 3usize
            .saturating_add(d.symbols.len())
            .saturating_add(d.exports.len())
            .saturating_add(d.occurrences.len().saturating_mul(2))
            .saturating_add(d.aliases.len())
            .saturating_add(d.bindings.len())
            .saturating_add(heritage.map_or(0, |h| h.classes.len()))
            .saturating_add(provenance.map_or(0, |p| p.direct_exports.len()));
        let mut bytes = rows
            .saturating_mul(256usize.saturating_add(input.id.len().saturating_mul(2)))
            .saturating_add(d.uri.len())
            .saturating_add(input.sha.len())
            .saturating_add(domain.len());
        for s in &d.symbols {
            bytes = bytes
                .saturating_add(s.name.len().saturating_mul(3))
                .saturating_add(s.container.as_ref().map_or(0, String::len));
        }
        for e in &d.exports {
            bytes = bytes.saturating_add(e.exported_name.len().saturating_mul(2));
            for s in [
                &e.reference_export_name,
                &e.declaration_identity,
                &e.import_specifier,
                &e.module_id,
                &e.target_scope,
            ] {
                bytes = bytes.saturating_add(s.as_ref().map_or(0, String::len));
            }
        }
        for o in &d.occurrences {
            bytes = bytes
                .saturating_add(o.name.len().saturating_mul(2))
                .saturating_add(
                    o.qualifier
                        .as_ref()
                        .map_or(0, String::len)
                        .saturating_mul(2),
                );
        }
        for a in &d.aliases {
            bytes = bytes
                .saturating_add(a.from_name.len())
                .saturating_add(a.to_name.len());
        }
        for b in &d.bindings {
            bytes = bytes
                .saturating_add(b.imported_name.len())
                .saturating_add(b.local_name.len())
                .saturating_add(b.source_specifier.len());
        }
        if let Some(h) = heritage {
            for c in &h.classes {
                bytes = bytes
                    .saturating_add(c.name.len())
                    .saturating_add(c.base.as_ref().map_or(0, |b| b.name.len()));
            }
        }
        Self {
            documents: 1,
            rows,
            estimated_bytes: bytes,
        }
    }
    pub fn combine(self, other: Self) -> Self {
        Self {
            documents: self.documents.saturating_add(other.documents),
            rows: self.rows.saturating_add(other.rows),
            estimated_bytes: self.estimated_bytes.saturating_add(other.estimated_bytes),
        }
    }
    pub fn fits(self) -> bool {
        self.documents <= 64 && self.rows <= 4096 && self.estimated_bytes <= 4 * 1024 * 1024
    }
    pub fn at_limit(self) -> bool {
        self.documents >= 64 || self.rows >= 4096 || self.estimated_bytes >= 4 * 1024 * 1024
    }
}
