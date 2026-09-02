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
