#!/bin/sh

set -eu

if [ "$#" -gt 1 ]; then
  echo "usage: scripts/install-local.sh [BIN_DIRECTORY]" >&2
  exit 2
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
source_command=$project_root/bin/arkts-language-server
install_dir=${1:-"${HOME}/.local/bin"}
installed_command=$install_dir/arkts-language-server
extension_dir=$project_root/editors/zed
extension_target_dir=$extension_dir/target
extension_build=$extension_target_dir/wasm32-wasip2/release/zed_arkts_local.wasm
extension_wasm=$extension_dir/extension.wasm
lockfile=$project_root/pnpm-lock.yaml
dependency_stamp_dir=$project_root/node_modules/.cache/arkts-language-server
dependency_stamp=$dependency_stamp_dir/dependency-fingerprint.json

for required_command in node pnpm cargo; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "arkts-language-server local install requires $required_command on PATH." >&2
    exit 127
  fi
done

if [ -e "$installed_command" ] || [ -L "$installed_command" ]; then
  if ! { [ -L "$installed_command" ] && [ "$(readlink "$installed_command")" = "$source_command" ]; }; then
    echo "Refusing to replace existing path: $installed_command" >&2
    exit 1
  fi
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
CARGO_TARGET_DIR=$extension_target_dir \
  cargo build --locked --manifest-path "$extension_dir/Cargo.toml" --target wasm32-wasip2 --release

extension_tmp=$extension_wasm.tmp.$$
trap 'rm -f "$extension_tmp"' EXIT HUP INT TERM
cp "$extension_build" "$extension_tmp"
mv "$extension_tmp" "$extension_wasm"
trap - EXIT HUP INT TERM

mkdir -p "$install_dir"
if [ ! -L "$installed_command" ]; then
  ln -s "$source_command" "$installed_command"
  echo "Installed arkts-language-server at $installed_command"
else
  echo "Updated arkts-language-server at $installed_command"
fi
echo "Built Zed extension at $extension_wasm"
echo "Ensure $install_dir is on PATH before starting Zed."
