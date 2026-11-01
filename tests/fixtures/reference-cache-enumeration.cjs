const fs = require("node:fs"), path = require("node:path")
const { isMainThread } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_TEST_REFERENCE_CACHE_WITNESS) {
  const witness = process.env.ARKTS_TEST_REFERENCE_CACHE_WITNESS
  if (!path.basename(path.dirname(witness)).startsWith("arkts-reference-cache-probe-")) {
    throw Error("private reference cache probe required")
  }
  const cache = path.resolve(process.env.ARKTS_INDEX_CACHE_DIR)
  fs.appendFileSync(witness, "loaded\n")
  const opendir = fs.opendirSync
  fs.opendirSync = function(file, ...args) {
    const directory = opendir.call(this, file, ...args)
    if (path.resolve(String(file)) === cache) {
      const read = directory.readSync
      directory.readSync = function() {
        const entry = read.call(this)
        if (entry === null) {
          const mutation = path.join(cache, "private-membership-churn")
          fs.writeFileSync(mutation, "native cache namespace changed")
          fs.unlinkSync(mutation)
          fs.appendFileSync(witness, "churned\n")
        }
        return entry
      }
    }
    return directory
  }
}
