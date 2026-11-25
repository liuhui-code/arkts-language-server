import { lookupIdentity } from "./configuration-lookup-identity.js"

import type { RetainedInputFact } from "../contracts/retained-input-fact.js"
export type { RetainedInputFact } from "../contracts/retained-input-fact.js"

export function retainedInputFactsCurrent(facts: readonly RetainedInputFact[], checkpoint: () => void): boolean {
  checkpoint()
  for (const fact of facts) {
    checkpoint()
    if (lookupIdentity(fact.filePath, fact.directoryOnly)?.identity !== fact.identity) return false
  }
  checkpoint()
  return true
}
