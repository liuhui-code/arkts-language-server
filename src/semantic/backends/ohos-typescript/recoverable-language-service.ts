import ts from "typescript"
import { ownedDocumentRegistry } from "./owned-document-registry.js"
import { observedDocumentRegistry } from "./observed-document-registry.js"
import { observeCompilerPhase, compilerSynchronized } from "../../semantic-worker-progress.js"
import { assertCompilerOwnership, quarantineCompilerOwner } from "./compiler-resource-lifetime.js"
import { completeCompilerSynchronization } from "../../semantic-cancellation-scope.js"

// These APIs synchronize the semantic Program. Syntax-only APIs keep their original cost/behavior.
const semanticMethods = new Set<keyof ts.LanguageService>([
  "getProgram", "getSemanticDiagnostics", "getSyntacticDiagnostics", "getCompilerOptionsDiagnostics",
  "getCompletionsAtPosition", "getCompletionEntryDetails", "getCompletionEntrySymbol",
  "getQuickInfoAtPosition", "getSignatureHelpItems", "getDefinitionAtPosition", "getDefinitionAndBoundSpan",
  "getTypeDefinitionAtPosition", "getImplementationAtPosition", "getReferencesAtPosition", "findReferences",
  "getDocumentHighlights", "getRenameInfo", "findRenameLocations", "getCodeFixesAtPosition",
  "getCombinedCodeFix", "provideInlayHints", "prepareCallHierarchy",
  "provideCallHierarchyIncomingCalls", "provideCallHierarchyOutgoingCalls",
])

/** Isolate failed compiler synchronization without changing input versions or SDK ownership. */
export function recoverableLanguageService(host: ts.LanguageServiceHost, shared: ts.DocumentRegistry,
  observe?: (source: ts.SourceFile) => void, invalidate: () => void = () => {}): ts.LanguageService {
  const create = () => {
    assertCompilerOwnership()
    const owner = ownedDocumentRegistry(shared)
    const registry = observe ? observedDocumentRegistry(owner.registry, observe) : owner.registry
    return { service: ts.createLanguageService(host, registry), owner }
  }
  type Owner = ReturnType<typeof create>
  type State = { kind: "live"; value: Owner } | { kind: "retiring"; value: Owner }
    | { kind: "quarantined"; value: Owner; error: Error } | { kind: "empty" } | { kind: "disposed" }
  const initial = create()
  let state: State = { kind: "live", value: initial }
  const retire = () => {
    if (state.kind === "quarantined") throw state.error
    if (state.kind === "empty" || state.kind === "disposed") return
    if (state.kind === "retiring") throw new Error("Compiler retirement is already in progress")
    const previous = state.value
    state = { kind: "retiring", value: previous }
    try {
      try { invalidate() }
      finally {
        try { previous.service.dispose() }
        finally { previous.owner.releaseRemaining() }
      }
      state = { kind: "empty" }
    } catch (error) {
      const failure = quarantineCompilerOwner(previous, error)
      state = { kind: "quarantined", value: previous, error: failure }
      throw failure
    }
  }
  const available = () => {
    if (state.kind === "disposed") throw new Error("Language service is disposed")
    assertCompilerOwnership()
    if (state.kind === "quarantined") throw state.error
    if (state.kind === "retiring") throw new Error("Compiler retirement is in progress")
    if (state.kind === "empty") state = { kind: "live", value: create() }
    return state.value
  }
  const checkpoint = () => {
    if (host.getCancellationToken?.().isCancellationRequested()) throw new ts.OperationCanceledException()
  }
  const synchronize = () => {
    // Cancellation outside the mutating sync must not retire a healthy owner.
    checkpoint()
    let program: ts.Program | undefined
    try {
      program = completeCompilerSynchronization(() => observeCompilerPhase("synchronize", () => {
        const current = available().service.getProgram()
        if (current) compilerSynchronized()
        return current
      }))
    }
    catch (error) {
      try { retire() }
      catch (cleanup) { throw new AggregateError([error, cleanup], "Failed to clean up compiler synchronization") }
      throw error
    }
    checkpoint()
    return program
  }
  const facade = { ...initial.service }
  for (const key of Object.keys(facade) as (keyof ts.LanguageService)[]) {
    if (typeof facade[key] !== "function") continue
    const invoke = (...args: unknown[]) => {
      if (key === "dispose") {
        if (state.kind !== "disposed" && state.kind !== "quarantined") { retire(); state = { kind: "disposed" } }
        return
      }
      if (key === "cleanupSemanticCache") { available(); retire(); return }
      if (key === "getProgram") return synchronize()
      // Preflight gives synchronization its own error boundary. The real API's
      // internal second sync sees the same Host version and returns immediately.
      if (semanticMethods.has(key)) synchronize()
      const service = available().service
      return observeCompilerPhase("semantic-query", () =>
        (service[key] as (...args: unknown[]) => unknown).apply(service, args))
    }
    Object.assign(facade, { [key]: invoke })
  }
  return facade
}
