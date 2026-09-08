import fs from "node:fs"
import path from "node:path"

import type {
  SemanticDocumentSync,
  SemanticDocumentPosition,
  SemanticReplayDocument,
  SemanticResponseState,
} from "../protocol.js"
import { resolveWorkspaceRoot, type WorkspaceDocument } from "../sdk/workspace-loader.js"
import { LocalPackageResolver } from "../sdk/local-package-resolver.js"

const MAX_CACHED_DOCUMENTS = 512
const MAX_CACHED_BYTES = 16 * 1024 * 1024
const MAX_CLOSURE_DOCUMENTS = 256
const MAX_CLOSURE_BYTES = 8 * 1024 * 1024
const MAX_CLOSURE_CREATION_CANDIDATES = MAX_CLOSURE_DOCUMENTS * 4
const MAX_PROJECT_FILE_SET_ROOTS = 4
const MAX_PROJECT_FILE_SET_PATHS = 20_000
const MAX_PROJECT_FILE_SET_PATH_BYTES = 4 * 1024 * 1024
const MAX_WATCHED_REMOVED_PATHS = 512
const MAX_WATCHED_CHANGED_PATHS = 512
const SOURCE_EXTENSIONS = [".ets", ".ts"]
const MAX_REPLAY_DOCUMENTS = 32
const MAX_REPLAY_BYTES = 4 * 1024 * 1024
const MAX_DISK_READ_CHUNK_BYTES = 64 * 1024
export const MAX_DISK_SNAPSHOT_BYTES = 4 * 1024 * 1024
const CASE_FOLDED_PATH_IDENTITY_PREFIX = "\0case-folded:"

interface DocumentRecord extends WorkspaceDocument {
  contentGeneration: number
  documentVersion?: number
  workspaceRoot?: string
  physicalPath: string
  diskFingerprint: string | null
  lastAccess: number
  available: boolean
  overlay: boolean
  overlayOrder: number
}

interface DependencyClosureCacheEntry {
  contentGeneration: number
  paths: string[]
  physicalPaths: string[]
  workspaceRoot: string
  creationCandidatePaths: string[]
  creationCandidatesComplete: boolean
}

interface DependencyClosureResult {
  entries: Array<{ record: DocumentRecord; cacheHit: boolean }>
  cacheHit: boolean
  removedPaths: string[]
}

type DiskInvalidationMatches = Map<string, Map<string, Set<string>>>

interface DiskInvalidationInput {
  path: string
  physicalPath?: string
}

type BudgetedDiskLoadResult =
  | { status: "loaded"; record: DocumentRecord }
  | { status: "budget-exceeded" }

type DiskReadResult =
  | { status: "loaded"; content: string }
  | { status: "unavailable" }
  | { status: "budget-exceeded" }

interface DocumentCacheTransaction {
  records: Map<string, DocumentRecord | undefined>
  closures: Map<string, DependencyClosureCacheEntry | undefined>
  cachedBytes: number
  accessClock: number
  committed: boolean
}

export interface ProjectMembershipSnapshot {
  readonly paths: readonly string[]
  status: "complete" | "partial"
  reason?: "path-count-limit" | "path-byte-limit" | "enumeration-error" | "source-unavailable"
  revision: number
}

export type ProjectFileAdmissionToken = string

export interface ProjectFileAccessPort {
  tokenFor(
    canonicalRootId: string,
    catalogRevision: number,
    filePath: string,
  ): ProjectFileAdmissionToken | undefined
  read(
    canonicalRootId: string,
    catalogRevision: number,
    filePath: string,
    token: ProjectFileAdmissionToken,
  ): string | null
}

interface ProjectFileSetCacheEntry extends Omit<ProjectMembershipSnapshot, "paths"> {
  paths: string[]
  pathBytes: number
  diskIdentities: Map<string, string>
  publicSnapshot?: ProjectMembershipSnapshot
}

export interface SemanticOperationControl {
  checkpoint(): void
}

const NOOP_OPERATION_CONTROL: SemanticOperationControl = Object.freeze({
  checkpoint(): void {},
})

export interface SemanticDocumentStoreOptions {
  packageResolver?: LocalPackageResolver
  enumerateWorkspaceSources?: (rootPath: string) => Iterable<string>
  operationControl?: SemanticOperationControl
  projectFileSetLimits?: {
    maxRoots?: number
    maxPaths?: number
    maxPathBytes?: number
  }
  watchedFileLimits?: {
    maxRemovedPaths?: number
    maxChangedPaths?: number
  }
}

export interface SemanticWorkspaceView {
  rootPath: string
  canonicalRootId: string
  typeEngineResetEpoch: number
  overlayPaths?: ReadonlyMap<string, string>
  documents: Array<WorkspaceDocument & {
    documentVersion?: number
    overlay: boolean
  }>
  projectMembership?: ProjectMembershipSnapshot
  removedPaths?: string[]
  changedPaths?: string[]
  contentRevision: number
  resetTypeEngine?: boolean
  state: SemanticResponseState
}

export interface WorkspaceFileChangeBatch {
  rootPath: string
  rootDirty: boolean
  changes: Array<{
    path: string
    kind: "created" | "changed" | "deleted"
  }>
}

export interface ProjectMembershipRefresh {
  changed: boolean
  removedPaths: string[]
}

export class SemanticDocumentStore implements ProjectFileAccessPort {
  private readonly documents = new Map<string, DocumentRecord>()
  private readonly dependencyGenerations = new Map<string, number>()
  private readonly dependencyClosures = new Map<string, DependencyClosureCacheEntry>()
  private readonly projectFileSets = new Map<string, ProjectFileSetCacheEntry>()
  private readonly watchedRemovedPaths = new Map<string, Set<string>>()
  private readonly watchedChangedPaths = new Map<string, Set<string>>()
  private readonly contentRevisions = new Map<string, number>()
  private readonly typeEngineResetRoots = new Set<string>()
  private readonly typeEngineResetEpochs = new Map<string, number>()
  private readonly enumerateWorkspaceSources: (rootPath: string) => Iterable<string>
  private readonly operationControl: SemanticOperationControl
  private readonly maxProjectFileSetRoots: number
  private readonly maxProjectFileSetPaths: number
  private readonly maxProjectFileSetPathBytes: number
  private readonly maxWatchedRemovedPaths: number
  private readonly maxWatchedChangedPaths: number
  private accessClock = 0
  private overlayOrderClock = 0
  private cachedBytes = 0
  private projectMembershipRevision = 0
  private readonly packageResolver: LocalPackageResolver

  constructor({
    packageResolver = new LocalPackageResolver(),
    enumerateWorkspaceSources,
    operationControl = NOOP_OPERATION_CONTROL,
    projectFileSetLimits = {},
    watchedFileLimits = {},
  }: SemanticDocumentStoreOptions = {}) {
    this.packageResolver = packageResolver
    this.operationControl = operationControl
    this.enumerateWorkspaceSources = enumerateWorkspaceSources
      ?? ((rootPath) => listWorkspaceSourcePaths(rootPath, this.operationControl,
        (sourcePath, directoryTraversal) => this.isActiveProjectSource(
          rootPath, sourcePath, directoryTraversal,
        )))
    this.maxProjectFileSetRoots = boundedLimit(
      projectFileSetLimits.maxRoots,
      MAX_PROJECT_FILE_SET_ROOTS,
      "project file set roots",
    )
    this.maxProjectFileSetPaths = boundedLimit(
      projectFileSetLimits.maxPaths,
      MAX_PROJECT_FILE_SET_PATHS,
      "project file set paths",
    )
    this.maxProjectFileSetPathBytes = boundedLimit(
      projectFileSetLimits.maxPathBytes,
      MAX_PROJECT_FILE_SET_PATH_BYTES,
      "project file set path bytes",
    )
    this.maxWatchedRemovedPaths = boundedLimit(
      watchedFileLimits.maxRemovedPaths,
      MAX_WATCHED_REMOVED_PATHS,
      "watched removed paths",
    )
    this.maxWatchedChangedPaths = boundedLimit(
      watchedFileLimits.maxChangedPaths,
      MAX_WATCHED_CHANGED_PATHS,
      "watched changed paths",
    )
  }

  restore(documents: SemanticReplayDocument[]): number {
    if (documents.length > MAX_REPLAY_DOCUMENTS) {
      throw new Error(`Semantic replay exceeds ${MAX_REPLAY_DOCUMENTS} documents`)
    }
    const totalBytes = documents.reduce((total, document) => total + Buffer.byteLength(document.content), 0)
    if (totalBytes > MAX_REPLAY_BYTES) {
      throw new Error(`Semantic replay exceeds ${MAX_REPLAY_BYTES} bytes`)
    }
    for (const document of documents) {
      if (document.contentGeneration < 1) {
        throw new Error(`Semantic replay generation must be positive for ${document.path}`)
      }
      const filePath = path.resolve(document.path)
      const cached = this.documents.get(filePath)
      if (cached && document.contentGeneration < cached.contentGeneration) {
        throw new Error(
          `Stale semantic document generation for ${filePath}: ${document.contentGeneration} < ${cached.contentGeneration}`,
        )
      }
      if (cached && document.contentGeneration === cached.contentGeneration && cached.content !== document.content) {
        throw new Error(`Semantic document generation ${document.contentGeneration} changed content for ${filePath}`)
      }
      this.store(
        filePath,
        document.content,
        document.contentGeneration,
        null,
        true,
        document.documentVersion,
        true,
        cached?.workspaceRoot,
      )
    }
    return documents.length
  }

  sync(document: SemanticDocumentSync): DocumentRecord {
    const filePath = path.resolve(document.path)
    const cached = this.documents.get(filePath)
    const workspaceRoot = document.workspaceRoot
      ? canonicalWorkspaceRoot(document.workspaceRoot)
      : cached?.workspaceRoot
    if (cached?.documentVersion !== undefined && document.documentVersion < cached.documentVersion) {
      throw new Error(
        `Stale semantic document version for ${filePath}: ${document.documentVersion} < ${cached.documentVersion}`,
      )
    }
    if (cached?.documentVersion === document.documentVersion && cached.content !== document.content) {
      throw new Error(`Semantic document version ${document.documentVersion} changed content for ${filePath}`)
    }
    if (cached?.documentVersion === document.documentVersion && cached.content === document.content) {
      cached.lastAccess = ++this.accessClock
      cached.workspaceRoot = workspaceRoot
      this.includeOpenedProjectSource(document.workspaceRoot, filePath)
      return cached
    }
    const generation = cached?.content === document.content
      ? cached.contentGeneration
      : (cached?.contentGeneration ?? 0) + 1
    const record = this.store(
      filePath,
      document.content,
      generation,
      null,
      true,
      document.documentVersion,
      true,
      workspaceRoot,
    )
    if (!cached?.overlay && (
      filePath.split(path.sep).includes("oh_modules")
      || isWorkspacePhysicalAlias(
        document.workspaceRoot,
        workspaceRoot,
        filePath,
        record.physicalPath,
      )
    )) {
      const matches = this.invalidateDiskDocuments(
        [{ path: filePath, physicalPath: record.physicalPath }],
        { includeOverlayDependencies: true },
      )
      for (const affectedRoot of matches.get(filePath)?.keys() ?? []) {
        this.markTypeEngineReset(affectedRoot)
        this.contentRevisions.set(affectedRoot, (this.contentRevisions.get(affectedRoot) ?? 0) + 1)
      }
    }
    this.includeOpenedProjectSource(document.workspaceRoot, filePath)
    return record
  }

  close(filePath: string): void {
    const resolved = path.resolve(filePath)
    const cached = this.documents.get(resolved)
    if (!cached) return
    const physicalPath = cached.physicalPath
    if (cached.overlay) this.removeOpenedProjectSource(cached.workspaceRoot, resolved)
    this.documents.delete(resolved)
    this.dependencyClosures.delete(resolved)
    this.cachedBytes -= Buffer.byteLength(cached.content)
    if (cached.overlay) {
      const canonicalRoot = cached.workspaceRoot
        ?? canonicalWorkspaceRoot(resolveWorkspaceRoot(resolved))
      const currentPhysicalPath = canonicalSourcePath(resolved)
      const invalidationMatches = this.invalidateDiskDocuments(
        [...new Set([physicalPath, currentPhysicalPath])].map((identity) => ({
          path: resolved,
          physicalPath: identity,
        })),
      )
      const changedRoots = new Set([canonicalRoot])
      const resetRoots = new Set<string>()
      this.markWatchedChanged(canonicalRoot, resolved)
      for (const [affectedRoot, affectedPaths] of invalidationMatches.get(resolved) ?? []) {
        let physicalAliasAffected = false
        for (const affectedPath of affectedPaths) {
          this.markWatchedChanged(affectedRoot, affectedPath)
          physicalAliasAffected ||= affectedPath !== resolved
        }
        changedRoots.add(affectedRoot)
        if (affectedRoot !== canonicalRoot || physicalAliasAffected) {
          resetRoots.add(affectedRoot)
        }
      }
      for (const resetRoot of resetRoots) this.markTypeEngineReset(resetRoot)
      for (const changedRoot of changedRoots) {
        this.contentRevisions.set(changedRoot, (this.contentRevisions.get(changedRoot) ?? 0) + 1)
      }
    }
  }

  invalidate(rootPath: string): void {
    this.projectFileSets.delete(canonicalWorkspaceRoot(rootPath))
  }

  tokenFor(
    canonicalRootId: string,
    catalogRevision: number,
    filePath: string,
  ): ProjectFileAdmissionToken | undefined {
    this.operationControl.checkpoint()
    const entry = this.projectFileSets.get(canonicalRootId)
    if (!entry || entry.revision !== catalogRevision) return undefined
    return entry.diskIdentities.get(path.resolve(filePath))
  }

  read(
    canonicalRootId: string,
    catalogRevision: number,
    filePath: string,
    token: ProjectFileAdmissionToken,
  ): string | null {
    this.operationControl.checkpoint()
    const resolvedPath = path.resolve(filePath)
    if (this.tokenFor(canonicalRootId, catalogRevision, resolvedPath) !== token) return null
    if (safeLstat(resolvedPath, this.operationControl)?.isFile() !== true) return null
    const physicalPath = canonicalSourcePath(resolvedPath)
    if (!isInside(canonicalRootId, physicalPath)) return null
    const result = safeRead(
      resolvedPath,
      Number.POSITIVE_INFINITY,
      this.operationControl,
      physicalPath,
      token,
    )
    return result.status === "loaded" ? result.content : null
  }

  refreshProjectMembership(rootPath: string): ProjectMembershipRefresh {
    this.operationControl.checkpoint()
    const canonicalRoot = canonicalWorkspaceRoot(rootPath)
    const previous = this.projectFileSets.get(canonicalRoot)
    if (!previous) return { changed: false, removedPaths: [] }
    const current = this.scanProjectMembership(rootPath)
    const membershipUnchanged = current.status === previous.status
      && current.reason === previous.reason
      && current.paths.length === previous.paths.length
      && current.paths.every((filePath, index) => filePath === previous.paths[index])
    const currentPaths = new Set(current.paths)
    const removedPaths = current.status === "complete"
      ? previous.paths.filter((filePath) => !currentPaths.has(filePath))
      : []
    const changedPaths = current.paths.filter((filePath) => (
      current.diskIdentities.get(filePath) !== previous.diskIdentities.get(filePath)
    ))
    const catalogUnchanged = membershipUnchanged && changedPaths.length === 0
    this.operationControl.checkpoint()

    current.revision = catalogUnchanged
      ? previous.revision
      : ++this.projectMembershipRevision
    const invalidationMatches = this.invalidateDiskDocuments([...removedPaths, ...changedPaths])
    const changedRoots = new Set<string>()
    const resetRoots = new Set<string>()
    for (const filePath of removedPaths) {
      this.markWatchedRemoved(canonicalRoot, filePath)
      for (const [affectedRoot, affectedPaths] of invalidationMatches.get(filePath) ?? []) {
        for (const affectedPath of affectedPaths) {
          this.markWatchedRemoved(affectedRoot, affectedPath)
        }
        changedRoots.add(affectedRoot)
        resetRoots.add(affectedRoot)
      }
    }
    for (const filePath of changedPaths) {
      this.markWatchedChanged(canonicalRoot, filePath)
      for (const [affectedRoot, affectedPaths] of invalidationMatches.get(filePath) ?? []) {
        let physicalAliasAffected = false
        for (const affectedPath of affectedPaths) {
          this.markWatchedChanged(affectedRoot, affectedPath)
          physicalAliasAffected ||= affectedPath !== filePath
        }
        changedRoots.add(affectedRoot)
        if (affectedRoot !== canonicalRoot || physicalAliasAffected) {
          resetRoots.add(affectedRoot)
        }
      }
    }
    if (removedPaths.length > 0 || changedPaths.length > 0) {
      changedRoots.add(canonicalRoot)
    }
    for (const resetRoot of resetRoots) this.markTypeEngineReset(resetRoot)
    for (const changedRoot of changedRoots) {
      this.contentRevisions.set(changedRoot, (this.contentRevisions.get(changedRoot) ?? 0) + 1)
    }
    this.publishProjectMembership(canonicalRoot, current)
    return {
      changed: !catalogUnchanged || removedPaths.length > 0,
      removedPaths,
    }
  }

  workspaceFilesChanged(batch: WorkspaceFileChangeBatch): void {
    const lexicalRoot = path.resolve(batch.rootPath)
    const canonicalRoot = canonicalWorkspaceRoot(batch.rootPath)
    if (batch.rootDirty) {
      this.packageResolver.invalidate()
      const dirtyProjectRoots = new Set([canonicalRoot])
      const dirtyClosureOwners: string[] = []
      // Configuration invalidates dependency edges even when every source is an overlay.
      for (const [owner, closure] of this.dependencyClosures) {
        if (closure.workspaceRoot === canonicalRoot
          || isInside(canonicalRoot, closure.workspaceRoot)
          || isInside(closure.workspaceRoot, canonicalRoot)) {
          dirtyProjectRoots.add(closure.workspaceRoot)
          dirtyClosureOwners.push(owner)
        }
      }
      const knownPaths = new Set<string>()
      for (const [projectRoot, projectFileSet] of this.projectFileSets) {
        const overlapsPhysicalRoot = projectRoot === canonicalRoot
          || isInside(projectRoot, canonicalRoot)
          || isInside(canonicalRoot, projectRoot)
        const matchingPaths = projectFileSet.paths.filter((sourcePath) => (
          isInside(lexicalRoot, path.resolve(sourcePath))
          || (projectRoot === canonicalRoot && isInside(canonicalRoot, path.resolve(sourcePath)))
        ))
        if (matchingPaths.length === 0 && !overlapsPhysicalRoot) continue
        dirtyProjectRoots.add(projectRoot)
        for (const matchingPath of matchingPaths) knownPaths.add(matchingPath)
      }
      for (const [documentPath, document] of this.documents) {
        if (
          isInside(canonicalRoot, document.physicalPath)
          || isInside(lexicalRoot, documentPath)
        ) knownPaths.add(documentPath)
      }
      const invalidatedPaths = [...knownPaths].filter((knownPath) => (
        !this.documents.get(knownPath)?.overlay
      ))
      const invalidationMatches = this.invalidateDiskDocuments(invalidatedPaths, {
        canonicalizeInputs: false,
        dirtyRoot: canonicalRoot,
        lexicalDirtyRoot: lexicalRoot,
      })
      // Preserve the shared disk-invalidation pass before removing overlay-only edges.
      for (const owner of dirtyClosureOwners) this.dependencyClosures.delete(owner)
      for (const knownPath of invalidatedPaths) {
        this.markWatchedRemoved(canonicalRoot, knownPath)
        if (this.typeEngineResetRoots.has(canonicalRoot)) break
      }
      const affectedRoots = new Set(dirtyProjectRoots)
      for (const pathsByRoot of invalidationMatches.values()) {
        for (const affectedRoot of pathsByRoot.keys()) {
          affectedRoots.add(affectedRoot)
        }
      }
      for (const affectedRoot of affectedRoots) {
        this.contentRevisions.set(
          affectedRoot,
          (this.contentRevisions.get(affectedRoot) ?? 0) + 1,
        )
        this.markTypeEngineReset(affectedRoot)
      }
      for (const dirtyProjectRoot of dirtyProjectRoots) {
        this.projectFileSets.delete(dirtyProjectRoot)
      }
      return
    }
    const entry = this.projectFileSets.get(canonicalRoot)
    const paths = entry?.paths
    const rejectedSourceChanges: DiskInvalidationInput[] = []
    const sourceChanges = batch.changes.flatMap((change) => {
      const sourcePath = path.resolve(change.path)
      if (!SOURCE_EXTENSIONS.includes(path.extname(sourcePath))) return []
      const physicalPath = canonicalSourcePath(sourcePath)
      if (!isInside(canonicalRoot, physicalPath)) {
        if (isInside(lexicalRoot, sourcePath)) {
          rejectedSourceChanges.push({ path: sourcePath, physicalPath })
        }
        return []
      }
      let stat: fs.Stats | undefined
      let membershipEligible = false
      if (change.kind !== "deleted") {
        membershipEligible = safeLstat(sourcePath, this.operationControl)?.isFile() === true
        stat = safeStat(sourcePath, this.operationControl) ?? undefined
        if (!stat?.isFile() || stat.size > MAX_DISK_SNAPSHOT_BYTES) {
          rejectedSourceChanges.push({ path: sourcePath, physicalPath })
          return []
        }
      }
      return [{
        sourcePath,
        physicalPath,
        kind: change.kind,
        overlay: this.documents.get(sourcePath)?.overlay === true,
        membershipEligible,
        stat,
      }]
    })
    const knownPathsBeforeInvalidation = new Set(sourceChanges.flatMap(({ sourcePath, overlay }) => (
      !overlay && (this.documents.has(sourcePath) || Boolean(paths?.includes(sourcePath))) ? [sourcePath] : []
    )))
    const invalidationMatches = this.invalidateDiskDocuments(
      [
        ...sourceChanges.map(({ sourcePath, physicalPath }) => ({
          path: sourcePath,
          physicalPath,
        })),
        ...rejectedSourceChanges,
      ],
    )
    let membershipChanged = false
    let contentChanged = false
    const createdSources: DiskInvalidationInput[] = []
    const removedPathsByRoot = new Map<string, Set<string>>()
    const changedPathsByRoot = new Map<string, Set<string>>()
    const changedRoots = new Set<string>()
    const resetRoots = new Set<string>()
    const dirtyMembershipRoots = new Set<string>()
    for (const rejected of rejectedSourceChanges) {
      for (const [projectRoot, projectEntry] of this.projectFileSets) {
        if (
          projectRoot === canonicalRoot
          || isInside(projectRoot, rejected.path)
          || isInside(projectRoot, rejected.physicalPath ?? rejected.path)
          || projectEntry.paths.includes(rejected.path)
        ) {
          dirtyMembershipRoots.add(projectRoot)
          this.markWatchedRemoved(projectRoot, rejected.path)
          changedRoots.add(projectRoot)
          resetRoots.add(projectRoot)
        }
      }
      changedRoots.add(canonicalRoot)
      resetRoots.add(canonicalRoot)
      for (const [affectedRoot, affectedPaths] of invalidationMatches.get(rejected.path) ?? []) {
        for (const affectedPath of affectedPaths) {
          this.markWatchedRemoved(affectedRoot, affectedPath)
        }
        changedRoots.add(affectedRoot)
        resetRoots.add(affectedRoot)
      }
    }
    for (const change of sourceChanges) {
      const { sourcePath, physicalPath, overlay, membershipEligible, stat } = change
      const affectedPathsByRoot = invalidationMatches.get(sourcePath) ?? new Map()
      let membershipRemoved = false
      if (entry && paths?.includes(sourcePath) && change.kind !== "deleted") {
        if (!overlay && !membershipEligible) {
          paths.splice(paths.indexOf(sourcePath), 1)
          entry.pathBytes -= Buffer.byteLength(sourcePath)
          entry.diskIdentities.delete(sourcePath)
          membershipChanged = true
          membershipRemoved = true
          addPathByRoot(removedPathsByRoot, canonicalRoot, sourcePath)
          changedRoots.add(canonicalRoot)
          resetRoots.add(canonicalRoot)
        } else {
          const previousIdentity = entry.diskIdentities.get(sourcePath)
          const currentIdentity = membershipEligible && stat?.isFile()
            ? sourceStatIdentity(stat)
            : undefined
          if (currentIdentity === undefined) entry.diskIdentities.delete(sourcePath)
          else entry.diskIdentities.set(sourcePath, currentIdentity)
          membershipChanged ||= previousIdentity !== currentIdentity
        }
      }
      if (change.kind === "deleted") {
        if (!overlay && paths) {
          const index = paths.indexOf(sourcePath)
          if (index >= 0) {
            paths.splice(index, 1)
            if (entry) entry.pathBytes -= Buffer.byteLength(sourcePath)
            entry?.diskIdentities.delete(sourcePath)
            membershipChanged = true
          }
        }
        if (!overlay && (knownPathsBeforeInvalidation.has(sourcePath) || affectedPathsByRoot.size > 0)) {
          addPathByRoot(removedPathsByRoot, canonicalRoot, sourcePath)
          changedRoots.add(canonicalRoot)
        }
        for (const [affectedRoot, affectedPaths] of affectedPathsByRoot) {
          for (const affectedPath of affectedPaths) {
            addPathByRoot(removedPathsByRoot, affectedRoot, affectedPath)
          }
          changedRoots.add(affectedRoot)
          resetRoots.add(affectedRoot)
        }
      } else {
        if (change.kind === "changed") {
          if (!overlay && !membershipRemoved) {
            addPathByRoot(changedPathsByRoot, canonicalRoot, sourcePath)
            contentChanged = true
          }
          for (const [affectedRoot, affectedPaths] of affectedPathsByRoot) {
            let physicalAliasAffected = false
            for (const affectedPath of affectedPaths) {
              if (
                membershipRemoved
                && affectedRoot === canonicalRoot
                && affectedPath === sourcePath
              ) continue
              addPathByRoot(changedPathsByRoot, affectedRoot, affectedPath)
              physicalAliasAffected ||= affectedPath !== sourcePath
            }
            changedRoots.add(affectedRoot)
            if (affectedRoot !== canonicalRoot || physicalAliasAffected) {
              resetRoots.add(affectedRoot)
            }
          }
        } else {
          createdSources.push({ path: sourcePath, physicalPath })
          for (const [affectedRoot, affectedPaths] of affectedPathsByRoot) {
            for (const affectedPath of affectedPaths) {
              addPathByRoot(changedPathsByRoot, affectedRoot, affectedPath)
            }
            changedRoots.add(affectedRoot)
            resetRoots.add(affectedRoot)
          }
        }
      }
      if (change.kind !== "created" || !paths) continue
      if (!membershipEligible) continue
      if (!this.isActiveProjectSource(batch.rootPath, sourcePath)) continue
      if (paths.includes(sourcePath)) continue
      if (paths.length >= this.maxProjectFileSetPaths) {
        if (entry?.status === "complete") {
          entry.status = "partial"
          entry.reason = "path-count-limit"
          membershipChanged = true
        }
        continue
      }
      if ((entry?.pathBytes ?? 0) + Buffer.byteLength(sourcePath) > this.maxProjectFileSetPathBytes) {
        if (entry?.status === "complete") {
          entry.status = "partial"
          entry.reason = "path-byte-limit"
          membershipChanged = true
        }
        continue
      }
      paths.push(sourcePath)
      paths.sort()
      if (entry) {
        entry.pathBytes += Buffer.byteLength(sourcePath)
        if (stat?.isFile()) entry.diskIdentities.set(sourcePath, sourceStatIdentity(stat))
      }
      membershipChanged = true
    }
    if (entry && membershipChanged) entry.revision = ++this.projectMembershipRevision
    if (contentChanged || createdSources.length > 0) changedRoots.add(canonicalRoot)
    for (const affectedRoot of this.invalidateCreatedResolutionCandidates(createdSources)) {
      changedRoots.add(affectedRoot)
      resetRoots.add(affectedRoot)
    }
    for (const [removedRoot, removedPaths] of removedPathsByRoot) {
      for (const removedPath of removedPaths) this.markWatchedRemoved(removedRoot, removedPath)
    }
    for (const [changedRoot, changedPaths] of changedPathsByRoot) {
      for (const changedPath of changedPaths) this.markWatchedChanged(changedRoot, changedPath)
    }
    for (const resetRoot of resetRoots) this.markTypeEngineReset(resetRoot)
    for (const changedRoot of changedRoots) {
      this.contentRevisions.set(changedRoot, (this.contentRevisions.get(changedRoot) ?? 0) + 1)
    }
    for (const dirtyRoot of dirtyMembershipRoots) this.projectFileSets.delete(dirtyRoot)
  }

  private invalidateDiskDocuments(
    filePaths: Iterable<string | DiskInvalidationInput>,
    {
      canonicalizeInputs = true,
      dirtyRoot,
      lexicalDirtyRoot,
      includeOverlayDependencies = false,
    }: {
      canonicalizeInputs?: boolean
      dirtyRoot?: string
      lexicalDirtyRoot?: string
      includeOverlayDependencies?: boolean
    } = {},
  ): DiskInvalidationMatches {
    const inputPathsByIdentity = new Map<string, Set<string>>()
    const invalidationMatches: DiskInvalidationMatches = new Map()
    for (const input of filePaths) {
      const sourcePath = path.resolve(typeof input === "string" ? input : input.path)
      addPathByRoot(inputPathsByIdentity, sourcePath, sourcePath)
      if (canonicalizeInputs) {
        const physicalPath = typeof input === "string"
          ? canonicalSourcePath(sourcePath)
          : input.physicalPath ?? canonicalSourcePath(sourcePath)
        addPathByRoot(inputPathsByIdentity, physicalPath, sourcePath)
      }
    }
    if (inputPathsByIdentity.size === 0 && dirtyRoot === undefined) return invalidationMatches
    const invalidatedDocumentPaths = new Set<string>()
    for (const [documentPath, document] of this.documents) {
      if (document.overlay) continue
      if (
        inputPathsByIdentity.has(documentPath)
        || inputPathsByIdentity.has(document.physicalPath)
        || (dirtyRoot !== undefined && isInside(dirtyRoot, document.physicalPath))
        || (lexicalDirtyRoot !== undefined && isInside(lexicalDirtyRoot, documentPath))
      ) {
        invalidatedDocumentPaths.add(documentPath)
      }
    }
    for (const [ownerPath, closure] of this.dependencyClosures) {
      let affected = false
      closure.paths.some((closurePath, index) => {
        if (!includeOverlayDependencies && this.documents.get(closurePath)?.overlay) return false
        const matchingInputs = matchingPaths(
          inputPathsByIdentity,
          closurePath,
          closure.physicalPaths?.[index] ?? closurePath,
        )
        const physicalPath = closure.physicalPaths?.[index] ?? closurePath
        if (dirtyRoot !== undefined && isInside(dirtyRoot, physicalPath)) {
          matchingInputs.push(closurePath)
        }
        if (lexicalDirtyRoot !== undefined && isInside(lexicalDirtyRoot, closurePath)) {
          matchingInputs.push(closurePath)
        }
        if (matchingInputs.length === 0) return false
        affected = true
        invalidatedDocumentPaths.add(closurePath)
        for (const inputPath of matchingInputs) {
          addInvalidationMatch(
            invalidationMatches,
            inputPath,
            closure.workspaceRoot,
            closurePath,
          )
        }
        return false
      })
      if (
        closure.paths[0] !== ownerPath
        && (includeOverlayDependencies || !this.documents.get(ownerPath)?.overlay)
      ) {
        const matchingInputs = matchingPaths(inputPathsByIdentity, ownerPath, ownerPath)
        if (matchingInputs.length > 0) {
          affected = true
          invalidatedDocumentPaths.add(ownerPath)
          for (const inputPath of matchingInputs) {
            addInvalidationMatch(
              invalidationMatches,
              inputPath,
              closure.workspaceRoot,
              ownerPath,
            )
          }
        }
      }
      if (!affected) continue
      this.dependencyClosures.delete(ownerPath)
    }
    for (const documentPath of invalidatedDocumentPaths) {
      const cached = this.documents.get(documentPath)
      if (!cached || cached.overlay) continue
      this.documents.delete(documentPath)
      this.cachedBytes -= Buffer.byteLength(cached.content)
    }
    return invalidationMatches
  }

  private invalidateCreatedResolutionCandidates(
    sources: readonly DiskInvalidationInput[],
  ): Set<string> {
    const createdPaths = new Set(sources.flatMap(createdSourcePathIdentities))
    const affectedRoots = new Set<string>()
    if (createdPaths.size === 0) return affectedRoots
    for (const [ownerPath, closure] of this.dependencyClosures) {
      const affected = closure.creationCandidatesComplete !== true
        || closure.creationCandidatePaths.some((candidatePath) => createdPaths.has(candidatePath))
      if (!affected) continue
      this.dependencyClosures.delete(ownerPath)
      affectedRoots.add(closure.workspaceRoot)
    }
    return affectedRoots
  }

  private markTypeEngineReset(canonicalRoot: string): void {
    if (this.typeEngineResetRoots.has(canonicalRoot)) return
    this.typeEngineResetRoots.add(canonicalRoot)
    this.typeEngineResetEpochs.set(
      canonicalRoot,
      (this.typeEngineResetEpochs.get(canonicalRoot) ?? 0) + 1,
    )
  }

  private markWatchedRemoved(canonicalRoot: string, filePath: string): void {
    if (this.typeEngineResetRoots.has(canonicalRoot)) return
    let removed = this.watchedRemovedPaths.get(canonicalRoot)
    if (!removed) {
      removed = new Set()
      this.watchedRemovedPaths.set(canonicalRoot, removed)
    }
    if (!removed.has(filePath) && removed.size >= this.maxWatchedRemovedPaths) {
      removed.clear()
      this.markTypeEngineReset(canonicalRoot)
      return
    }
    removed.add(filePath)
  }

  private markWatchedChanged(canonicalRoot: string, filePath: string): void {
    if (this.typeEngineResetRoots.has(canonicalRoot)) return
    let changed = this.watchedChangedPaths.get(canonicalRoot)
    if (!changed) {
      changed = new Set()
      this.watchedChangedPaths.set(canonicalRoot, changed)
    }
    if (!changed.has(filePath) && changed.size >= this.maxWatchedChangedPaths) {
      changed.clear()
      this.markTypeEngineReset(canonicalRoot)
      return
    }
    changed.add(filePath)
  }

  dispose(): void {
    this.packageResolver.invalidate()
    this.documents.clear()
    this.dependencyGenerations.clear()
    this.dependencyClosures.clear()
    this.projectFileSets.clear()
    this.watchedRemovedPaths.clear()
    this.watchedChangedPaths.clear()
    this.contentRevisions.clear()
    this.typeEngineResetRoots.clear()
    this.typeEngineResetEpochs.clear()
    this.accessClock = 0
    this.overlayOrderClock = 0
    this.cachedBytes = 0
    this.projectMembershipRevision = 0
  }

  prepare(position: SemanticDocumentPosition, includeWorkspaceFiles = false): SemanticWorkspaceView {
    this.operationControl.checkpoint()
    const transaction = this.beginDocumentCacheTransaction()
    try {
      const currentPath = path.resolve(position.path)
      const rootPath = position.workspaceRoot
        ? path.resolve(position.workspaceRoot)
        : resolveWorkspaceRoot(currentPath)
      const canonicalRoot = canonicalWorkspaceRoot(rootPath)
      const previousCurrent = this.documents.get(currentPath)
      const current = this.loadCurrent(currentPath, position, transaction, canonicalRoot)
      return this.prepareFromCurrent(
        currentPath,
        rootPath,
        canonicalRoot,
        previousCurrent,
        current,
        includeWorkspaceFiles,
        transaction,
      )
    } catch (error) {
      this.rollbackDocumentCacheTransaction(transaction)
      throw error
    }
  }

  prepareDiskSnapshot(
    position: SemanticDocumentPosition,
    content: string,
    includeWorkspaceFiles = false,
  ): SemanticWorkspaceView {
    this.operationControl.checkpoint()
    if (Buffer.byteLength(content) > MAX_DISK_SNAPSHOT_BYTES) {
      throw new RangeError(`Disk snapshot exceeds ${MAX_DISK_SNAPSHOT_BYTES} bytes`)
    }
    const transaction = this.beginDocumentCacheTransaction()
    try {
      const currentPath = path.resolve(position.path)
      const rootPath = position.workspaceRoot
        ? path.resolve(position.workspaceRoot)
        : resolveWorkspaceRoot(currentPath)
      const canonicalRoot = canonicalWorkspaceRoot(rootPath)
      const previousCurrent = this.documents.get(currentPath)
      if (previousCurrent?.overlay) {
        throw new Error(`Cannot replace open overlay with disk snapshot for ${currentPath}`)
      }
      this.captureDocumentRecord(transaction, currentPath)
      let current: DocumentRecord
      if (previousCurrent?.available && previousCurrent.content === content) {
        previousCurrent.lastAccess = ++this.accessClock
        previousCurrent.workspaceRoot = canonicalRoot
        previousCurrent.diskFingerprint = null
        current = previousCurrent
      } else {
        current = this.store(
          currentPath,
          content,
          (previousCurrent?.contentGeneration ?? 0) + 1,
          null,
          true,
          undefined,
          false,
          canonicalRoot,
        )
      }
      return this.prepareFromCurrent(
        currentPath,
        rootPath,
        canonicalRoot,
        previousCurrent,
        current,
        includeWorkspaceFiles,
        transaction,
      )
    } catch (error) {
      this.rollbackDocumentCacheTransaction(transaction)
      throw error
    }
  }

  private prepareFromCurrent(
    currentPath: string,
    rootPath: string,
    canonicalRoot: string,
    previousCurrent: DocumentRecord | undefined,
    current: DocumentRecord,
    includeWorkspaceFiles: boolean,
    transaction: DocumentCacheTransaction,
  ): SemanticWorkspaceView {
    const overlays = this.openOverlays(canonicalRoot)
    const authoritativeOverlays = new Map<string, DocumentRecord>()
    for (const record of overlays) {
      const previous = authoritativeOverlays.get(record.physicalPath)
      if (!previous || record.overlayOrder > previous.overlayOrder) {
        authoritativeOverlays.set(record.physicalPath, record)
      }
    }
    // The globally freshest overlay remains authoritative for other documents,
    // while a request made from an older open alias must still see its own text.
    if (current.overlay) authoritativeOverlays.set(current.physicalPath, current)
    const overlayPaths = new Map(
      [...authoritativeOverlays].map(([physicalPath, record]) => [physicalPath, record.path]),
    )
    const authoritativeOverlayPaths = new Set(overlayPaths.values())
    const shadowedPaths = new Set([
      ...[...overlayPaths].flatMap(([physicalPath, overlayPath]) => {
        const lexicalPath = lexicalWorkspacePath(rootPath, canonicalRoot, physicalPath)
        return lexicalPath !== undefined && lexicalPath !== overlayPath ? [lexicalPath] : []
      }),
      ...overlays.flatMap((record) => (
        authoritativeOverlayPaths.has(record.path) ? [] : [record.path]
      )),
    ])
    const closureResult = this.collectDependencyClosure(
      current,
      previousCurrent === current,
      canonicalRoot,
      transaction,
      overlayPaths,
    )
    const closure = closureResult.entries.filter(({ record }) => !shadowedPaths.has(record.path))
    const closureAuthorityChanged = closure.length !== closureResult.entries.length
    const loadedPaths = new Set(closure.map(({ record }) => record.path))
    const excludedOverlayPaths: string[] = []
    for (const record of overlays) {
      if (!authoritativeOverlayPaths.has(record.path)) {
        excludedOverlayPaths.push(record.path)
        continue
      }
      if (loadedPaths.has(record.path)) continue
      if (!this.isActiveProjectSource(rootPath, record.path)) {
        excludedOverlayPaths.push(record.path)
        continue
      }
      closure.push({ record, cacheHit: true })
      loadedPaths.add(record.path)
    }
    const documentCacheHit = closure.every(({ cacheHit }) => cacheHit)
    let projectMembership: ProjectMembershipSnapshot | undefined
    if (includeWorkspaceFiles) {
      projectMembership = this.projectMembership(rootPath)
      if (shadowedPaths.size > 0) {
        const visiblePaths = projectMembership.paths.filter(
          (sourcePath) => !shadowedPaths.has(sourcePath),
        )
        if (visiblePaths.length !== projectMembership.paths.length) {
          projectMembership = {
            ...projectMembership,
            paths: visiblePaths,
          }
        }
      }
      let totalBytes = closure.reduce((total, { record }) => total + Buffer.byteLength(record.content), 0)
      for (const sourcePath of projectMembership.paths) {
        if (loadedPaths.has(sourcePath) || closure.length >= MAX_CLOSURE_DOCUMENTS) continue
        const before = this.documents.get(sourcePath)
        const loaded = this.loadFromDiskWithinTransaction(
          sourcePath,
          before,
          transaction,
          Math.max(0, MAX_CLOSURE_BYTES - totalBytes),
          canonicalRoot,
        )
        if (loaded.status === "budget-exceeded") continue
        const record = loaded.record
        const bytes = Buffer.byteLength(record.content)
        if (!record.available || totalBytes + bytes > MAX_CLOSURE_BYTES) continue
        closure.push({ record, cacheHit: before === record })
        loadedPaths.add(sourcePath)
        totalBytes += bytes
      }
    }
    const documents = closure.map(({ record }) => ({
      path: record.path,
      content: record.content,
      documentVersion: record.documentVersion,
      overlay: record.overlay,
    }))
    this.operationControl.checkpoint()
    transaction.committed = true
    const dependencyGeneration = this.updateDependencyGeneration(rootPath, closure)
    this.evict(currentPath, new Set(documents.map((document) => document.path)))
    const watchedRemovedPaths = this.watchedRemovedPaths.get(canonicalRoot)
    this.watchedRemovedPaths.delete(canonicalRoot)
    const watchedChangedPaths = this.watchedChangedPaths.get(canonicalRoot)
    this.watchedChangedPaths.delete(canonicalRoot)
    const resetTypeEngine = this.typeEngineResetRoots.delete(canonicalRoot)

    return {
      rootPath,
      canonicalRootId: canonicalRoot,
      overlayPaths,
      typeEngineResetEpoch: this.typeEngineResetEpochs.get(canonicalRoot) ?? 0,
      documents,
      projectMembership,
      removedPaths: [...new Set([
        ...(watchedRemovedPaths ?? []),
        ...closureResult.removedPaths,
        ...excludedOverlayPaths,
      ])],
      changedPaths: [...(watchedChangedPaths ?? [])],
      contentRevision: this.contentRevisions.get(canonicalRoot) ?? 0,
      resetTypeEngine,
      state: {
        path: currentPath,
        contentGeneration: current.contentGeneration,
        documentVersion: current.documentVersion,
        dependencyGeneration,
        documentCacheHit,
        dependencyClosureCacheHit: closureResult.cacheHit && !closureAuthorityChanged,
        queryCacheHit: false,
        loadedDocumentCount: documents.length,
        syntaxReady: current.available,
      },
    }
  }

  private openOverlays(canonicalRoot: string): DocumentRecord[] {
    return [...this.documents.values()]
      .filter((record) => (
        record.overlay && isInside(canonicalRoot, canonicalSourcePath(record.path))
      ))
      .sort((left, right) => left.path.localeCompare(right.path))
  }

  private loadCurrent(
    filePath: string,
    position: SemanticDocumentPosition,
    transaction: DocumentCacheTransaction,
    workspaceRoot: string,
  ): DocumentRecord {
    this.captureDocumentRecord(transaction, filePath)
    const cached = this.documents.get(filePath)
    const requestedGeneration = position.contentGeneration
    const requestedVersion = position.documentVersion
    if (cached && requestedGeneration !== undefined && requestedGeneration < cached.contentGeneration) {
      throw new Error(
        `Stale semantic document generation for ${filePath}: ${requestedGeneration} < ${cached.contentGeneration}`,
      )
    }
    if (cached?.documentVersion !== undefined && requestedVersion !== undefined && requestedVersion < cached.documentVersion) {
      throw new Error(
        `Stale semantic document version for ${filePath}: ${requestedVersion} < ${cached.documentVersion}`,
      )
    }
    if (cached?.documentVersion !== undefined && requestedVersion !== undefined && requestedVersion > cached.documentVersion) {
      throw new Error(
        `Semantic document version ${requestedVersion} is not synchronized for ${filePath}; latest is ${cached.documentVersion}`,
      )
    }

    if (position.content !== undefined) {
      if (cached && requestedGeneration === cached.contentGeneration && position.content !== cached.content) {
        throw new Error(`Semantic document generation ${requestedGeneration} changed content for ${filePath}`)
      }
      if (cached && position.content === cached.content) {
        cached.lastAccess = ++this.accessClock
        if (position.workspaceRoot) cached.workspaceRoot = canonicalWorkspaceRoot(position.workspaceRoot)
        return cached
      }
      const generation = requestedGeneration ?? ((cached?.contentGeneration ?? 0) + 1)
      return this.store(
        filePath,
        position.content,
        generation,
        null,
        true,
        undefined,
        true,
        position.workspaceRoot
          ? canonicalWorkspaceRoot(position.workspaceRoot)
          : cached?.workspaceRoot,
      )
    }

    if (cached?.overlay) {
      cached.lastAccess = ++this.accessClock
      if (position.workspaceRoot) cached.workspaceRoot = canonicalWorkspaceRoot(position.workspaceRoot)
      return cached
    }
    return this.loadFromDiskWithinTransaction(
      filePath,
      cached,
      transaction,
      undefined,
      workspaceRoot,
    )
  }

  private projectMembership(rootPath: string): ProjectMembershipSnapshot {
    this.operationControl.checkpoint()
    const resolvedRoot = path.resolve(rootPath)
    const canonicalRoot = canonicalWorkspaceRoot(resolvedRoot)
    const cached = this.projectFileSets.get(canonicalRoot)
    if (cached) {
      this.projectFileSets.delete(canonicalRoot)
      this.projectFileSets.set(canonicalRoot, cached)
      return publicProjectMembership(cached)
    }
    const entry = this.scanProjectMembership(resolvedRoot)
    entry.revision = ++this.projectMembershipRevision
    this.publishProjectMembership(canonicalRoot, entry)
    return publicProjectMembership(entry)
  }

  private isActiveProjectSource(
    rootPath: string,
    sourcePath: string,
    directoryTraversal = false,
  ): boolean {
    const project = this.packageResolver.projectFor(rootPath)
    const scope = project.scopeFor(sourcePath)
    if (scope.status === "unconfigured") return true
    if (!scope.moduleRoot) {
      return directoryTraversal && project.mayContainDeclaredModule(sourcePath)
    }
    const resolvedPath = path.resolve(sourcePath)
    const sourceParent = path.join(scope.moduleRoot, "src")
    const physicalPath = canonicalSourcePath(resolvedPath)
    const physicalParent = canonicalSourcePath(sourceParent)
    const relative = path.relative(physicalParent, physicalPath)
    if (!relative) return true
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      if (directoryTraversal) return project.mayContainDeclaredModule(sourcePath)
      const moduleRoot = path.resolve(scope.moduleRoot)
      return path.dirname(resolvedPath) === moduleRoot
        && path.dirname(physicalPath) === canonicalSourcePath(moduleRoot)
    }
    const activeLexicalSource = scope.status === "ready" && scope.sourceRoots.some((sourceRoot) => (
      resolvedPath === sourceRoot || isInside(sourceRoot, resolvedPath)
    ))
    const activePhysicalSource = scope.status === "ready"
      && project.physicalSourceRootsFor(scope).some((physicalRoot) => {
      return physicalPath === physicalRoot || isInside(physicalRoot, physicalPath)
      })
    const activeSource = activeLexicalSource && activePhysicalSource
    return activeSource || (directoryTraversal && project.mayContainDeclaredModule(sourcePath))
  }

  private scanProjectMembership(rootPath: string): ProjectFileSetCacheEntry {
    const resolvedRoot = path.resolve(rootPath)
    const canonicalRoot = canonicalWorkspaceRoot(resolvedRoot)
    const overlayPaths = [...this.documents.values()]
      .filter((record) => record.overlay && isInside(canonicalRoot, canonicalSourcePath(record.path)))
      .map((record) => record.path)
      .sort()
    const paths: string[] = []
    const seen = new Set<string>()
    let pathBytes = 0
    let status: ProjectMembershipSnapshot["status"] = "complete"
    let reason: ProjectMembershipSnapshot["reason"]
    const diskIdentities = new Map<string, string>()
    const accept = (candidate: string, diskIdentity?: string): boolean => {
      const sourcePath = path.resolve(candidate)
      if (!this.isActiveProjectSource(resolvedRoot, sourcePath)) return true
      if (seen.has(sourcePath)) {
        if (diskIdentity !== undefined) diskIdentities.set(sourcePath, diskIdentity)
        return true
      }
      if (paths.length >= this.maxProjectFileSetPaths) {
        status = "partial"
        reason = "path-count-limit"
        return false
      }
      const bytes = Buffer.byteLength(sourcePath)
      if (pathBytes + bytes > this.maxProjectFileSetPathBytes) {
        status = "partial"
        reason = "path-byte-limit"
        return false
      }
      seen.add(sourcePath)
      paths.push(sourcePath)
      pathBytes += bytes
      if (diskIdentity !== undefined) diskIdentities.set(sourcePath, diskIdentity)
      return true
    }
    for (const overlayPath of overlayPaths) {
      if (!accept(overlayPath)) break
    }
    if (status === "complete") {
      try {
        for (const sourcePath of this.enumerateWorkspaceSources(resolvedRoot)) {
          this.operationControl.checkpoint()
          const lexicalStat = safeLstat(sourcePath, this.operationControl)
          if (lexicalStat?.isSymbolicLink()) continue
          const stat = lexicalStat
          if (!stat?.isFile() || stat.size > MAX_DISK_SNAPSHOT_BYTES) {
            status = "partial"
            reason = "source-unavailable"
            break
          }
          if (!accept(sourcePath, sourceStatIdentity(stat))) break
        }
      } catch {
        this.operationControl.checkpoint()
        status = "partial"
        reason = "enumeration-error"
      }
    }
    paths.sort()
    const entry: ProjectFileSetCacheEntry = {
      paths,
      pathBytes,
      status,
      ...(reason ? { reason } : {}),
      revision: 0,
      diskIdentities,
    }
    this.operationControl.checkpoint()
    return entry
  }

  private publishProjectMembership(canonicalRoot: string, entry: ProjectFileSetCacheEntry): void {
    this.projectFileSets.delete(canonicalRoot)
    this.projectFileSets.set(canonicalRoot, entry)
    while (this.projectFileSets.size > this.maxProjectFileSetRoots) {
      const oldestRoot = this.projectFileSets.keys().next().value
      if (oldestRoot === undefined) break
      this.projectFileSets.delete(oldestRoot)
    }
  }

  private includeOpenedProjectSource(rootPath: string | undefined, filePath: string): void {
    if (!rootPath || !SOURCE_EXTENSIONS.includes(path.extname(filePath))) return
    const canonicalRoot = canonicalWorkspaceRoot(rootPath)
    const entry = this.projectFileSets.get(canonicalRoot)
    const paths = entry?.paths
    const resolvedPath = path.resolve(filePath)
    const comparablePath = canonicalSourcePath(resolvedPath)
    if (!entry || !paths || paths.includes(resolvedPath) || !isInside(canonicalRoot, comparablePath)) return
    if (!this.isActiveProjectSource(rootPath, resolvedPath)) return
    if (paths.length >= this.maxProjectFileSetPaths) {
      if (entry.status === "complete") {
        entry.status = "partial"
        entry.reason = "path-count-limit"
        entry.revision = ++this.projectMembershipRevision
      }
      return
    }
    if (entry.pathBytes + Buffer.byteLength(resolvedPath) > this.maxProjectFileSetPathBytes) {
      if (entry.status === "complete") {
        entry.status = "partial"
        entry.reason = "path-byte-limit"
        entry.revision = ++this.projectMembershipRevision
      }
      return
    }
    paths.push(resolvedPath)
    paths.sort()
    entry.pathBytes += Buffer.byteLength(resolvedPath)
    entry.revision = ++this.projectMembershipRevision
  }

  private removeOpenedProjectSource(rootPath: string | undefined, filePath: string): void {
    if (!rootPath) return
    const canonicalRoot = canonicalWorkspaceRoot(rootPath)
    const entry = this.projectFileSets.get(canonicalRoot)
    const resolvedPath = path.resolve(filePath)
    if (!entry) return
    const index = entry.paths.indexOf(resolvedPath)
    if (index < 0) {
      entry.diskIdentities.delete(resolvedPath)
      return
    }
    const lexicalSourceIsRegular = safeLstat(resolvedPath, this.operationControl)?.isFile() === true
    const stat = safeStat(resolvedPath, this.operationControl)
    const physicalPath = canonicalSourcePath(resolvedPath)
    if (
      lexicalSourceIsRegular
      && stat?.isFile()
      && stat.size <= MAX_DISK_SNAPSHOT_BYTES
      && isInside(canonicalRoot, physicalPath)
      && this.isActiveProjectSource(rootPath, resolvedPath)
    ) {
      const diskIdentity = sourceStatIdentity(stat)
      if (entry.diskIdentities.get(resolvedPath) !== diskIdentity) {
        entry.diskIdentities.set(resolvedPath, diskIdentity)
        entry.revision = ++this.projectMembershipRevision
      }
      return
    }
    entry.diskIdentities.delete(resolvedPath)
    entry.paths.splice(index, 1)
    entry.pathBytes -= Buffer.byteLength(resolvedPath)
    entry.revision = ++this.projectMembershipRevision
  }

  private beginDocumentCacheTransaction(): DocumentCacheTransaction {
    return {
      records: new Map(),
      closures: new Map(),
      cachedBytes: this.cachedBytes,
      accessClock: this.accessClock,
      committed: false,
    }
  }

  private captureDocumentRecord(transaction: DocumentCacheTransaction, filePath: string): void {
    if (transaction.records.has(filePath)) return
    const previous = this.documents.get(filePath)
    transaction.records.set(filePath, previous ? { ...previous } : undefined)
  }

  private captureDependencyClosure(transaction: DocumentCacheTransaction, ownerPath: string): void {
    if (transaction.closures.has(ownerPath)) return
    transaction.closures.set(ownerPath, this.dependencyClosures.get(ownerPath))
  }

  private rollbackDocumentCacheTransaction(transaction: DocumentCacheTransaction): void {
    if (transaction.committed) return
    for (const [filePath, record] of transaction.records) {
      if (record) this.documents.set(filePath, record)
      else this.documents.delete(filePath)
    }
    for (const [ownerPath, closure] of transaction.closures) {
      if (closure) this.dependencyClosures.set(ownerPath, closure)
      else this.dependencyClosures.delete(ownerPath)
    }
    this.cachedBytes = transaction.cachedBytes
    this.accessClock = transaction.accessClock
  }

  private loadFromDiskWithinTransaction(
    filePath: string,
    cached?: DocumentRecord,
    transaction?: DocumentCacheTransaction,
    remainingBytes?: undefined,
    workspaceRoot?: string,
  ): DocumentRecord
  private loadFromDiskWithinTransaction(
    filePath: string,
    cached: DocumentRecord | undefined,
    transaction: DocumentCacheTransaction | undefined,
    remainingBytes: number,
    workspaceRoot?: string,
  ): BudgetedDiskLoadResult
  private loadFromDiskWithinTransaction(
    filePath: string,
    cached?: DocumentRecord,
    transaction?: DocumentCacheTransaction,
    remainingBytes?: number,
    workspaceRoot?: string,
  ): DocumentRecord | BudgetedDiskLoadResult {
    const budgeted = remainingBytes !== undefined
    const availableBytes = remainingBytes ?? Number.POSITIVE_INFINITY
    const loaded = (record: DocumentRecord): DocumentRecord | BudgetedDiskLoadResult => (
      budgeted ? { status: "loaded", record } : record
    )
    if (cached?.overlay) {
      if (transaction) this.captureDocumentRecord(transaction, filePath)
      cached.lastAccess = ++this.accessClock
      return loaded(cached)
    }
    const physicalPath = canonicalSourcePath(filePath)
    const physicallyAdmitted = workspaceRoot === undefined || isInside(workspaceRoot, physicalPath)
    const stat = physicallyAdmitted ? safeStat(filePath, this.operationControl) : null
    const fingerprint = stat ? `${stat.mtimeMs}:${stat.size}` : null
    if (
      cached
      && cached.physicalPath === physicalPath
      && fingerprint !== null
      && cached.diskFingerprint === fingerprint
    ) {
      if (Buffer.byteLength(cached.content) > availableBytes) {
        return { status: "budget-exceeded" }
      }
      if (transaction) this.captureDocumentRecord(transaction, filePath)
      cached.lastAccess = ++this.accessClock
      return loaded(cached)
    }
    const read = stat?.isFile() && stat.size <= MAX_DISK_SNAPSHOT_BYTES
      ? safeRead(filePath, availableBytes, this.operationControl, physicalPath)
      : { status: "unavailable" as const }
    if (read.status === "budget-exceeded") return read
    if (read.status === "unavailable") {
      if (cached && !cached.available && cached.diskFingerprint === fingerprint) return loaded(cached)
      if (transaction) this.captureDocumentRecord(transaction, filePath)
      return loaded(this.store(
        filePath,
        "",
        (cached?.contentGeneration ?? 0) + 1,
        fingerprint,
        false,
        undefined,
        false,
        undefined,
        physicalPath,
      ))
    }
    if (Buffer.byteLength(read.content) > availableBytes) {
      return { status: "budget-exceeded" }
    }
    if (transaction) this.captureDocumentRecord(transaction, filePath)
    return loaded(this.store(
      filePath,
      read.content,
      (cached?.contentGeneration ?? 0) + 1,
      fingerprint,
      true,
      undefined,
      false,
      undefined,
      physicalPath,
    ))
  }

  private collectDependencyClosure(
    current: DocumentRecord,
    currentCacheHit: boolean,
    workspaceRoot: string,
    transaction: DocumentCacheTransaction,
    overlayPaths: ReadonlyMap<string, string>,
  ): DependencyClosureResult {
    this.captureDependencyClosure(transaction, current.path)
    this.operationControl.checkpoint()
    const changedPaths = new Set<string>()
    const removedPaths = new Set<string>()
    const cached = this.reuseDependencyClosure(
      current,
      currentCacheHit,
      workspaceRoot,
      changedPaths,
      removedPaths,
      transaction,
    )
    if (cached) return { entries: cached, cacheHit: true, removedPaths: [] }

    const result: Array<{ record: DocumentRecord; cacheHit: boolean }> = [
      { record: current, cacheHit: currentCacheHit },
    ]
    const queued = [current]
    const visited = new Set([current.path])
    let totalBytes = Buffer.byteLength(current.content)
    let complete = true
    let aggregateAdmissionComplete = true
    let creationCandidatesComplete = true
    const creationCandidatePaths = new Set<string>()

    while (queued.length > 0 && result.length < MAX_CLOSURE_DOCUMENTS) {
      this.operationControl.checkpoint()
      const source = queued.shift()
      if (!source) break
      const resolved = resolveRelativeImports(
        source.path,
        source.content,
        this.operationControl,
        this.packageResolver,
        workspaceRoot,
        (filePath) => this.documents.get(filePath)?.overlay === true,
        (physicalPath) => overlayPaths.get(physicalPath),
      )
      complete &&= resolved.complete
      for (const candidatePath of resolved.creationCandidatePaths) {
        if (creationCandidatePaths.has(candidatePath)) continue
        if (creationCandidatePaths.size >= MAX_CLOSURE_CREATION_CANDIDATES) {
          creationCandidatesComplete = false
          break
        }
        creationCandidatePaths.add(candidatePath)
      }
      for (const dependencyPath of resolved.paths) {
        this.operationControl.checkpoint()
        if (visited.has(dependencyPath)) continue
        visited.add(dependencyPath)
        const before = this.documents.get(dependencyPath)
        const loaded = this.loadFromDiskWithinTransaction(
          dependencyPath,
          before,
          transaction,
          Math.max(0, MAX_CLOSURE_BYTES - totalBytes),
          workspaceRoot,
        )
        if (loaded.status === "budget-exceeded") {
          aggregateAdmissionComplete = false
          continue
        }
        const dependency = loaded.record
        this.operationControl.checkpoint()
        const bytes = Buffer.byteLength(dependency.content)
        if (totalBytes + bytes > MAX_CLOSURE_BYTES) {
          creationCandidatesComplete = false
          continue
        }
        totalBytes += bytes
        result.push({
          record: dependency,
          cacheHit: before === dependency && !changedPaths.has(dependencyPath),
        })
        queued.push(dependency)
        if (result.length >= MAX_CLOSURE_DOCUMENTS) break
      }
    }
    if (queued.length > 0) creationCandidatesComplete = false
    this.operationControl.checkpoint()
    if (complete && aggregateAdmissionComplete) {
      this.dependencyClosures.set(current.path, {
        contentGeneration: current.contentGeneration,
        paths: result.map(({ record }) => record.path),
        physicalPaths: result.map(({ record }) => record.physicalPath),
        workspaceRoot,
        creationCandidatePaths: [...creationCandidatePaths].sort(),
        creationCandidatesComplete,
      })
    } else {
      this.dependencyClosures.delete(current.path)
    }
    return { entries: result, cacheHit: false, removedPaths: [...removedPaths] }
  }

  private reuseDependencyClosure(
    current: DocumentRecord,
    currentCacheHit: boolean,
    workspaceRoot: string,
    changedPaths: Set<string>,
    removedPaths: Set<string>,
    transaction: DocumentCacheTransaction,
  ): Array<{ record: DocumentRecord; cacheHit: boolean }> | null {
    const cached = this.dependencyClosures.get(current.path)
    if (
      !currentCacheHit
      || cached?.contentGeneration !== current.contentGeneration
      || cached.workspaceRoot !== workspaceRoot
    ) return null

    const entries = [{ record: current, cacheHit: true }]
    for (const dependencyPath of cached.paths.slice(1)) {
      this.operationControl.checkpoint()
      const before = this.documents.get(dependencyPath)
      const dependency = this.loadFromDiskWithinTransaction(
        dependencyPath,
        before,
        transaction,
        undefined,
        workspaceRoot,
      )
      this.operationControl.checkpoint()
      if (!dependency.available || dependency !== before) {
        changedPaths.add(dependencyPath)
        if (!dependency.available) removedPaths.add(dependencyPath)
        this.dependencyClosures.delete(current.path)
        return null
      }
      entries.push({ record: dependency, cacheHit: true })
    }
    return entries
  }

  private store(
    filePath: string,
    content: string,
    contentGeneration: number,
    diskFingerprint: string | null,
    available: boolean,
    documentVersion?: number,
    overlay = false,
    workspaceRoot?: string,
    physicalPathOverride?: string,
  ): DocumentRecord {
    const previous = this.documents.get(filePath)
    if (previous) this.cachedBytes -= Buffer.byteLength(previous.content)
    const record = {
      path: filePath,
      content,
      contentGeneration,
      documentVersion,
      workspaceRoot,
      physicalPath: physicalPathOverride ?? canonicalSourcePath(filePath),
      diskFingerprint,
      lastAccess: ++this.accessClock,
      available,
      overlay,
      overlayOrder: overlay ? ++this.overlayOrderClock : 0,
    }
    this.documents.set(filePath, record)
    this.cachedBytes += Buffer.byteLength(content)
    return record
  }

  private updateDependencyGeneration(
    rootPath: string,
    closure: Array<{ record: DocumentRecord; cacheHit: boolean }>,
  ): number {
    const previous = this.dependencyGenerations.get(rootPath) ?? 0
    const changedDependency = closure.slice(1).some(({ cacheHit }) => !cacheHit)
    const next = previous === 0 || changedDependency ? previous + 1 : previous
    this.dependencyGenerations.set(rootPath, next)
    return next
  }

  private evict(currentPath: string, protectedPaths: Set<string>): void {
    if (this.documents.size <= MAX_CACHED_DOCUMENTS && this.cachedBytes <= MAX_CACHED_BYTES) return
    const candidates = [...this.documents.values()]
      .filter((record) => (
        !record.overlay
        && record.path !== currentPath
        && !protectedPaths.has(record.path)
      ))
      .sort((left, right) => left.lastAccess - right.lastAccess)
    for (const record of candidates) {
      if (this.documents.size <= MAX_CACHED_DOCUMENTS && this.cachedBytes <= MAX_CACHED_BYTES) break
      this.documents.delete(record.path)
      this.dependencyClosures.delete(record.path)
      this.cachedBytes -= Buffer.byteLength(record.content)
    }
  }
}

function canonicalWorkspaceRoot(rootPath: string): string {
  const resolved = path.resolve(rootPath)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function lexicalWorkspacePath(
  rootPath: string,
  canonicalRoot: string,
  physicalPath: string,
): string | undefined {
  const relative = path.relative(canonicalRoot, physicalPath)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return undefined
  }
  return path.resolve(rootPath, relative)
}

function isWorkspacePhysicalAlias(
  lexicalWorkspaceRoot: string | undefined,
  canonicalRoot: string | undefined,
  sourcePath: string,
  physicalPath: string,
): boolean {
  if (!lexicalWorkspaceRoot || !canonicalRoot) return false
  const lexicalRoot = path.resolve(lexicalWorkspaceRoot)
  const relative = path.relative(lexicalRoot, sourcePath)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return false
  }
  return path.resolve(canonicalRoot, relative) !== physicalPath
}

function canonicalSourcePath(filePath: string): string {
  const resolved = path.resolve(filePath)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    try {
      return path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved))
    } catch {
      return resolved
    }
  }
}

function isInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function addPathByRoot(
  pathsByRoot: Map<string, Set<string>>,
  rootPath: string,
  filePath: string,
): void {
  let paths = pathsByRoot.get(rootPath)
  if (!paths) {
    paths = new Set()
    pathsByRoot.set(rootPath, paths)
  }
  paths.add(filePath)
}

function matchingPaths(
  pathsByIdentity: ReadonlyMap<string, ReadonlySet<string>>,
  rawPath: string,
  physicalPath: string,
): string[] {
  const rawMatches = pathsByIdentity.get(rawPath)
  const physicalMatches = physicalPath === rawPath
    ? undefined
    : pathsByIdentity.get(physicalPath)
  if (!rawMatches && !physicalMatches) return []
  if (!rawMatches) return [...(physicalMatches ?? [])]
  if (!physicalMatches) return [...rawMatches]
  return [...new Set([...rawMatches, ...physicalMatches])]
}

function addInvalidationMatch(
  matches: DiskInvalidationMatches,
  inputPath: string,
  rootPath: string,
  affectedPath: string,
): void {
  let pathsByRoot = matches.get(inputPath)
  if (!pathsByRoot) {
    pathsByRoot = new Map()
    matches.set(inputPath, pathsByRoot)
  }
  addPathByRoot(pathsByRoot, rootPath, affectedPath)
}

function boundedLimit(value: number | undefined, hardMaximum: number, label: string): number {
  if (value === undefined) return hardMaximum
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} limit must be a positive safe integer`)
  }
  return Math.min(value, hardMaximum)
}

function publicProjectMembership(entry: ProjectFileSetCacheEntry): ProjectMembershipSnapshot {
  if (entry.publicSnapshot?.revision === entry.revision) return entry.publicSnapshot
  const snapshot: ProjectMembershipSnapshot = Object.freeze({
    paths: Object.freeze([...entry.paths]),
    status: entry.status,
    ...(entry.reason ? { reason: entry.reason } : {}),
    revision: entry.revision,
  })
  entry.publicSnapshot = snapshot
  return snapshot
}

function* listWorkspaceSourcePaths(
  rootPath: string,
  operationControl: SemanticOperationControl,
  includePath: (sourcePath: string, directoryTraversal: boolean) => boolean,
): Generator<string> {
  const pending: Array<{ path: string; directory: fs.Dir }> = []
  try {
    pending.push({ path: rootPath, directory: fs.opendirSync(rootPath) })
    while (pending.length > 0) {
      const current = pending[pending.length - 1]
      const entry = current.directory.readSync()
      if (entry === null) {
        pending.pop()
        current.directory.closeSync()
        continue
      }
      operationControl.checkpoint()
      if (entry.name === ".arkline" || entry.name === ".git" || entry.name === "build"
        || entry.name === "node_modules" || entry.name === "oh_modules") continue
      const entryPath = path.resolve(current.path, entry.name)
      if (entry.isDirectory()) {
        if (!includePath(entryPath, true)) continue
        pending.push({ path: entryPath, directory: fs.opendirSync(entryPath) })
      }
      else if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))
        && includePath(entryPath, false)) yield entryPath
    }
  } finally {
    let closeError: unknown
    while (pending.length > 0) {
      try {
        pending.pop()?.directory.closeSync()
      } catch (error) {
        closeError ??= error
      }
    }
    if (closeError) throw closeError
  }
}

function resolveRelativeImports(
  documentPath: string,
  content: string,
  operationControl: SemanticOperationControl,
  packageResolver: LocalPackageResolver,
  workspaceRoot: string,
  hasOverlay: (filePath: string) => boolean,
  overlayPath: (physicalPath: string) => string | undefined,
): { paths: string[]; creationCandidatePaths: string[]; complete: boolean } {
  const specifiers = [...content.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier))
  const resolved = specifiers.flatMap((specifier) => {
    if (specifier.startsWith(".")) {
      const relative = resolveImportPath(documentPath, specifier, operationControl)
      return [{
        ...relative,
        paths: relative.paths.flatMap((candidate) => {
          const resolved = packageResolver.installedSourcePath(
            workspaceRoot, documentPath, candidate, overlayPath, () => operationControl.checkpoint(),
          )
          return resolved === undefined ? [] : [resolved]
        }),
      }]
    }
    const local = packageResolver.resolve(workspaceRoot, documentPath, specifier, {
      checkpoint: () => operationControl.checkpoint(), hasOverlay, overlayPath,
    })
    return local === undefined ? [] : [{ paths: local.path ? [local.path] : [], creationCandidatePaths: [] }]
  })
  return {
    paths: resolved.flatMap(({ paths }) => paths),
    creationCandidatePaths: resolved.flatMap(({ creationCandidatePaths }) => (
      creationCandidatePaths
    )),
    complete: resolved.every(({ paths }) => paths.length > 0),
  }
}

function resolveImportPath(
  documentPath: string,
  specifier: string,
  operationControl: SemanticOperationControl,
): { paths: string[]; creationCandidatePaths: string[] } {
  const basePath = path.resolve(path.dirname(documentPath), specifier)
  const rawCandidates = path.extname(basePath)
    ? [basePath]
    : [
        ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => path.join(basePath, `index${extension}`)),
      ]
  const candidates = rawCandidates.filter((candidate, index) => (
    index === rawCandidates.findIndex((value) => value === candidate)
  ))
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    if (!candidate || !safeStat(candidate, operationControl)?.isFile()) continue
    return {
      paths: [candidate],
      creationCandidatePaths: candidates.slice(0, index).flatMap(sourcePathIdentities),
    }
  }
  return {
    paths: [],
    creationCandidatePaths: candidates.flatMap(sourcePathIdentities),
  }
}

function sourcePathIdentities(filePath: string): string[] {
  const resolved = path.resolve(filePath)
  const physical = canonicalSourcePath(resolved)
  return [...new Set([
    resolved,
    physical,
    caseFoldedPathIdentity(resolved),
    caseFoldedPathIdentity(physical),
  ])]
}

function createdSourcePathIdentities(source: DiskInvalidationInput): string[] {
  const resolved = path.resolve(source.path)
  const physical = source.physicalPath ?? canonicalSourcePath(resolved)
  const identities = [resolved, physical]
  if (hasCaseInsensitiveAlias(resolved, physical)) {
    identities.push(caseFoldedPathIdentity(resolved), caseFoldedPathIdentity(physical))
  }
  return [...new Set(identities)]
}

function caseFoldedPathIdentity(filePath: string): string {
  return `${CASE_FOLDED_PATH_IDENTITY_PREFIX}${filePath.toLowerCase()}`
}

function hasCaseInsensitiveAlias(filePath: string, physicalPath: string): boolean {
  const basename = path.basename(filePath)
  const alternateBasename = toggleAsciiCase(basename)
  if (alternateBasename === basename) return false
  try {
    return fs.realpathSync.native(path.join(path.dirname(filePath), alternateBasename)) === physicalPath
  } catch {
    return false
  }
}

function toggleAsciiCase(value: string): string {
  const index = value.search(/[A-Za-z]/)
  if (index < 0) return value
  const character = value[index]
  const toggled = character === character.toLowerCase()
    ? character.toUpperCase()
    : character.toLowerCase()
  return `${value.slice(0, index)}${toggled}${value.slice(index + 1)}`
}

function safeRead(
  filePath: string,
  remainingBytes: number,
  operationControl: SemanticOperationControl,
  expectedPhysicalPath?: string,
  expectedDiskIdentity?: ProjectFileAdmissionToken,
): DiskReadResult {
  let descriptor: number | undefined
  try {
    operationControl.checkpoint()
    const initial = fs.lstatSync(filePath)
    if (!initial.isFile() && !initial.isSymbolicLink()) return { status: "unavailable" }
    descriptor = fs.openSync(
      filePath,
      fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0),
    )
    const before = fs.fstatSync(descriptor)
    if (!before.isFile() || before.size > MAX_DISK_SNAPSHOT_BYTES) return { status: "unavailable" }
    if (before.size > remainingBytes) return { status: "budget-exceeded" }
    if (expectedDiskIdentity !== undefined && sourceStatIdentity(before) !== expectedDiskIdentity) {
      return { status: "unavailable" }
    }
    if (expectedPhysicalPath !== undefined) {
      const currentPhysicalPath = fs.realpathSync.native(filePath)
      const expectedEntry = fs.lstatSync(expectedPhysicalPath)
      const expectedStat = fs.statSync(expectedPhysicalPath)
      if (
        currentPhysicalPath !== expectedPhysicalPath
        || !expectedEntry.isFile()
        || before.dev !== expectedStat.dev
        || before.ino !== expectedStat.ino
      ) return { status: "unavailable" }
    }
    operationControl.checkpoint()
    const bytes = Buffer.allocUnsafe(before.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      operationControl.checkpoint()
      const bytesRead = fs.readSync(
        descriptor,
        bytes,
        offset,
        Math.min(bytes.length - offset, MAX_DISK_READ_CHUNK_BYTES),
        null,
      )
      if (bytesRead === 0) break
      offset += bytesRead
      operationControl.checkpoint()
    }
    const after = fs.fstatSync(descriptor)
    if (
      offset !== before.size
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) return { status: "unavailable" }
    return {
      status: "loaded",
      content: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
        .decode(bytes.subarray(0, offset)),
    }
  } catch {
    operationControl.checkpoint()
    return { status: "unavailable" }
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor)
      } catch {
        // The read already failed closed.
      }
    }
  }
}

function safeStat(
  filePath: string,
  operationControl: SemanticOperationControl = NOOP_OPERATION_CONTROL,
): fs.Stats | null {
  try {
    const stat = fs.statSync(filePath)
    operationControl.checkpoint()
    return stat
  } catch {
    operationControl.checkpoint()
    return null
  }
}

function safeLstat(
  filePath: string,
  operationControl: SemanticOperationControl = NOOP_OPERATION_CONTROL,
): fs.Stats | null {
  try {
    const stat = fs.lstatSync(filePath)
    operationControl.checkpoint()
    return stat
  } catch {
    operationControl.checkpoint()
    return null
  }
}

function sourceStatIdentity(stat: fs.Stats): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":")
}
