import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import type { HarmonySdkTarget } from "../../project/harmony-sdk-target.js"
import { bindSdkTarget } from "../sdk/target-qualification.js"
import { discoverProjectSdk } from "../sdk/project-sdk.js"
import { arktsLanguageServiceOptions } from "./arkts-language-service-options.js"
import { discoverSdkAmbientDeclarations, type TypeScriptSdkAmbientProfile } from "./typescript-sdk-ambient.js"
import { canonicalExistingPath } from "./typescript-source-boundary.js"

/** Bind all SDK discovery/option/ambient reads to the actual compiler owner's witness. */
export function loadCompilerSdk(root: string, configuration: unknown,
  inputs: LoadedConfigurationWitness | undefined, profile: TypeScriptSdkAmbientProfile, target?: HarmonySdkTarget) {
  const installation = discoverProjectSdk(root, process.env.ARKLINE_HARMONY_SDK_PATH, configuration, inputs)
  const selection = target ? bindSdkTarget(installation, target, inputs) : installation
  const options = arktsLanguageServiceOptions(selection.path, inputs)
  const compatible = selection.targetQualification?.compatibleApi
  if (selection.targetQualification?.status === "compatible" && compatible !== undefined) options.compatibleSdkVersion = compatible
  return {
    selection,
    options,
    physicalRoot: selection.path ? canonicalExistingPath(selection.path) : undefined,
    ambientPaths: discoverSdkAmbientDeclarations(selection.path, profile, inputs),
  }
}
