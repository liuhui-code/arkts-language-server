# Identity references: candidate dependency admission

Parent revision: `48b81d17a3c44754166d181329e3ae7c51029497`.

Public interface: a real child-process, Content-Length framed LSP session in
`tests/semantic/references-batching.test.mjs`. The SDK-terminal fixture contains
`Query -> Barrel -> Target`, another `Use -> Barrel -> Target` chain, and
same-name imports from a locked SDK module.

RED command:

```sh
pnpm build && node --test --test-name-pattern='indexed batching classifies a locked SDK module' tests/semantic/references-batching.test.mjs
```

RED: explicit `indexed-batched` + `identity` returned five Locations instead of
the conservative seven. Its index proof included `Barrel.ets` as a candidate,
but a separate `Use.ets` verifier batch did not admit that file and the
compiler's attempted access was tolerated as an identity-profile dependency.

GREEN: when a verifier reports an unavailable project file **that is also in
the complete identity candidate set**, admit that file and retry the same
batch. An unknown or already-admitted candidate fails closed. Noncandidate
imports remain excluded: the direct-import fixture's unrelated six-file
`Heavy*` chain must not enter the Program. The LSP test asserts exact Location
equality and that the indexed path was used. Trace events record counts, not
source contents or paths.

The first implementation admitted every missing dependency. The existing
direct-import LSP test caught this regression: six unrelated `Heavy*` files
entered the identity Program and removed its working-set benefit. Restricting
admission to identity candidates restored that test while retaining the SDK
fixture fix.

Verification: `pnpm check:fast` passed 928/928 tests on macOS when run with
permission for its existing external RSS sampler. The sandboxed first run
passed 927/928; its only failure was sampler `spawn EPERM`, not an LSP result.
