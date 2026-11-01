import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { CallHierarchySourceAuthority } from "../../../src/lsp/call-hierarchy-source-authority.js"
import "./scripted-semantic-server.js"

// Fixture-only port decoration: suspend the final source-validation promise,
// not the engine query. Keep the real authority's filesystem checks intact.
const isCurrent = CallHierarchySourceAuthority.prototype.isCurrent
let paused = false
CallHierarchySourceAuthority.prototype.isCurrent = async function (resolution) {
  const current = await isCurrent.call(this, resolution)
  const directory = process.env.ARKTS_TEST_PUBLICATION_BARRIER
  if (!paused && directory) {
    paused = true
    await fs.writeFile(path.join(directory, "entered"), String(current))
    const deadline = Date.now() + 10_000
    while (true) {
      try {
        await fs.access(path.join(directory, "release"))
        break
      } catch {
        if (Date.now() >= deadline) throw new Error("Publication barrier timed out")
        await delay(5)
      }
    }
  }
  return current
}
