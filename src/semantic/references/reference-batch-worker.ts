import type { SemanticDefinitionCandidate, SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type { ReferenceBatchVerification } from "./reference-search-executor.js"
import type { ReferenceSdkAmbientProfile, ReferenceSearchRuntimeConfig } from "./reference-runtime.js"
import type { TransientSemanticWorkerObserver } from "../transient-worker-lifecycle.js"
import { ReferenceVerifierClient } from "./reference-verifier-client.js"

export interface ReferenceAnchorVerification {
  readonly definitions: readonly SemanticDefinitionCandidate[]
  readonly timings: ReferenceBatchVerification["timings"]
  readonly prepared: ReferenceBatchVerification["prepared"]
  readonly stats: ReferenceBatchVerification["stats"]
  readonly memory: ReferenceBatchVerification["memory"]
}

export interface ReferenceBatchWorkerOptions {
  readonly client?: ReferenceVerifierClient
  readonly workerPath?: string
  readonly isCancellationRequested?: () => boolean
  readonly projectConfiguration?: unknown
  readonly sdkConfiguration?: unknown
  readonly sdkAmbientProfile?: ReferenceSdkAmbientProfile
  readonly trace?: boolean
  readonly tolerateUnadmittedProjectDependencies?: boolean
  readonly constructorScope?: boolean
  readonly onTransientWorker?: TransientSemanticWorkerObserver
}

/** Keep the fallback's configuration and cancellation ownership in one adapter. */
export function referenceWorkerOptions(client: ReferenceVerifierClient,
  projectConfiguration: unknown, sdkConfiguration: unknown, options: {
    readonly references?: Pick<ReferenceSearchRuntimeConfig, "sdkAmbientProfile" | "trace">
    readonly onTransientWorker?: TransientSemanticWorkerObserver
    readonly hostCancellationToken?: { isCancellationRequested(): boolean }
  }): ReferenceBatchWorkerOptions {
  return { client, projectConfiguration, sdkConfiguration,
    sdkAmbientProfile: options.references?.sdkAmbientProfile,
    trace: options.references?.trace, onTransientWorker: options.onTransientWorker,
    isCancellationRequested: options.hostCancellationToken
      ? () => options.hostCancellationToken?.isCancellationRequested() === true : undefined }
}

export async function verifyReferenceBatchInWorker(
  workspace: SemanticWorkspaceView,
  position: SemanticDocumentPosition,
  includeDeclaration: boolean,
  options: ReferenceBatchWorkerOptions,
): Promise<ReferenceBatchVerification> {
  return runReferenceWorker({
    operation: "references", workspace, position, includeDeclaration,
    projectConfiguration: options.projectConfiguration,
    sdkConfiguration: options.sdkConfiguration,
    sdkAmbientProfile: options.sdkAmbientProfile,
    trace: options.trace,
    tolerateUnadmittedProjectDependencies: options.tolerateUnadmittedProjectDependencies,
    constructorScope: options.constructorScope,
  }, options)
}

export function resolveReferenceAnchorInWorker(
  workspace: SemanticWorkspaceView,
  position: SemanticDocumentPosition,
  options: ReferenceBatchWorkerOptions,
): Promise<ReferenceAnchorVerification> {
  return runReferenceWorker({
    operation: "definition",
    workspace,
    position,
    projectConfiguration: options.projectConfiguration,
    sdkConfiguration: options.sdkConfiguration,
    sdkAmbientProfile: options.sdkAmbientProfile,
    trace: options.trace,
  }, options)
}

async function runReferenceWorker<Result>(
  input: { readonly operation: "definition" | "references"; readonly [key: string]: unknown },
  options: ReferenceBatchWorkerOptions,
): Promise<Result> {
  const client = options.client ?? new ReferenceVerifierClient()
  try { return await client.run<Result>(input, options) }
  finally { if (!options.client) client.dispose() }
}
