import { mapStatus } from "./sidecar-workspace-status.js"
import { WorkspaceCacheNamespaces } from "./workspace-cache-namespaces.js"
import { attestManagedCacheNamespace } from "./managed-cache-namespace.js"
import type { ManagedSourceDirectory } from "../contracts/managed-source-namespace.js"
import type { SemanticWorkspaceFileChangeBatch } from "../contracts/semantic-engine.js"
import { normalizeIndexInputs } from "./maintenance-input-normalization.js"
import { retainedReadProof } from "./versioned-index-proof.js"
import { negotiateMaintenance } from "./maintenance-negotiation.js"
import { VersionedMaintenance } from "./versioned-maintenance.js"
import { LegacyCatalogs } from "./legacy-catalogs.js"
import { SidecarSession, type SidecarProtocolEvent } from "./sidecar-session.js"
export { SidecarRequestError, SidecarTimeoutError } from "./sidecar-session.js"
export type { SidecarProtocolEvent } from "./sidecar-session.js"
import { resolveRequestTimeout, resolveInitializeTimeout, resolveTerminationTimeout, resolvePositiveTimeout } from "./sidecar-timeouts.js"
import { mapSearchResult, mapExportSearchResult } from "./sidecar-symbol-results.js"
import { SidecarProtocolError, asRecord, isCompleteness, isNonNegativeInteger } from "./sidecar-protocol-validation.js"
export { SidecarProtocolError } from "./sidecar-protocol-validation.js"

import type {
  DocumentSnapshot,
  DocumentUri,
  WorkspaceDescriptor,
  WorkspaceId,
} from "../contracts/document.js"
import type { WorkspaceCatalogPort } from "../contracts/workspace-catalog.js"
import type {
  ClassBindingDiscoveryPort,
  ClassBindingDiscoveryQuery,
  ClassBindingDiscoveryResult,
} from "../contracts/class-binding-discovery.js"
import type {
  WorkspaceExportIndexPort,
  WorkspaceExportSearchResult,
  WorkspaceIndexPort,
  WorkspaceIndexStatus,
  WorkspaceReferenceCandidateResult,
  WorkspaceReferenceIndexPort,
  WorkspaceReferenceSourceResolution,
  WorkspaceSymbolSearchResult,
} from "../contracts/workspace-index.js"
import type { WorkspaceIndexProgress } from "../contracts/workspace-symbol-service.js"
import { resolveIndexSidecarPath, type SidecarPathOptions } from "./sidecar-path.js"
import { mapClassBindingResult, prepareClassBindingQuery } from "./class-binding-discovery.js"
import {
  canonicalDirectory,
  canonicalFileWorkspaceRoot,
  isEquivalentWorkspaceIdentity,
  toWorkspaceIdentityUri,
  tryClientWorkspaceUri,
  tryWorkspaceIdentityUri,
} from "./workspace-uri-identity.js"

const DEFAULT_CATALOG_STALL_TIMEOUT_MS = 30_000

export interface SidecarWorkspaceIndexOptions extends SidecarPathOptions {
  /** Catalog composition opts in; existing explicit-text refresh clients retain their wire contract. */
  fileMaintenance?: boolean
  onManagedCacheNamespace?(rootUri: string, directories: readonly ManagedSourceDirectory[]): Promise<void>
  onSourceScopeChanged?(rootUri: string): void
  onEvent?(event: SidecarProtocolEvent): void
  requestTimeoutMs?: number
  initializeTimeoutMs?: number
  terminationTimeoutMs?: number
  catalogCancelTimeoutMs?: number
  catalogStallTimeoutMs?: number
}

export class SidecarWorkspaceIndex implements WorkspaceIndexPort, WorkspaceCatalogPort,
  WorkspaceExportIndexPort, WorkspaceReferenceIndexPort, ClassBindingDiscoveryPort {
  private readonly sessions = new Map<WorkspaceId, SidecarSession>()
  private readonly openingWorkspaces = new Map<WorkspaceId, Promise<WorkspaceIndexStatus>>()
  private readonly options: SidecarWorkspaceIndexOptions
  private readonly sourceNamespaces: WorkspaceCacheNamespaces
  private readonly catalogs: LegacyCatalogs

  constructor(options: SidecarWorkspaceIndexOptions = {}) {
    this.options = options
    this.sourceNamespaces = new WorkspaceCacheNamespaces(options.onManagedCacheNamespace, options.onSourceScopeChanged)
    this.catalogs = new LegacyCatalogs(
      workspaceId => this.session(workspaceId),
      resolveRequestTimeout(options.catalogCancelTimeoutMs ?? options.requestTimeoutMs),
      resolvePositiveTimeout(options.catalogStallTimeoutMs, DEFAULT_CATALOG_STALL_TIMEOUT_MS, "catalog stall"),
    )
  }

  open(workspace: WorkspaceDescriptor, cacheDir: string): Promise<WorkspaceIndexStatus> {
    if (this.sessions.has(workspace.id) || this.openingWorkspaces.has(workspace.id)) {
      return Promise.reject(new Error(`workspace index is already open: ${workspace.id}`))
    }
    const opening = this.openWorkspace(workspace, cacheDir)
    this.openingWorkspaces.set(workspace.id, opening)
    void opening.then(
      () => this.openingWorkspaces.delete(workspace.id),
      () => this.openingWorkspaces.delete(workspace.id),
    )
    return opening
  }

  private async openWorkspace(
    workspace: WorkspaceDescriptor,
    cacheDir: string,
  ): Promise<WorkspaceIndexStatus> {
    const workspaceRoot = await canonicalFileWorkspaceRoot(workspace.rootUri)
    const cacheDirectory = await canonicalDirectory(cacheDir)
    const session = new SidecarSession(
      resolveIndexSidecarPath(this.options),
      (event) => {
        if (event.event === "catalog/progress") {
          if (session.versioned) throw new SidecarProtocolError("legacy catalog event in a maintenance session")
          this.catalogs.acceptEvent(workspace.id, event)
        } else {
          if (!session.versioned) throw new SidecarProtocolError("maintenance event before capability acknowledgment")
          session.versioned.acceptEvent(event)
        }
        this.options.onEvent?.(event)
      },
      (error) => {
        this.catalogs.reject(workspace.id, error)
        session.versioned?.reject(error)
        // Process liveness is not directory role: retain the attested cache identity
        // until workspace close. Every source scan still revalidates the object.
      },
      resolveRequestTimeout(this.options.requestTimeoutMs),
      resolveInitializeTimeout(this.options.initializeTimeoutMs),
      resolveTerminationTimeout(this.options.terminationTimeoutMs),
    )
    session.clientRootUri = workspace.rootUri
    this.sessions.set(workspace.id, session)
    try {
      const { initialized, maintenance } = await negotiateMaintenance(session, { workspaceRoot, cacheDirectory }, this.options.fileMaintenance === true)
      if (typeof initialized.workspaceIdentity !== "string") {
        throw new SidecarProtocolError("index sidecar omitted workspace identity")
      }
      if (!isEquivalentWorkspaceIdentity(initialized.workspaceIdentity, workspaceRoot)) {
        throw new SidecarProtocolError("index sidecar returned the wrong workspace identity")
      }
      session.workspaceIdentity = initialized.workspaceIdentity
      if (maintenance) session.versioned = new VersionedMaintenance(session, maintenance,
        resolveRequestTimeout(this.options.catalogCancelTimeoutMs ?? this.options.requestTimeoutMs),
        resolvePositiveTimeout(this.options.catalogStallTimeoutMs, DEFAULT_CATALOG_STALL_TIMEOUT_MS, "catalog stall"))
      await this.sourceNamespaces.add(workspace.id, workspace.rootUri, workspaceRoot, session,
        await attestManagedCacheNamespace(session, initialized, cacheDirectory))
      const status = mapStatus(initialized.status)
      session.lastStatus = status
      return status
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      this.sessions.delete(workspace.id)
      await session.closeAfterFailure()
      await this.sourceNamespaces.remove(workspace.id)
      throw error
    }
  }

  async refresh(
    workspaceId: WorkspaceId,
    generation: number,
    changed: readonly DocumentSnapshot[],
    removedUris: readonly string[],
    signal?: AbortSignal,
  ): Promise<WorkspaceIndexStatus> {
    const session = this.session(workspaceId)
    try {
      const result = asRecord(await session.request("refresh", {
        generation,
        changed: changed.map(({ uri, text }) => ({
          uri: toWorkspaceIdentityUri(session, uri),
          text,
        })),
        removedUris: removedUris.map((uri) => toWorkspaceIdentityUri(session, uri)),
      }, signal))
      const status = mapStatus(result.status)
      session.lastStatus = status
      return status
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

  async searchSymbols(
    workspaceId: WorkspaceId,
    query: string,
    limit: number,
    signal?: AbortSignal,
    excludedUris: readonly DocumentUri[] = [],
  ): Promise<WorkspaceSymbolSearchResult> {
    const session = this.session(workspaceId)
    try {
      return mapSearchResult(await session.request(
        "search",
        {
          query,
          limit,
          excludedUris: excludedUris.flatMap((uri) => {
            const rebased = tryWorkspaceIdentityUri(session, uri)
            return rebased === undefined ? [] : [rebased]
          }),
        },
        signal,
      ), (uri) => toClientWorkspaceUri(session, uri))
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

  async searchExports(
    workspaceId: WorkspaceId,
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceExportSearchResult> {
    const session = this.session(workspaceId)
    try {
      return mapExportSearchResult(await session.request(
        "exports/search",
        { query, limit },
        signal,
      ), (uri) => toClientWorkspaceUri(session, uri))
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

  async searchReferenceCandidates(
    workspaceId: WorkspaceId,
    declarationUri: DocumentUri,
    declarationPosition: { line: number; character: number },
    limit: number,
    sourceResolutions?: readonly WorkspaceReferenceSourceResolution[],
    admittedRootUris?: readonly DocumentUri[],
    signal?: AbortSignal,
  ): Promise<WorkspaceReferenceCandidateResult> {
    const session = this.session(workspaceId)
    try {
      const rebasedDeclarationUri = tryWorkspaceIdentityUri(session, declarationUri)
      if (rebasedDeclarationUri === undefined) {
        return unsupportedReferenceCandidates(session.lastStatus.committedGeneration)
      }
      const rebasedSourceResolutions = sourceResolutions?.map((resolution) => {
        const bindingUri = tryWorkspaceIdentityUri(session, resolution.bindingUri)
        if (!bindingUri) return undefined
        if ("resolvedSourceUri" in resolution
          && typeof resolution.resolvedSourceUri === "string") {
          const resolvedSourceUri = tryWorkspaceIdentityUri(session, resolution.resolvedSourceUri)
          return resolvedSourceUri
            ? { bindingUri, sourceSpecifier: resolution.sourceSpecifier, resolvedSourceUri }
            : undefined
        }
        return isExternalTerminalIdentity(resolution.externalTerminalIdentity)
          ? {
              bindingUri,
              sourceSpecifier: resolution.sourceSpecifier,
              externalTerminalIdentity: resolution.externalTerminalIdentity,
            }
          : undefined
      })
      if (rebasedSourceResolutions?.some(resolution => resolution === undefined)) {
        return unsupportedReferenceCandidates(session.lastStatus.committedGeneration)
      }
      const rebasedAdmittedRootUris = admittedRootUris?.map(uri => (
        tryWorkspaceIdentityUri(session, uri)
      ))
      if (rebasedAdmittedRootUris?.some(uri => uri === undefined)) {
        return unsupportedReferenceCandidates(session.lastStatus.committedGeneration)
      }
      return mapReferenceCandidateResult(await session.request(
        "references/candidates",
        {
          declarationUri: rebasedDeclarationUri,
          declarationPosition,
          limit,
          ...(rebasedSourceResolutions?.length
            ? { sourceResolutions: rebasedSourceResolutions }
            : {}),
          ...(rebasedAdmittedRootUris?.length
            ? { admittedRootUris: rebasedAdmittedRootUris }
            : {}),
        },
        signal,
      ), (uri) => toClientWorkspaceUri(session, uri))
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

  async resolveClassBaseBinding(
    workspaceId: WorkspaceId,
    query: ClassBindingDiscoveryQuery,
    signal?: AbortSignal,
  ): Promise<ClassBindingDiscoveryResult> {
    const session = this.session(workspaceId)
    const params = prepareClassBindingQuery(
      workspaceId, session.workspaceIdentity, query, uri => toWorkspaceIdentityUri(session, uri),
    )
    try {
      return mapClassBindingResult(await session.request("class-bindings/resolve", params, signal),
        params, uri => toClientWorkspaceUri(session, uri), message => new SidecarProtocolError(message))
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

  async status(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<WorkspaceIndexStatus> {
    const session = this.session(workspaceId)
    const degraded = session.degradedStatus()
    if (degraded) return degraded
    try {
      const status = mapStatus(await session.request(session.versioned ? "index/status" : "status", {}, signal))
      session.lastStatus = status
      return status
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

  observe(workspaceId: WorkspaceId, batch: SemanticWorkspaceFileChangeBatch): void {
    const session = this.sessions.get(workspaceId)
    if (session?.versioned) session.versioned.observe(normalizeIndexInputs(session, batch))
  }

  async start(workspace: WorkspaceDescriptor, report: (progress: WorkspaceIndexProgress) => void, signal?: AbortSignal): Promise<void> {
    if (this.sourceNamespaces.needsOpeningBarrier(workspace.id)) {
      await Promise.allSettled([...this.openingWorkspaces.values()])
    }
    const session = this.session(workspace.id)
    this.sourceNamespaces.catalogStarting(workspace.id)
    return session.versioned ? session.versioned.start(report, signal) : this.catalogs.start(workspace, report, signal)
  }

  async close(workspaceId: WorkspaceId): Promise<void> {
    const opening = this.openingWorkspaces.get(workspaceId)
    if (opening) {
      try { await opening } catch { return }
    }
    const session = this.sessions.get(workspaceId)
    if (!session) return
    const error = new Error("workspace index closed during cataloging")
    this.catalogs.reject(workspaceId, error)
    session.versioned?.reject(error)
    try {
      await session.close()
    } finally {
      this.sessions.delete(workspaceId)
      await this.sourceNamespaces.remove(workspaceId)
    }
  }

  private session(workspaceId: WorkspaceId): SidecarSession {
    const session = this.sessions.get(workspaceId)
    if (!session) throw new Error(`workspace index is not open: ${workspaceId}`)
    return session
  }

}


function mapReferenceCandidateResult(
  value: unknown,
  mapUri: (uri: DocumentUri) => DocumentUri = (uri) => uri,
): WorkspaceReferenceCandidateResult {
  const result = asRecord(value)
  if (typeof result.supported !== "boolean"
    || typeof result.complete !== "boolean"
    || typeof result.identityComplete !== "boolean"
    || !Array.isArray(result.identityUris)
    || result.identityUris.some(uri => typeof uri !== "string")
    || (!result.identityComplete && result.identityUris.length !== 0)
    || !Array.isArray(result.uris)
    || result.uris.some(uri => typeof uri !== "string")
    || (result.narrowedUris !== undefined
      && (!Array.isArray(result.narrowedUris)
        || result.narrowedUris.some(uri => typeof uri !== "string")
        || result.narrowedUris.some(uri => !(result.uris as unknown[]).includes(uri))
        || (result.narrowedUris.length > 0
          && result.narrowedUris.length >= (result.uris as unknown[]).length)))
    || !Array.isArray(result.names)
    || result.names.some(name => typeof name !== "string")
    || (result.bindings !== undefined
      && (!Array.isArray(result.bindings)
        || result.bindings.some(binding => !isReferenceBinding(binding))))
    || !isNonNegativeInteger(result.servedGeneration)
    || !isCompleteness(result.completeness)
    || (result.declarationUri !== null
      && result.declarationUri !== undefined
      && typeof result.declarationUri !== "string")
    || (result.declarationIdentity !== null
      && result.declarationIdentity !== undefined
      && typeof result.declarationIdentity !== "string")
    || (result.identityComplete
      && (typeof result.declarationUri !== "string"
        || typeof result.declarationIdentity !== "string"
        || !(result.identityUris as unknown[]).includes(result.declarationUri)))) {
    throw new SidecarProtocolError("index sidecar returned invalid reference candidates")
  }
  return {
    ...retainedReadProof(value),
    supported: result.supported,
    complete: result.complete,
    identityComplete: result.identityComplete,
    identityUris: (result.identityUris as string[]).map(mapUri),
    ...(Array.isArray(result.narrowedUris)
      ? { narrowedUris: (result.narrowedUris as string[]).map(mapUri) }
      : {}),
    ...(typeof result.declarationUri === "string"
      ? { declarationUri: mapUri(result.declarationUri) }
      : {}),
    ...(typeof result.declarationIdentity === "string"
      ? { declarationIdentity: result.declarationIdentity }
      : {}),
    names: result.names as string[],
    uris: (result.uris as string[]).map(mapUri),
    ...(Array.isArray(result.bindings)
      ? {
          bindings: result.bindings.map((binding) => {
            const item = binding as Record<string, unknown>
            return {
              kind: item.kind as "import" | "reexport",
              uri: mapUri(item.uri as string),
              importedName: item.importedName as string,
              localName: item.localName as string,
              sourceSpecifier: item.sourceSpecifier as string,
              sourceResolution: item.sourceResolution as
                "unique" | "external" | "unresolved" | "ambiguous" | "unsupported",
              ...(typeof item.resolvedSourceUri === "string"
                ? { resolvedSourceUri: mapUri(item.resolvedSourceUri) }
                : {}),
              ...(typeof item.externalTerminalIdentity === "string"
                ? { externalTerminalIdentity: item.externalTerminalIdentity }
                : {}),
            }
          }),
        }
      : {}),
    servedGeneration: result.servedGeneration,
    completeness: result.completeness,
  }
}

function isReferenceBinding(value: unknown): boolean {
  const binding = asRecord(value)
  return (binding.kind === "import" || binding.kind === "reexport")
    && typeof binding.uri === "string"
    && typeof binding.importedName === "string"
    && typeof binding.localName === "string"
    && typeof binding.sourceSpecifier === "string"
    && (binding.sourceResolution === "unique"
      || binding.sourceResolution === "external"
      || binding.sourceResolution === "unresolved"
      || binding.sourceResolution === "ambiguous"
      || binding.sourceResolution === "unsupported")
    && (binding.resolvedSourceUri === null
      || binding.resolvedSourceUri === undefined
      || typeof binding.resolvedSourceUri === "string")
    && (binding.externalTerminalIdentity === null
      || binding.externalTerminalIdentity === undefined
      || isExternalTerminalIdentity(binding.externalTerminalIdentity))
    && ((binding.sourceResolution === "unique")
      === (typeof binding.resolvedSourceUri === "string"))
    && ((binding.sourceResolution === "external")
      === (typeof binding.externalTerminalIdentity === "string"))
}

function isExternalTerminalIdentity(value: unknown): value is string {
  return typeof value === "string" && /^sdk:[0-9a-f]{64}$/.test(value)
}

function unsupportedReferenceCandidates(
  servedGeneration: number,
): WorkspaceReferenceCandidateResult {
  return {
    supported: false,
    complete: false,
    identityComplete: false,
    identityUris: [],
    names: [],
    uris: [],
    servedGeneration,
    completeness: "stale",
  }
}

function toClientWorkspaceUri(session: SidecarSession, uri: DocumentUri): DocumentUri {
  const rebased = tryClientWorkspaceUri(session, uri)
  if (rebased !== undefined) return rebased
  throw new SidecarProtocolError(`index sidecar returned a symbol outside workspace root: ${uri}`)
}
