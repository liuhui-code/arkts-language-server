import { defaultHarmonySdkCandidates } from "../../../src/core/sdk/discovery.js"

export function candidatesForDarwinHome(homeDirectory: string): string[] {
  return defaultHarmonySdkCandidates("darwin", homeDirectory)
}
