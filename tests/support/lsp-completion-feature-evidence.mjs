/** Completion evidence stays together when its public transcripts move. */
export function completionFeatureEvidence({ enabledFeature, capability, evidence }) {
  return {
    list: enabledFeature({
      id: "completion",
      requiredCapabilities: [capability("completionProvider.triggerCharacters", ["."])],
      protocol: [evidence(
        "tests/lsp-completion-reliability.test.mjs",
        "preserves independent current completion consumers at different positions",
        "completion.protocol.independent-consumers",
      )],
      bundle: [evidence(
        "tests/lsp-transcript.test.mjs",
        "completes both a field and a method from the opened ArkTS snapshot",
        "completion.bundle.open-member-field-method",
      )],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "completion.artifact.immutable-typescript-arkui-sdk-resource-builder",
      )],
      artifactGap: null,
    }),
    resolve: enabledFeature({
      id: "completion-resolve",
      requiredCapabilities: [capability("completionProvider.resolveProvider", true)],
      protocol: [evidence(
        "tests/lsp-completion-reliability.test.mjs",
        "maps completion resolve cancellation to the semantic abort signal",
        "completion-resolve.protocol.cancellation",
      )],
      bundle: [evidence(
        "tests/semantic/semantic-characterization.test.mjs",
        "resolves and applies an unopened class auto-import through the production server",
        "completion-resolve.bundle.auto-import",
      )],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "completion-resolve.artifact.immutable-auto-import",
      )],
      artifactGap: null,
    }),
  }
}
