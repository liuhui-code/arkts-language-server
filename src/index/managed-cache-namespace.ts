import { createHash } from "node:crypto"
import path from "node:path"
import type { ManagedSourceDirectory } from "../contracts/managed-source-namespace.js"
import { observeManagedDirectory, sameManagedDirectory } from "../core/workspace/managed-source-namespaces.js"
import { relativePathWithinRoot, samePhysicalPath } from "../project/path-identity.js"
import { asRecord, SidecarProtocolError } from "./sidecar-protocol-validation.js"
import type { SidecarSession } from "./sidecar-session.js"

export interface NativeProof { directory: string; workspaceIdentity: string; objectId: string }
function proof(value: unknown, workspaceIdentity: string): NativeProof {
  const row = asRecord(value)
  if (Object.keys(row).sort().join(",") !== "directory,objectId,workspaceIdentity"
    || typeof row.directory !== "string" || !path.isAbsolute(row.directory)
    || row.workspaceIdentity !== workspaceIdentity || typeof row.objectId !== "string"
    || !row.objectId.length || row.objectId.length > 256) {
    throw new SidecarProtocolError("invalid managed cache namespace proof")
  }
  return row as unknown as NativeProof
}

/** Attest only the actual opened Native leaf, bracketing its live proof with Node identities.
 * Native keeps the directory object pinned. No metadata file can grant this ownership.
 */
export interface AttestedCacheNamespace { source: ManagedSourceDirectory; native: NativeProof }
export async function attestManagedCacheNamespace(session: SidecarSession, initialized: Record<string, unknown>,
  cacheDirectory: string): Promise<AttestedCacheNamespace | undefined> {
  if (!Object.hasOwn(initialized, "managedCache")) return undefined // Older scripted/legacy adapters have no authority.
  const first = proof(initialized.managedCache, session.workspaceIdentity)
  const key = createHash("sha256").update("arkts-index-cache\0v2\0").update(session.workspaceIdentity).digest("hex")
  const expected = path.join(cacheDirectory, "workspaces", key)
  if (!samePhysicalPath(first.directory, expected)) throw new SidecarProtocolError("wrong managed cache namespace path")
  const before = observeManagedDirectory(expected)
  const again = proof(await session.request("cache/namespace", {}), session.workspaceIdentity)
  const after = observeManagedDirectory(expected)
  if (first.objectId !== again.objectId || !samePhysicalPath(first.directory, again.directory)
    || !sameManagedDirectory(before, after)) throw new SidecarProtocolError("managed cache namespace changed during admission")
  return { source: before, native: again }
}

/** Compatibility helper for the original single-root admission boundary. */
export async function readManagedCacheNamespace(session: SidecarSession, initialized: Record<string, unknown>,
  workspaceRoot: string, cacheDirectory: string): Promise<ManagedSourceDirectory | undefined> {
  const namespace = await attestManagedCacheNamespace(session, initialized, cacheDirectory)
  if (!namespace) return undefined
  const relative = relativePathWithinRoot(workspaceRoot, namespace.source.directory)
  return relative === undefined || relative === "" ? undefined : namespace.source
}
