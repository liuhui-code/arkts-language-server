export interface SemanticBackendIdentity {
  readonly name: string
  readonly revision: string
}

export interface SemanticBackend {
  readonly backendIdentity: SemanticBackendIdentity
  dispose(): void | Promise<void>
}
