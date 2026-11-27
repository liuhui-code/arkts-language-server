const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const dir = path.dirname(process.env.ARKTS_LSP_LOG_DIR || "")
if (!path.basename(dir).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
const compile = Module.prototype._compile
Module.prototype._compile = function(source, file) {
  if (path.basename(file) === "semantic-worker.cjs") source += `\n{
    const define = SourceReferenceOwner.prototype.define;
    SourceReferenceOwner.prototype.define = function(query, ...args) {
      if (require("node:fs").existsSync(require("node:path").join(${JSON.stringify(dir)}, "full-navigation-oracle")))
        return { documentVersion: query.document.version, value: null };
      return Reflect.apply(define, this, [query, ...args]);
    };
  }\n`;
  return compile.call(this, source, file)
}
