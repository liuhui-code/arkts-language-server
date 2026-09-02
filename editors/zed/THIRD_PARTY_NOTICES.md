# Third-party notices

The initial ArkTS language configuration and adapter structure were derived
from [`liuyanghejerry/zed-arkts`](https://github.com/liuyanghejerry/zed-arkts)
at commit `285b5e1f95b15a6dc6fb0e02a41c5181711687c2`, used under the MIT License
included in `LICENSE`. Local changes remove package download, DevEco-specific
initialization options, and remote execution concerns.

The highlighting baseline and generated `grammars/arkts.wasm` come from
[`harmony-contrib/tree-sitter-arkts`](https://github.com/harmony-contrib/tree-sitter-arkts)
at commit `a16e9d2d5c63a1cd02aa5edd4c4b2309f4da16fa` for local spike testing.
The outline, indentation, and bracket queries are maintained locally and are
compiled against that exact revision by the delivery quality gate.
