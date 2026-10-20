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
  history: readonly WorkspaceContentDelta[]
}

const EMPTY_HISTORY: readonly WorkspaceContentDelta[] = Object.freeze([])
const MAX_DELTA_HISTORY = 32

/** One-shot notifications and bounded immutable metadata for independent retained consumers. */
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
      changes.history = EMPTY_HISTORY
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
    changes.history = EMPTY_HISTORY
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
      if (result.contentDelta) {
        const previous = changes.history.at(-1)
        const history = previous && (previous.toRevision !== result.contentDelta.fromRevision
          || previous.rootPath !== result.contentDelta.rootPath) ? [] : [...changes.history]
        history.push(result.contentDelta)
        let paths = history.reduce((total, delta) => total + delta.changedPaths.length, 0)
        while (history.length > MAX_DELTA_HISTORY || paths > this.maxChanged) {
          paths -= history.shift()!.changedPaths.length
        }
        changes.history = Object.freeze(history)
      }
      changes.changed.clear()
      changes.removed.clear()
      changes.resetRequested = false
      changes.span = undefined
      changes.spanBlocked = false
    }
    return result
  }

  history(root: string): readonly WorkspaceContentDelta[] {
    return this.roots.get(root)?.history ?? EMPTY_HISTORY
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
        changed: new Set(), removed: new Set(), history: EMPTY_HISTORY }
      this.roots.set(root, changes)
    }
    return changes
  }
}
