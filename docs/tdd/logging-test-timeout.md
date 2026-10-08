# Logging transcript completion wait

- Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.
- Public boundary: real `arkts-language-server --stdio` child process with Content-Length framing.
- RED: `node --test tests/logging.test.mjs` timed out waiting for completion response ID 2 after the test's default 3,000 ms. The failing full-check run used the repository's small fixture SDK environment; this test deliberately points `ARKLINE_HARMONY_SDK_PATH` to a missing directory.
- Diagnostic proof: with only this response wait temporarily raised to 20,000 ms, the same transcript and all stderr/file logging assertions passed. Two isolated runs measured response waits of 2,991 ms and 3,179 ms; the latter exceeds the old cutoff.
- GREEN: use an explicit 10,000 ms wait for the completion response in this logging test. This is a protocol/logging assertion, not a completion latency gate; dedicated performance tests retain that responsibility. No server code or runtime behavior changed.
