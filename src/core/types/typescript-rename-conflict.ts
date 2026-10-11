import ts from "typescript"

type RenameConflictPreflight = "not-applicable" | "clear" | "conflict" | "indeterminate"

export function isIdentifierText(value: string) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, value)
  return scanner.scan() === ts.SyntaxKind.Identifier
    && scanner.scan() === ts.SyntaxKind.EndOfFileToken
}

export function preflightRenameConflict(
  service: ts.LanguageService,
  filePath: string,
  triggerOffset: number,
  newName: string,
): RenameConflictPreflight {
  const program = service.getProgram()
  const sourceFile = program?.getSourceFile(filePath)
  if (!program || !sourceFile) return "indeterminate"
  const target = identifierAtPosition(sourceFile, triggerOffset)
  if (!target) return "not-applicable"
  const checker = program.getTypeChecker()
  const targetSymbol = checker.getSymbolAtLocation(target)
  const member = targetSymbol?.declarations?.find(declaration => (
    (ts.isPropertyDeclaration(declaration) || ts.isMethodDeclaration(declaration)
      || ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration))
    && ts.isClassLike(declaration.parent)
  ))
  if (targetSymbol && member && ts.isClassLike(member.parent)) {
    const owner = member.parent
    const classSymbol = owner.name ? checker.getSymbolAtLocation(owner.name) : undefined
    const ownerType = ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static
      ? classSymbol && checker.getTypeOfSymbolAtLocation(classSymbol, owner)
      : checker.getTypeAtLocation(owner)
    if (!ownerType) return "indeterminate"
    const candidate = checker.getPropertyOfType(ownerType, newName)
    if (!candidate || canonicalExportSymbol(checker, candidate) === canonicalExportSymbol(checker, targetSymbol)) {
      return "clear"
    }
    return candidate.declarations?.some(declaration => declaration.parent === owner)
      ? "conflict" : "not-applicable"
  }
  const topLevelClass = ts.isClassDeclaration(target.parent)
    && target.parent.name === target && ts.isSourceFile(target.parent.parent)
  const localAlias = targetSymbol?.declarations?.find((declaration): declaration is ts.ImportSpecifier => (
    ts.isImportSpecifier(declaration) && declaration.propertyName !== undefined
    && declaration.name.text === target.text && declaration.getSourceFile() === sourceFile
  ))
  if (!topLevelClass && !localAlias) return "not-applicable"
  if (!targetSymbol) return "indeterminate"
  const canonicalTarget = canonicalExportSymbol(checker, targetSymbol)
  // An import binding belongs to the module scope, even when triggered inside a function.
  const candidate = checker.getSymbolsInScope(localAlias?.name ?? target,
    ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace | ts.SymbolFlags.Alias)
    .find(symbol => symbol.name === newName)
  if (!candidate) return "clear"
  const canonicalCandidate = canonicalExportSymbol(checker, candidate)
  if (canonicalCandidate === canonicalTarget) return "clear"
  if (!canonicalCandidate.declarations?.some(declaration => declaration.getSourceFile() === sourceFile)) {
    return "clear"
  }
  if (!localAlias) return canonicalCandidate.flags & ts.SymbolFlags.ClassExcludes ? "conflict" : "clear"
  if (canonicalCandidate.flags & ts.SymbolFlags.Alias) return "conflict"
  const imported = canonicalExportSymbol(checker, checker.getAliasedSymbol(targetSymbol))
  const meanings = [ts.SymbolFlags.Value, ts.SymbolFlags.Type, ts.SymbolFlags.Namespace]
  if (!meanings.some(meaning => imported.flags & meaning)) return "indeterminate"
  return meanings.some(meaning => (imported.flags & meaning) && (canonicalCandidate.flags & meaning))
    ? "conflict" : "clear"
}

function canonicalExportSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return checker.getMergedSymbol(checker.getExportSymbolOfSymbol(symbol))
}

function identifierAtPosition(sourceFile: ts.SourceFile, position: number): ts.Identifier | undefined {
  let result: ts.Identifier | undefined
  const visit = (node: ts.Node): void => {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) return
    if (ts.isIdentifier(node)) result = node
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}
