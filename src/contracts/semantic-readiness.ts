export const SEMANTIC_READY_CAPABILITIES = Object.freeze([
  "references:includeDeclaration=false", "references:includeDeclaration=true",
  "implementation", "definition", "typeDefinition", "hover", "signatureHelp",
  "completion", "completionResolve", "prepareRename", "rename",
  "prepareCallHierarchy", "incomingCalls", "outgoingCalls",
] as const)

export interface SemanticReadinessQuery {
  readonly rootUri: string
  readonly prepare: boolean
  readonly signal?: AbortSignal
}

/** Query support is distinct from a complete-project semantic certificate. */
export const SEMANTIC_AVAILABLE_CAPABILITIES = Object.freeze([
  "definition", "typeDefinition", "hover", "signatureHelp", "completion", "completionResolve",
] as const)

export type SemanticInputIssue =
  | { readonly layer: "sdk"; readonly reason: "module-not-found"; readonly specifier: string }
  | { readonly layer: "sdk"; readonly reason: "coverage-unproven" | "declaration-not-found" }

export interface SemanticReadinessReport {
  readonly rootUri: string
  readonly semanticState: "unprepared" | "ready" | "partial" | "degraded"
  /** Present for usable partial inputs; not a full-reference/rename proof. */
  readonly availableCapabilities?: readonly string[]
  readonly inputIssues?: readonly SemanticInputIssue[]
  readonly semanticGeneration: string | null
  readonly readyCapabilities: readonly string[]
  readonly unavailableReasons: readonly string[]
  /** First compiler-proven missing input, not an exhaustive diagnostic list. */
  readonly unavailableInput: null | {
    readonly uri: string | null
    readonly code: number
    readonly message: string
    readonly position: null | { readonly line: number; readonly character: number }
  }
  readonly inputIdentity: null | {
    readonly sha256: string
    readonly engineGeneration: number
    readonly canonicalRoot: string
    readonly membershipRevision: number
    readonly sourcesSha256: string
    readonly overlaysSha256: string
    readonly optionsSha256: string
    readonly projectGraphSha256: string
    readonly sdkSha256: string
    readonly standardLibrarySha256: string
    readonly backend: { readonly packageVersion: string; readonly compilerSha256: string; readonly packageSha256: string }
  }
  readonly coverage: null | {
    readonly projectSources: number
    readonly sdkSources: number
    readonly standardLibrarySources: number
    readonly programSources: number
    readonly dependenciesComplete: true
  }
}

export function semanticUnprepared(rootUri: string, reason?: string): SemanticReadinessReport {
  return { rootUri, semanticState: reason ? "degraded" : "unprepared",
    semanticGeneration: null, readyCapabilities: [], unavailableReasons: reason ? [reason] : [],
    unavailableInput: null, inputIdentity: null, coverage: null }
}

export function semanticSdkPartial(rootUri: string, issue: SemanticInputIssue,
  unavailableInput: SemanticReadinessReport["unavailableInput"] = null): SemanticReadinessReport {
  return { ...semanticUnprepared(rootUri, "sdk-inputs-incomplete"), semanticState: "partial",
    availableCapabilities: SEMANTIC_AVAILABLE_CAPABILITIES, inputIssues: [issue], unavailableInput }
}
