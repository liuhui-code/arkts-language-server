import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { isArkUIStringResourceCandidate, isArkUIStringResourcePath } from "../core/arkui/resource-path.js"
import { relativePathWithinRoot } from "../project/path-identity.js"

const SOURCE_EXTENSIONS = new Set([".ets", ".ts"])
const MAX_PENDING_PATHS = 1_024

type WorkspaceFileDomain = "source" | "arkui-resource"

export type WorkspaceFileChangeKind = "created" | "changed" | "deleted"

export interface WorkspaceFileChange {
  uri: string
  kind: WorkspaceFileChangeKind
}

export interface WorkspaceFileChangeBatch {
  catalogRulesChanged?: boolean
  namespaceUncertain?: boolean
  rootUri: string
  rootDirty: boolean
  configurationChanged?: boolean
  resourceDirty?: boolean
  resourceChanged?: boolean
  changes: WorkspaceFileChange[]
}

export interface WorkspaceFileEvent {
  uri: string
  type: number
}

export interface WorkspaceFileChangeCoordinatorOptions {
  rootUris: string[]
  maxPendingPaths?: number
  isResourceFile?: (rootUri: string, fileUri: string) => boolean
  isSourceNamespace?: (rootUri: string, fileUri: string) => boolean
  isManagedCachePath?: (rootUri: string, fileUri: string) => boolean
}

interface WorkspaceRoot {
  uri: string
  path: string
  canonicalPath: string
  order: number
}

interface PendingChange extends WorkspaceFileChange {
  root: WorkspaceRoot
  domain: WorkspaceFileDomain | "catalog-rules"
}

export class WorkspaceFileChangeCoordinator {
  private readonly roots: WorkspaceRoot[]
  private readonly maxPendingPaths: number
  private readonly pending = new Map<string, PendingChange>()
  private readonly sourceDirtyRoots = new Set<string>()
  private readonly configurationChangedRoots = new Set<string>()
  private readonly catalogRuleRoots = new Set<string>()
  private readonly namespaceDirtyRoots = new Set<string>()
  private readonly resourceDirtyRoots = new Set<string>()
  private readonly isManagedCachePath: WorkspaceFileChangeCoordinatorOptions["isManagedCachePath"]
  private readonly isSourceNamespace: WorkspaceFileChangeCoordinatorOptions["isSourceNamespace"]
  private readonly isResourceFile: WorkspaceFileChangeCoordinatorOptions["isResourceFile"]

  constructor({ rootUris, maxPendingPaths, isResourceFile, isSourceNamespace, isManagedCachePath }: WorkspaceFileChangeCoordinatorOptions) {
    this.isResourceFile = isResourceFile
    this.isSourceNamespace = isSourceNamespace
    this.isManagedCachePath = isManagedCachePath
    this.roots = rootUris
      .flatMap((uri, order) => {
        const rootPath = filePath(uri)
        return rootPath === undefined
          ? []
          : [{
              uri,
              path: path.resolve(rootPath),
              canonicalPath: canonicalPath(rootPath),
              order,
            }]
      })
      .sort((left, right) => right.canonicalPath.length - left.canonicalPath.length)
    this.maxPendingPaths = boundedLimit(maxPendingPaths, MAX_PENDING_PATHS)
  }

  accept(events: readonly WorkspaceFileEvent[]): void {
    for (const event of events) this.acceptOne(event)
  }

  drain(): WorkspaceFileChangeBatch[] {
    const batches = new Map<string, WorkspaceFileChangeBatch>()
    for (const root of this.roots) {
      const rootDirty = this.sourceDirtyRoots.has(root.canonicalPath)
      const resourceDirty = this.resourceDirtyRoots.has(root.canonicalPath)
      const rulesChanged = this.catalogRuleRoots.has(root.canonicalPath)
      if (!rootDirty && !resourceDirty && !rulesChanged) continue
      batches.set(root.canonicalPath, {
        rootUri: root.uri,
        rootDirty,
        ...(rulesChanged ? { catalogRulesChanged: true } : {}),
        ...(this.namespaceDirtyRoots.has(root.canonicalPath) ? { namespaceUncertain: true } : {}),
        ...(this.configurationChangedRoots.has(root.canonicalPath) ? { configurationChanged: true } : {}),
        ...(resourceDirty ? { resourceDirty: true } : {}),
        ...(resourceDirty ? { resourceChanged: true } : {}),
        changes: [],
      })
    }
    for (const change of this.pending.values()) {
      if (change.domain !== "arkui-resource" && this.sourceDirtyRoots.has(change.root.canonicalPath)) continue
      if (
        change.domain === "arkui-resource"
        && this.resourceDirtyRoots.has(change.root.canonicalPath)
      ) continue
      let batch = batches.get(change.root.canonicalPath)
      if (!batch) {
        batch = {
          rootUri: change.root.uri,
          rootDirty: false,
          changes: [],
        }
        batches.set(change.root.canonicalPath, batch)
      }
      if (change.domain === "arkui-resource") batch.resourceChanged = true
      batch.changes.push({ uri: change.uri, kind: change.kind })
    }
    const result = [...batches.entries()]
      .sort(([left], [right]) => this.rootOrder(left) - this.rootOrder(right))
      .map(([, batch]) => batch)
    this.pending.clear()
    this.sourceDirtyRoots.clear()
    this.configurationChangedRoots.clear()
    this.catalogRuleRoots.clear()
    this.namespaceDirtyRoots.clear()
    this.resourceDirtyRoots.clear()
    return result
  }

  private acceptOne(event: WorkspaceFileEvent): void {
    const candidatePath = filePath(event.uri)
    const kind = changeKind(event.type)
    if (candidatePath === undefined || kind === undefined) return
    if (this.roots.some(root => this.isManagedCachePath?.(root.uri, event.uri) === true)) return
    if (this.acceptNamespaceEvent(candidatePath, kind, false)) return
    const lexical = path.resolve(candidatePath)
    const ruleRoot = this.roots.find(root => {
      const relative = relativePathWithinRoot(root.path, lexical)
        ?? relativePathWithinRoot(root.canonicalPath, lexical)
      return relative !== undefined && (path.basename(lexical).toLowerCase() === ".gitignore"
        || relative.split(path.sep).join("/").toLowerCase() === ".git/info/exclude")
    })
    if (ruleRoot) {
      this.catalogRuleRoots.add(ruleRoot.canonicalPath)
      // A missing rules path does not prove it used to be a regular file.
      if (kind === "deleted" && this.acceptNamespaceEvent(candidatePath, kind)) return
      if (this.sourceDirtyRoots.has(ruleRoot.canonicalPath)) return
      const key = `${ruleRoot.canonicalPath}\0${lexical}`
      if (!this.pending.has(key) && this.pending.size >= this.maxPendingPaths) {
        this.markRootDirty(ruleRoot, "source")
      } else this.pending.set(key, { root: ruleRoot, domain: "catalog-rules", uri: event.uri, kind })
      return
    }
    const domain = workspaceFileDomain(candidatePath)
    // A deleted non-source entry has no remaining kind evidence. Resource file
    // names can also name directories; do not hide namespace changes as UI-only.
    if (kind === "deleted" && domain !== "source"
      && this.acceptNamespaceEvent(candidatePath, kind)) return
    if (!domain) { this.acceptNamespaceEvent(candidatePath, kind, true, true); return }
    const candidateLexicalPath = path.resolve(candidatePath)
    const candidateCanonicalPath = physicalPathWithMissingTail(candidatePath)
    if (candidateCanonicalPath === undefined && !isProjectConfiguration(candidatePath)) {
      const uncertain = this.roots.find(entry => isInside(entry.path, candidateLexicalPath)
        || isInside(entry.canonicalPath, candidateLexicalPath))
      if (uncertain) this.markRootDirty(uncertain, domain)
      return
    }
    // Configuration links belong to the workspace path the client watched. Source
    // and resource events still require physical containment in the workspace.
    const root = isProjectConfiguration(candidatePath)
      ? this.roots.find((entry) => isInside(entry.path, candidateLexicalPath))
        ?? this.roots.find((entry) => isInside(entry.canonicalPath,
          path.join(canonicalPath(path.dirname(candidateLexicalPath)), path.basename(candidateLexicalPath))))
      : this.roots.find((entry) => isInside(entry.canonicalPath, candidateCanonicalPath!))
    if (!root) return
    if (isProjectConfiguration(candidatePath)) {
      this.configurationChangedRoots.add(root.canonicalPath)
      this.markRootDirty(root, "source")
      return
    }
    if (domain === "arkui-resource" && this.acceptNamespaceEvent(candidatePath, kind, true, true)) return
    if (this.isDirty(root, domain)) return
    if (domain === "arkui-resource" && !(this.isResourceFile
      ? this.isResourceFile(root.uri, event.uri)
      : isArkUIStringResourcePath(candidatePath))) return

    const key = `${root.canonicalPath}\0${candidateLexicalPath}`
    const existing = this.pending.get(key)
    if (existing) {
      existing.uri = event.uri
      existing.kind = kind
      return
    }
    if (this.pending.size >= this.maxPendingPaths) {
      this.markRootDirty(root, domain)
      return
    }
    this.pending.set(key, {
      root,
      domain,
      uri: event.uri,
      kind,
    })
  }

  /** Opaque directory/removed-entry signals require a census, never guessed file deletion.
   * Only the root is invalidated; no uncertain URI is admitted as a source fact. */
  private acceptNamespaceEvent(candidate: string, kind: WorkspaceFileChangeKind, allowMissing = true, allowRegular = false): boolean {
    let unknown = false
    const lexical = path.resolve(candidate)
    const registeredRoot = this.roots.some(entry => relativePathWithinRoot(entry.path, lexical) === ""
      || relativePathWithinRoot(entry.canonicalPath, lexical) === "")
    try {
      const stat = fs.lstatSync(candidate)
      if (!allowRegular && !stat.isDirectory() && !(registeredRoot && stat.isSymbolicLink() && fs.statSync(candidate).isDirectory())) return false
    }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT" && (!allowMissing || kind !== "deleted")) return false
      unknown = code !== "ENOENT"
    }
    const physical = physicalPathWithMissingTail(candidate)
    const root = this.roots.find(entry => physical !== undefined
      ? relativePathWithinRoot(entry.canonicalPath, physical) === "" || isInside(entry.canonicalPath, physical)
      : unknown && (lexical === entry.path || isInside(entry.path, lexical)))
      ?? (allowRegular ? this.roots.find(entry => isInside(entry.path, lexical)
        || isInside(entry.canonicalPath, lexical)) : undefined)
    if (!root) return false
    if (allowRegular && this.isSourceNamespace) {
      try { if (this.isSourceNamespace(root.uri, pathToFileURL(candidate).href) === false) return false }
      catch { /* Unknown input domain remains namespace uncertainty. */ }
    }
    this.namespaceDirtyRoots.add(root.canonicalPath)
    this.markRootDirty(root, "source")
    this.markRootDirty(root, "arkui-resource")
    return true
  }

  private isDirty(root: WorkspaceRoot, domain: WorkspaceFileDomain): boolean {
    return domain === "source"
      ? this.sourceDirtyRoots.has(root.canonicalPath)
      : this.resourceDirtyRoots.has(root.canonicalPath)
  }

  private markRootDirty(root: WorkspaceRoot, domain: WorkspaceFileDomain): void {
    const dirtyRoots = domain === "source" ? this.sourceDirtyRoots : this.resourceDirtyRoots
    dirtyRoots.add(root.canonicalPath)
    for (const [key, change] of this.pending) {
      if (change.root.canonicalPath === root.canonicalPath && change.domain === domain) {
        this.pending.delete(key)
      }
    }
  }

  private rootOrder(canonicalRoot: string): number {
    return this.roots.find((root) => root.canonicalPath === canonicalRoot)?.order
      ?? Number.MAX_SAFE_INTEGER
  }
}

function workspaceFileDomain(filePath: string): WorkspaceFileDomain | undefined {
  if (isProjectConfiguration(filePath)) return "source"
  if (SOURCE_EXTENSIONS.has(path.extname(filePath))) return "source"
  if (isArkUIStringResourceCandidate(filePath)) return "arkui-resource"
  return undefined
}

function isProjectConfiguration(filePath: string): boolean {
  const name = path.basename(filePath)
  return name === "oh-package.json5" || name === "oh-package-lock.json5"
    || name === "build-profile.json5" || name === "local.properties"
}

function filePath(uri: string): string | undefined {
  try {
    const parsed = new URL(uri)
    return parsed.protocol === "file:" ? fileURLToPath(parsed) : undefined
  } catch {
    return undefined
  }
}

function canonicalPath(candidatePath: string): string {
  return physicalPathWithMissingTail(candidatePath) ?? path.resolve(candidatePath)
}

/** Missing path components can be reconstructed through a proven ancestor.
 * A dangling link, permission/IO error or non-directory is unknown, never proof
 * that a source disappeared. An existing outside link still resolves outside.
 */
function physicalPathWithMissingTail(candidatePath: string): string | undefined {
  let cursor = path.resolve(candidatePath)
  const missing: string[] = []
  for (;;) {
    try { return path.join(fs.realpathSync.native(cursor), ...missing) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined
      try { fs.lstatSync(cursor); return undefined }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined }
      const parent = path.dirname(cursor)
      if (parent === cursor) return undefined
      missing.unshift(path.basename(cursor))
      cursor = parent
    }
  }
}

function isInside(rootPath: string, candidatePath: string): boolean {
  const relative = relativePathWithinRoot(rootPath, candidatePath)
  return relative !== undefined && relative.length > 0
}

function changeKind(type: number): WorkspaceFileChangeKind | undefined {
  if (type === 1) return "created"
  if (type === 2) return "changed"
  if (type === 3) return "deleted"
  return undefined
}

function boundedLimit(value: number | undefined, hardMaximum: number): number {
  if (value === undefined) return hardMaximum
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("pending watched paths limit must be a positive safe integer")
  }
  return Math.min(value, hardMaximum)
}
