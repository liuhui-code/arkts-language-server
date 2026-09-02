#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
extension_dir=$project_root/editors/zed
validator_dir=$extension_dir/query-validator
language_dir=$extension_dir/languages/arkts

parse_grammar_source() {
  awk '
    function fail(message) {
      print "extension.toml " message > "/dev/stderr"
      failed = 1
    }
    BEGIN {
      in_arkts = 0
      table_count = 0
      repository_count = 0
      revision_count = 0
    }
    /^[[:space:]]*\[[^]]+\][[:space:]]*(#.*)?$/ {
      in_arkts = ($0 ~ /^[[:space:]]*\[grammars\.arkts\][[:space:]]*(#.*)?$/)
      if (in_arkts) table_count++
      next
    }
    in_arkts && /^[[:space:]]*repository[[:space:]]*=/ {
      if ($0 !~ /^[[:space:]]*repository[[:space:]]*=[[:space:]]*"[^"]+"[[:space:]]*(#.*)?$/) {
        fail("has an invalid grammars.arkts repository")
        next
      }
      value = $0
      sub(/^[[:space:]]*repository[[:space:]]*=[[:space:]]*"/, "", value)
      sub(/"[[:space:]]*(#.*)?$/, "", value)
      repository = value
      repository_count++
      next
    }
    in_arkts && /^[[:space:]]*rev[[:space:]]*=/ {
      if ($0 !~ /^[[:space:]]*rev[[:space:]]*=[[:space:]]*"[0-9a-f]+"[[:space:]]*(#.*)?$/) {
        fail("has an invalid grammars.arkts revision")
        next
      }
      value = $0
      sub(/^[[:space:]]*rev[[:space:]]*=[[:space:]]*"/, "", value)
      sub(/"[[:space:]]*(#.*)?$/, "", value)
      revision = value
      revision_count++
      next
    }
    END {
      if (table_count != 1) fail("must define exactly one [grammars.arkts] table")
      if (repository_count != 1) fail("must define exactly one grammars.arkts repository")
      if (revision_count != 1) fail("must define exactly one grammars.arkts revision")
      if (revision_count == 1 && length(revision) != 40) {
        fail("must pin grammars.arkts rev to a 40-character hexadecimal commit")
      }
      if (failed) exit 1
      printf "%s\t%s\n", repository, revision
    }
  ' "$1"
}

validated_grammar_source() {
  grammar_source_value=$(parse_grammar_source "$1")
  grammar_repository_value=$(printf '%s\n' "$grammar_source_value" | cut -f 1)
  case $grammar_repository_value in
    https://*|file://*) ;;
    *)
      echo "extension.toml must use an https:// or file:// ArkTS grammar repository" >&2
      return 1
      ;;
  esac
  printf '%s\n' "$grammar_source_value"
}

verify_grammar_cache() {
  grammar_manifest=$1
  grammar_cache_to_verify=$2
  grammar_source_value=$(validated_grammar_source "$grammar_manifest")
  grammar_repository_value=$(printf '%s\n' "$grammar_source_value" | cut -f 1)
  grammar_revision_value=$(printf '%s\n' "$grammar_source_value" | cut -f 2)

  actual_revision=$(git -C "$grammar_cache_to_verify" rev-parse HEAD)
  if [ "$actual_revision" != "$grammar_revision_value" ]; then
    echo "ArkTS grammar cache is at $actual_revision; expected $grammar_revision_value" >&2
    return 1
  fi
  actual_repository=$(git -C "$grammar_cache_to_verify" remote get-url origin)
  if [ "$actual_repository" != "$grammar_repository_value" ]; then
    echo "ArkTS grammar cache origin is $actual_repository; expected $grammar_repository_value" >&2
    return 1
  fi
  grammar_status=$(git -C "$grammar_cache_to_verify" status --porcelain=v1 --untracked-files=all --ignore-submodules=none)
  if [ -n "$grammar_status" ]; then
    echo "Refusing dirty or untracked parser/scanner cache: $grammar_cache_to_verify" >&2
    printf '%s\n' "$grammar_status" >&2
    return 1
  fi
}

discover_query_files() {
  query_directory=$1
  if [ ! -d "$query_directory" ]; then
    echo "ArkTS query directory does not exist: $query_directory" >&2
    return 1
  fi
  query_files=$(find "$query_directory" -type f -name '*.scm' -print | LC_ALL=C sort)
  if [ -z "$query_files" ]; then
    echo "ArkTS query directory contains no .scm files: $query_directory" >&2
    return 1
  fi
  printf '%s\n' "$query_files"
}

if [ "${1:-}" = "--print-grammar-source" ]; then
  if [ "$#" -ne 2 ]; then
    echo "usage: scripts/check-zed-queries.sh --print-grammar-source EXTENSION_TOML" >&2
    exit 2
  fi
  validated_grammar_source "$2"
  exit
fi
if [ "${1:-}" = "--verify-grammar-cache" ]; then
  if [ "$#" -ne 3 ]; then
    echo "usage: scripts/check-zed-queries.sh --verify-grammar-cache EXTENSION_TOML CACHE" >&2
    exit 2
  fi
  verify_grammar_cache "$2" "$3"
  exit
fi
if [ "${1:-}" = "--print-query-files" ]; then
  if [ "$#" -ne 2 ]; then
    echo "usage: scripts/check-zed-queries.sh --print-query-files LANGUAGE_DIRECTORY" >&2
    exit 2
  fi
  discover_query_files "$2"
  exit
fi
if [ "$#" -ne 0 ]; then
  echo "usage: scripts/check-zed-queries.sh [--print-grammar-source EXTENSION_TOML | --verify-grammar-cache EXTENSION_TOML CACHE | --print-query-files LANGUAGE_DIRECTORY]" >&2
  exit 2
fi

grammar_source=$(validated_grammar_source "$extension_dir/extension.toml")
grammar_repository=$(printf '%s\n' "$grammar_source" | cut -f 1)
grammar_revision=$(printf '%s\n' "$grammar_source" | cut -f 2)
grammar_cache=${ARKTS_QUERY_GRAMMAR_CACHE:-"$validator_dir/target/tree-sitter-arkts-$grammar_revision"}

if [ ! -e "$grammar_cache/.git" ]; then
  grammar_parent=$(dirname -- "$grammar_cache")
  grammar_tmp=$grammar_cache.tmp.$$
  mkdir -p "$grammar_parent"
  trap 'rm -rf "$grammar_tmp"' EXIT HUP INT TERM
  git init --quiet "$grammar_tmp"
  git -C "$grammar_tmp" remote add origin "$grammar_repository"
  git -C "$grammar_tmp" fetch --quiet --depth 1 origin "$grammar_revision"
  git -C "$grammar_tmp" checkout --quiet --detach FETCH_HEAD
  mv "$grammar_tmp" "$grammar_cache"
  trap - EXIT HUP INT TERM
fi

verify_grammar_cache "$extension_dir/extension.toml" "$grammar_cache"

query_files=$(discover_query_files "$language_dir")
old_ifs=$IFS
IFS='
'
set -- $query_files
IFS=$old_ifs

CARGO_TARGET_DIR=$validator_dir/target/cargo \
ARKTS_GRAMMAR_DIR=$grammar_cache \
ARKTS_ZED_LANGUAGE_DIR=$language_dir \
  cargo test --locked --quiet --manifest-path "$validator_dir/Cargo.toml"

CARGO_TARGET_DIR=$validator_dir/target/cargo \
ARKTS_GRAMMAR_DIR=$grammar_cache \
  cargo run --locked --quiet --manifest-path "$validator_dir/Cargo.toml" -- "$@"
