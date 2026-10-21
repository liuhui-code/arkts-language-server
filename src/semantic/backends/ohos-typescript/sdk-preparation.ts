import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { safeRead } from "../../../core/types/typescript-safe-source-read.js"
import { isWithinRoot } from "../../../core/types/typescript-source-boundary.js"
import { SemanticInputUnavailableError } from "../../../core/types/typescript-query-inputs.js"
import { initialPreparationCheckpoint } from "../../coordinator/initial-preparation.js"

type Acquisition = Parameters<ts.DocumentRegistry["acquireDocumentWithKey"]>

/** Preparse the supported SDK declaration catalog; never add these files as Program roots. */
export function prepareSdkDeclarations(root: string, actual: Acquisition, registry: ts.DocumentRegistry): void {
  const physicalRoot = fs.realpathSync.native(root)
  // Preacquire the same canonical paths as the actual LanguageService host.
  const caseSensitive = (actual[2] as ts.LanguageServiceHost).useCaseSensitiveFileNames?.() ?? false
  const pending = ["ets/component", "ets/api", "ets/kits", "ets/arkts", "js/api"]
    .map(directory => path.join(root, directory))
  while (pending.length) {
    initialPreparationCheckpoint()
    const directory = pending.pop()!
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw error
    }
    for (const entry of entries) {
      initialPreparationCheckpoint()
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) { pending.push(file); continue }
      if (!/\.d\.(?:ts|ets)$/.test(entry.name) || (!entry.isFile() && !entry.isSymbolicLink())) continue
      if (!isWithinRoot(physicalRoot, fs.realpathSync.native(file))) throw new SemanticInputUnavailableError()
      const content = safeRead(file)
      if (content === null) throw new SemanticInputUnavailableError()
      const normalized = path.resolve(file).split(path.sep).join("/")
      const resolved = (caseSensitive ? normalized : normalized.toLowerCase()) as ts.Path
      const kind = file.endsWith(".ets") ? ts.ScriptKind.ETS : ts.ScriptKind.TS
      const source = registry.acquireDocumentWithKey(file, resolved, actual[2], actual[3],
        ts.ScriptSnapshot.fromString(content), actual[5], kind, actual[7])
      registry.releaseDocumentWithKey(resolved, actual[3], kind, source.impliedNodeFormat)
    }
  }
}
