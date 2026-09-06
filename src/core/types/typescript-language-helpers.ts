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
  return mapTypescriptDiagnosticGroups(filePath, virtualDocument, diagnosticGroups)
}

export function mapTypescriptDiagnosticGroups(
  filePath: string,
  virtualDocument: ArktsVirtualDocument,
  diagnosticGroups: readonly (readonly ts.Diagnostic[])[],
  work?: { item(): void },
): SemanticNumericDiagnostic[] {
  const seen = new Set<string>()
  const result: SemanticNumericDiagnostic[] = []
  for (const diagnosticGroup of diagnosticGroups) {
    for (const diagnostic of diagnosticGroup) {
      const mapped = mapTypescriptDiagnostic(filePath, virtualDocument, diagnostic)
      work?.item()
      if (!mapped) continue
      const key = JSON.stringify([
        mapped.code,
        mapped.severity,
        mapped.range.startLine,
        mapped.range.startColumn,
        mapped.range.endLine,
        mapped.range.endColumn,
        mapped.message,
      ])
      if (seen.has(key)) continue
      seen.add(key)
      result.push(mapped)
    }
  }
  return result
}

function mapTypescriptDiagnostic(
  filePath: string,
  virtualDocument: ArktsVirtualDocument,
  diagnostic: ts.Diagnostic,
): SemanticNumericDiagnostic | null {
  if (
    diagnostic.start === undefined
    || diagnostic.category !== ts.DiagnosticCategory.Error
      && diagnostic.category !== ts.DiagnosticCategory.Warning
  ) return null
  const range = virtualDocument.generatedSpanToSourceRange(
    diagnostic.start,
    diagnostic.length ?? 1,
  )
  return {
    source: "language",
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
    code: diagnostic.code,
    path: filePath,
    range,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  }
}
