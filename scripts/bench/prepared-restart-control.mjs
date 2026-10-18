import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { performance } from "node:perf_hooks"

import { observeSemanticReadiness, preparedOverlayDigest } from "./prepared-semantic-readiness.mjs"

/** Client input and public process-local proofs, never compiler state or old item handles. */
export function createRestartControl(state, scenarioIds) {
  const accepted = new Set(scenarioIds)
  const control = {
    initial: { status: "NOT_RUN", observed: null },
    handoff: { status: "NOT_RUN", observed: null },
    queryOracles: state.queryOracles,
    replayedDocuments: [],
    accepts: id => accepted.has(id),
    async start({ session, suite, mark, observeDiagnostics, overlays, openedModules }) {
      mark("restart-fresh-status-start", { prepare: false })
      control.initial = (await observeSemanticReadiness(session, suite, false)).semantic
      mark("restart-fresh-status-complete", { status: control.initial.status })
      if (!["UNPREPARED", "READY"].includes(control.initial.status)) throw new Error("RESTART_FRESH_PROCESS_READINESS_INVALID")
      for (const document of state.documents) {
        overlays.set(document.uri, document.text)
        observeDiagnostics(document.uri, document.version)
        session.openDocument(document)
        openedModules.add(document.moduleId)
        control.replayedDocuments.push({ uri: document.uri, version: document.version })
        mark("didOpen-replayed", { uri: document.uri, version: document.version })
      }
    },
    async finish({ session, suite, mark, overlays, queryOracles, failure }) {
      state.documents = [...session.documentVersions].map(([uri, version]) => ({ uri, version,
        text: overlays.get(uri), moduleId: suite.targets.find(target =>
          pathToFileURL(path.join(suite.workspace, target.file)).href === uri)?.moduleId
          ?? path.relative(suite.workspace, fileURLToPath(uri)).split(path.sep).join("/") }))
      state.queryOracles = [...queryOracles]
      if (failure || !session.initialized || session.transport.child.exitCode !== null) return
      const started = performance.now()
      mark("restart-handoff-validation-start", { prepare: false })
      let observation = await observeSemanticReadiness(session, suite, false)
      let preparationMs = 0
      if (observation.semantic.status !== "READY") {
        mark("restart-handoff-preparation-start", { prepare: true })
        const preparation = await observeSemanticReadiness(session, suite)
        preparationMs = preparation.elapsedMs
        mark("restart-handoff-preparation-complete", { status: preparation.semantic.status, preparationMs })
        observation = await observeSemanticReadiness(session, suite, false)
      }
      control.handoff = { ...observation.semantic, elapsedMs: performance.now() - started, preparationMs }
      if (control.handoff.status === "READY" && control.handoff.observed.inputIdentity.overlaysSha256
        !== preparedOverlayDigest(overlays, session.documentVersions)) {
        control.handoff = { status: "READINESS_INVALID", reason: "RESTART_INPUT_REPLAY_NOT_VERIFIED", observed: null }
      }
      mark("restart-handoff-validation-complete", { status: control.handoff.status,
        elapsedMs: control.handoff.elapsedMs, preparationMs })
    },
  }
  return control
}
