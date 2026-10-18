import { TypeScriptLanguageServiceEngine, type TypeScriptLanguageServiceEngineOptions } from "./typescript-language-service.js"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { ProjectFileAccessPort } from "../workspace/document-store.js"
import type { ReferenceSearchRuntimeConfig } from "../../semantic/references/reference-runtime.js"
import { referenceCheckpoint } from "../../semantic/references/reference-context-retention.js"

type Trace = (event: string, fields: Readonly<Record<string, string | number | boolean | null | undefined>>) => void

/** One compiler/SDK profile per registry; configuration replacement disposes all profile owners. */
export function createTypeScriptEngine(rootPath: string, packageResolver: LocalPackageResolver,
  onSdkSelected: TypeScriptLanguageServiceEngineOptions["onSdkSelected"], projectFileAccess: ProjectFileAccessPort | undefined,
  sdkConfiguration: unknown, options: {
    readonly references?: ReferenceSearchRuntimeConfig
    readonly hostCancellationToken?: TypeScriptLanguageServiceEngineOptions["hostCancellationToken"]
    readonly interactiveSdkAmbientProfile?: TypeScriptLanguageServiceEngineOptions["sdkAmbientProfile"]
  }, trace: Trace): TypeScriptLanguageServiceEngine {
    return new TypeScriptLanguageServiceEngine(rootPath, {
      packageResolver: packageResolver,
      onSdkSelected: onSdkSelected,
      onScriptAdmission: options.references?.trace ? fields => trace("semantic.prepare.script-admission", fields) : undefined,
      onResidentReferenceProofFailure: options.references?.trace
        ? fields => trace("references.resident.proof.rejected", { ...fields }) : undefined,
      projectFileAccess: projectFileAccess,
      sdkConfiguration: sdkConfiguration,
      hostCancellationToken: options.hostCancellationToken,
      checkpoint: options.references?.residentFastPath
        ? referenceCheckpoint(options.hostCancellationToken) : undefined,
      sdkAmbientProfile: options.interactiveSdkAmbientProfile,
      residentReferenceReuse: options.references?.residentFastPath === true,
    })
}
