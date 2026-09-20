# Windows Zed source-checkout installation

Parent revision: `48b81d17a3c44754166d181329e3ae7c51029497`.

Public command: `pnpm zed:install` (optionally `--zed-user-data-dir` and `--bin-dir`).

## RED

The Windows installer contract and Zed adapter launch tests failed on the
parent revision: the installer rejected `win32` before building, and the adapter
had no Windows launch descriptor. The failing command was:

```text
node --test --test-name-pattern='Windows Zed installation|the Zed adapter starts the Windows' tests/local-delivery-config.test.mjs tests/zed-adapter.test.mjs
```

## GREEN

The installer now builds the Node runtime, native Rust sidecar, and WASI Zed
extension with native tools on Windows. It validates the pinned grammar and
stages content-addressed server and extension releases. A profile-local launch
descriptor points directly at the Node executable selected at install time and `server.cjs`,
so the Zed adapter need not spawn a Unix shell script or depend on PATH.

The process-level fixture simulates the Windows branch on macOS and verifies
installation plus failed-update preservation. The `windows-install` GitHub job
runs the real installer on a Windows host and checks the installed extension,
sidecar, and a framed LSP session. That native job must pass before claiming
Windows host verification; source-checkout installation is distinct from a
portable Windows release artifact.

## Effective `lockfile=false` configuration regression

Parent revision: `0225f613717609ac351b1f6f3342a658b2f2fbd7`.

The lockfile was present, but pnpm's effective `lockfile=false` setting made a
frozen install report it as absent. The Windows and Unix installer process
fixtures now simulate that setting and require the installer to explicitly
enable lockfile reading while retaining `--frozen-lockfile`.

RED command (both process fixtures failed with the missing-lockfile error):

```text
node --test --test-name-pattern='Windows Zed installer activates|local installer reruns frozen install' tests/local-delivery-config.test.mjs
```

GREEN: the same command passes with `--config.lockfile=true` on the install
step. The native Windows CI install step also runs with
`npm_config_lockfile='false'` to exercise the real pnpm/Windows combination.
