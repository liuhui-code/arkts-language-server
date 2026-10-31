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
  pathBytes: number
  diskIdentities: Map<string, string>
  publicSnapshot?: ProjectMembershipSnapshot
  capacityProof?: { readonly directories: WorkspaceNamespaceWitness; readonly overlays: readonly string[] }
}

/** Enumerate authoritative membership; only observed directory namespaces certify a capacity failure. */
export function scanProjectMembership(rootPath: string, overlays: readonly string[], options: {
  readonly resolver: LocalPackageResolver
  readonly control: SemanticOperationControl
  readonly maxPaths: number
  readonly maxPathBytes: number
  readonly enumerate?: (rootPath: string) => Iterable<string>
}): ProjectFileSetCacheEntry {
  const resolvedRoot = path.resolve(rootPath)
  const canonicalRoot = canonicalWorkspaceRoot(resolvedRoot)
  const { control } = options
  const eligibility = createProjectSourceEligibility(options.resolver.projectFor(resolvedRoot), () => control.checkpoint())
  const namespaces = options.enumerate ? undefined : new WorkspaceNamespaceWitness(options.maxPathBytes)
  const paths: string[] = [], seen = new Set<string>()
  const diskIdentities = new Map<string, string>()
  let pathBytes = 0
  let status: ProjectMembershipSnapshot["status"] = "complete"
  let reason: ProjectMembershipSnapshot["reason"]
  const accept = (candidate: string, diskIdentity?: string, physicalPath?: string): boolean => {
    const sourcePath = path.resolve(candidate)
    if (!eligibility.includes(sourcePath, false, physicalPath)) return true
    if (seen.has(sourcePath)) {
      if (diskIdentity !== undefined) diskIdentities.set(sourcePath, diskIdentity)
      return true
    }
    if (paths.length >= options.maxPaths) { status = "partial"; reason = "path-count-limit"; return false }
    const bytes = Buffer.byteLength(sourcePath)
    if (pathBytes + bytes > options.maxPathBytes) { status = "partial"; reason = "path-byte-limit"; return false }
    seen.add(sourcePath)
    paths.push(sourcePath)
    pathBytes += bytes
    if (diskIdentity !== undefined) diskIdentities.set(sourcePath, diskIdentity)
    return true
  }
  for (const overlay of overlays) if (!accept(overlay)) break
  if (status === "complete") {
    try {
      const entries = options.enumerate ? unresolvedSourceEntries(options.enumerate(resolvedRoot))
        : listWorkspaceSourcePaths(resolvedRoot, control, eligibility.includes, canonicalRoot,
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
    } catch {
      control.checkpoint()
      status = "partial"; reason = "enumeration-error"
    }
  }
  paths.sort()
  control.checkpoint()
  return { paths, pathBytes, status, ...(reason ? { reason } : {}), revision: 0, diskIdentities,
    ...(namespaces && (reason === "path-count-limit" || reason === "path-byte-limit")
      // Disk-backed members remain members when an overlay opens/closes. Only
      // overlay-only members used by this enumeration must remain authoritative.
      ? { capacityProof: { directories: namespaces, overlays: overlays.filter(file => !diskIdentities.has(file)) } } : {}) }
}

function safeLstat(file: string, control: SemanticOperationControl): fs.Stats | null {
  try { const stat = fs.lstatSync(file); control.checkpoint(); return stat }
  catch { control.checkpoint(); return null }
}
