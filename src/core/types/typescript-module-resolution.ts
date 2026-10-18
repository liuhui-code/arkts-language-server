import path from "node:path"
import ts from "typescript"
import type { SemanticCallHierarchyFailureReason } from "../protocol.js"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import { resolveHarmonySdkModule } from "../sdk/module-resolver.js"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import type { QueryModuleResolution } from "./typescript-query-module-resolution.js"
import { relativeModuleCandidate } from "./typescript-relative-module-candidate.js"
import { witnessedModuleResolutionHost } from "./typescript-resolution-witness.js"
import { callHierarchyPathFailure } from "./typescript-source-boundary.js"
import { verifierSdkFileExists } from "./verifier-sdk-lookups.js"

interface ModuleResolutionPort {
  readonly rootPath: string
  readonly sdkRoot: string | null
  readonly packageResolver: LocalPackageResolver
  readonly scripts: ReadonlyMap<string, { readonly overlay: boolean }>
  readonly overlayPaths: ReadonlyMap<string, string> | undefined
  readonly configurationWitness: LoadedConfigurationWitness | undefined
  readonly moduleResolution: QueryModuleResolution
  readonly checkpoint: (() => void) | undefined
  readonly relativeResolutionCheckpoint: () => void
  readonly relativeResolutionFailures: Map<string, Map<string, SemanticCallHierarchyFailureReason>>
}

/** ArkTS package/SDK priority and canonical relative-source ownership. */
export function resolveTypeScriptModule(port: ModuleResolutionPort, name: string, containingFile: string,
  relativeBoundaryRoot?: string): ts.ResolvedModule | undefined {
  if (!name.startsWith(".")) {
    const local = port.packageResolver.resolve(port.rootPath, containingFile, name, {
      checkpoint: port.checkpoint,
      hasOverlay: (filePath) => port.scripts.get(filePath)?.overlay === true,
      overlayPath: (physicalPath) => port.overlayPaths?.get(physicalPath),
    })
    if (local !== undefined) {
      return local.path
        ? ({ resolvedFileName: local.path, extension: moduleExtension(local.path) } as ts.ResolvedModule)
        : undefined
    }
    const sdkModule = port.sdkRoot ? resolveHarmonySdkModule(port.sdkRoot, name, port.configurationWitness) : null
    if (sdkModule) {
      return ({
        resolvedFileName: sdkModule,
        extension: moduleExtension(sdkModule),
        isExternalLibraryImport: true,
      } as ts.ResolvedModule)
    }
    return port.moduleResolution.resolve(name, containingFile,
      witnessedModuleResolutionHost(port.configurationWitness))
  }
  const base = path.resolve(path.dirname(containingFile), name)
  const resolved = relativeModuleCandidate(base,
    candidate => port.scripts.has(path.resolve(candidate)),
    candidate => verifierSdkFileExists(candidate, port.sdkRoot, port.configurationWitness))
  const resolvedPath = resolved && path.resolve(resolved)
  const sourcePath = resolvedPath && relativeBoundaryRoot
    ? port.packageResolver.installedSourcePath(
      relativeBoundaryRoot,
      containingFile,
      resolvedPath,
      (physicalPath) => port.overlayPaths?.get(physicalPath)
        ?? (port.scripts.has(resolvedPath) ? resolvedPath : undefined),
      port.relativeResolutionCheckpoint,
    )
    : undefined
  if (!resolvedPath || !relativeBoundaryRoot) port.relativeResolutionCheckpoint()
  if (resolvedPath && !sourcePath) {
    const failure = callHierarchyPathFailure(
      relativeBoundaryRoot ?? port.rootPath,
      resolvedPath,
      port.scripts.get(resolvedPath)?.overlay === true,
    ) ?? "source-unavailable"
    if (port.scripts.has(containingFile)) {
      let failures = port.relativeResolutionFailures.get(containingFile)
      if (!failures) {
        failures = new Map()
        port.relativeResolutionFailures.set(containingFile, failures)
      }
      const previous = failures.get(name)
      if (previous !== "source-outside-workspace" || failure === "source-outside-workspace") {
        failures.set(name, failure)
      }
    }
  }
  return sourcePath
    ? ({ resolvedFileName: sourcePath, extension: moduleExtension(sourcePath) } as ts.ResolvedModule)
    : undefined
}

function moduleExtension(filePath: string): ts.Extension {
  if (filePath.endsWith(".d.ets")) return ts.Extension.Dets
  if (filePath.endsWith(".ets")) return ts.Extension.Ets
  if (filePath.endsWith(".d.ts")) return ts.Extension.Dts
  return ts.Extension.Ts
}
