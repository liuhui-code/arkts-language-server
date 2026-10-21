import type ts from "typescript"

/** Observe the SourceFile actually retained by the shared registry, not the offered snapshot. */
export function observedDocumentRegistry(registry: ts.DocumentRegistry,
  observe: (source: ts.SourceFile) => void): ts.DocumentRegistry {
  const observed = (source: ts.SourceFile) => { observe(source); return source }
  return {
    ...registry,
    acquireDocument: (...args) => observed(registry.acquireDocument(...args)),
    acquireDocumentWithKey: (...args) => observed(registry.acquireDocumentWithKey(...args)),
    updateDocument: (...args) => observed(registry.updateDocument(...args)),
    updateDocumentWithKey: (...args) => observed(registry.updateDocumentWithKey(...args)),
  }
}
