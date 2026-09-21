# F2 Settings primary benchmark preflight

Status: **historical preflight for SDK-matched testing**. The later
[pinned API-24 compatibility benchmark](2026-09-21-settings-api24-benchmark.md)
supersedes this report's blanket environment block for performance work;
an exact API-23-matched comparison remains unavailable.
The benchmark priority changed from Photos to the real OpenHarmony Settings
project; existing Photos observations remain smoke evidence only.

The already-present Settings checkout at
`/private/tmp/arkts-settings-e2e.vrQQm9/project` is clean and pinned to
`ecc550dfaed880e04e38a2477eb7235cd50475b9` on the 6.1-LTS history.
It has 3,308 tracked files, including 1,725 `.ets` files. Its
`build-profile.json5` declares compile SDK **23** and target/compatible SDK
**20**. These are genuine project boundaries; no source or build profile was
changed to alter the benchmark size.

The installed DevEco SDK found at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony` reports
ETS API **24**, component version `6.1.1.125`. No API-23 SDK was found in the
inspected user SDK, application and temporary locations. The source report's
separate Settings master revision `3718cba469731021ecd26b1a619d6493976602a1`
requires compile SDK **26.0.1**, not API 24 either. Thus neither revision
currently has a matching local SDK.

The official [OpenHarmony 6.1 Release notes](https://github.com/openharmony/docs/blob/master/zh-cn/release-notes/OpenHarmony-v6.1-release.md)
identify Public SDK `6.1.0.31` as API 23. The official release mirror offers
the [macOS public SDK archive and checksum](https://repo.huaweicloud.com/openharmony/os/6.1-Release/),
but this Mac is `x86_64`, so the separately labelled M1 archive is not an
appropriate substitute. The Mac archive is about 1.3 GiB compressed; only
2.9 GiB of local temporary-disk capacity was free at preflight. Downloading
and unpacking it without a storage plan risks filling the user volume, so no
SDK download or extraction was attempted.

For an SDK-matched cross-version gate: locate/install a genuine API-23 SDK
for the clean 6.1-LTS checkout (or a genuine 26.0.1 SDK for the separately
pinned master revision), compute
its declaration digest, choose a real symbol with known references, and
freeze a verified exact UTF-16 oracle before A/B/C replay. Running the
API-23 project against API 24 is now a pinned same-SDK strategy and
performance benchmark. It cannot satisfy an API-23-matched or DevEco
diagnostic-equivalence gate, but lack of API 23 no longer blocks that work.

This preflight did not run references, obtain a result set, or measure server
RSS. It must not be counted as a Settings end-to-end test.
