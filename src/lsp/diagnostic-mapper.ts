import {
  DiagnosticSeverity,
  type Diagnostic,
} from "vscode-languageserver/node.js"

import type { SemanticDiagnostic } from "../contracts/semantic-engine.js"

export type MappedDiagnostic = Diagnostic & {
  severity: DiagnosticSeverity
  code: number | string
  source: "arkts"
}

export function toLspDiagnostic(diagnostic: SemanticDiagnostic): MappedDiagnostic {
  return {
    range: diagnostic.range,
    severity: diagnostic.severity === "error"
      ? DiagnosticSeverity.Error
      : DiagnosticSeverity.Warning,
    code: diagnostic.code,
    source: diagnostic.source,
    message: diagnostic.message,
  }
}
