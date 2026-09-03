#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(dirname -- "$SCRIPT_DIR")
cd "$PROJECT_ROOT"

if [ -z "${ARKTS_INDEX_REAL_FIXTURE:-}" ]; then
  printf '%s\n' 'ARKTS_INDEX_REAL_FIXTURE must point to the pinned 455-file ArkTS fixture.' >&2
  exit 2
fi

if [ -z "${ARKTS_LARGE_FIXTURE:-}" ]; then
  printf '%s\n' 'ARKTS_LARGE_FIXTURE must point to the pinned 455-file ArkTS fixture.' >&2
  exit 2
fi

pnpm check:fast
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace --all-targets
cargo test --locked -p arkts-index-sidecar --test ndjson_protocol \
  pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates \
  -- --ignored --exact
cargo build --locked --workspace --release
./scripts/check-zed-queries.sh
cargo fmt --manifest-path editors/zed/Cargo.toml -- --check
cargo build --manifest-path editors/zed/Cargo.toml --locked --target wasm32-wasip2 --release
node --test --test-concurrency=1 tests/release/*.acceptance.mjs
