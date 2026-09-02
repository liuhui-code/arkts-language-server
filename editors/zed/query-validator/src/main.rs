use std::{env, error::Error, fs, path::PathBuf};

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_arkts() -> *const ();
}

const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_arkts) };

fn main() -> Result<(), Box<dyn Error>> {
    let query_paths = env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    if query_paths.is_empty() {
        return Err("provide at least one Zed query file".into());
    }

    let language: tree_sitter::Language = LANGUAGE.into();
    for path in query_paths {
        let source = fs::read_to_string(&path)
            .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
        tree_sitter::Query::new(&language, &source)
            .map_err(|error| format!("{} does not compile: {error}", path.display()))?;
        println!("validated {}", path.display());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeSet, env, fs, path::PathBuf};

    use streaming_iterator::StreamingIterator;

    use super::LANGUAGE;

    fn language_dir() -> PathBuf {
        env::var_os("ARKTS_ZED_LANGUAGE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join("languages")
                    .join("arkts")
            })
    }

    fn captures(query_name: &str, source: &str) -> BTreeSet<(String, String)> {
        let language: tree_sitter::Language = LANGUAGE.into();
        let query_source = fs::read_to_string(language_dir().join(query_name)).unwrap();
        let query = tree_sitter::Query::new(&language, &query_source).unwrap();
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&language).unwrap();
        let tree = parser.parse(source, None).unwrap();
        assert!(
            !tree.root_node().has_error(),
            "{}",
            tree.root_node().to_sexp()
        );

        let mut cursor = tree_sitter::QueryCursor::new();
        let mut query_captures = cursor.captures(&query, tree.root_node(), source.as_bytes());
        let mut result = BTreeSet::new();
        while let Some((query_match, capture_index)) = query_captures.next() {
            let capture = query_match.captures[*capture_index];
            result.insert((
                query.capture_names()[capture.index as usize].to_owned(),
                source[capture.node.byte_range()].to_owned(),
            ));
        }
        result
    }

    #[test]
    fn representative_arkts_keeps_javascript_and_arkts_highlight_captures() {
        let source = r#"// account summary
const TOTAL: number = 42

function greet(name: string): string {
  return "hello"
}

struct AccountCard {
  render(): void {}
}
"#;
        let actual = captures("highlights.scm", source);
        let expected = [
            ("comment", "// account summary"),
            ("keyword", "const"),
            ("number", "42"),
            ("keyword", "function"),
            ("function", "greet"),
            ("keyword", "return"),
            ("string", "\"hello\""),
            ("keyword", "struct"),
            ("type", "AccountCard"),
        ];

        for (capture, text) in expected {
            assert!(
                actual.contains(&(capture.to_owned(), text.to_owned())),
                "missing @{capture} capture for {text:?}; actual captures: {actual:#?}"
            );
        }
    }

    #[test]
    fn representative_arkts_outline_contains_struct_function_and_method() {
        let source = r#"function greet(name: string): string {
  return "hello"
}

struct AccountCard {
  render(): void {}
}
"#;
        let actual = captures("outline.scm", source);

        for name in ["AccountCard", "greet", "render"] {
            assert!(
                actual.contains(&("name".to_owned(), name.to_owned())),
                "missing outline item {name:?}; actual captures: {actual:#?}"
            );
        }
    }
}
