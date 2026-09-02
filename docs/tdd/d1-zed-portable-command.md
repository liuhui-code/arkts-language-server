# D1: portable local Zed command

Parent revision: `a4da5556b7f233abee00b152356ab477dba76f31`

Scope: make the local Zed adapter start the stable
`arkts-language-server --stdio` command without machine-specific paths. This
slice intentionally does not download binaries, support SSH, or modify a
user's global Zed development-extension link.

## Slice 1: Zed resolves the server from PATH

RED:

```text
node --test tests/zed-adapter.test.mjs
not ok 1 - the local Zed adapter registers ArkTS and launches the portable server from PATH
The input did not match /worktree\.which\("arkts-language-server"\)/
```

GREEN: the adapter now calls
`worktree.which("arkts-language-server")`, passes only `--stdio`, and returns an
error that tells the user to install the command and expose it on PATH. The
same focused command passed 1/1.

## Slice 2: the repository command is cwd-independent

RED:

```text
node --test tests/zed-adapter.test.mjs
not ok 2 - the repository CLI starts the language server outside the repository cwd
spawn /private/tmp/arkts-lsp-d/bin/arkts-language-server ENOENT
```

GREEN: `bin/arkts-language-server --stdio` resolves the built server relative
to the launcher itself (including when reached through a symlink), emits
operational failures on stderr, and successfully answers a framed LSP
`initialize` request when launched with `/tmp` as cwd. The focused suite passed
2/2 after `pnpm build`.

## Slice 3: local installation has an explicit target

RED:

```text
node --test tests/zed-adapter.test.mjs
not ok 3 - the local installer creates a working command in the requested bin directory
spawnSync /private/tmp/arkts-lsp-d/scripts/install-local.sh ENOENT
```

GREEN: `scripts/install-local.sh [BIN_DIRECTORY]` creates a development
symlink without replacing an unrelated existing path. A command installed in
a temporary bin directory answered a real framed LSP `initialize` request from
outside the repository. The focused suite passed 3/3.

## Final verification

```text
pnpm check:fast
7 tests passed

cd editors/zed && cargo fmt --check
passed

cd editors/zed && cargo build --target wasm32-wasip2 --release
Finished release profile
```
