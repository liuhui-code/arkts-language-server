import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

/** Independent fixture accounting: ordinary script globals are not candidate roots. */
export function conformanceGlobalScripts(workspace, current) {
  const result = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (/\.(?:ets|ts)$/.test(file) && file !== current) {
        const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.ETS)
        if (!ts.isExternalModule(source)) result.push(file)
      }
    }
  }
  for (const module of ["entry", "shared"]) visit(path.join(workspace, module, "src/main/ets"))
  return result.sort()
}
