import ts from "typescript"

export interface GlobalDeclarationSummary {
  readonly names: readonly string[]
  readonly complete: boolean
  readonly plainDeclaration: boolean
}

/** Top-level binding domains, not member bodies or a substitute for binding. */
export function globalDeclarationSummary(source: ts.SourceFile): GlobalDeclarationSummary {
  const names = new Set<string>()
  let complete = !((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length)
  let plainDeclaration = source.isDeclarationFile && !ts.isExternalModule(source)
  const binding = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) names.add(name.text)
    else for (const element of name.elements) if (ts.isBindingElement(element)) binding(element.name)
  }
  const declarations = (statements: readonly ts.Statement[]): void => {
    for (const statement of statements) {
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) binding(declaration.name)
      else if (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)
        || ts.isTypeAliasDeclaration(statement) || ts.isFunctionDeclaration(statement)
        || ts.isEnumDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
        if (statement.name) names.add(statement.name.text)
        else complete = false
      } else if (ts.isModuleDeclaration(statement)) {
        if ((statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0) {
          plainDeclaration = false
          if (statement.body && ts.isModuleBlock(statement.body)) declarations(statement.body.statements)
          else complete = false
        } else if (ts.isIdentifier(statement.name)) names.add(statement.name.text)
        else plainDeclaration = false // Ambient module bindings do not introduce global names.
      } else if (!ts.isEmptyStatement(statement)) complete = false
    }
  }
  if (!ts.isExternalModule(source)) declarations(source.statements)
  const visit = (node: ts.Node): void => {
    if (ts.isModuleDeclaration(node) && (node.flags & ts.NodeFlags.GlobalAugmentation) !== 0) {
      plainDeclaration = false
      if (node.body && ts.isModuleBlock(node.body)) declarations(node.body.statements)
      else complete = false
      return
    }
    if (ts.isNamespaceExportDeclaration(node)) { plainDeclaration = false; names.add(node.name.text) }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { names: JSON.parse(JSON.stringify([...names])), complete, plainDeclaration }
}
