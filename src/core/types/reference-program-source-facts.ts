import path from "node:path"
import type ts from "typescript"
import { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { safeRead } from "./typescript-safe-source-read.js"
import { createSourceDocument } from "./source-document.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

/** Issuance only, inside the original query lease. Actual bytes bracketed by
 * full identities must equal the exact compiler SourceFile (not just its hash).
 * Register these facts with the query's owner so its final fence rechecks them.
 * Authoritative overlays are bound separately by the full namespace + versions. */
export function referenceProgramSourceFacts(program: ts.Program, checkpoint: () => void,
  witness = new LoadedConfigurationWitness(), overlaySource: (file: string) => string | undefined = () => undefined) {
  for (const source of program.getSourceFiles()) {
    checkpoint()
    const file = path.resolve(source.fileName)
    const overlay = overlaySource(file)
    const content = overlay ?? witness.observe(file, () => safeRead(file))
    if (content === null || (/\.ets$/i.test(file) ? createSourceDocument(content).generatedContent : content) !== source.text)
      throw new SemanticInputUnavailableError()
  }
  const proof = witness.captureConfigurationBeforeSourceReset(checkpoint, () => false)
  if (!proof.facts || !proof.current(checkpoint)) throw new SemanticInputUnavailableError()
  return proof.facts
}
