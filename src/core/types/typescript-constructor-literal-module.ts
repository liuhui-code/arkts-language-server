import ts from "typescript"

const MAX_SYNTAX_ITEMS = 4096

/** Closed module grammar, independent of a target name or compiler symbols. */
export function isConstructorLiteralModule(filePath: string, content: string): boolean {
  if (!/\.(?:ets|ts)$/u.test(filePath) || /\.d\.(?:ets|ts)$/u.test(filePath)) return false
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2022, false,
    filePath.endsWith(".ets") ? ts.ScriptKind.ETS : ts.ScriptKind.TS)
  // This pinned frontend exposes parse diagnostics. Missing evidence is unknown.
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics
  if (!Array.isArray(diagnostics) || diagnostics.length !== 0 || source.isDeclarationFile
    || !ts.isExternalModule(source) || source.referencedFiles.length !== 0
    || source.typeReferenceDirectives.length !== 0 || source.libReferenceDirectives.length !== 0
    || source.hasNoDefaultLib || source.statements.length === 0) return false
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, content)
  for (let count = 0; ; count += 1) {
    if (count >= MAX_SYNTAX_ITEMS) return false
    const token = scanner.scan()
    if (token === ts.SyntaxKind.EndOfFileToken) break
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const text = scanner.getTokenText()
      if (text.startsWith("///") || text.startsWith("/**") || text.includes("@")) return false
    }
  }
  let declarations = 0
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || statement.modifiers?.length !== 1
      || statement.modifiers[0]?.kind !== ts.SyntaxKind.ExportKeyword
      || !(statement.declarationList.flags & ts.NodeFlags.Const)) return false
    for (const declaration of statement.declarationList.declarations) {
      if (++declarations > MAX_SYNTAX_ITEMS || !ts.isIdentifier(declaration.name)
        || declaration.type || !declaration.initializer || !isScalar(declaration.initializer)) return false
    }
  }
  return declarations > 0
}

function isScalar(node: ts.Expression): boolean {
  return ts.isStringLiteral(node) || ts.isNumericLiteral(node)
    || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword
    || node.kind === ts.SyntaxKind.NullKeyword
}
