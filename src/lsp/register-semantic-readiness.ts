import { ErrorCodes, LSPErrorCodes, ResponseError, type Connection } from "vscode-languageserver/node.js"
import type { SemanticEnginePort } from "../contracts/semantic-engine.js"
import { semanticUnprepared } from "../contracts/semantic-readiness.js"

interface SemanticReadinessRegistration {
  readonly connection: Connection
  readonly semantic: SemanticEnginePort
  readonly assertRunning: () => void
  readonly workspaceRootUris: () => readonly string[]
}

/** Catalog completion alone never certifies a semantic generation. */
export function registerSemanticReadiness(options: SemanticReadinessRegistration): void {
  options.connection.onRequest("arkts/semanticReadiness", async (params: unknown, token) => {
    options.assertRunning()
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw new ResponseError(ErrorCodes.InvalidParams, "Expected a configured rootUri and boolean prepare")
    }
    const input = params as { rootUri?: unknown; prepare?: unknown }
    if (Object.keys(params).length !== 2 || typeof input.prepare !== "boolean"
      || typeof input.rootUri !== "string" || !options.workspaceRootUris().includes(input.rootUri)) {
      throw new ResponseError(ErrorCodes.InvalidParams, "Expected a configured rootUri and boolean prepare")
    }
    if (token.isCancellationRequested) {
      throw new ResponseError(LSPErrorCodes.RequestCancelled, "Semantic readiness request cancelled")
    }
    const controller = new AbortController()
    const cancellation = token.onCancellationRequested(() => controller.abort())
    try {
      const result = options.semantic.semanticReadiness
        ? await options.semantic.semanticReadiness({ rootUri: input.rootUri,
            prepare: input.prepare, signal: controller.signal })
        : semanticUnprepared(input.rootUri, "semantic-preparation-unavailable")
      options.assertRunning()
      if (token.isCancellationRequested) throw new ResponseError(LSPErrorCodes.RequestCancelled,
        "Semantic readiness request cancelled")
      return result
    } catch (error) {
      if (token.isCancellationRequested) throw new ResponseError(LSPErrorCodes.RequestCancelled,
        "Semantic readiness request cancelled")
      if (error instanceof ResponseError) throw error
      const code = (error as { code?: unknown } | null)?.code
      throw new ResponseError(code === "content-modified" ? LSPErrorCodes.ContentModified
        : code === "client-cancelled" ? LSPErrorCodes.RequestCancelled : LSPErrorCodes.RequestFailed,
      "Semantic readiness requires current complete workspace inputs")
    } finally {
      cancellation.dispose()
    }
  })
}
