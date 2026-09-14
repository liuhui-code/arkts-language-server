# References identity-bounded dependency profile

## Outcome

The previous Photos traces proved that semantic-unit admission was not the
compiler working set: `LogExtender` admitted 841 project files but the Program
loaded 206, and `Routers` loaded 218. The two missing paths that triggered the
841-file expansion were hashed in the default-off trace and resolved locally
to real undeclared cross-module relative imports. Following those imports also
pulled unrelated dependencies of the candidate consumer into the verifier.

This slice adds an experimental `identity` dependency profile. It is active
only when the Rust reference index reports a complete declaration-identity
proof and every identity candidate fits in one batch. The verifier then admits
the query/open documents and all identity candidate files together, and treats
other project dependencies as unavailable instead of expanding through their
import closure. `ohos-typescript` still proves every returned Location. If the
identity proof is incomplete or candidates would require multiple batches, the
executor remains on the existing conservative closure profile.

The profile is default-off. Production continues to use `legacy`; indexed
batching continues to use `closure` unless explicitly configured.

## Real-project result

OpenHarmony Photos was fixed at commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`, with DevEco API 24 SDK
`6.1.1.125` and Node `v26.3.0`. Each cell below is the median of three
independent server processes. The comparison baseline is the immediately
preceding indexed-batched closure profile, not a new legacy measurement.

| Symbol | Profile | Locations | Request median | Peak RSS median | Program files | Expansion |
|---|---|---:|---:|---:|---:|---:|
| `LogExtender` | closure | 3 | 7.331 s | 576,307,200 B | 565 (206 project + 359 SDK) | 1 |
| `LogExtender` | identity | 3 | 14.628 s | 376,823,808 B | 126 (2 project + 124 SDK) | 0 |
| `Routers` | closure | 19 | 9.914 s | 562,438,144 B | 577 (218 project + 359 SDK) | 1 |
| `Routers` | identity | 19 | 13.732 s | 395,386,880 B | 127 (3 project + 124 SDK) | 0 |

All six identity-profile runs passed oracle validation. `LogExtender` retained
the same three Locations and zero diagnostics; `Routers` retained the same 19
Locations and one normal diagnostic. Identity bounding reduced median peak RSS
by 34.61% and 29.70% respectively. It also increased median request time by
99.53% and 38.51%.

This is causal evidence that the candidate consumer's unrelated import closure
is a major working-set multiplier. It is not a release result: neither sample
is the user-reported greater-than-3-GB project, neither reaches the final 50%
peak-reduction gate, and `LogExtender` is only narrowly within the prototype
2x latency ceiling.

Machine-readable summary:
[`evidence/2026-09-14-references-identity-bounded-dependencies.json`](evidence/2026-09-14-references-identity-bounded-dependencies.json).

## Safety boundary

The public child-process LSP test includes a real direct import reference plus
a six-file irrelevant dependency chain. The closure profile loads that chain;
the identity profile returns the exact same normalized Locations with a
smaller compiler Program. A second public case requests the identity profile
with an incomplete index proof and asserts that every verifier batch remains
on `closure`.

The implementation deliberately does not attempt multi-batch identity
verification yet. Splitting the declaration and a consumer into separate
Programs lost the consumer reference in the initial RED experiment. Until a
stable anchor can be reconstructed in every batch, a candidate set larger than
the root limit must remain conservative.

## Fixed replay

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file tools/src/main/utils/LogExtender.ets \
  --symbol LogExtender --line 21 --character 24 \
  --oracle /private/tmp/photos-logextender-legacy-pass.json \
  --out /private/tmp/photos-logextender-identity.json \
  --mode A --strategy indexed-batched --sdk-profile common \
  --dependency-profile identity --batch-roots 64 \
  --trace --idle-ms 0 --timeout-ms 30000
```

For `Routers`, replace the file/symbol/position with
`tools/src/main/global/pages/Routers.ets`, `Routers`, and zero-based UTF-16
position `26:19`, and use `/private/tmp/photos-routers-legacy-pass.json` as the
oracle.

## Status and next gate

Status: **prototype PASS, release gate NOT PASSED**.

The next slice must make identity-bounded verification safe across multiple
batches by reconstructing the declaration anchor in each Program, then compare
exact Locations and normal diagnostics before using smaller root limits. It
must not enable this profile by default, add parallel verifier Programs, or
silently tolerate an incomplete identity proof.
