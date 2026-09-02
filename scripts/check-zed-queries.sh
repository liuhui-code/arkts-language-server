#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
extension_dir=$project_root/editors/zed
validator_dir=$extension_dir/query-validator
language_dir=$extension_dir/languages/arkts
grammar_revision=$(sed -n 's/^rev = "\([0-9a-f][0-9a-f]*\)"$/\1/p' "$extension_dir/extension.toml")
case $grammar_revision in
  ""|*[!0-9a-f]*)
    echo "extension.toml must pin the ArkTS grammar to a hexadecimal commit" >&2
    exit 1
    ;;
esac
if [ "${#grammar_revision}" -ne 40 ]; then
  echo "extension.toml must pin the ArkTS grammar to a 40-character commit" >&2
  exit 1
fi
grammar_cache=${ARKTS_QUERY_GRAMMAR_CACHE:-"$validator_dir/target/tree-sitter-arkts-$grammar_revision"}

if [ ! -e "$grammar_cache/.git" ]; then
  grammar_parent=$(dirname -- "$grammar_cache")
  grammar_tmp=$grammar_cache.tmp.$$
  mkdir -p "$grammar_parent"
  trap 'rm -rf "$grammar_tmp"' EXIT HUP INT TERM
  git init --quiet "$grammar_tmp"
  git -C "$grammar_tmp" remote add origin https://github.com/harmony-contrib/tree-sitter-arkts.git
  git -C "$grammar_tmp" fetch --quiet --depth 1 origin "$grammar_revision"
  git -C "$grammar_tmp" checkout --quiet --detach FETCH_HEAD
  mv "$grammar_tmp" "$grammar_cache"
  trap - EXIT HUP INT TERM
fi

actual_revision=$(git -C "$grammar_cache" rev-parse HEAD)
if [ "$actual_revision" != "$grammar_revision" ]; then
  echo "ArkTS grammar cache is at $actual_revision; expected $grammar_revision" >&2
  exit 1
fi

CARGO_TARGET_DIR=$validator_dir/target/cargo \
ARKTS_GRAMMAR_DIR=$grammar_cache \
  cargo run --locked --quiet --manifest-path "$validator_dir/Cargo.toml" -- \
    "$language_dir/highlights.scm" \
    "$language_dir/outline.scm" \
    "$language_dir/indents.scm" \
    "$language_dir/brackets.scm"
