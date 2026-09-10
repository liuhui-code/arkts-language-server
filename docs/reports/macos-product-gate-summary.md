# macOS Product Gate execution — 2026-09-10

The macOS end-to-end execution is complete for the release server, API 24 SDK, release Rust sidecar,
and an isolated Zed host. It is development evidence, not a substitute for the Linux PSS and DevEco
comparison release gate.

## Results

| Check | Result |
|---|---:|
| API 24 real-SDK stdio acceptance | PASS, 10/10 |
| Pinned 455-file real workspace | PASS, 455/455 indexed; latest cold 194.48 ms |
| Real source completion/definition/references/rename | PASS after bare-relative dependency fix |
| 10k generated workspace, cold/warm/stress 3/10/5 | PASS |
| 100k generated workspace, cold/warm/stress 3/10/5 | PASS |
| 100k completion/definition/references/edit/completion | 18/18 PASS |
| 100k stress: 20 module visits, explicit L3, completion rebuild | 5/5 PASS |
| Single worker / resident contexts | PASS, maximum 1 context |
| Heavy semantic project files at 10k and 100k | 201 at both sizes |
| 100k/10k steady RSS | 1.034, target <= 1.25 PASS |
| 100k post-L3 RSS / initial warm RSS | 1.282, target <= 1.20 FAIL |
| Isolated Zed host and configured SDK | PASS |
| DevEco comparison | NOT RUN |

The first 100k run correctly failed closed because the fixture placed nominally unrelated files under
the declared `entry` module. The fixed fixture puts those files at workspace level. Rust still catalogs
100,000 files, while `ProjectGraph` presents only the 201 declared active files to the semantic backend.

The remaining macOS failure is RSS retention after L3. RSS varies substantially across stress runs even
with one open document and one resident context, so the evidence does not yet distinguish live heap from
allocator-retained pages. The committed Linux PSS gate remains unchanged.

Verification on candidate `caf0f5828600c2a19b7cdb361d26a0e54cc7a215`:

- `pnpm check:fast`: 877/877 PASS;
- API 24 real-SDK acceptance: 10/10 PASS;
- pinned real-workspace acceptance: 455/455 indexed, PASS;
- generated 10k and 100k production stdio workflows: 3 cold + 10 warm + 5 stress runs each, PASS.

Raw evidence:

- [real-project semantic E2E](macos-real-project-semantic-e2e.json)
- [10k raw evidence](macos-zed-arkts-10k.json)
- [100k raw evidence](macos-zed-arkts-100k.json)
- [Zed host smoke](macos-zed-host-smoke.json)
- [benchmark environment](benchmark-environment-macos.json)
