import ts from "typescript"
import path from "node:path"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { isRegularBoundedFile } from "./typescript-safe-source-read.js"

export function witnessedFilesystemLookup<Result>(filePath: string, lookup: () => Result,
  witness?: LoadedConfigurationWitness): Result {
  return witness ? witness.observe(filePath, lookup) : lookup()
}

/** Metadata existence consumes its actual leaf, never unrelated parent contents. */
export function witnessedFileExists(filePath: string, witness?: LoadedConfigurationWitness,
  lookup: () => boolean = () => isRegularBoundedFile(filePath)): boolean {
  if (!witness) return lookup()
  return path.basename(filePath) === "package.json"
    ? witness.observePresence(filePath, lookup) : witness.observe(filePath, lookup)
}

export function witnessedDirectoryExists(filePath: string, witness?: LoadedConfigurationWitness): boolean {
  return witness ? witness.observePresence(filePath, () => ts.sys.directoryExists(filePath)) : ts.sys.directoryExists(filePath)
}

/** Preserve all real compiler fallback reads and negative path lookups. */
export function witnessedModuleResolutionHost(witness?: LoadedConfigurationWitness): ts.ModuleResolutionHost {
  if (!witness) return ts.sys
  return {
    fileExists: filePath => witnessedFileExists(filePath, witness, () => ts.sys.fileExists(filePath)),
    readFile: filePath => witness.observe(filePath, () => ts.sys.readFile(filePath)),
    directoryExists: filePath => witnessedDirectoryExists(filePath, witness),
    getDirectories: filePath => witness.observe(filePath, () => ts.sys.getDirectories(filePath)),
    realpath: ts.sys.realpath ? filePath => witness.observe(filePath, () => ts.sys.realpath!(filePath)) : undefined,
  }
}
