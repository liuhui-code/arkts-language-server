import { observeManagedDirectory, sameManagedDirectory } from "../core/workspace/managed-source-namespaces.js"
import type { ManagedSourceDirectory } from "../contracts/managed-source-namespace.js"
import { relativePathWithinRoot } from "../project/path-identity.js"
import type { AttestedCacheNamespace } from "./managed-cache-namespace.js"
import { SidecarRequestError, type SidecarSession } from "./sidecar-session.js"

function current(namespace: AttestedCacheNamespace): boolean {
  try { return sameManagedDirectory(namespace.source, observeManagedDirectory(namespace.source.directory)) }
  catch { return false }
}
interface Owner {
  rootUri: string; rootPath: string; session: SidecarSession
  namespace?: AttestedCacheNamespace
  sourceKey: string; nativeKey: string; started: boolean
}
/** The owner of a leaf and the source roots containing it are separate relations.
 * Retain attested roles across optional process failure; close/replacement revoke them.
 */
export class WorkspaceCacheNamespaces {
  private readonly owners = new Map<string, Owner>()
  constructor(private readonly changed?: (root: string, directories: readonly ManagedSourceDirectory[]) => Promise<void>,
    private readonly reconcile?: (root: string) => void) {}

  async add(id: string, rootUri: string, rootPath: string, session: SidecarSession,
    namespace: AttestedCacheNamespace | undefined): Promise<void> {
    this.owners.set(id, { rootUri, rootPath, session, namespace, sourceKey: "[]", nativeKey: "[]", started: false })
    await this.publish()
  }
  needsOpeningBarrier(id: string): boolean {
    const owner = this.owners.get(id)
    return !!owner && !owner.started && owner.sourceKey !== "[]"
  }
  catalogStarting(id: string): void {
    const owner = this.owners.get(id)
    if (owner) owner.started = true
  }
  async remove(id: string): Promise<void> {
    const owner = this.owners.get(id)
    if (!owner) return
    this.owners.delete(id)
    const revoked = owner.sourceKey !== "[]" ? this.changed?.(owner.rootUri, []) : undefined
    await Promise.all([revoked, this.publish()])
  }
  private async publish(): Promise<void> {
    const leaves = [...new Map([...this.owners.values()].flatMap(owner => owner.namespace && current(owner.namespace)
      ? [[owner.namespace.source.directory, owner.namespace] as const] : [])).values()]
      .sort((a, b) => a.source.directory.localeCompare(b.source.directory))
    const changes: Promise<void>[] = []
    for (const owner of this.owners.values()) {
      const contained = leaves.filter(leaf => {
        const relative = relativePathWithinRoot(owner.rootPath, leaf.source.directory)
        return relative !== undefined && relative !== ""
      })
      const peers = contained.filter(leaf => leaf.native.workspaceIdentity !== owner.session.workspaceIdentity)
        .map(leaf => leaf.native)
      const nativeKey = JSON.stringify(peers)
      if (nativeKey !== owner.nativeKey) {
        if (!owner.session.versioned?.capability.sourceNamespaces) {
          throw new SidecarRequestError("unsupported_source_namespaces", "Native cannot attest cross-root source exclusions")
        }
        owner.session.versioned.sourceNamespacesChanged(peers)
        owner.nativeKey = nativeKey
        if (owner.started) this.reconcile?.(owner.rootUri)
      }
      const sources = contained.map(leaf => leaf.source), sourceKey = JSON.stringify(sources)
      if (sourceKey === owner.sourceKey) continue
      owner.sourceKey = sourceKey
      const changed = this.changed?.(owner.rootUri, sources)
      if (changed) changes.push(changed)
    }
    await Promise.all(changes)
  }
}
