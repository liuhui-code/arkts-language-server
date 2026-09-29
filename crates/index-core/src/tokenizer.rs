use crate::DocumentParseError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TokenKind {
    Identifier,
    Punctuation,
    StringLiteral,
}

#[derive(Clone, Debug)]
pub(crate) struct Token<'a> {
    pub(crate) text: &'a str,
    pub(crate) kind: TokenKind,
    pub(crate) start: usize,
    pub(crate) end: usize,
}

pub(crate) struct Tokenization<'a> {
    pub(crate) tokens: Vec<Token<'a>>,
    /// Legacy scanning does not fully classify these forms. Never a semantic proof.
    pub(crate) uncertain: bool,
}

pub(crate) fn tokenize_with_status(source: &str) -> Result<Tokenization<'_>, DocumentParseError> {
    scan(source, true)
}

fn scan(source: &str, inspect_unsupported: bool) -> Result<Tokenization<'_>, DocumentParseError> {
    let mut tokens = Vec::new();
    let mut offset = 0usize;
    let mut regex_allowed = true;
    let mut uncertain = false;

    while offset < source.len() {
        let rest = &source[offset..];
        if rest.starts_with("//") {
            let end = rest.find('\n').unwrap_or(rest.len());
            // Preserve the legacy token stream, but do not certify code hidden
            // by its LF-only comment handling. Normal CRLF is not uncertain.
            uncertain |= inspect_unsupported
                && rest[..end].char_indices().any(|(index, character)| {
                    matches!(character, '\u{2028}' | '\u{2029}')
                        || (character == '\r' && rest.as_bytes().get(index + 1) != Some(&b'\n'))
                });
            offset += end;
            continue;
        }
        if rest.starts_with("/*") {
            let Some(end) = rest.find("*/") else {
                return Err(DocumentParseError);
            };
            offset += end + 2;
            continue;
        }

        let character = rest.chars().next().expect("offset is inside source");
        if character.is_whitespace() {
            offset += character.len_utf8();
            continue;
        }
        // Comments/quoted strings are inert. Templates, regex-vs-division and
        // escaped identifiers need more syntax knowledge than this scanner has.
        uncertain |= inspect_unsupported && matches!(character, '`' | '/' | '\\' | '@');
        if matches!(character, '\'' | '"' | '`') {
            let end = skip_quoted(source, offset, character).ok_or(DocumentParseError)?;
            if character != '`' {
                tokens.push(Token {
                    text: &source[offset + character.len_utf8()..end - character.len_utf8()],
                    kind: TokenKind::StringLiteral,
                    start: offset + character.len_utf8(),
                    end: end - character.len_utf8(),
                });
            }
            offset = end;
            regex_allowed = false;
            continue;
        }
        if character.is_ascii_digit() {
            offset = skip_number(source, offset);
            regex_allowed = false;
            continue;
        }
        if is_identifier_start(character) {
            let start = offset;
            offset += character.len_utf8();
            while offset < source.len() {
                let next = source[offset..]
                    .chars()
                    .next()
                    .expect("offset is inside source");
                if !is_identifier_continue(next) {
                    break;
                }
                offset += next.len_utf8();
            }
            tokens.push(Token {
                text: &source[start..offset],
                kind: TokenKind::Identifier,
                start,
                end: offset,
            });
            regex_allowed = identifier_allows_regex_after(&source[start..offset]);
            continue;
        }
        if character == '/' && regex_allowed {
            offset = skip_regex_literal(source, offset).ok_or(DocumentParseError)?;
            regex_allowed = false;
            continue;
        }
        if rest.starts_with("++") || rest.starts_with("--") {
            tokens.push(Token {
                text: &source[offset..offset + 2],
                kind: TokenKind::Punctuation,
                start: offset,
                end: offset + 2,
            });
            offset += 2;
            continue;
        }
        if rest.starts_with("=>") {
            tokens.push(Token {
                text: &source[offset..offset + 2],
                kind: TokenKind::Punctuation,
                start: offset,
                end: offset + 2,
            });
            offset += 2;
            regex_allowed = true;
            continue;
        }

        let end = offset + character.len_utf8();
        tokens.push(Token {
            text: &source[offset..end],
            kind: TokenKind::Punctuation,
            start: offset,
            end,
        });
        offset = end;
        regex_allowed = punctuation_allows_regex_after(character, regex_allowed, rest);
    }

    Ok(Tokenization { tokens, uncertain })
}

pub(crate) fn skip_number(source: &str, start: usize) -> usize {
    let mut offset = start;
    while offset < source.len() {
        let character = source[offset..]
            .chars()
            .next()
            .expect("offset is inside source");
        if !(character.is_ascii_alphanumeric() || matches!(character, '.' | '_')) {
            break;
        }
        offset += character.len_utf8();
    }
    offset
}

pub(crate) fn identifier_allows_regex_after(identifier: &str) -> bool {
    matches!(
        identifier,
        "await"
            | "case"
            | "delete"
            | "do"
            | "else"
            | "extends"
            | "in"
            | "instanceof"
            | "new"
            | "of"
            | "return"
            | "throw"
            | "typeof"
            | "void"
            | "yield"
    )
}

pub(crate) fn punctuation_allows_regex_after(
    punctuation: char,
    previously_allowed: bool,
    source_from_punctuation: &str,
) -> bool {
    match punctuation {
        ')' | ']' | '}' | '.' | '<' | '>' => false,
        '!' if !source_from_punctuation.starts_with("!=") => previously_allowed,
        '?' if source_from_punctuation.starts_with("?.") => false,
        _ => true,
    }
}

pub(crate) fn skip_regex_literal(source: &str, start: usize) -> Option<usize> {
    let mut offset = start + 1;
    let mut escaped = false;
    let mut in_character_class = false;

    while offset < source.len() {
        let character = source[offset..]
            .chars()
            .next()
            .expect("offset is inside source");
        if matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}') {
            return None;
        }
        offset += character.len_utf8();
        if escaped {
            escaped = false;
            continue;
        }
        match character {
            '\\' => escaped = true,
            '[' => in_character_class = true,
            ']' => in_character_class = false,
            '/' if !in_character_class => {
                while offset < source.len() {
                    let flag = source[offset..]
                        .chars()
                        .next()
                        .expect("offset is inside source");
                    if !is_identifier_continue(flag) {
                        break;
                    }
                    offset += flag.len_utf8();
                }
                return Some(offset);
            }
            _ => {}
        }
    }
    None
}

pub(crate) fn skip_quoted(source: &str, start: usize, quote: char) -> Option<usize> {
    let mut escaped = false;
    let content_start = start + quote.len_utf8();
    for (relative_offset, character) in source[content_start..].char_indices() {
        let offset = content_start + relative_offset;
        if escaped {
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == quote {
            return Some(offset + character.len_utf8());
        }
    }
    None
}

pub(crate) fn is_identifier_start(character: char) -> bool {
    character == '_' || character == '$' || character.is_alphabetic()
}

pub(crate) fn is_identifier_continue(character: char) -> bool {
    is_identifier_start(character) || character.is_ascii_digit()
}
