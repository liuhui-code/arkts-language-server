export interface WorkspaceContentDelta {
  readonly rootPath: string
  readonly fromRevision: number
  readonly toRevision: number
  readonly changedPaths: readonly string[]
}

interface RootChanges {
  revision: number
  resetEpoch: number
  resetRequested: boolean
  changed: Set<string>
  removed: Set<string>
  span?: Omit<WorkspaceContentDelta, "changedPaths">
  spanBlocked?: boolean
}

/** Owns the store's bounded one-shot deltas and durable revision/reset fences. */
export class WorkspaceContentChanges {
  private readonly roots = new Map<string, RootChanges>()

  constructor(private readonly maxRemoved: number, private readonly maxChanged: number) {}

  advance(root: string, compatibleLexicalRoot?: string): void {
    const changes = this.root(root)
    const fromRevision = changes.revision++
    if (!compatibleLexicalRoot || changes.spanBlocked || changes.resetRequested
      || (changes.span && changes.span.rootPath !== compatibleLexicalRoot)) {
      changes.span = undefined
      changes.spanBlocked = true
      return
    }
    changes.span = { rootPath: compatibleLexicalRoot,
      fromRevision: changes.span?.fromRevision ?? fromRevision, toRevision: changes.revision }
  }

  hasReset(root: string): boolean {
    return this.roots.get(root)?.resetRequested === true
  }

  reset(root: string): void {
    const changes = this.root(root)
    if (changes.resetRequested) return
    changes.resetRequested = true
    changes.resetEpoch += 1
  }

  markRemoved(root: string, filePath: string): void {
    this.mark(root, filePath, "removed", this.maxRemoved)
  }

  markChanged(root: string, filePath: string): void {
    this.mark(root, filePath, "changed", this.maxChanged)
  }

  take(root: string) {
    const changes = this.roots.get(root)
    const result = {
      contentRevision: changes?.revision ?? 0,
      typeEngineResetEpoch: changes?.resetEpoch ?? 0,
      resetTypeEngine: changes?.resetRequested ?? false,
      changedPaths: [...(changes?.changed ?? [])],
      removedPaths: [...(changes?.removed ?? [])],
      contentDelta: changes?.span && !changes.resetRequested && changes.removed.size === 0
        ? Object.freeze({ ...changes.span, changedPaths: Object.freeze([...changes.changed]) })
        : undefined,
    }
    if (changes) {
      changes.changed.clear()
      changes.removed.clear()
      changes.resetRequested = false
      changes.span = undefined
      changes.spanBlocked = false
    }
    return result
  }

  clear(): void {
    this.roots.clear()
  }

  private mark(root: string, filePath: string, kind: "removed" | "changed", maximum: number): void {
    const changes = this.root(root)
    if (changes.resetRequested) return
    const paths = changes[kind]
    if (!paths.has(filePath) && paths.size >= maximum) {
      paths.clear()
      this.reset(root)
      return
    }
    paths.add(filePath)
  }

  private root(root: string): RootChanges {
    let changes = this.roots.get(root)
    if (!changes) {
      changes = { revision: 0, resetEpoch: 0, resetRequested: false,
        changed: new Set(), removed: new Set() }
      this.roots.set(root, changes)
    }
    return changes
  }
}
