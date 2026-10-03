import fs from "node:fs"
import path from "node:path"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"

const MAX_ANCESTORS = 64

export function findInstalledPackage(
  physicalRoot: string,
  start: string,
  name: string,
  checkpoint: () => void,
  witness?: LoadedConfigurationWitness,
): string | undefined {
  let directory: string
  try { directory = observed(start, () => fs.realpathSync.native(start), witness) }
  catch { return undefined }
  const clientRoot = clientWorkspaceRoot(physicalRoot, start, checkpoint, witness)
  if (clientRoot === undefined) return undefined
  for (let depth = 0; depth < MAX_ANCESTORS && physicallyInside(physicalRoot, directory); depth += 1) {
    checkpoint()
    const candidate = path.join(directory, "oh_modules", name)
    try {
      // Let the lexical installation link choose the store entry; never enumerate .ohpm.
      return observed(candidate, () => {
        fs.lstatSync(candidate)
        try { return path.join(clientRoot, path.relative(physicalRoot, fs.realpathSync.native(candidate))) }
        catch { return undefined }
      }, witness)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return path.join(clientRoot, path.relative(physicalRoot, candidate))
      }
    }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return undefined
}

export function clientWorkspaceRoot(
  physicalRoot: string,
  start: string,
  checkpoint: () => void,
  witness?: LoadedConfigurationWitness,
): string | undefined {
  let directory = start
  for (let depth = 0; depth < MAX_ANCESTORS; depth += 1) {
    checkpoint()
    try {
      if (observed(directory, () => fs.realpathSync.native(directory), witness) === physicalRoot) return directory
    } catch { return undefined }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return undefined
}

function observed<T>(filePath: string, lookup: () => T, witness?: LoadedConfigurationWitness): T {
  return witness ? witness.observe(filePath, lookup) : lookup()
}
function physicallyInside(root: string, candidate: string): boolean {
  try {
    const relative = path.relative(fs.realpathSync.native(root), fs.realpathSync.native(candidate))
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  } catch { return false }
}
