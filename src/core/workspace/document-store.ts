import fs from "node:fs"
import path from "node:path"

import type {
  SemanticDocumentSync,
  SemanticDocumentPosition,
  SemanticReplayDocument,
  SemanticResponseState,
} from "../protocol.js"
import { resolveWorkspaceRoot, type WorkspaceDocument } from "../sdk/workspace-loader.js"

const MAX_CACHED_DOCUMENTS = 512
const MAX_CACHED_BYTES = 16 * 1024 * 1024
const MAX_CLOSURE_DOCUMENTS = 256
const MAX_CLOSURE_BYTES = 8 * 1024 * 1024
const MAX_PROJECT_FILE_SET_ROOTS = 4
const MAX_PROJECT_FILE_SET_PATHS = 20_000
const MAX_PROJECT_FILE_SET_PATH_BYTES = 4 * 1024 * 1024
const MAX_WATCHED_REMOVED_PATHS = 512
const MAX_WATCHED_CHANGED_PATHS = 512
const SOURCE_EXTENSIONS = [".ets", ".ts"]
const MAX_REPLAY_DOCUMENTS = 32
const MAX_REPLAY_BYTES = 4 * 1024 * 1024

interface DocumentRecord extends WorkspaceDocument {
  contentGeneration: number
  documentVersion?: number
  diskFingerprint: string | null
  lastAccess: number
  available: boolean
  overlay: boolean
}

interface DependencyClosureCacheEntry {
  contentGeneration: number
  paths: string[]
}

interface DependencyClosureResult {
  entries: Array<{ record: DocumentRecord; cacheHit: boolean }>
  cacheHit: boolean
  removedPaths: string[]
}

export interface ProjectMembershipSnapshot {
  paths: string[]
  status: "complete" | "partial"
  reason?: "path-count-limit" | "path-byte-limit" | "enumeration-error"
  revision: number
}

interface ProjectFileSetCacheEntry extends ProjectMembershipSnapshot {
  pathBytes: number
}

export interface SemanticDocumentStoreOptions {
  enumerateWorkspaceSources?: (rootPath: string) => Iterable<string>
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
  documents: WorkspaceDocument[]
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

export class SemanticDocumentStore {
  private readonly documents = new Map<string, DocumentRecord>()
  private readonly dependencyGenerations = new Map<string, number>()
  private readonly dependencyClosures = new Map<string, DependencyClosureCacheEntry>()
  private readonly projectFileSets = new Map<string, ProjectFileSetCacheEntry>()
  private readonly watchedRemovedPaths = new Map<string, Set<string>>()
  private readonly watchedChangedPaths = new Map<string, Set<string>>()
  private readonly contentRevisions = new Map<string, number>()
  private readonly typeEngineResetRoots = new Set<string>()
  private readonly enumerateWorkspaceSources: (rootPath: string) => Iterable<string>
  private readonly maxProjectFileSetRoots: number
  private readonly maxProjectFileSetPaths: number
  private readonly maxProjectFileSetPathBytes: number
  private readonly maxWatchedRemovedPaths: number
  private readonly maxWatchedChangedPaths: number
  private accessClock = 0
  private cachedBytes = 0
  private projectMembershipRevision = 0

  constructor({
    enumerateWorkspaceSources = listWorkspaceSourcePaths,
    projectFileSetLimits = {},
    watchedFileLimits = {},
  }: SemanticDocumentStoreOptions = {}) {
    this.enumerateWorkspaceSources = enumerateWorkspaceSources
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
      )
    }
    return documents.length
  }

  sync(document: SemanticDocumentSync): DocumentRecord {
    const filePath = path.resolve(document.path)
    const cached = this.documents.get(filePath)
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
    )
    this.includeOpenedProjectSource(document.workspaceRoot, filePath)
    return record
  }

  close(filePath: string): void {
    const resolved = path.resolve(filePath)
    const cached = this.documents.get(resolved)
    if (!cached) return
    this.documents.delete(resolved)
    this.dependencyClosures.delete(resolved)
    this.cachedBytes -= Buffer.byteLength(cached.content)
  }

  invalidate(rootPath: string): void {
    this.projectFileSets.delete(canonicalWorkspaceRoot(rootPath))
  }

  workspaceFilesChanged(batch: WorkspaceFileChangeBatch): void {
    const canonicalRoot = canonicalWorkspaceRoot(batch.rootPath)
    if (batch.rootDirty) {
      const knownPaths = new Set(this.projectFileSets.get(canonicalRoot)?.paths ?? [])
      for (const documentPath of this.documents.keys()) {
        if (isInside(canonicalRoot, canonicalSourcePath(documentPath))) knownPaths.add(documentPath)
      }
      for (const knownPath of knownPaths) {
        if (this.documents.get(knownPath)?.overlay) continue
        this.invalidateDiskDocument(knownPath)
        this.markWatchedRemoved(canonicalRoot, knownPath)
      }
      this.projectFileSets.delete(canonicalRoot)
      this.typeEngineResetRoots.add(canonicalRoot)
      return
    }
    const entry = this.projectFileSets.get(canonicalRoot)
    const paths = entry?.paths
    let membershipChanged = false
    let contentChanged = false
    for (const change of batch.changes) {
      const sourcePath = path.resolve(change.path)
      if (!SOURCE_EXTENSIONS.includes(path.extname(sourcePath))) continue
      if (!isInside(canonicalRoot, canonicalSourcePath(sourcePath))) continue
      if (change.kind === "deleted") {
        if (this.documents.get(sourcePath)?.overlay) continue
        const known = this.documents.has(sourcePath)
          || Boolean(paths?.includes(sourcePath))
          || [...this.dependencyClosures.values()].some((closure) => (
            closure.paths.includes(sourcePath)
          ))
        this.invalidateDiskDocument(sourcePath)
        if (paths) {
          const index = paths.indexOf(sourcePath)
          if (index >= 0) {
            paths.splice(index, 1)
            if (entry) entry.pathBytes -= Buffer.byteLength(sourcePath)
            membershipChanged = true
          }
        }
        if (known) this.markWatchedRemoved(canonicalRoot, sourcePath)
      } else {
        if (change.kind === "changed" && this.documents.get(sourcePath)?.overlay) continue
        this.invalidateDiskDocument(sourcePath)
        if (change.kind === "changed") {
          this.markWatchedChanged(canonicalRoot, sourcePath)
          contentChanged = true
        }
      }
      if (change.kind !== "created" || !paths) continue
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
      if (entry) entry.pathBytes += Buffer.byteLength(sourcePath)
      membershipChanged = true
    }
    if (entry && membershipChanged) entry.revision = ++this.projectMembershipRevision
    if (contentChanged) {
      this.contentRevisions.set(canonicalRoot, (this.contentRevisions.get(canonicalRoot) ?? 0) + 1)
    }
  }

  private invalidateDiskDocument(filePath: string): void {
    const cached = this.documents.get(filePath)
    if (cached?.overlay) return
    if (cached) {
      this.documents.delete(filePath)
      this.cachedBytes -= Buffer.byteLength(cached.content)
    }
    for (const [ownerPath, closure] of this.dependencyClosures) {
      if (ownerPath === filePath || closure.paths.includes(filePath)) {
        this.dependencyClosures.delete(ownerPath)
      }
    }
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
      this.typeEngineResetRoots.add(canonicalRoot)
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
      this.typeEngineResetRoots.add(canonicalRoot)
      return
    }
    changed.add(filePath)
  }

  dispose(): void {
    this.documents.clear()
    this.dependencyGenerations.clear()
    this.dependencyClosures.clear()
    this.projectFileSets.clear()
    this.watchedRemovedPaths.clear()
    this.watchedChangedPaths.clear()
    this.contentRevisions.clear()
    this.typeEngineResetRoots.clear()
    this.accessClock = 0
    this.cachedBytes = 0
    this.projectMembershipRevision = 0
  }

  prepare(position: SemanticDocumentPosition, includeWorkspaceFiles = false): SemanticWorkspaceView {
    const currentPath = path.resolve(position.path)
    const rootPath = position.workspaceRoot
      ? path.resolve(position.workspaceRoot)
      : resolveWorkspaceRoot(currentPath)
    const previousCurrent = this.documents.get(currentPath)
    const current = this.loadCurrent(currentPath, position)
    const closureResult = this.collectDependencyClosure(current, previousCurrent === current)
    const closure = closureResult.entries
    const documentCacheHit = closure.every(({ cacheHit }) => cacheHit)
    let projectMembership: ProjectMembershipSnapshot | undefined
    if (includeWorkspaceFiles) {
      projectMembership = this.projectMembership(rootPath)
      const loadedPaths = new Set(closure.map(({ record }) => record.path))
      let totalBytes = closure.reduce((total, { record }) => total + Buffer.byteLength(record.content), 0)
      for (const sourcePath of projectMembership.paths) {
        if (loadedPaths.has(sourcePath) || closure.length >= MAX_CLOSURE_DOCUMENTS) continue
        const before = this.documents.get(sourcePath)
        const record = this.loadFromDisk(sourcePath, before)
        const bytes = Buffer.byteLength(record.content)
        if (!record.available || totalBytes + bytes > MAX_CLOSURE_BYTES) continue
        closure.push({ record, cacheHit: before === record })
        loadedPaths.add(sourcePath)
        totalBytes += bytes
      }
    }
    const documents = closure.map(({ record }) => ({ path: record.path, content: record.content }))
    const dependencyGeneration = this.updateDependencyGeneration(rootPath, closure)
    this.evict(currentPath, new Set(documents.map((document) => document.path)))
    const canonicalRoot = canonicalWorkspaceRoot(rootPath)
    const watchedRemovedPaths = this.watchedRemovedPaths.get(canonicalRoot)
    this.watchedRemovedPaths.delete(canonicalRoot)
    const watchedChangedPaths = this.watchedChangedPaths.get(canonicalRoot)
    this.watchedChangedPaths.delete(canonicalRoot)
    const resetTypeEngine = this.typeEngineResetRoots.delete(canonicalRoot)

    return {
      rootPath,
      documents,
      projectMembership,
      removedPaths: [...new Set([
        ...(watchedRemovedPaths ?? []),
        ...closureResult.removedPaths,
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
        dependencyClosureCacheHit: closureResult.cacheHit,
        queryCacheHit: false,
        loadedDocumentCount: documents.length,
        syntaxReady: current.available,
      },
    }
  }

  private loadCurrent(filePath: string, position: SemanticDocumentPosition): DocumentRecord {
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
        return cached
      }
      const generation = requestedGeneration ?? ((cached?.contentGeneration ?? 0) + 1)
      return this.store(filePath, position.content, generation, null, true)
    }

    if (cached?.overlay) {
      cached.lastAccess = ++this.accessClock
      return cached
    }
    return this.loadFromDisk(filePath, cached)
  }

  private projectMembership(rootPath: string): ProjectMembershipSnapshot {
    const resolvedRoot = path.resolve(rootPath)
    const canonicalRoot = canonicalWorkspaceRoot(resolvedRoot)
    const cached = this.projectFileSets.get(canonicalRoot)
    if (cached) {
      this.projectFileSets.delete(canonicalRoot)
      this.projectFileSets.set(canonicalRoot, cached)
      return publicProjectMembership(cached)
    }
    const overlayPaths = [...this.documents.values()]
      .filter((record) => record.overlay && isInside(canonicalRoot, canonicalSourcePath(record.path)))
      .map((record) => record.path)
      .sort()
    const paths: string[] = []
    const seen = new Set<string>()
    let pathBytes = 0
    let status: ProjectMembershipSnapshot["status"] = "complete"
    let reason: ProjectMembershipSnapshot["reason"]
    const accept = (candidate: string): boolean => {
      const sourcePath = path.resolve(candidate)
      if (seen.has(sourcePath)) return true
      seen.add(sourcePath)
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
      paths.push(sourcePath)
      pathBytes += bytes
      return true
    }
    for (const overlayPath of overlayPaths) {
      if (!accept(overlayPath)) break
    }
    if (status === "complete") {
      try {
        for (const sourcePath of this.enumerateWorkspaceSources(resolvedRoot)) {
          if (!accept(sourcePath)) break
        }
      } catch {
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
      revision: ++this.projectMembershipRevision,
    }
    this.projectFileSets.set(canonicalRoot, entry)
    while (this.projectFileSets.size > this.maxProjectFileSetRoots) {
      const oldestRoot = this.projectFileSets.keys().next().value
      if (oldestRoot === undefined) break
      this.projectFileSets.delete(oldestRoot)
    }
    return publicProjectMembership(entry)
  }

  private includeOpenedProjectSource(rootPath: string | undefined, filePath: string): void {
    if (!rootPath || !SOURCE_EXTENSIONS.includes(path.extname(filePath))) return
    const canonicalRoot = canonicalWorkspaceRoot(rootPath)
    const entry = this.projectFileSets.get(canonicalRoot)
    const paths = entry?.paths
    const resolvedPath = path.resolve(filePath)
    const comparablePath = canonicalSourcePath(resolvedPath)
    if (!entry || !paths || paths.includes(resolvedPath) || !isInside(canonicalRoot, comparablePath)) return
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

  private loadFromDisk(filePath: string, cached?: DocumentRecord): DocumentRecord {
    if (cached?.overlay) {
      cached.lastAccess = ++this.accessClock
      return cached
    }
    const stat = safeStat(filePath)
    const fingerprint = stat ? `${stat.mtimeMs}:${stat.size}` : null
    if (cached && fingerprint !== null && cached.diskFingerprint === fingerprint) {
      cached.lastAccess = ++this.accessClock
      return cached
    }
    const content = safeRead(filePath)
    if (content === null) {
      if (cached && !cached.available && cached.diskFingerprint === fingerprint) return cached
      return this.store(
        filePath,
        "",
        (cached?.contentGeneration ?? 0) + 1,
        fingerprint,
        false,
        undefined,
        false,
      )
    }
    return this.store(filePath, content, (cached?.contentGeneration ?? 0) + 1, fingerprint, true, undefined, false)
  }

  private collectDependencyClosure(
    current: DocumentRecord,
    currentCacheHit: boolean,
  ): DependencyClosureResult {
    const changedPaths = new Set<string>()
    const removedPaths = new Set<string>()
    const cached = this.reuseDependencyClosure(
      current,
      currentCacheHit,
      changedPaths,
      removedPaths,
    )
    if (cached) return { entries: cached, cacheHit: true, removedPaths: [] }

    const result: Array<{ record: DocumentRecord; cacheHit: boolean }> = [
      { record: current, cacheHit: currentCacheHit },
    ]
    const queued = [current]
    const visited = new Set([current.path])
    let totalBytes = Buffer.byteLength(current.content)
    let complete = true

    while (queued.length > 0 && result.length < MAX_CLOSURE_DOCUMENTS) {
      const source = queued.shift()
      if (!source) break
      const resolved = resolveRelativeImports(source.path, source.content)
      complete &&= resolved.complete
      for (const dependencyPath of resolved.paths) {
        if (visited.has(dependencyPath)) continue
        visited.add(dependencyPath)
        const before = this.documents.get(dependencyPath)
        const dependency = this.loadFromDisk(dependencyPath, before)
        const bytes = Buffer.byteLength(dependency.content)
        if (totalBytes + bytes > MAX_CLOSURE_BYTES) continue
        totalBytes += bytes
        result.push({
          record: dependency,
          cacheHit: before === dependency && !changedPaths.has(dependencyPath),
        })
        queued.push(dependency)
        if (result.length >= MAX_CLOSURE_DOCUMENTS) break
      }
    }
    if (complete) {
      this.dependencyClosures.set(current.path, {
        contentGeneration: current.contentGeneration,
        paths: result.map(({ record }) => record.path),
      })
    } else {
      this.dependencyClosures.delete(current.path)
    }
    return { entries: result, cacheHit: false, removedPaths: [...removedPaths] }
  }

  private reuseDependencyClosure(
    current: DocumentRecord,
    currentCacheHit: boolean,
    changedPaths: Set<string>,
    removedPaths: Set<string>,
  ): Array<{ record: DocumentRecord; cacheHit: boolean }> | null {
    const cached = this.dependencyClosures.get(current.path)
    if (!currentCacheHit || cached?.contentGeneration !== current.contentGeneration) return null

    const entries = [{ record: current, cacheHit: true }]
    for (const dependencyPath of cached.paths.slice(1)) {
      const before = this.documents.get(dependencyPath)
      const dependency = this.loadFromDisk(dependencyPath, before)
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
  ): DocumentRecord {
    const previous = this.documents.get(filePath)
    if (previous) this.cachedBytes -= Buffer.byteLength(previous.content)
    const record = {
      path: filePath,
      content,
      contentGeneration,
      documentVersion,
      diskFingerprint,
      lastAccess: ++this.accessClock,
      available,
      overlay,
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
      .filter((record) => record.path !== currentPath && !protectedPaths.has(record.path))
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

function boundedLimit(value: number | undefined, hardMaximum: number, label: string): number {
  if (value === undefined) return hardMaximum
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} limit must be a positive safe integer`)
  }
  return Math.min(value, hardMaximum)
}

function publicProjectMembership(entry: ProjectFileSetCacheEntry): ProjectMembershipSnapshot {
  return {
    paths: [...entry.paths],
    status: entry.status,
    ...(entry.reason ? { reason: entry.reason } : {}),
    revision: entry.revision,
  }
}

function* listWorkspaceSourcePaths(rootPath: string): Generator<string> {
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
      if (entry.name === ".arkline" || entry.name === ".git" || entry.name === "build"
        || entry.name === "node_modules" || entry.name === "oh_modules") continue
      const entryPath = path.resolve(current.path, entry.name)
      if (entry.isDirectory()) {
        pending.push({ path: entryPath, directory: fs.opendirSync(entryPath) })
      }
      else if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) yield entryPath
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
): { paths: string[]; complete: boolean } {
  const specifiers = [...content.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier?.startsWith(".")))
  const resolved = specifiers.map((specifier) => resolveImportPath(documentPath, specifier))
  return {
    paths: resolved.flat(),
    complete: resolved.every((matches) => matches.length > 0),
  }
}

function resolveImportPath(documentPath: string, specifier: string): string[] {
  const basePath = path.resolve(path.dirname(documentPath), specifier)
  const candidates = path.extname(basePath)
    ? [basePath]
    : [
        ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => path.join(basePath, `index${extension}`)),
      ]
  return candidates.filter((candidate, index) => index === candidates.findIndex((value) => value === candidate))
    .filter((candidate) => safeStat(candidate)?.isFile())
    .slice(0, 1)
}

function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch {
    return null
  }
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath)
  } catch {
    return null
  }
}
