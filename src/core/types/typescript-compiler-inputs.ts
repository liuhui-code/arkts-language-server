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

/** Consume every event revision; only changed compiler inputs advance the Host clock.
 * Same-byte delivered roots retain their snapshot, not any prior request's validity proof. */
export function applyTypeScriptContentChanges(workspace: SemanticWorkspaceView, versions: TypeScriptContentVersions,
  invalidate: (filePath: string, relevant: boolean) => void, retained?: {
    readonly scripts: ReadonlyMap<string, { readonly sourceContent: string }>
    readonly stableRoot: (filePath: string) => boolean
  }): void {
  const documents = retained && !workspace.resetTypeEngine && workspace.changedPaths?.length
    ? new Map(workspace.documents.map(document => [path.resolve(document.path), document])) : undefined
  const unchanged = (filePath: string): boolean => {
    const file = path.resolve(filePath), document = documents?.get(file), previous = retained?.scripts.get(file)
    if (!retained || !document || !previous || previous.sourceContent !== document.content || !retained.stableRoot(file)) return false
    const relative = path.relative(workspace.rootPath, file)
    return relative !== "" && !path.isAbsolute(relative)
      && !relative.split(path.sep).some(part => part === ".." || part === "oh_modules")
  }
  const changed = workspace.changedPaths?.filter(file => !unchanged(file))
  const contentChanged = (workspace.contentChangedPaths ?? workspace.changedPaths)?.filter(file => !unchanged(file))
  const relevant = changed && new Set(changed.map(file => path.resolve(file)))
  const paths = versions.update(workspace.contentRevision, changed, contentChanged)
  for (const filePath of paths) invalidate(filePath, relevant === undefined || relevant.has(filePath))
}

/** Removed members lose their compiler clock and resident input together. */
export function removeTypeScriptProjectInputs(removedPaths: readonly string[] | undefined,
  members: Set<string>, versions: TypeScriptContentVersions, remove: (filePath: string) => void): boolean {
  let membershipChanged = false
  for (const removedPath of removedPaths ?? []) {
    const filePath = path.resolve(removedPath)
    membershipChanged = members.delete(filePath) || membershipChanged
    versions.delete(filePath)
    remove(filePath)
  }
  return membershipChanged
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
