const path = require("node:path")

// Inject only the sampler's external wall-clock boundary, never RSS or query results.
if (path.basename(process.argv[1] ?? "") === "sample-process-tree-rss.mjs"
  && process.env.ARKTS_TEST_RSS_CLOCK_ROLLBACK === "1") {
  const original = Date.now
  let reads = 0
  Date.now = () => original() - (++reads >= 2 ? 2000 : 0)
}
