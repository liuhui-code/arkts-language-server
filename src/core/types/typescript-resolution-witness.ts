import ts from "typescript"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"

export function witnessedDirectoryExists(filePath: string, witness?: LoadedConfigurationWitness): boolean {
  return witness ? witness.observePresence(filePath, () => ts.sys.directoryExists(filePath)) : ts.sys.directoryExists(filePath)
}

/** Preserve all real compiler fallback reads and negative path lookups. */
export function witnessedModuleResolutionHost(witness?: LoadedConfigurationWitness): ts.ModuleResolutionHost {
  if (!witness) return ts.sys
  return {
    fileExists: filePath => witness.observe(filePath, () => ts.sys.fileExists(filePath)),
    readFile: filePath => witness.observe(filePath, () => ts.sys.readFile(filePath)),
    directoryExists: filePath => witnessedDirectoryExists(filePath, witness),
    getDirectories: filePath => witness.observe(filePath, () => ts.sys.getDirectories(filePath)),
    realpath: ts.sys.realpath ? filePath => witness.observe(filePath, () => ts.sys.realpath!(filePath)) : undefined,
  }
}
