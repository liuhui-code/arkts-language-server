import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { isArkUIStringResourcePath } from "../core/arkui/resource-path.js"

const SOURCE_EXTENSIONS = new Set([".ets", ".ts"])
const MAX_PENDING_PATHS = 1_024

type WorkspaceFileDomain = "source" | "arkui-resource"

export type WorkspaceFileChangeKind = "created" | "changed" | "deleted"

export interface WorkspaceFileChange {
  uri: string
  kind: WorkspaceFileChangeKind
}

export interface WorkspaceFileChangeBatch {
  rootUri: string
  rootDirty: boolean
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
}

interface WorkspaceRoot {
  uri: string
  path: string
  canonicalPath: string
  order: number
}

interface PendingChange extends WorkspaceFileChange {
  root: WorkspaceRoot
  canonicalPath: string
  domain: WorkspaceFileDomain
}

export class WorkspaceFileChangeCoordinator {
  private readonly roots: WorkspaceRoot[]
  private readonly maxPendingPaths: number
  private readonly pending = new Map<string, PendingChange>()
  private readonly sourceDirtyRoots = new Set<string>()
  private readonly resourceDirtyRoots = new Set<string>()

  constructor({ rootUris, maxPendingPaths }: WorkspaceFileChangeCoordinatorOptions) {
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
      if (!rootDirty && !resourceDirty) continue
      batches.set(root.canonicalPath, {
        rootUri: root.uri,
        rootDirty,
        ...(resourceDirty ? { resourceDirty: true } : {}),
        ...(resourceDirty ? { resourceChanged: true } : {}),
        changes: [],
      })
    }
    for (const change of this.pending.values()) {
      if (change.domain === "source" && this.sourceDirtyRoots.has(change.root.canonicalPath)) continue
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
    this.resourceDirtyRoots.clear()
    return result
  }

  private acceptOne(event: WorkspaceFileEvent): void {
    const candidatePath = filePath(event.uri)
    const kind = changeKind(event.type)
    if (candidatePath === undefined || kind === undefined) return
    const domain = workspaceFileDomain(candidatePath)
    if (!domain) return
    const candidateCanonicalPath = canonicalPath(candidatePath)
    const root = this.roots.find((entry) => isInside(entry.canonicalPath, candidateCanonicalPath))
    if (!root || this.isDirty(root, domain)) return

    const key = `${root.canonicalPath}\0${candidateCanonicalPath}`
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
      canonicalPath: candidateCanonicalPath,
      domain,
      uri: event.uri,
      kind,
    })
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
  if (SOURCE_EXTENSIONS.has(path.extname(filePath))) return "source"
  if (isArkUIStringResourcePath(filePath)) return "arkui-resource"
  return undefined
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
  const resolved = path.resolve(candidatePath)
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
