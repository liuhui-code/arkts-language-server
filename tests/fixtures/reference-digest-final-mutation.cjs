const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  const plan = path.join(directory, "reference-digest-mutation.json")
  globalThis.__referenceDigestMutation = file => {
    if (!file.endsWith("Unused0.ts") || !fs.existsSync(plan)) return
    const change = JSON.parse(fs.readFileSync(plan, "utf8"))
    const target = path.join(directory, "workspace/noise/Unused0.ts")
    if (fs.realpathSync.native(file) !== fs.realpathSync.native(target)) throw Error("private target identity mismatch")
    const before = fs.statSync(target)
    fs.renameSync(plan, plan + ".fired")
    fs.writeFileSync(target, change.text)
    fs.utimesSync(target, before.atimeMs / 1000, before.mtimeMs / 1000)
    const after = fs.statSync(target)
    fs.writeFileSync(plan + ".evidence.json", JSON.stringify({ stage: "after-real-borrowed-digest",
      before: { size: before.size, mtimeMs: before.mtimeMs, ctimeMs: before.ctimeMs },
      after: { size: after.size, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs } }))
  }
  const validate = source => {
    const start = source.indexOf("var TypeScriptResidentReferenceState = class")
    const end = source.indexOf("\n};", start)
    if (start < 0 || source.indexOf("var TypeScriptResidentReferenceState = class", start + 1) >= 0
      || !source.slice(start, end).includes("\n  diskSourceDigest(program, filePath) {")) {
      throw Error("unique actual disk-source digest owner required")
    }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (require("node:worker_threads").isMainThread && path.basename(file) === "server.cjs") {
      validate(fs.readFileSync(path.join(path.dirname(file), "semantic-worker.cjs"), "utf8"))
    }
    if (path.basename(file) === "semantic-worker.cjs") {
      validate(source)
      source += `\n{
        const digest = TypeScriptResidentReferenceState.prototype.diskSourceDigest;
        TypeScriptResidentReferenceState.prototype.diskSourceDigest = function(program, filePath) {
          const value = Reflect.apply(digest, this, [program, filePath]);
          if (value !== undefined) globalThis.__referenceDigestMutation(filePath);
          return value;
        };
      }\n`
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
