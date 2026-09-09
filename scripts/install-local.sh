#!/bin/sh

set -eu

artifact_root=
if [ "${1:-}" = "--from-artifact" ]; then
  if [ "$#" -lt 2 ]; then
    echo "usage: scripts/install-local.sh [--from-artifact ARTIFACT_DIRECTORY] [BIN_DIRECTORY]" >&2
    exit 2
  fi
  artifact_root=$2
  shift 2
fi

if [ "$#" -gt 1 ]; then
  echo "usage: scripts/install-local.sh [--from-artifact ARTIFACT_DIRECTORY] [BIN_DIRECTORY]" >&2
  exit 2
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
source_command=$project_root/bin/arkts-language-server
install_dir=${1:-"${HOME}/.local/bin"}
installed_command=$install_dir/arkts-language-server
install_prefix=$(dirname -- "$install_dir")
libexec_root=$install_prefix/libexec/arkts-language-server
extension_dir=$project_root/editors/zed
extension_target_dir=$extension_dir/target
extension_build=$extension_target_dir/wasm32-wasip2/release/zed_arkts_local.wasm
extension_wasm=$extension_dir/extension.wasm
grammar_manifest=$extension_dir/extension.toml
grammar_gate=$project_root/scripts/check-zed-queries.sh
grammar_dir=$extension_dir/grammars
grammar_wasm=$grammar_dir/arkts.wasm
grammar_stamp=$grammar_dir/.arkts-source
grammar_lock=$extension_dir/zed-grammar-lock.json
lockfile=$project_root/pnpm-lock.yaml
dependency_stamp_dir=$project_root/node_modules/.cache/arkts-language-server
dependency_stamp=$dependency_stamp_dir/dependency-fingerprint.json

if [ -n "$artifact_root" ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "arkts-language-server artifact install requires node on PATH." >&2
    exit 127
  fi
  artifact_installer=$script_dir/artifact/install-from-manifest.mjs
  if [ ! -f "$artifact_installer" ]; then
    echo "Missing artifact installer: $artifact_installer" >&2
    exit 1
  fi
  exec node "$artifact_installer" "$artifact_root" "$install_dir"
fi

for required_command in node pnpm cargo; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "arkts-language-server local install requires $required_command on PATH." >&2
    exit 127
  fi
done

if [ -e "$installed_command" ] || [ -L "$installed_command" ]; then
  existing_target=
  if [ -L "$installed_command" ]; then
    existing_target=$(readlink "$installed_command")
  fi
  case $existing_target in
    "$source_command"|"$libexec_root"/*) ;;
    *)
      echo "Refusing to replace existing path: $installed_command" >&2
      exit 1
      ;;
  esac
fi

if [ ! -f "$lockfile" ]; then
  echo "Missing dependency lockfile: $lockfile" >&2
  exit 1
fi
pnpm_version=$(pnpm --version)
dependency_fingerprint=$(node -e '
  const crypto = require("node:crypto")
  const fs = require("node:fs")
  const lockfileSha256 = crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex")
  process.stdout.write(JSON.stringify({
    arch: process.arch,
    lockfileSha256,
    nodeMajor: process.versions.node.split(".")[0],
    nodeModulesAbi: process.versions.modules,
    platform: process.platform,
    pnpmVersion: process.argv[2],
  }))
' "$lockfile" "$pnpm_version")
installed_signature=
if [ -f "$dependency_stamp" ]; then
  installed_signature=$(sed -n '1p' "$dependency_stamp")
fi
if [ ! -x "$project_root/node_modules/.bin/esbuild" ] || [ "$installed_signature" != "$dependency_fingerprint" ]; then
  (cd "$project_root" && pnpm install --frozen-lockfile)
  mkdir -p "$dependency_stamp_dir"
  dependency_stamp_tmp=$dependency_stamp.tmp.$$
  trap 'rm -f "$dependency_stamp_tmp"' EXIT HUP INT TERM
  printf '%s\n' "$dependency_fingerprint" > "$dependency_stamp_tmp"
  mv "$dependency_stamp_tmp" "$dependency_stamp"
  trap - EXIT HUP INT TERM
fi
(cd "$project_root" && pnpm build)
(
  cd "$project_root"
  CARGO_TARGET_DIR=$project_root/target \
    cargo build --locked --manifest-path "$project_root/Cargo.toml" \
    --package arkts-index-sidecar --release
)
(
  cd "$project_root"
  CARGO_TARGET_DIR=$extension_target_dir \
    cargo build --locked --manifest-path "$extension_dir/Cargo.toml" --target wasm32-wasip2 --release
)

# Zed stores a generated grammar beside a development extension. It does not
# encode the source revision in that artifact, so carrying it across a grammar
# revision can make otherwise valid queries fail at runtime. Keep a local
# source stamp and invalidate only an unproven or changed generated grammar.
grammar_identity=$("$grammar_gate" --print-grammar-source "$grammar_manifest")
installed_grammar_identity=
if [ -f "$grammar_stamp" ]; then
  installed_grammar_identity=$(sed -n '1p' "$grammar_stamp")
fi
reviewed_grammar=false
if [ -f "$grammar_lock" ] && [ -f "$grammar_wasm" ]; then
  if node -e '
    const crypto = require("node:crypto")
    const fs = require("node:fs")
    const lock = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    const digest = crypto.createHash("sha256").update(fs.readFileSync(process.argv[2])).digest("hex")
    const identity = `${lock.repository}\t${lock.revision}`
    if (lock.grammar !== "arkts" || identity !== process.argv[3] || digest !== lock.sha256) process.exit(1)
  ' "$grammar_lock" "$grammar_wasm" "$grammar_identity"
  then
    reviewed_grammar=true
  fi
fi
if [ "$installed_grammar_identity" != "$grammar_identity" ]; then
  mkdir -p "$grammar_dir"
  grammar_stamp_tmp=$grammar_stamp.tmp.$$
  trap 'rm -f "$grammar_stamp_tmp"' EXIT HUP INT TERM
  printf '%s\n' "$grammar_identity" > "$grammar_stamp_tmp"
  if [ "$reviewed_grammar" != true ]; then
    rm -f "$grammar_wasm"
  fi
  mv "$grammar_stamp_tmp" "$grammar_stamp"
  trap - EXIT HUP INT TERM
fi

extension_tmp=$extension_wasm.tmp.$$
trap 'rm -f "$extension_tmp"' EXIT HUP INT TERM
cp "$extension_build" "$extension_tmp"
mv "$extension_tmp" "$extension_wasm"
trap - EXIT HUP INT TERM

package_version=$(node -e '
  const version = require(process.argv[1]).version
  if (typeof version !== "string" || !/^[A-Za-z0-9._-]+$/.test(version)) process.exit(1)
  process.stdout.write(version)
' "$project_root/package.json")
release_fingerprint=$(node -e '
  const crypto = require("node:crypto")
  const fs = require("node:fs")
  const digest = crypto.createHash("sha256")
  for (const file of process.argv.slice(1)) {
    digest.update(fs.readFileSync(file))
    digest.update("\0")
  }
  process.stdout.write(digest.digest("hex"))
' "$source_command" "$project_root/config/semantic-runtime.json" \
  "$project_root/dist/semantic-worker.cjs" "$project_root/dist/server.cjs" \
  "$project_root/target/release/arkts-index-sidecar")
release_id=$package_version-$release_fingerprint
release_dir=$libexec_root/$release_id
staging_dir=$libexec_root/.staging-$release_id-$$
command_tmp=$installed_command.tmp.$$
cleanup_installation() {
  rm -rf "$staging_dir"
  rm -f "$command_tmp"
}
trap cleanup_installation EXIT HUP INT TERM

mkdir -p "$staging_dir/bin" "$staging_dir/config" "$staging_dir/dist" \
  "$staging_dir/target/release"
cp "$source_command" "$staging_dir/bin/arkts-language-server"
cp "$project_root/config/semantic-runtime.json" "$staging_dir/config/semantic-runtime.json"
cp "$project_root/dist/semantic-worker.cjs" "$staging_dir/dist/semantic-worker.cjs"
cp "$project_root/dist/server.cjs" "$staging_dir/dist/server.cjs"
cp "$project_root/target/release/arkts-index-sidecar" \
  "$staging_dir/target/release/arkts-index-sidecar"
chmod 755 "$staging_dir/bin/arkts-language-server" \
  "$staging_dir/target/release/arkts-index-sidecar"

mkdir -p "$libexec_root" "$install_dir"
if [ ! -d "$release_dir" ]; then
  mv "$staging_dir" "$release_dir"
fi
ln -s "$release_dir/bin/arkts-language-server" "$command_tmp"
mv -f "$command_tmp" "$installed_command"
cleanup_installation
trap - EXIT HUP INT TERM

echo "Installed arkts-language-server $release_id at $installed_command"
echo "Built Zed extension at $extension_wasm"
if [ "${ARKTS_ZED_INSTALL_AUTO:-}" != "1" ]; then
  echo "Ensure $install_dir is on PATH before starting Zed."
  echo "For one-command Zed installation, run 'pnpm zed:install'."
  echo "Alternatively, run 'zed: install dev extension' and select $extension_dir."
fi
