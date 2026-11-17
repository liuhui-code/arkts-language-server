import { captureCompleteMembershipProof, type CompleteMembershipProof } from "./complete-membership-proof.js"
import type { ManagedSourceNamespaces } from "./managed-source-namespaces.js"
import fs from "node:fs"
import path from "node:path"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { SemanticOperationControl } from "./document-store.js"
import type { ProjectMembershipSnapshot } from "./semantic-workspace-view.js"
import { canonicalWorkspaceRoot } from "./physical-path-identity.js"
import { createProjectSourceEligibility } from "./project-source-eligibility.js"
import { listWorkspaceSourcePaths, unresolvedSourceEntries, WorkspaceNamespaceWitness } from "./workspace-source-enumerator.js"
import { MAX_DISK_SNAPSHOT_BYTES, sourceStatIdentity } from "./workspace-disk-source.js"

export interface ProjectFileSetCacheEntry extends Omit<ProjectMembershipSnapshot, "paths"> {
  paths: string[]
  readonly scanRoot?: string
  pathBytes: number
  diskIdentities: Map<string, string>
  publicSnapshot?: ProjectMembershipSnapshot
  completeProof?: CompleteMembershipProof
  capacityProof?: { readonly directories: WorkspaceNamespaceWitness; readonly overlays: readonly string[] }
}

/** Membership is authoritative metadata, not a source-body cache. Only an
 * explicitly configured admission limit may truncate this catalog. The existing
 * source delivery, parsing and residency policies own their respective budgets. */
export function projectMembershipLimit(value: number | undefined, label: string): number {
  if (value === undefined) return Number.POSITIVE_INFINITY
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} limit must be a positive safe integer`)
  }
  return value
}

/** Enumerate authoritative membership; only observed directory namespaces certify a capacity failure. */
export function scanProjectMembership(rootPath: string, overlays: readonly string[], options: {
  readonly managedSources?: ManagedSourceNamespaces
  readonly resolver: LocalPackageResolver
  readonly control: SemanticOperationControl
  readonly maxPaths: number
  readonly maxPathBytes: number
  readonly enumerate?: (rootPath: string) => Iterable<string>
  readonly previous?: ProjectFileSetCacheEntry
}): ProjectFileSetCacheEntry {
  const resolvedRoot = path.resolve(rootPath)
  const canonicalRoot = canonicalWorkspaceRoot(resolvedRoot)
  const { control, resolver, managedSources, enumerate, maxPaths, maxPathBytes, previous } = options
  if (!enumerate && previous?.completeProof?.current(previous, overlays, control)) return previous
  const model = resolver.projectFor(resolvedRoot)
  const managedGeneration = managedSources?.generation
  const eligibility = createProjectSourceEligibility(model, () => control.checkpoint())
  const namespaces = enumerate ? undefined : new WorkspaceNamespaceWitness(maxPathBytes)
  const managed = managedSources?.view(resolvedRoot)
  const includes = (source: string, directory: boolean, physical?: string) =>
    !managed?.excluded(source, physical) && eligibility.includes(source, directory, physical)
  const paths: string[] = [], seen = new Set<string>()
  const diskIdentities = new Map<string, string>()
  let pathBytes = 0
  let status: ProjectMembershipSnapshot["status"] = "complete"
  let reason: ProjectMembershipSnapshot["reason"]
  const accept = (candidate: string, diskIdentity?: string, physicalPath?: string): boolean => {
    const sourcePath = path.resolve(candidate)
    if (!includes(sourcePath, false, physicalPath)) return true
    if (seen.has(sourcePath)) {
      if (diskIdentity !== undefined) diskIdentities.set(sourcePath, diskIdentity)
      return true
    }
    if (paths.length >= maxPaths) { status = "partial"; reason = "path-count-limit"; return false }
    const bytes = Buffer.byteLength(sourcePath)
    if (pathBytes + bytes > maxPathBytes) { status = "partial"; reason = "path-byte-limit"; return false }
    seen.add(sourcePath)
    paths.push(sourcePath)
    pathBytes += bytes
    if (diskIdentity !== undefined) diskIdentities.set(sourcePath, diskIdentity)
    return true
  }
  for (const overlay of overlays) if (!accept(overlay)) break
  if (status === "complete") {
    try {
      const entries = enumerate ? unresolvedSourceEntries(enumerate(resolvedRoot))
        : listWorkspaceSourcePaths(resolvedRoot, control, includes, canonicalRoot,
          directory => namespaces!.observe(directory))
      for (const { path: sourcePath, physicalPath } of entries) {
        control.checkpoint()
        const stat = safeLstat(sourcePath, control)
        if (stat?.isSymbolicLink()) continue
        if (!stat?.isFile() || stat.size > MAX_DISK_SNAPSHOT_BYTES) {
          status = "partial"; reason = "source-unavailable"; break
        }
        if (!accept(sourcePath, sourceStatIdentity(stat), physicalPath)) break
      }
      eligibility.validate()
      managed?.validate()
    } catch {
      control.checkpoint()
      status = "partial"; reason = "enumeration-error"
    }
  }
  paths.sort()
  control.checkpoint()
  const entry: ProjectFileSetCacheEntry = { scanRoot: resolvedRoot, paths, pathBytes, status, ...(reason ? { reason } : {}), revision: 0, diskIdentities,
    ...(namespaces && (reason === "path-count-limit" || reason === "path-byte-limit")
      // Disk-backed members remain members when an overlay opens/closes. Only
      // overlay-only members used by this enumeration must remain authoritative.
      ? { capacityProof: { directories: namespaces, overlays: overlays.filter(file => !diskIdentities.has(file)) } } : {}) }
  if (status === "complete" && namespaces?.canProveCompleteScope() && eligibility.retainable()) {
    const configuration = model.captureConfigurationProof(() => control.checkpoint())
    if (configuration) entry.completeProof = captureCompleteMembershipProof(entry, namespaces, () => {
      // Package lookup epochs can rotate while membership inputs stay identical.
      // Model identity, original configuration facts and physical scope stay authoritative.
      if (resolver.projectFor(resolvedRoot) !== model
        || managedSources?.generation !== managedGeneration) return false
      eligibility.validate()
      managed?.validate()
      return configuration.current(() => control.checkpoint())
    }, () => control.checkpoint())
  }
  return entry
}

function safeLstat(file: string, control: SemanticOperationControl): fs.Stats | null {
  try { const stat = fs.lstatSync(file); control.checkpoint(); return stat }
  catch { control.checkpoint(); return null }
}

/** Publish one physical catalog and retain the existing bounded LRU ownership. */
export function publishMembershipCatalog(entries: Map<string, ProjectFileSetCacheEntry>,
  canonicalRoot: string, entry: ProjectFileSetCacheEntry, maxRoots: number): void {
  entries.delete(canonicalRoot)
  entries.set(canonicalRoot, entry)
  while (entries.size > maxRoots) {
    const oldestRoot = entries.keys().next().value
    if (oldestRoot === undefined) break
    entries.delete(oldestRoot)
  }
}
