// Controlled uncertainty at the compiler Registry boundary; not a product dependency.
const fs = require("node:fs"), path = require("node:path"), wt = require("node:worker_threads")
const root = process.env.ARKTS_AUDIT_RUNTIME_ROOT
if (!root) throw Error("audit runtime required")
if (wt.isMainThread) {
  require("./worker-lifecycle-audit.cjs")
} else {
  require(path.join(root, "tests/fixtures/failed-semantic-build.cjs"))
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  const workspace = fs.realpathSync(path.join(directory, "workspace"))
  const control = path.join(directory, "audit-release.json")
  const installed = new WeakSet()
  const install = globalThis.__failedBuildTest.registry
  globalThis.__failedBuildTest.registry = registry => {
    install(registry)
    if (installed.has(registry)) return
    installed.add(registry)
    const project = new Map()
    const acquire = registry.acquireDocumentWithKey
    registry.acquireDocumentWithKey = function(...args) {
      const source = acquire.apply(this, args)
      let relative, physical
      try { physical = fs.realpathSync(args[0]); relative = path.relative(workspace, physical) } catch {}
      if (relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) {
        project.set(args[1], { kind: args[6] ?? source.scriptKind, physical })
      }
      return source
    }
    const release = registry.releaseDocumentWithKey
    registry.releaseDocumentWithKey = function(...args) {
      let fault
      try { fault = JSON.parse(fs.readFileSync(control, "utf8")) } catch {}
      if (!(fault?.remaining > 0) || !project.has(args[0])) return release.apply(this, args)
      fs.writeFileSync(control, JSON.stringify({ ...fault, remaining: fault.remaining - 1 }))
      const refs = () => registry.getLanguageServiceRefCounts(args[0], project.get(args[0]).kind)
        .reduce((sum, [, count]) => sum + (count ?? 0), 0)
      const before = refs()
      const projectBefore = [...project].map(([file, input]) => ({ file, physical: input.physical,
        refs: registry.getLanguageServiceRefCounts(file, input.kind).reduce((sum, [, count]) => sum + (count ?? 0), 0) }))
      if (fault.mode === "after") release.apply(this, args)
      fs.appendFileSync(path.join(directory, "audit-release.ndjson"), JSON.stringify({
        mode: fault.mode, args, physical: project.get(args[0]).physical,
        before, after: refs(), projectBefore, threadId: wt.threadId,
      }) + "\n")
      throw Error("audit: Registry release threw " + fault.mode + " effect")
    }
  }
}
