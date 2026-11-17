//! Shared source admission/extraction; no task ownership or queue policy.
use super::super::{
    MAX_SOURCE_BYTES,
    source::{SourceRead, SourceStamp, read_source},
    stream_gate,
};
use arkts_index_core::{Document, DocumentSymbols, parse_document_symbols};
use std::{fs, path::PathBuf};
pub(crate) struct Job {
    pub uri: String,
    pub path: PathBuf,
    pub expected: Option<SourceStamp>,
}
pub(crate) struct Output {
    pub uri: String,
    pub source: Option<SourceStamp>,
    pub outcome: Outcome,
}
pub(crate) enum Outcome {
    Parsed(Box<DocumentSymbols>),
    Rejected,
    Skipped,
    Changed,
}

pub(crate) fn parse(
    Job {
        uri,
        path,
        expected,
    }: Job,
) -> Output {
    let mut output = Output {
        uri,
        source: None,
        outcome: if expected.is_some() {
            Outcome::Changed
        } else {
            Outcome::Rejected
        },
    };
    let Ok(metadata) = fs::metadata(&path) else {
        return output;
    };
    if metadata.len() > MAX_SOURCE_BYTES {
        if expected.is_none() {
            output.outcome = Outcome::Skipped;
        }
        return output;
    }
    stream_gate::trace("parse_read", &output.uri);
    match read_source(&path) {
        Ok(SourceRead::Text(text)) => {
            let source = SourceStamp::capture(&path, &metadata, &text);
            if expected
                .as_ref()
                .is_some_and(|previous| !previous.same_input(&source))
            {
                return output;
            }
            if expected.is_none() {
                output.source = Some(source);
            }
            output.outcome = Outcome::Rejected;
            stream_gate::trace("parser_call", &output.uri);
            if let Ok(document) = parse_document_symbols(&Document::new(output.uri.clone(), text)) {
                output.outcome = Outcome::Parsed(Box::new(document));
            }
        }
        Ok(SourceRead::PolicySkipped) if expected.is_none() => output.outcome = Outcome::Skipped,
        Ok(SourceRead::PolicySkipped) => {}
        Err(_) => {}
    }
    output
}
