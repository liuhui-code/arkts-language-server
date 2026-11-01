import type { SemanticDiagnostic } from "../protocol.js"
import type { ProjectSdkSelection } from "../sdk/project-sdk.js"

export function sdkConfigurationDiagnostic(sdk: ProjectSdkSelection, filePath: string): SemanticDiagnostic | undefined {
  const invalidPath = sdk.source === "configuration" && !sdk.ready
  const target = sdk.targetQualification
  const component = sdk.components?.find(component => component.issue)
  if (!invalidPath && (!target || target.status === "compatible") && !component) return undefined
  return {
    source: "language", severity: "error", path: filePath,
    code: invalidPath ? "arkts.sdk.configuration" : component ? "arkts.sdk.component" : "arkts.sdk.target",
    range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
    message: invalidPath
      ? "The configured ArkTS SDK path is invalid. Set initializationOptions.sdk.path or arkts.sdk.path to an absolute OpenHarmony SDK directory."
      : component ? `The SDK extension is invalid or incompatible. Check ${component.metadataPath}.`
        : target!.message ?? "The selected SDK target cannot be verified.",
  }
}
