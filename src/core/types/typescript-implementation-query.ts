import path from "node:path"
import type ts from "typescript"

import { CooperativeWork } from "./cooperative-work.js"
import { traceTypeScriptImplementation } from "./compiler-query-timing.js"
import { typescriptSpanKey } from "./typescript-reference-query.js"

export class IncompleteImplementationError extends Error {
  constructor() {
    super("Implementations require a complete workspace snapshot")
    this.name = "IncompleteImplementationError"
  }
}

/** Preserve the compiler's alias chain while excluding only actual declarations. */
export function queryTypeScriptImplementations(
  service: ts.LanguageService,
  filePath: string,
  offset: number,
  work: CooperativeWork,
): readonly ts.ImplementationLocation[] {
  work.boundary()
  const rawDefinitions = service.getDefinitionAtPosition(filePath, offset) ?? []
  work.boundary()
  const declarations = new Set<string>()
  for (const definition of rawDefinitions) {
    declarations.add(typescriptSpanKey(path.resolve(definition.fileName), definition.textSpan))
    work.item()
  }
  work.boundary()
  const rawImplementations = traceTypeScriptImplementation(
    () => service.getImplementationAtPosition(filePath, offset)) ?? []
  work.boundary()
  const implementations: ts.ImplementationLocation[] = []
  for (const implementation of rawImplementations) {
    if (!declarations.has(typescriptSpanKey(
      path.resolve(implementation.fileName),
      implementation.textSpan,
    ))) implementations.push(implementation)
    work.item()
  }
  return implementations
}
