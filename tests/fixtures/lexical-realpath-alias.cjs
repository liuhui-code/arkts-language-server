// Simulate the legal Windows distinction between JS and native realpath on an
// 8.3 alias. A real directory link supplies both spellings on every platform.
// Product algorithms and the native filesystem APIs remain unchanged.
const fs = require("node:fs"), path = require("node:path")
const lexical = process.env.ARKTS_TEST_REALPATH_LEXICAL_ROOT
if (lexical) {
  const physical = fs.realpathSync.native(lexical)
  const original = fs.realpathSync
  const preserveAlias = function(...args) {
    const resolved = original.apply(this, args)
    if (typeof resolved !== "string") return resolved
    const relative = path.relative(physical, resolved)
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      ? path.join(lexical, relative) : resolved
  }
  preserveAlias.native = original.native
  fs.realpathSync = preserveAlias
}
