import ts from "typescript"

export interface SourceExportSummary {
  readonly names: readonly string[]
  readonly stars: readonly string[]
  readonly unknown: boolean
}

/** A candidate superset only. Actual compiler exports still decide suggestions. */
export function sourceExportSummary(source: ts.SourceFile): SourceExportSummary {
  const names = new Set<string>(), stars = new Set<string>()
  let unknown = /\.[cm]?jsx?$/i.test(source.fileName)
    || ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length ?? 0) > 0
  const binding = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) names.add(name.text)
    else for (const element of name.elements) if (ts.isBindingElement(element)) binding(element.name)
  }
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const entry of statement.exportClause.elements) {
          if (entry.name.text === "default") unknown = true
          else names.add(entry.name.text)
        }
      } else if (statement.exportClause && ts.isNamespaceExport(statement.exportClause)) names.add(statement.exportClause.name.text)
      else if (statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) stars.add(statement.moduleSpecifier.text)
      else unknown = true
    } else if (ts.isExportAssignment(statement)) {
      if (!statement.isExportEquals && ts.isIdentifier(statement.expression)) names.add(statement.expression.text)
      else unknown = true
    } else {
      const declaration = statement as ts.Statement & { readonly modifiers?: readonly ts.ModifierLike[]; readonly name?: ts.DeclarationName }
      if (!declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue
      if (ts.isVariableStatement(statement)) for (const entry of statement.declarationList.declarations) binding(entry.name)
      else if (declaration.name && ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
      else unknown = true
    }
  }
  return JSON.parse(JSON.stringify({ names: [...names], stars: [...stars], unknown }))
}
