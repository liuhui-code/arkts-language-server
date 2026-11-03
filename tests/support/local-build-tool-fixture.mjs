import fs from "node:fs"
import path from "node:path"

/** Build-command fixture shared by the local installation fingerprint contract. */
export function writeLocalBuildTools(fakeBin) {
  fs.writeFileSync(path.join(fakeBin, "pnpm"), `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' "$ARKTS_INSTALL_TEST_PNPM_VERSION"
  exit 0
fi
printf '%s\\n' "$*" >> "$ARKTS_INSTALL_TEST_LOG"
if [ "$1" = "install" ] && [ "$npm_config_lockfile" = "false" ] && [ "$3" != "--config.lockfile=true" ]; then
  printf '%s\\n' 'Headless installation requires a pnpm-lock.yaml file' >&2
  exit 17
fi
if [ "$1" = "build" ]; then
  mkdir -p dist
  printf '%s\\n' 'process.stdin.resume()' > dist/semantic-worker.cjs
  printf '%s\\n' 'process.stdin.resume()' > dist/reference-verifier-worker.cjs
  printf '%s\\n' 'process.stdin.resume()' > dist/diagnostic-verifier-worker.cjs
  printf '%s\\n' 'process.stdin.resume()' > dist/server.cjs
  printf '%s\\n' '{"schema":"arkts-language-server.standard-library","schemaVersion":1,"files":["lib.d.ts"]}' > dist/arkts-standard-library.json
  printf '%s\\n' 'interface Object {}' > dist/lib.d.ts
fi
exit 0
`)
  fs.writeFileSync(path.join(fakeBin, "cargo"), `#!/bin/sh
printf 'cargo %s\\n' "$*" >> "$ARKTS_INSTALL_TEST_LOG"
printf 'cargo-cwd %s\\n' "$(pwd -P)" >> "$ARKTS_INSTALL_TEST_LOG"
case "$CARGO_TARGET_DIR" in
  */editors/zed/target)
    mkdir -p "$CARGO_TARGET_DIR/wasm32-wasip2/release"
    printf '\\000asm' > "$CARGO_TARGET_DIR/wasm32-wasip2/release/zed_arkts_local.wasm"
    ;;
  *)
    mkdir -p "$CARGO_TARGET_DIR/release"
    printf '#!/bin/sh\\nexit 0\\n' > "$CARGO_TARGET_DIR/release/arkts-index-sidecar"
    chmod 755 "$CARGO_TARGET_DIR/release/arkts-index-sidecar"
    ;;
esac
exit 0
`)
}
