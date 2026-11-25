import { SemanticInputUnavailableError, SemanticResultInvalidatedError } from "../../core/types/typescript-query-inputs.js"
import { readReferenceQueryProof, type ReferenceQueryProof, type FullProgramReferenceQueryProof } from "../../contracts/reference-query-proof.js"

/** All necessary batches must provide compatible immutable evidence. Missing or
 * conflicting evidence stays rejected; union alone never establishes coverage. */
export class ReferenceProofConsensus {
  private proof: ReferenceQueryProof | undefined
  private rejected = false
  observe(input: unknown): void {
    const next = readReferenceQueryProof(input)
    if (!next) { this.rejected = true; return }
    if (!this.proof) { this.proof = next; return }
    if (this.proof.coverage === "full-program" && next.coverage === "full-program") {
      const merged = mergeProgramProofs(this.proof, next)
      if (!merged) this.rejected = true
      else this.proof = merged
    } else if (JSON.stringify(this.proof) !== JSON.stringify(next)) this.rejected = true
  }
  get value(): ReferenceQueryProof | undefined { return this.rejected ? undefined : this.proof }
}

function mergeProgramProofs(left: FullProgramReferenceQueryProof, right: FullProgramReferenceQueryProof): FullProgramReferenceQueryProof | undefined {
  const { facts: leftFacts, searchedPaths: leftPaths, ...leftQuery } = left
  const { facts: rightFacts, searchedPaths: rightPaths, ...rightQuery } = right
  if (JSON.stringify(leftQuery) !== JSON.stringify(rightQuery)) return undefined
  const facts = new Map<string, typeof leftFacts[number]>()
  for (const fact of [...leftFacts, ...rightFacts]) {
    const key = `${fact.directoryOnly}\0${fact.filePath}`
    const previous = facts.get(key)
    if (previous && previous.identity !== fact.identity)
      throw new SemanticResultInvalidatedError(new SemanticInputUnavailableError())
    facts.set(key, fact)
  }
  return Object.freeze({ ...left, searchedPaths: Object.freeze([...new Set([...leftPaths, ...rightPaths])].sort()),
    facts: Object.freeze([...facts.values()]) })
}
