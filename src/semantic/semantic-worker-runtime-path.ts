import fs from "node:fs"
import path from "node:path"

/** Keep packaged adjacency and the existing explicit/development fallbacks identical. */
export function resolveSemanticWorkerPath(directory: string, override?: string): string {
  const adjacent = path.join(directory, "semantic-worker.cjs")
  return override ?? (fs.existsSync(adjacent) ? adjacent : path.resolve(process.cwd(), "dist", "semantic-worker.cjs"))
}
