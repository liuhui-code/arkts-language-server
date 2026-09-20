# Default indexed references: macOS validation

The user requested enabling the references optimization by default and adding
memory to normal runtime logs. This change selects `indexed-batched` with the
conservative `closure` dependency profile and the existing `full` SDK profile.
`identity` remains opt-in: the SDK-import regression fixture showed two missed
`Use.ets` references when a necessary re-export support file was absent from
an identity batch. An index cannot be treated as current after a watched source
or project-configuration change; such a session falls back to the complete
legacy query. `ARKTS_REFERENCES_STRATEGY=legacy` remains the explicit override.

## Fixed real-project replay

- Mac server HEAD before this change: `6678b97d19a08ec53a3925e0e48e4a577c5e73fb`.
- Node `v26.3.0`; Photos commit `98ea1d9cd6a363c576e2c6ff17844e51723baec5`;
  DevEco OpenHarmony SDK API 24, version `6.1.1.125`.
- File `imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`;
  symbol `getMutuallyExclusiveDesc`; zero-based UTF-16 position `351:19`.
- Fresh process for each strategy; normal automatic diagnostics retained;
  external process-tree RSS sampler; no forced GC.

| Run | Exact Locations | Diagnostics | Product peak RSS | Request duration |
|---|---:|---:|---:|---:|
| Explicit legacy | 3 | 62 | 885,006,336 bytes | 7.857 s |
| Server defaults | 3 | 62 | 670,273,536 bytes | 8.729 s |

The strict replay differential passed both Location and diagnostic gates. The
default request log contained `rssBytes=577220608` and
`heapUsedBytes=11823608` at completion; these are not peak measurements.
The single paired run shows a 24.3% peak reduction, not a release-gate result.
The original user-reported >3 GB reproducer and final 50% peak gate remain open.

Local raw reports (outside the repository):
`/private/tmp/photos-legacy-paired-20260920.json` and
`/private/tmp/photos-default-closure-20260920.json`.

Replay the default path without strategy flags:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets \
  --symbol getMutuallyExclusiveDesc --line 351 --character 19 \
  --oracle /private/tmp/photos-bottomtoolbar-full-main-20260920.json \
  --out /private/tmp/photos-default-closure-20260920.json \
  --mode A --trace --idle-ms 0
```

The output path must not already exist; choose another `--out` for a new run.
