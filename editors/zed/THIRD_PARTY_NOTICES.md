# Third-party notices

The initial ArkTS language configuration and adapter structure were derived
from [`liuyanghejerry/zed-arkts`](https://github.com/liuyanghejerry/zed-arkts)
at commit `285b5e1f95b15a6dc6fb0e02a41c5181711687c2`, used under the MIT License
included in `LICENSE`. Local changes remove package download, DevEco-specific
initialization options, and remote execution concerns.

The ArkTS highlighting delta and generated `grammars/arkts.wasm` come from
[`harmony-contrib/tree-sitter-arkts`](https://github.com/harmony-contrib/tree-sitter-arkts)
at commit `a16e9d2d5c63a1cd02aa5edd4c4b2309f4da16fa`, under the MIT
License reproduced in `licenses/tree-sitter-arkts-MIT.txt`.

The JavaScript baseline embedded in `languages/arkts/highlights.scm` comes
from `tree-sitter-javascript` v0.23.1, commit
`3a837b6f3658ca3618f2022f8707e29739c91364`, under the MIT License
reproduced in `licenses/tree-sitter-javascript-MIT.txt`. This matches the
composition declared by the pinned ArkTS grammar's `tree-sitter.json`; no
floating dependency is fetched to construct the shipped query.

The outline, indentation, and bracket queries are maintained locally. The
delivery gate compiles every shipped `.scm` query against the exact ArkTS
grammar revision and executes capture-level regression tests.
