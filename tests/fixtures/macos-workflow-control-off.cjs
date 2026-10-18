const path = require("node:path")

// Exercise a native JSON-RPC error at the external process configuration boundary.
if (path.basename(process.argv[1] ?? "") === "server.cjs"
  && process.env.ARKTS_TEST_WORKFLOW_CONTROL_OFF === "1") {
  if (!process.env.ARKTS_INDEX_CACHE_DIR?.split(path.sep)
    .some(part => part.startsWith("arkts-macos-e2e-"))) {
    throw new Error("control-off probe requires its private workflow cache")
  }
  process.env.ARKTS_BENCHMARK_CONTROL = "0"
}
