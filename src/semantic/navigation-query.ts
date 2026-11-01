import { pathToFileURL } from "node:url"
import type { SemanticDefinition, SemanticQuery, VersionedSemanticResult } from "../contracts/semantic-engine.js"
import type { SemanticDocumentPosition } from "../core/protocol.js"
import type { SemanticTypeQueryContext } from "../core/types/type-engine-contract.js"
import { withSynchronousInputPreparation } from "../project/request-input-validation.js"
import { toPublicRange } from "./legacy-result-mappers.js"

interface NavigationPreparation {
  readonly engine: Pick<SemanticTypeQueryContext, "define" | "typeDefinitions">
  readonly position: SemanticDocumentPosition
}

/** Preparation shares observations, while the existing engine lease owns the fresh final fence. */
export function runNavigationQuery(method: "define" | "typeDefinitions", query: SemanticQuery, ports: {
  sync(): void
  prepare(scope: boolean | "definition-fallback"): NavigationPreparation
}): VersionedSemanticResult<SemanticDefinition[]> {
  return withSynchronousInputPreparation(() => {
    checkpoint(query.signal)
    ports.sync()
    const prepared = ports.prepare(false)
    let definitions = prepared.engine[method](prepared.position)
    if (method === "define" && definitions.length === 0) {
      checkpoint(query.signal)
      const complete = ports.prepare("definition-fallback")
      definitions = complete.engine.define(complete.position)
    }
    return { documentVersion: query.document.version, value: definitions.map(target => ({
      uri: pathToFileURL(target.path).href, range: toPublicRange(target.range),
    })) }
  })
}

function checkpoint(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled")
}
