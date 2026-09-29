import type { DocumentSnapshot, DocumentUri, TextPosition, TextRange, WorkspaceId } from "./document.js"
import type { WorkspaceIndexCompleteness } from "./workspace-index.js"

/** Lexical declaration discovery; never compiler identity or constructor coverage. */
export type ClassBaseBinding =
  | { kind: "unknown" }
  | { kind: "no-base" }
  | {
      kind: "resolved"
      declarationUri: DocumentUri
      name: string
      nameRange: TextRange
      supportUris: DocumentUri[]
    }

/** Caller-captured source presence, not validated metadata or semantic identity. */
export interface ClassBindingSourceAvailability {
  uri: DocumentUri
  state: "present" | "absent" | "unknown"
}

/**
 * The caller fences its workspace/configuration/document revisions and includes
 * relevant current overlays. Generation equality cannot prove overlay
 * completeness or current disk freshness.
 */
export interface ClassBindingDiscoveryQuery {
  expectedGeneration: number
  documentUris: readonly DocumentUri[]
  overlays: readonly DocumentSnapshot[]
  /** Omitted entries mean no evidence, never absence; the caller owns freshness. */
  sourceAvailability?: readonly ClassBindingSourceAvailability[]
  documentUri: DocumentUri
  classNamePosition: TextPosition
}

export interface ClassBindingDiscoveryResult {
  servedGeneration: number
  completeness: WorkspaceIndexCompleteness
  binding: ClassBaseBinding
}

export interface ClassBindingDiscoveryPort {
  resolveClassBaseBinding(
    workspaceId: WorkspaceId,
    query: ClassBindingDiscoveryQuery,
    signal?: AbortSignal,
  ): Promise<ClassBindingDiscoveryResult>
}
