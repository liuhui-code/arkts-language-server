//! Source validation for the narrow named import/re-export discovery subset.

use crate::line_index::LineIndex;
use crate::tokenizer::{Token, TokenKind, Tokenization};
use crate::{Document, Position};
use std::collections::BTreeSet;

pub(super) fn module_bindings_supported(document: &Document, scanned: &Tokenization<'_>) -> bool {
    if scanned.uncertain {
        return false;
    }
    let tokens = &scanned.tokens;
    let mut depths = [0usize; 3];
    for (index, token) in tokens.iter().enumerate() {
        if token.kind == TokenKind::StringLiteral {
            continue;
        }
        // These declarations are not represented by the narrow class binder.
        // Their absence from old index metadata cannot prove absence of shadowing.
        if depths[0] == 0
            && matches!(
                token.text,
                "const"
                    | "let"
                    | "var"
                    | "function"
                    | "type"
                    | "interface"
                    | "enum"
                    | "namespace"
                    | "struct"
            )
        {
            return false;
        }
        if depths[0] == 0 && matches!(token.text, "import" | "export") {
            if depths[1] != 0
                || depths[2] != 0
                || !statement_boundary(&document.text, tokens, index)
            {
                return false;
            }
            let next = tokens.get(index + 1);
            if token.text == "export"
                && !next.is_some_and(|next| {
                    next.kind != TokenKind::StringLiteral
                        && matches!(next.text, "{" | "class" | "abstract" | "declare")
                })
            {
                return false;
            }
            if (token.text == "import" || next.is_some_and(|next| next.text == "{"))
                && !named_header(&document.text, tokens, index)
            {
                return false;
            }
        }
        match token.text {
            "{" => depths[0] += 1,
            "}" => depths[0] = depths[0].saturating_sub(1),
            "(" => depths[1] += 1,
            ")" => depths[1] = depths[1].saturating_sub(1),
            "[" => depths[2] += 1,
            "]" => depths[2] = depths[2].saturating_sub(1),
            _ => {}
        }
    }
    true
}

/// Scan once for catalog provenance; rescanning per class is quadratic.
pub(super) fn direct_named_export_positions(
    scanned: &Tokenization<'_>,
    lines: &LineIndex,
) -> BTreeSet<Position> {
    // Heritage owns the declaration span; old export metadata is not sufficient.
    // In particular a string containing "export" must not act as a modifier.
    scanned
        .tokens
        .iter()
        .filter(|token| token.kind == TokenKind::Identifier && token.text == "export")
        .map(|token| lines.position(token.start))
        .collect()
}

fn named_header(source: &str, tokens: &[Token<'_>], start: usize) -> bool {
    let mut cursor = start + 1;
    if tokens.get(cursor).map(|token| token.text) != Some("{") {
        return false;
    }
    cursor += 1;
    if tokens.get(cursor).map(|token| token.text) == Some("}") {
        return false;
    }
    loop {
        if !tokens.get(cursor).is_some_and(named_identifier) {
            return false;
        }
        cursor += 1;
        if tokens.get(cursor).map(|token| token.text) == Some("as") {
            cursor += 1;
            if !tokens.get(cursor).is_some_and(named_identifier) {
                return false;
            }
            cursor += 1;
        }
        match tokens.get(cursor).map(|token| token.text) {
            Some("}") => break,
            Some(",") => {
                cursor += 1;
                if tokens.get(cursor).map(|token| token.text) == Some("}") {
                    break;
                }
            }
            _ => return false,
        }
    }
    cursor += 1;
    if tokens.get(cursor).map(|token| token.text) != Some("from") {
        return false;
    }
    let Some(literal) = tokens
        .get(cursor + 1)
        .filter(|token| token.kind == TokenKind::StringLiteral)
    else {
        return false;
    };
    if literal.text.contains('\\') || literal.start == 0 {
        return false;
    }
    // The scanner drops numeric tokens. Validate every raw inter-token gap.
    if !(start..cursor).all(|left| trivia(&source[tokens[left].end..tokens[left + 1].start]))
        || !trivia(&source[tokens[cursor].end..literal.start - 1])
    {
        return false;
    }
    let tail_start = literal.end + 1;
    let Some(next) = tokens.get(cursor + 2) else {
        return trivia(&source[tail_start..]);
    };
    let tail_end = next.start - usize::from(next.kind == TokenKind::StringLiteral);
    let gap = &source[tail_start..tail_end];
    trivia(gap)
        && ((next.kind == TokenKind::Punctuation && next.text == ";")
            || gap.contains(['\n', '\r', '\u{2028}', '\u{2029}']))
}

fn named_identifier(token: &Token<'_>) -> bool {
    token.kind == TokenKind::Identifier && !matches!(token.text, "type" | "lazy" | "as" | "from")
}

fn statement_boundary(source: &str, tokens: &[Token<'_>], index: usize) -> bool {
    if index == 0 {
        return trivia(&source[..tokens[index].start]);
    }
    let previous = &tokens[index - 1];
    let gap_start = previous.end + usize::from(previous.kind == TokenKind::StringLiteral);
    let gap = &source[gap_start..tokens[index].start];
    trivia(gap)
        && ((previous.kind == TokenKind::Punctuation && matches!(previous.text, ";" | "}"))
            || (previous.kind == TokenKind::StringLiteral
                && gap.contains(['\n', '\r', '\u{2028}', '\u{2029}'])))
}

fn trivia(mut source: &str) -> bool {
    loop {
        source = source.trim_start();
        if source.is_empty() {
            return true;
        }
        if source.starts_with("//") {
            source = &source[source.find('\n').unwrap_or(source.len())..];
        } else if source.starts_with("/*") {
            let Some(end) = source.find("*/") else {
                return false;
            };
            source = &source[end + 2..];
        } else {
            return false;
        }
    }
}
