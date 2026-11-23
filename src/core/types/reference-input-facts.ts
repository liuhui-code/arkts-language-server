import type ts from "typescript"
import { referenceProgramSourceFacts } from "./reference-program-source-facts.js"
import { captureVerifierSdkInputFacts } from "./verifier-sdk-lookups.js"
import type { ProjectSdkSelection } from "../sdk/project-sdk.js"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { retainedInputFactsCurrent, type RetainedInputFact } from "../../project/retained-input-facts.js"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"

/** Snapshot original compiler + resolver + project-model load/lookup evidence.
 * Later checks do raw identity IO; no source is restamped into an old answer. */
export function referenceInputFacts(witness: LoadedConfigurationWitness | undefined,
  resolver: LocalPackageResolver, rootPath: string, checkpoint: () => void, program: ts.Program,
  overlaySource: (file: string) => string | undefined): readonly RetainedInputFact[] | undefined {
  if (!witness) return undefined
  const compiler = referenceProgramSourceFacts(program, checkpoint, witness, overlaySource)
  const configuration = resolver.captureInputFacts(rootPath, checkpoint)
  const sdkLookups = captureVerifierSdkInputFacts(witness, checkpoint)
  if (!compiler || !configuration || !sdkLookups) return undefined
  const facts = new Map<string, RetainedInputFact>()
  for (const fact of [...compiler, ...configuration, ...sdkLookups]) {
    checkpoint()
    const key = `${fact.directoryOnly}\0${fact.filePath}`
    if (facts.has(key) && facts.get(key)!.identity !== fact.identity) return undefined
    facts.set(key, fact)
  }
  const result = Object.freeze([...facts.values()])
  return result.length && retainedInputFactsCurrent(result, checkpoint) ? result : undefined
}

/** Do not add an all-Program diagnostic pass to legacy READY searches. The
 * partial producer requires a fully selected distribution, not a missing SDK. */
export function canProveReferenceEnvironment(sdk: ProjectSdkSelection, ambientProfile: string): boolean {
  return sdk.ready && sdk.identity?.status === "identified" && ambientProfile === "full" && !!sdk.components?.length
    && sdk.components.every(component => !component.issue)
    && (sdk.targetQualification?.status === "mismatch" || sdk.targetQualification?.status === "unverified")
}
