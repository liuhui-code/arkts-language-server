/** Query-cache admission and proof ownership form one conformance group. */
export const queryCacheUnitTests = Object.freeze([
  "tests/reference-namespace-admission.test.mjs",
  "tests/reference-query-proof.test.mjs",
  "tests/reference-portable-inputs.test.mjs",
])
export const queryCacheBundleTests = Object.freeze([
  "tests/semantic/references-source-input-lifetime.test.mjs",
  "tests/semantic/references-source-input-qualification.test.mjs",
  "tests/semantic/references-partial-retained-owner.test.mjs",
  "tests/semantic/references-source-digest-lifecycle.test.mjs",
  "tests/semantic/references-source-digest-reuse.test.mjs",
  "tests/semantic/references-query-cache-proof.test.mjs",
  "tests/semantic/references-lexical-probe-lifetime.test.mjs",
  "tests/semantic/references-compiler-input-cache.test.mjs",
])
