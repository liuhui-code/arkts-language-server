// Document synchronization evidence, including disk-authoritative save delivery.
export function documentSyncFeatureEvidence({ enabledFeature, capability, evidence }) {
  return enabledFeature({
      id: "document-sync",
      requiredCapabilities: [
        capability("positionEncoding", "utf-16"),
        capability("textDocumentSync.openClose", true),
        capability("textDocumentSync.change", 2),
        capability("textDocumentSync.save", true),
      ],
      protocol: [evidence(
        "tests/lsp-session.test.mjs",
        "sends an applied document edit through didChange before the next request",
        "document-sync.protocol.did-change-before-request",
      )],
      bundle: [
        evidence(
          "tests/lsp-index-versioned-maintenance.test.mjs",
          "production framed LSP negotiates file maintenance and writes only the edited file",
          "document-sync.bundle.disk-save-index-without-watch",
        ),
        evidence(
          "tests/lsp-document-lifecycle.test.mjs",
          "advertises open/close incremental document synchronization",
          "document-sync.bundle.sync-capability",
        ),
        evidence(
          "tests/lsp-document-lifecycle.test.mjs",
          "applies ranged incremental changes before serving completion",
          "document-sync.bundle.incremental-change",
        ),
        evidence(
          "tests/lsp-document-lifecycle.test.mjs",
          "does not serve a stale overlay after the document closes",
          "document-sync.bundle.close-clears-overlay",
        ),
      ],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "document-sync.artifact.immutable-incremental-overlay-lifecycle",
      )],
      artifactGap: null,
    })
}
