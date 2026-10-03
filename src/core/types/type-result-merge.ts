import type { SemanticDefinitionCandidate, SemanticDiagnostic } from "../protocol.js"

export function mergeDefinitions(
  arkui: SemanticDefinitionCandidate[],
  typescript: SemanticDefinitionCandidate[],
): SemanticDefinitionCandidate[] {
  const result: SemanticDefinitionCandidate[] = []
  const seen = new Set<string>()
  for (const definition of [...arkui, ...typescript]) {
    const key = [definition.path, definition.range.startLine, definition.range.startColumn,
      definition.range.endLine, definition.range.endColumn].join(":")
    if (seen.has(key)) continue
    seen.add(key)
    result.push(definition)
  }
  return result
}

export function mergeDiagnostics(
  typescript: SemanticDiagnostic[],
  arkui: SemanticDiagnostic[],
): SemanticDiagnostic[] {
  if (arkui.length === 0) return typescript
  if (typescript.length === 0) return arkui
  const result: SemanticDiagnostic[] = []
  const seen = new Set<string>()
  for (const diagnostic of [...typescript, ...arkui]) {
    const key = JSON.stringify([diagnostic.path, diagnostic.range.startLine,
      diagnostic.range.startColumn, diagnostic.range.endLine, diagnostic.range.endColumn,
      diagnostic.code, diagnostic.severity, diagnostic.message])
    if (seen.has(key)) continue
    seen.add(key)
    result.push(diagnostic)
  }
  return result.sort((left, right) => (
    ordinalCompare(left.path, right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endLine - right.range.endLine
    || left.range.endColumn - right.range.endColumn
    || ordinalCompare(String(left.code), String(right.code))
    || ordinalCompare(left.message, right.message)
  ))
}

function ordinalCompare(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
