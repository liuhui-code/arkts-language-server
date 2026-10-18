import type { WorkspaceDocument } from "../sdk/workspace-loader.js"
import type { SemanticResponseState } from "../protocol.js"
import type { WorkspaceContentDelta } from "./workspace-content-changes.js"

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
  /** One-shot store-owned evidence that every intervening revision is a compatible disk delta. */
  contentDelta?: WorkspaceContentDelta
  contentRevision: number
  resetTypeEngine?: boolean
  state: SemanticResponseState
}
