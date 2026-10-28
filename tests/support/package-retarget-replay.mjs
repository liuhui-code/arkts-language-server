import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import { createFixture, replay } from "./reference-coverage-replay.mjs"

/** Each declaration policy must independently reject its first stale owner. */
export async function assertPackageRetarget(t, { runtimeEnv = {}, installedPackage = false } = {}) {
  for (const includeDeclaration of [false, true]) {
    const fixture = createFixture(t, { namedPackage: true, installedPackage })
    const options = { includeDeclarations: [includeDeclaration], settleBeforeWarm: true }
    const hasPackageConsumer = result => result.map(JSON.parse)
      .some(location => location.uri === fixture.uri("PackageConsumer.ets"))
    const before = await replay(t, fixture, "legacy", options)
    assert.ok(before.results.every(hasPackageConsumer))
    const resident = await replay(t, fixture, "batched", {
      ...options, warm: true, resident: true, runtimeEnv,
      afterWarm: () => {
        if (!installedPackage) {
          fs.writeFileSync(path.join(fixture.root, "shared/oh-package.json5"), "{ main: 'B.ets' }")
        } else {
          const link = path.join(fixture.root, "oh_modules/shared")
          fs.unlinkSync(link)
          fs.symlinkSync(path.join(fixture.root, "shared/B"), link, process.platform === "win32" ? "junction" : "dir")
        }
      },
    })
    // The original compiler also caches package metadata: use a new process
    // after mutation as the exact oracle, never that original warm service.
    const fresh = await replay(t, fixture, "legacy", options)
    assert.equal(resident.results.length, 1, "the stale-owner check must be the session's first query")
    assert.ok(fresh.results.every(result => !hasPackageConsumer(result)))
    assert.deepEqual(resident.results, fresh.results)
    assert.ok(!resident.events.some(event => event.event === "references.resident.hit"))
    assert.ok(resident.events.some(event => event.event === "references.batch.start"))
    if (runtimeEnv.ARKTS_REFERENCES_CONTEXT_RETENTION === "budget-aware") {
      assert.ok(resident.events.some(event => event.event === "references.context.retention"
        && event.profile === "budget-aware" && event.removed === false), "actually run the selected budget policy")
    }
  }
}
