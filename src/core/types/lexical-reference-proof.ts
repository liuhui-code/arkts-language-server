import ts from "typescript"
import path from "node:path"
import { createHash } from "node:crypto"
import type { LexicalReferenceQueryProof } from "../../contracts/reference-query-proof.js"
import { compilerArtifactIdentity } from "./typescript-compiler-artifact.js"

/** First coverage producer: one direct block-scoped variable inside a function
 * body, bound to exactly one declaration. Excludes exports, aliases, properties,
 * destructuring, namespaces, ambient/error-recovery ASTs and transformed text.
 * Completeness follows from lexical binding, not the files returned by search. */
export function lexicalReferenceProof(program: ts.Program | undefined, filePath: string, offset: number,
  originalText: string, includeDeclaration: boolean, definitions: readonly ts.DefinitionInfo[], checkpoint: () => void): LexicalReferenceQueryProof | undefined {
  if (!program || !compilerArtifactIdentity) return undefined
  const source = program.getSourceFile(filePath)
  if (!source || source.text !== originalText || source.isDeclarationFile
    || ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length ?? 0)) return undefined
  let token: ts.Identifier | undefined
  const visit = (node: ts.Node): void => {
    checkpoint()
    if (offset < node.getStart(source) || offset >= node.end) return
    if (ts.isIdentifier(node)) token = node
    else ts.forEachChild(node, visit)
  }
  visit(source)
  if (!token) return undefined
  const symbol = program.getTypeChecker().getSymbolAtLocation(token)
  const declarations = symbol?.declarations
  if (!declarations || declarations.length !== 1) return undefined
  const declaration = declarations[0]
  if (!ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)
    || declaration.getSourceFile() !== source || !ts.isVariableDeclarationList(declaration.parent)
    || !(declaration.parent.flags & ts.NodeFlags.BlockScoped)) return undefined
  const statement = declaration.parent.parent
  if (!ts.isVariableStatement(statement) || statement.modifiers?.length || !ts.isBlock(statement.parent)) return undefined
  const block = statement.parent
  if (!ts.isFunctionLike(block.parent) || !("body" in block.parent) || block.parent.body !== block) return undefined
  if (definitions.length !== 1 || path.resolve(definitions[0].fileName) !== path.resolve(filePath)
    || definitions[0].textSpan.start !== declaration.name.getStart(source)
    || definitions[0].textSpan.length !== declaration.name.end - declaration.name.getStart(source)) return undefined
  let linkedProperty = false
  const checkLinks = (node: ts.Node): void => {
    checkpoint()
    if (ts.isShorthandPropertyAssignment(node) && program.getTypeChecker().getShorthandAssignmentValueSymbol(node) === symbol) linkedProperty = true
    ts.forEachChild(node, checkLinks)
  }
  checkLinks(block)
  if (linkedProperty) return undefined
  // The binding is in this function's body; another file or SDK declaration
  // cannot merge into it. A shadowed/local/property symbol is a different query.
  return Object.freeze({ version: 1, coverage: "lexical-block", path: path.resolve(filePath),
    sourceSha256: createHash("sha256").update(originalText).digest("hex"),
    compilerSha256: compilerArtifactIdentity.compilerSha256,
    declarationStart: declaration.name.getStart(source), scopeStart: block.getStart(source), scopeEnd: block.end,
    includeDeclaration })
}
