# L01 official Language Service ownership assertion

Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.

## RED

`node --test tests/semantic-capability-matrix.test.mjs` failed in the
single-owner architecture test with `2 !== 1`. The second production semantic
`createLanguageService()` site is the approved L2 recycler in
`registry-pool.ts`; it replaces the existing official service using the same
host and registry pool. The constructor site remains in
`typescript-language-service.ts`. This does not add a second semantic backend.

## GREEN

The architecture assertion now requires exactly one call in each approved
file and exactly two calls across `src/semantic` plus `src/core/types`.
An additional unapproved semantic factory site, including a third call in
either approved file, fails the test. The existing checks still reject
`ets2panda`/ACE providers and direct `createProgram()` sites in that scope.

`node --test tests/semantic-capability-matrix.test.mjs`: 2/2 passed.

The formatter's separate short-lived Language Service lies outside this
production semantic-owner scope and is not counted as an ArkTS semantic backend.
