import fs from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { TextPosition } from "../../contracts/document.js"
import type { WorkspaceReferenceCandidateResult, WorkspaceReferenceIndexPort, WorkspaceReferenceSourceResolution } from "../../contracts/workspace-index.js"
import { LocalPackageResolver } from "../../core/sdk/local-package-resolver.js"
import { isHarmonySdkModuleSpecifier, resolveHarmonySdkModule } from "../../core/sdk/module-resolver.js"
import { discoverProjectSdk, type ProjectSdkSelection } from "../../core/sdk/project-sdk.js"
import type { StructuredLogger } from "../../observability/logger.js"
import { isSemanticWorkerUriWithinRoot } from "../semantic-worker-supervisor.js"
import { MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES } from "../worker-protocol.js"
import type { ReferenceIndexFreshness } from "./reference-index-freshness.js"
import type { ReferenceSourceOverlaySnapshot } from "./reference-input-snapshot.js"

interface ReferenceSourceOptions {
  index?: WorkspaceReferenceIndexPort
  freshness: ReferenceIndexFreshness
  environment: NodeJS.ProcessEnv
  projectConfiguration?: unknown
  sdkConfiguration?: unknown
  sourceOverlays?: ReferenceSourceOverlaySnapshot
  logger?: StructuredLogger
}

export async function resolveReferenceCandidateSources(
  options: ReferenceSourceOptions, workspaceId: string, declarationUri: string,
  declarationPosition: TextPosition, result: WorkspaceReferenceCandidateResult,
  admittedRootUris: readonly string[] | undefined, signal?: AbortSignal,
): Promise<WorkspaceReferenceCandidateResult> {
  if (result.identityComplete || !options.index || !await options.freshness.accepts(
    workspaceId, result, options.index,
  )) {
    return result
  }
  // Unknown or competing physical aliases cannot authorize new source proof.
  if (options.sourceOverlays?.complete === false) return result
  const rootPath = toFilePath(workspaceId)
  if (!rootPath) return result
  const packageResolver = new LocalPackageResolver()
  packageResolver.configureProject(options.projectConfiguration)
  const sdk = discoverProjectSdk(
    rootPath,
    options.environment.ARKLINE_HARMONY_SDK_PATH,
    options.sdkConfiguration,
  )
  const sdkTerminals = new Map<string, string | undefined>()
  const resolutions = new Map<string, WorkspaceReferenceSourceResolution>()
  let unresolvedBindings = 0
  const unresolvedByKind = {
    sdk: 0,
    package: 0,
    relative: 0,
    other: 0,
  }
  const recordUnresolved = (sourceSpecifier: string): void => {
    unresolvedBindings += 1
    unresolvedByKind[referenceSourceKind(sourceSpecifier)] += 1
  }
  for (const binding of result.bindings ?? []) {
    if (binding.sourceResolution === "unique") continue
    const bindingPath = toFilePath(binding.uri)
    if (!bindingPath) {
      recordUnresolved(binding.sourceSpecifier)
      continue
    }
    if (isHarmonySdkModuleSpecifier(binding.sourceSpecifier)) {
      let externalTerminalIdentity = sdkTerminals.get(binding.sourceSpecifier)
      if (!sdkTerminals.has(binding.sourceSpecifier)) {
        externalTerminalIdentity = sdkExternalTerminalIdentity(sdk, binding.sourceSpecifier)
        sdkTerminals.set(binding.sourceSpecifier, externalTerminalIdentity)
      }
      if (!externalTerminalIdentity) {
        recordUnresolved(binding.sourceSpecifier)
        continue
      }
      const key = `${binding.uri}\0${binding.sourceSpecifier}`
      resolutions.set(key, {
        bindingUri: binding.uri,
        sourceSpecifier: binding.sourceSpecifier,
        externalTerminalIdentity,
      })
      continue
    }
    const resolved = packageResolver.resolve(
      rootPath,
      bindingPath,
      binding.sourceSpecifier,
      options.sourceOverlays,
    )
    options.sourceOverlays?.assertUnchanged()
    if (!resolved?.path) {
      recordUnresolved(binding.sourceSpecifier)
      continue
    }
    const resolvedSourceUri = pathToFileURL(resolved.path).href
    if (!isSemanticWorkerUriWithinRoot(resolvedSourceUri, workspaceId)) {
      recordUnresolved(binding.sourceSpecifier)
      continue
    }
    const key = `${binding.uri}\0${binding.sourceSpecifier}`
    resolutions.set(key, {
      bindingUri: binding.uri,
      sourceSpecifier: binding.sourceSpecifier,
      resolvedSourceUri,
    })
  }
  if (resolutions.size > 0 || unresolvedBindings > 0) {
    options.logger?.info("references.index.source-resolutions", {
      resolvedBindings: resolutions.size,
      unresolvedBindings,
      unresolvedSdkBindings: unresolvedByKind.sdk,
      unresolvedPackageBindings: unresolvedByKind.package,
      unresolvedRelativeBindings: unresolvedByKind.relative,
      unresolvedOtherBindings: unresolvedByKind.other,
      servedGeneration: result.servedGeneration,
    })
  }
  if (resolutions.size === 0) return result
  return options.index!.searchReferenceCandidates(
    workspaceId,
    declarationUri,
    declarationPosition,
    MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES,
    [...resolutions.values()],
    admittedRootUris,
    signal,
  )
}

export function referenceSourceKind(
  sourceSpecifier: string,
): "sdk" | "package" | "relative" | "other" {
  if (isHarmonySdkModuleSpecifier(sourceSpecifier)) return "sdk"
  if (sourceSpecifier.startsWith("./") || sourceSpecifier.startsWith("../")) return "relative"
  if (/^(?:@[\w.-]+\/)?[\w.-]+(?:\/[^/\\]+)*$/.test(sourceSpecifier)) return "package"
  return "other"
}

function sdkExternalTerminalIdentity(
  sdk: ProjectSdkSelection,
  sourceSpecifier: string,
): string | undefined {
  if (!sdk.ready || !sdk.path || sdk.identity?.status !== "identified") return undefined
  try {
    const sdkRoot = fs.realpathSync.native(sdk.path)
    const candidate = resolveHarmonySdkModule(sdkRoot, sourceSpecifier)
    if (!candidate) return undefined
    const resolved = fs.realpathSync.native(candidate)
    const relative = path.relative(sdkRoot, resolved)
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative) || !fs.statSync(resolved).isFile()) return undefined
    const identity = createHash("sha256")
      .update("arkts-sdk-terminal-v1\0")
      .update(sdkRoot)
      .update("\0")
      .update(sdk.identity.apiVersion ?? "")
      .update("\0")
      .update(sdk.identity.componentVersion ?? "")
      .update("\0")
      .update(sourceSpecifier)
      .update("\0")
      .update(relative.split(path.sep).join("/"))
      .digest("hex")
    return `sdk:${identity}`
  } catch {
    return undefined
  }
}


function toFilePath(uri: string): string | undefined {
  try { return uri.startsWith("file:") ? fileURLToPath(uri) : undefined }
  catch { return undefined }
}
