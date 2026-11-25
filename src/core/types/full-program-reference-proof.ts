import { referenceTypeInputsResolved } from "./reference-type-inputs-resolved.js"
import path from "node:path"
import ts from "typescript"
import { createHash } from "node:crypto"
import type { FullProgramReferenceQueryProof, ReferenceQueryProofRefusal } from "../../contracts/reference-query-proof.js"
import type { RetainedInputFact } from "../../project/retained-input-facts.js"
import { compilerArtifactIdentity } from "./typescript-compiler-artifact.js"

/** Coverage is checked separately against the immutable full workspace by the
 * executor. Errorful/unknown binding environments never acquire this receipt. */
export function fullProgramReferenceProof(program: ts.Program | undefined, searchedPaths: readonly string[] | undefined,
  filePath: string, originalText: string, includeDeclaration: boolean, definitions: readonly ts.DefinitionInfo[],
  captureInputs: ((program: ts.Program) => readonly RetainedInputFact[] | undefined) | undefined, checkpoint: () => void,
  onRefused?: (reason: ReferenceQueryProofRefusal) => void): FullProgramReferenceQueryProof | undefined {
  const refuse = (reason: ReferenceQueryProofRefusal): undefined => { onRefused?.(reason); return undefined }
  if (!program || !searchedPaths?.length) return refuse("program-unobserved")
  if (!compilerArtifactIdentity) return refuse("compiler-unidentified")
  if (!captureInputs) return refuse("sdk-environment-unqualified")
  if (definitions.length !== 1) return refuse("anchor-count-unproven")
  const source = program.getSourceFile(filePath)
  if (!source || source.text !== originalText) return refuse("query-source-unproven")
  const definition = definitions[0]
  const anchorSource = program.getSourceFile(definition.fileName)
  if (!anchorSource || anchorSource.isDeclarationFile || !ts.isExternalModule(anchorSource)) return refuse("anchor-not-project-export")
  const declaration = anchorSource.statements.find((statement): statement is ts.ClassDeclaration | ts.InterfaceDeclaration | ts.FunctionDeclaration | ts.EnumDeclaration =>
    (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isEnumDeclaration(statement))
      && statement.name?.getStart(anchorSource) === definition.textSpan.start)
  if (!declaration || !(ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export)
    || !("name" in declaration) || !declaration.name) return refuse("anchor-declaration-unproven")
  const symbol = program.getTypeChecker().getSymbolAtLocation(declaration.name)
  if (symbol?.declarations?.length !== 1) return refuse("anchor-merge-unproven")
  checkpoint()
  // Conservative eligibility only: diagnostics do not change the normal result.
  if (program.getSyntacticDiagnostics().length || program.getGlobalDiagnostics().length || program.getSemanticDiagnostics().length) return refuse("program-diagnostics")
  checkpoint()
  if (!referenceTypeInputsResolved(program, searchedPaths, checkpoint)) return refuse("unresolved-type-inputs")
  const facts = captureInputs(program)
  if (!facts?.length) return refuse("original-inputs-unproven")
  return Object.freeze({ version: 1, coverage: "full-program", scope: "program", path: path.resolve(filePath),
    sourceSha256: createHash("sha256").update(originalText).digest("hex"),
    compilerSha256: compilerArtifactIdentity.compilerSha256, includeDeclaration,
    anchor: Object.freeze({ path: path.resolve(definition.fileName), start: definition.textSpan.start, length: definition.textSpan.length }),
    searchedPaths: Object.freeze([...searchedPaths].sort()), facts })
}
