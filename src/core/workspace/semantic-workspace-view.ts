import type { ValidationDirectoryProof } from "../../project/request-input-validation.js"
import type { WorkspaceDocument } from "../sdk/workspace-loader.js"
import type { SemanticResponseState } from "../protocol.js"
import type { WorkspaceContentDelta } from "./workspace-content-changes.js"
import { RESOLUTION_INPUT_GENERATION, type ResolutionInputGeneration } from "./workspace-resolution-inputs.js"

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
/** Worker-local original membership authority; never a serialized validity bit. */
export const WORKSPACE_MEMBERSHIP_PROOF = Symbol("workspaceMembershipProof")

/** Actual bounded read plus the physical identity proven around that same descriptor. */
export interface ProjectSourceSnapshot {
  /** Descriptor mode from the same guarded read; absent legacy producers cannot lend it. */
  readonly mode?: number
  readonly content: string
  readonly identity: { readonly physicalPath: string; readonly stamp: string }
}

export interface ProjectFileAccessPort {
  /** Cancellation only; no path normalization, lookup or IO. Optional for legacy adapters. */
  checkpoint?(): void
  /** Store-owned live text authority; independent of bounded raw delivery. */
  overlayFor?(filePath: string): { readonly content: string; readonly documentVersion?: number } | undefined
  /** Store-owned live overlay lifecycle only; no disk/configuration authority. */
  overlayState?(): { current(): boolean }
  /** Optional native catalog reconciliation; absent ports retain the full scope. */
  refreshProjectMembership?(rootPath: string): { readonly catalogStamp: WorkspaceCatalogStamp }
  /** Original strong source generation; no refresh or rebasing on later disk inputs. */
  captureSourceIdentityProof?(rootPath: string, revision: number): {
    readonly catalogStamp: WorkspaceCatalogStamp; current(): boolean
  } | undefined
  membershipFor?(rootPath: string): ProjectMembershipSnapshot
  readSnapshot?(canonicalRootId: string, catalogRevision: number,
    filePath: string, token: ProjectFileAdmissionToken): ProjectSourceSnapshot | null
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

/** Local store-owned catalog identity; not serialized as cross-worker authority. */
export const WORKSPACE_CATALOG_STAMP = Symbol("workspaceCatalogStamp")
export interface WorkspaceCatalogStamp {
  readonly canonicalRootId: string
  readonly revision: number | null
}

/** Store-owned origin of a view whose paths exclude shadowed overlay aliases. */
export const WORKSPACE_MEMBERSHIP_ORIGIN = Symbol("workspaceMembershipOrigin")
export const WORKSPACE_SOURCE_DIRECTORIES = Symbol("workspaceSourceDirectories")
export interface SemanticWorkspaceView {
  readonly [WORKSPACE_MEMBERSHIP_PROOF]?: () => boolean
  readonly [WORKSPACE_SOURCE_DIRECTORIES]?: (directoryPath: string) => ValidationDirectoryProof | undefined
  readonly [WORKSPACE_MEMBERSHIP_ORIGIN]?: {
    readonly catalog: ProjectMembershipSnapshot
    readonly view: ProjectMembershipSnapshot
  }
  readonly [WORKSPACE_CATALOG_STAMP]?: WorkspaceCatalogStamp
  rootPath: string
  /** Resolver generation used to build membership and dependency input projections. */
  [RESOLUTION_INPUT_GENERATION]?: ResolutionInputGeneration
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
