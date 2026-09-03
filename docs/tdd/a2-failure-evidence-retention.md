# A2 failure evidence retention: TDD evidence

- Parent revision: `720c2027b2654fb7018caf3c6b92e342edf5211d`
- Public boundary: `withTestEvidence({ root, caseId, metadata }, run)`
- Focused command: `node --test tests/test-evidence.test.mjs`

## Contract

Every invocation creates a unique evidence directory directly below the
injected root and passes its path to the case callback. A successful callback's
return value is preserved and its evidence directory is deleted. A failed
callback keeps the directory, writes `failure.json`, and rethrows the original
error object.

`failure.json` has a versioned schema and contains the case id, an error summary,
and only explicitly allowed metadata. The metadata allowlist is `commit`,
`platform`, and `target`; values must be JSON scalars. The error summary permits
only `name`, `message`, `code`, and `signal`. Stack traces, complete environment
objects, source bodies, and unknown fields are not copied into the file.

The callback may place bounded transcript, log, or process evidence in its
directory. This helper owns only directory lifecycle and the minimal failure
summary; CI upload policy and resource sampling remain outside A2.

## RED -> GREEN cycles

1. **Unique directory and success cleanup**
   - RED: module import failed with `ERR_MODULE_NOT_FOUND` because the helper did
     not exist.
   - GREEN: two concurrent successful cases received different directories,
     returned their values, and left the injected evidence root empty.
2. **Failure retention and data minimization**
   - RED: the original failure was rethrown, but unconditional cleanup removed
     the transcript and produced `ENOENT` during verification.
   - GREEN: the transcript directory remained, `failure.json` matched the exact
     schema, the same error object was rethrown, and environment/source fields
     were absent.

Final focused result: 2 tests passed, 0 failed, 0 skipped.
