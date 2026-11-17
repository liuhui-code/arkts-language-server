import fs from "node:fs/promises"
import path from "node:path"

/** Genuine source-unavailable admission, independent of the removed20K cap. */
export async function writeUnavailableSource(workspace, relative = "Unavailable.ets") {
  const file = path.join(workspace, relative)
  await fs.writeFile(file, "/*" + " ".repeat(5 * 1024 * 1024) + "*/\nexport {}\n")
  return file
}
