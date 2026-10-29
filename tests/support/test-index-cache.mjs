import fs from "node:fs"
import promises from "node:fs/promises"
import os from "node:os"
import path from "node:path"

/** Explicit fixture caches stay caller-owned; implicit caches never inherit a user's cache. */
export function testIndexCache(environment = {}) {
  const explicit = environment.ARKTS_INDEX_CACHE_DIR
  const owned = !explicit
  const directory = explicit || fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-test-index-"))
  return {
    directory,
    environment: { ARKTS_INDEX_CACHE_GC: "off", ...environment, ARKTS_INDEX_CACHE_DIR: directory },
    afterClose(child) {
      const cleanup = new Promise((resolve, reject) => {
        child.once("close", () => {
          if (!owned) return resolve()
          promises.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
            .then(resolve, reject)
        })
      })
      cleanup.catch(error => {
        process.stderr.write(`[test-index-cache] cleanup failed: ${directory}: ${error.message}\n`)
        process.exitCode = 1
      })
      return cleanup
    },
  }
}
