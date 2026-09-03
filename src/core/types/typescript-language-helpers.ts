import path from "node:path"

import ts from "typescript"

import type { SemanticNumericDiagnostic } from "../protocol.js"
import type { ArktsVirtualDocument } from "../virtual/arkts-virtual-document.js"
import type { SemanticTypeStatus } from "./type-engine.js"

export function typescriptTypeStatus(filePath: string): SemanticTypeStatus {
  if (filePath.endsWith(".ets")) return "partial"
  if (filePath.endsWith(".ts")) return "ready"
  return "unsupported"
}

export function typescriptTypeDetail(
  entry: ts.CompletionEntry,
  importingFilePath?: string,
): string {
  const sourceDisplay = completionSourceDisplay(entry, importingFilePath)
  if (sourceDisplay) return sourceDisplay
  const modifiers = entry.kindModifiers ? ` ${entry.kindModifiers}` : ""
  return `TypeScript ${entry.kind}${modifiers}`
}

function completionSourceDisplay(
  entry: ts.CompletionEntry,
  importingFilePath: string | undefined,
): string | undefined {
  const source = ts.displayPartsToString(entry.sourceDisplay ?? []) || entry.source
  if (!source || !importingFilePath || !path.isAbsolute(source)) return source
  const relativePath = path.relative(path.dirname(importingFilePath), source)
    .replace(/\\/gu, "/")
    .replace(/(?:\.d)?\.(?:[cm]?[jt]sx?|ets)$/u, "")
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`
}

export function mapTypescriptDiagnostics(
  filePath: string,
  virtualDocument: ArktsVirtualDocument,
  ...diagnosticGroups: readonly ts.Diagnostic[][]
): SemanticNumericDiagnostic[] {
  const seen = new Set<string>()
  return diagnosticGroups.flat().flatMap((diagnostic) => {
    if (
      diagnostic.start === undefined
      || diagnostic.category !== ts.DiagnosticCategory.Error
        && diagnostic.category !== ts.DiagnosticCategory.Warning
    ) return []
    const range = virtualDocument.generatedSpanToSourceRange(
      diagnostic.start,
      diagnostic.length ?? 1,
    )
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    const key = JSON.stringify([
      diagnostic.code,
      diagnostic.category,
      range.startLine,
      range.startColumn,
      range.endLine,
      range.endColumn,
      message,
    ])
    if (seen.has(key)) return []
    seen.add(key)
    return [{
      source: "language" as const,
      severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" as const : "warning" as const,
      code: diagnostic.code,
      path: filePath,
      range,
      message,
    }]
  })
}
