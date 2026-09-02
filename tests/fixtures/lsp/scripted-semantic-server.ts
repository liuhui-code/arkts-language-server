import { pathToFileURL } from "node:url"

import type { DocumentSnapshot } from "../../../src/contracts/document.js"
import type {
  SemanticEnginePort,
  SemanticQuery,
  VersionedSemanticResult,
  SemanticCompletion,
  SemanticDefinition,
} from "../../../src/contracts/semantic-engine.js"
import { runLanguageServer } from "../../../src/lsp/run-language-server.js"
import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"

class ScriptedSemanticEngine implements SemanticEnginePort {
  private completionCount = 0

  sync(_document: DocumentSnapshot): void {}

  close(_documentUri: string): void {}

  async complete(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion[]>> {
    this.completionCount += 1
    if (
      query.document.text.includes("FIRST_WAITS_FOR_ABORT")
      && this.completionCount === 1
    ) {
      return waitForAbort(query.signal)
    }
    if (query.document.text.includes("DELAY_IGNORING_ABORT")) {
      query.signal?.addEventListener(
        "abort",
        () => process.stderr.write("SCRIPTED_STALE_ABORT\n"),
        { once: true },
      )
      await new Promise((resolve) => setTimeout(resolve, 150))
      return {
        documentVersion: query.document.version,
        value: [{
          label: `stale-v${query.document.version}`,
          detail: "Delayed scripted completion",
          kind: "property",
        }],
      }
    }
    console.log(`scripted completion v${query.document.version}`)
    return {
      documentVersion: query.document.version,
      value: [{
        label: `fixture-v${query.document.version}`,
        detail: "Scripted semantic completion",
        kind: "property",
      }],
    }
  }

  async define(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    return { documentVersion: query.document.version, value: [] }
  }

  async diagnose(query: { document: DocumentSnapshot }) {
    return { documentVersion: query.document.version, value: [] }
  }

  async hover(query: SemanticQuery) {
    return { documentVersion: query.document.version, value: null }
  }

  async signatureHelp(query: SemanticQuery) {
    return { documentVersion: query.document.version, value: null }
  }

  dispose(): void {
    process.stderr.write("SCRIPTED_DISPOSE\n")
  }
}

function waitForAbort(
  signal?: AbortSignal,
): Promise<VersionedSemanticResult<SemanticCompletion[]>> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    signal?.addEventListener("abort", () => reject(abortError()), { once: true })
  })
}

function abortError(): Error {
  const error = new Error("Scripted semantic request aborted")
  error.name = "AbortError"
  return error
}

const projects = new SingleRootProjectResolver(pathToFileURL(process.cwd()).href)
runLanguageServer({ projects, semantic: new ScriptedSemanticEngine() })
