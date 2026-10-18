const path = require("node:path")

// The real server answers every query; only its actual OS exit is fault-injected.
if (path.basename(process.argv[1] ?? "") === "server.cjs"
  && process.env.ARKTS_TEST_WORKFLOW_NONZERO_EXIT === "17") {
  if (!process.env.ARKTS_INDEX_CACHE_DIR?.split(path.sep)
    .some(part => part.startsWith("arkts-macos-e2e-"))) {
    throw new Error("nonzero exit probe requires its private workflow cache")
  }
  process.once("exit", () => { process.exitCode = 17 })
}
