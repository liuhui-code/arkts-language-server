use std::{env, path::PathBuf};

fn main() {
    let grammar_dir = PathBuf::from(
        env::var_os("ARKTS_GRAMMAR_DIR")
            .expect("ARKTS_GRAMMAR_DIR must point to the pinned grammar checkout"),
    );
    let source_dir = grammar_dir.join("src");
    let parser = source_dir.join("parser.c");
    let scanner = source_dir.join("scanner.c");

    assert!(
        parser.is_file(),
        "missing parser source: {}",
        parser.display()
    );

    let mut build = cc::Build::new();
    build.include(&source_dir).file(&parser);
    if scanner.is_file() {
        build.file(&scanner);
    }
    build.flag_if_supported("-Wno-unused-parameter");
    build.compile("tree-sitter-arkts");

    println!("cargo:rerun-if-env-changed=ARKTS_GRAMMAR_DIR");
    println!("cargo:rerun-if-changed={}", parser.display());
    if scanner.is_file() {
        println!("cargo:rerun-if-changed={}", scanner.display());
    }
}
