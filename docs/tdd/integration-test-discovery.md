# Integration test discovery evidence

- Parent revision: `b3e48cc` (`integration/local-beta` after semantic characterization merge)
- Scope: the public `pnpm check:fast` quality gate

## RED

`pnpm check:fast` reported only `3/3` semantic tests. The five existing
root-level `tests/*.test.mjs` cases were silently omitted because the shell
expanded `tests/**/*.test.mjs` only to nested paths.

## GREEN

The test command now names both root and nested suites explicitly. Its passing
count includes all eleven current public child-process/adapter tests.
