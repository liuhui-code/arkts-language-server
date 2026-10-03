import ts from "typescript"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"

/** Preserve all real compiler fallback reads and negative path lookups. */
export function witnessedModuleResolutionHost(witness?: LoadedConfigurationWitness): ts.ModuleResolutionHost {
  if (!witness) return ts.sys
  return {
    fileExists: filePath => witness.observe(filePath, () => ts.sys.fileExists(filePath)),
    readFile: filePath => witness.observe(filePath, () => ts.sys.readFile(filePath)),
    directoryExists: filePath => witness.observe(filePath, () => ts.sys.directoryExists(filePath)),
    getDirectories: filePath => witness.observe(filePath, () => ts.sys.getDirectories(filePath)),
    realpath: ts.sys.realpath ? filePath => witness.observe(filePath, () => ts.sys.realpath!(filePath)) : undefined,
  }
}
