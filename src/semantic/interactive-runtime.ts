import type { TypeScriptSdkAmbientProfile } from "../core/types/typescript-language-service.js"

export interface InteractiveSemanticRuntimeConfig {
  readonly sdkAmbientProfile: Extract<TypeScriptSdkAmbientProfile, "full" | "core">
}

export function interactiveSemanticRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): InteractiveSemanticRuntimeConfig {
  const sdkAmbientProfile = environment.ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE ?? "full"
  if (sdkAmbientProfile !== "full" && sdkAmbientProfile !== "core") {
    throw new Error("ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE must be full or core")
  }
  return { sdkAmbientProfile }
}
