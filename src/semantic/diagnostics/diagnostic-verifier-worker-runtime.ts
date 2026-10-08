import { parentPort, workerData } from "node:worker_threads"

import type { SemanticDiagnostic, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import { SingleRootProjectResolver } from "../../project/single-root-project-resolver.js"
import { OhosTypeScriptSemanticEngine } from "../backends/ohos-typescript/engine.js"
import { traceTransientDiagnosis, type TransientDiagnosisWorkerData } from "./transient-diagnosis.js"

const port = parentPort
if (!port) throw new Error("Diagnostic verifier requires a parent port")
const data = workerData as TransientDiagnosisWorkerData

void diagnose(data).then((response) => {
  port.postMessage(response)
  port.close()
})

async function diagnose(input: TransientDiagnosisWorkerData): Promise<
  | { readonly ok: true; readonly result: VersionedSemanticResult<SemanticDiagnostic[]> }
  | { readonly ok: false; readonly message: string }
> {
  try {
    const engine = new OhosTypeScriptSemanticEngine(
      new SingleRootProjectResolver(input.rootUri),
      undefined,
      {
        maxResidentContexts: 1,
        interactiveSdkAmbientProfile: input.interactiveSdkAmbientProfile,
        interactiveProjectRootProfile: input.interactiveProjectRootProfile,
      },
    )
    try {
      traceTransientDiagnosis("engine.configure.start", input.document.version, input.traceId)
      engine.configureProject(input.projectConfiguration)
      engine.configureSdk(input.sdkConfiguration)
      traceTransientDiagnosis("engine.configure.end", input.document.version, input.traceId)
      traceTransientDiagnosis("engine.sync.start", input.document.version, input.traceId)
      for (const document of input.documents) engine.sync(document)
      engine.sync(input.document)
      traceTransientDiagnosis("engine.sync.end", input.document.version, input.traceId)
      traceTransientDiagnosis("engine.diagnose.start", input.document.version, input.traceId)
      try {
        return { ok: true, result: await engine.diagnose({ document: input.document }) }
      } finally {
        traceTransientDiagnosis("engine.diagnose.end", input.document.version, input.traceId)
      }
    } finally {
      traceTransientDiagnosis("engine.dispose.start", input.document.version, input.traceId)
      try {
        engine.dispose()
      } finally {
        traceTransientDiagnosis("engine.dispose.end", input.document.version, input.traceId)
      }
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
