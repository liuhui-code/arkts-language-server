import { fileURLToPath } from "node:url"
import type { ManagedSourceDirectory } from "../contracts/managed-source-namespace.js"
import type { SemanticWorkspaceFileChangeBatch } from "../contracts/semantic-engine.js"
import { ManagedSourceNamespaces } from "../core/workspace/managed-source-namespaces.js"

/** Stage an index owner's policy without restarting the SDK or losing it on Worker replacement. */
export class WorkerManagedSourceNamespaces {
  readonly sources = new ManagedSourceNamespaces()
  private readonly revisions = new Map<string, number>()
  async update(rootUri: string, directories: readonly ManagedSourceDirectory[] | null, settle: () => Promise<void>,
    changed: (batch: SemanticWorkspaceFileChangeBatch) => void, disposed: () => boolean): Promise<void> {
    if (disposed() || (directories === null && !this.revisions.has(rootUri))) return
    const revision = (this.revisions.get(rootUri) ?? 0) + 1
    this.revisions.set(rootUri, revision)
    // Only an already running initialization is allowed to settle; never start
    // preparation here and never make SDK preparation wait for index progress.
    await settle()
    if (disposed() || this.revisions.get(rootUri) !== revision) return
    const rootPath = fileURLToPath(rootUri)
    this.sources.replace(rootPath, directories ?? [])
    changed({ rootUri, rootDirty: true, managedSourceNamespaces: directories ?? [], changes: [] })
  }
  clear(): void { this.sources.clear(); this.revisions.clear() }
}
