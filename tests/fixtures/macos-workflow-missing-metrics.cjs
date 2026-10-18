const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const childProcess = require("node:child_process")
const { syncBuiltinESMExports } = require("node:module")

// Move only the private, actually produced metrics after the real server has exited.
if (path.basename(process.argv[1] ?? "") === "run-macos-e2e.mjs"
  && process.env.ARKTS_TEST_WORKFLOW_METRICS_BACKUP_FILE) {
  const backup = path.resolve(process.env.ARKTS_TEST_WORKFLOW_METRICS_BACKUP_FILE)
  if (!backup.split(path.sep).some(part => part.startsWith("arkts-product-sdk-identity-"))
    || path.basename(backup) !== "faulted-metrics.jsonl") {
    throw new Error("missing metrics probe requires its private generated fixture")
  }
  const spawn = childProcess.spawn
  childProcess.spawn = function (command, args, options, ...rest) {
    const target = options?.env?.ARKTS_MEMORY_METRICS_FILE
    const fault = args?.[0]?.endsWith(path.join("dist", "server.cjs"))
      && /^arkts-macos-metrics-\d+-cold-0\.jsonl$/u.test(path.basename(target ?? ""))
    if (fault && (path.dirname(target) !== os.tmpdir()
      || !options.env.ARKTS_INDEX_CACHE_DIR?.split(path.sep)
        .some(part => part.startsWith("arkts-macos-e2e-")))) {
      throw new Error("missing metrics probe target is outside its private workflow")
    }
    const child = spawn.call(this, command, args, options, ...rest)
    if (fault) child.once("exit", () => {
      fs.renameSync(target, backup)
      if (process.env.ARKTS_TEST_WORKFLOW_CORRUPT_METRICS === "1") fs.writeFileSync(target, "{\"invalid\":\n")
      const schemaFault = process.env.ARKTS_TEST_WORKFLOW_METRICS_SCHEMA_FAULT
      if (schemaFault) {
        const samples = fs.readFileSync(backup, "utf8").trim().split("\n").map(JSON.parse)
        if (schemaFault === "null") samples[0] = null
        else if (schemaFault === "rss-negative") samples[0].rss = -1
        else if (schemaFault === "wrong-pid") samples[0].processId = process.pid
        else if (schemaFault === "missing-scope") delete samples[0].rssScope
        else throw new Error("unknown private metrics schema fault")
        fs.writeFileSync(target, samples.map(sample => JSON.stringify(sample)).join("\n") + "\n")
      }
    })
    return child
  }
  syncBuiltinESMExports()
}
