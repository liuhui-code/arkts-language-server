import type { WorkspaceDocument } from "../sdk/workspace-loader.js"
import type { SemanticResponseState } from "../protocol.js"
import type { WorkspaceContentDelta } from "./workspace-content-changes.js"

/** Raw source delivery budget; this does not bound a Program's dependency closure. */
export const SEMANTIC_SOURCE_SNAPSHOT_LIMITS = Object.freeze({
  maxDocuments: 256,
  maxBytes: 8 * 1024 * 1024,
})

export interface ProjectMembershipSnapshot {
  readonly paths: readonly string[]
  status: "complete" | "partial"
  reason?: "path-count-limit" | "path-byte-limit" | "enumeration-error" | "source-unavailable"
  revision: number
}

export type ProjectFileAdmissionToken = string

export interface ProjectFileAccessPort {
  tokenFor(
    canonicalRootId: string,
    catalogRevision: number,
    filePath: string,
  ): ProjectFileAdmissionToken | undefined
  read(
    canonicalRootId: string,
    catalogRevision: number,
    filePath: string,
    token: ProjectFileAdmissionToken,
  ): string | null
}

export interface SemanticWorkspaceView {
  rootPath: string
  canonicalRootId: string
  typeEngineResetEpoch: number
  overlayPaths?: ReadonlyMap<string, string>
  documents: Array<WorkspaceDocument & {
    documentVersion?: number
    overlay: boolean
  }>
  projectMembership?: ProjectMembershipSnapshot
  /** Immutable disk identities used by an isolated verifier to preserve membership admission. */
  projectFileIdentities?: readonly (readonly [string, ProjectFileAdmissionToken])[]
  /**
   * Optional compiler root subset for an operation-scoped semantic query.
   * Project membership remains the authority for file admission and result mapping.
   */
  semanticRootPaths?: readonly string[]
  removedPaths?: string[]
  changedPaths?: string[]
  /** Full witnessed delta for per-file version/snapshot invalidation, before semantic-scope exclusion. */
  contentChangedPaths?: readonly string[]
  /** Changed closed inputs read through the authority port when raw delivery is full. */
  changedDiskInputs?: readonly { readonly path: string; readonly physicalPath: string;
    readonly token: ProjectFileAdmissionToken; readonly sourceSha256: string }[]
  /** One-shot store-owned evidence of compatible disk/overlay authority transitions. */
  contentDelta?: WorkspaceContentDelta
  /** Bounded immutable compatible spans; each retained context applies its own revision cursor. */
  contentDeltas?: readonly WorkspaceContentDelta[]
  contentRevision: number
  resetTypeEngine?: boolean
  state: SemanticResponseState
}
