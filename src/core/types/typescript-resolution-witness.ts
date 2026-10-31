import ts from "typescript"
import path from "node:path"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { isRegularBoundedFile } from "./typescript-safe-source-read.js"

export function witnessedFilesystemLookup<Result>(filePath: string, lookup: () => Result,
  witness?: LoadedConfigurationWitness, directory = false): Result {
  if (!witness) return lookup()
  return directory || /\.(?:ets|tsx?)$/.test(filePath)
    ? witness.observeSourceNamespace(filePath, lookup) : witness.observe(filePath, lookup)
}

/** Metadata existence consumes its actual leaf, never unrelated parent contents. */
export function witnessedFileExists(filePath: string, witness?: LoadedConfigurationWitness,
  lookup: () => boolean = () => isRegularBoundedFile(filePath)): boolean {
  if (!witness) return lookup()
  if (/\.(?:ets|tsx?)$/.test(filePath)) return witness.observeSourceNamespace(filePath, lookup)
  return path.basename(filePath) === "package.json"
    ? witness.observePresence(filePath, lookup) : witness.observe(filePath, lookup)
}

export function witnessedDirectoryExists(filePath: string, witness?: LoadedConfigurationWitness): boolean {
  return witness ? witness.observeSourceNamespace(filePath, () => ts.sys.directoryExists(filePath), true) : ts.sys.directoryExists(filePath)
}

/** Preserve all real compiler fallback reads and negative path lookups. */
export function witnessedModuleResolutionHost(witness?: LoadedConfigurationWitness): ts.ModuleResolutionHost {
  if (!witness) return ts.sys
  return {
    fileExists: filePath => witnessedFileExists(filePath, witness, () => ts.sys.fileExists(filePath)),
    readFile: filePath => witnessedFilesystemLookup(filePath, () => ts.sys.readFile(filePath), witness),
    directoryExists: filePath => witnessedDirectoryExists(filePath, witness),
    getDirectories: filePath => witnessedFilesystemLookup(filePath, () => ts.sys.getDirectories(filePath), witness, true),
    realpath: ts.sys.realpath ? filePath => witnessedFilesystemLookup(filePath, () => ts.sys.realpath!(filePath), witness) : undefined,
  }
}
