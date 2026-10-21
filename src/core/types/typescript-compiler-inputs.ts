import path from "node:path"
import type { ProjectMembershipSnapshot, SemanticWorkspaceView } from "../workspace/document-store.js"
import type { TypeScriptContentVersions } from "./typescript-content-versions.js"

const MAX_COMPILER_INPUT_PATHS = 32_768
const MAX_COMPILER_INPUT_PATH_BYTES = 8 * 1024 * 1024

/** Metadata superset of every actual registry input; overflow revokes exclusions until recycling. */
export class TypeScriptCompilerInputs {
  private readonly paths = new Set<string>()
  private bytes = 0
  private overflow = false

  add(filePath: string): void {
    if (this.overflow) return
    const resolved = path.resolve(filePath)
    if (this.paths.has(resolved)) return
    const bytes = Buffer.byteLength(resolved)
    if (this.paths.size >= MAX_COMPILER_INPUT_PATHS || this.bytes + bytes > MAX_COMPILER_INPUT_PATH_BYTES) {
      this.paths.clear(); this.bytes = 0; this.overflow = true
      return
    }
    this.paths.add(resolved); this.bytes += bytes
  }

  knownPaths(): ReadonlySet<string> | undefined { return this.overflow ? undefined : this.paths }
  clear(): void { this.paths.clear(); this.bytes = 0; this.overflow = false }
}

/** Consume every witnessed file version, while only actual compiler inputs invalidate its project clock. */
export function applyTypeScriptContentChanges(workspace: SemanticWorkspaceView, versions: TypeScriptContentVersions,
  invalidate: (filePath: string, relevant: boolean) => void): void {
  const relevant = workspace.changedPaths && new Set(workspace.changedPaths.map(file => path.resolve(file)))
  const paths = versions.update(workspace.contentRevision, workspace.changedPaths, workspace.contentChangedPaths)
  for (const filePath of paths) invalidate(filePath, relevant === undefined || relevant.has(filePath))
}

/** Catalog admission may advance independently from the compiler's unchanged root structure. */
export function membershipUpdate(workspace: SemanticWorkspaceView, previous: {
  readonly status: ProjectMembershipSnapshot["status"] | "none"
  readonly revision: number
  readonly paths: ReadonlySet<string>
  readonly receivedContentRevision: number
  readonly sourceUnavailable: boolean
}): "none" | "catalog" | "replace" {
  const membership = workspace.projectMembership
  if (!membership) return "none"
  if (membership.status === previous.status && membership.revision === previous.revision
    && membership.paths.length === previous.paths.size) return "none"
  const delta = workspace.contentDelta
  // A full-root owner, changed member set, unknown span or reset keeps the existing conservative update.
  if (previous.sourceUnavailable || workspace.semanticRootPaths === undefined
    || membership.status !== "complete" || previous.status !== "complete"
    || workspace.resetTypeEngine || (workspace.removedPaths?.length ?? 0) > 0
    || membership.paths.length !== previous.paths.size || membership.paths.some(file => !previous.paths.has(path.resolve(file)))
    || !delta || delta.rootPath !== path.resolve(workspace.rootPath)
    || delta.fromRevision !== previous.receivedContentRevision || delta.toRevision !== workspace.contentRevision
    || delta.toRevision <= delta.fromRevision || workspace.changedPaths === undefined
    || delta.changedPaths.length !== workspace.changedPaths.length
    || delta.changedPaths.some((file, index) => file !== workspace.changedPaths![index])) return "replace"
  // The independently consumed source delta still updates every affected compiler file/version below.
  return "catalog"
}
