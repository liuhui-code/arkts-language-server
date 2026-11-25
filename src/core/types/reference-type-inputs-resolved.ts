import ts from "typescript"
import { CooperativeWork } from "./cooperative-work.js"

/** Root the proof in the compiler search's project files, not every auto-loaded
 * ambient type. Follow actual checker bindings into SDK declarations. All source
 * and lookup facts (including unused SDK files) still join independent fences. */
export function referenceTypeInputsResolved(program: ts.Program, projectPaths: readonly string[], checkpoint: () => void): boolean {
  const checker = program.getTypeChecker(), work = new CooperativeWork(checkpoint)
  const allSources = new Set(program.getSourceFiles())
  const roots = new Set(projectPaths.map(file => program.getSourceFile(file)).filter((file): file is ts.SourceFile => !!file))
  const pending: ts.Node[] = [...roots], visited = new Set<ts.Node>()
  const scopeBindings = new WeakMap<ts.Symbol, Map<number, boolean>>()
  let complete = true
  const resolved = (node: ts.Node, meaning = ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace, expand = true): boolean => {
    const symbol = checker.getSymbolAtLocation(node)
    const target = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
    if (!target || !(target.flags & meaning)) return false
    if (target.declarations?.length) {
      for (const declaration of target.declarations) {
        const source = declaration.getSourceFile()
        if (!allSources.has(source)) return false
        if (expand && !roots.has(source) && !program.isSourceFileDefaultLibrary(source)) pending.push(declaration)
      }
      return true
    }
    if (!ts.isIdentifier(node)) return false
    // Intrinsic bindings have no declaration; transient error symbols are not
    // members of the actual scope. Never accept by spelling or flags alone.
    let bindings = scopeBindings.get(target)
    if (!bindings) { bindings = new Map(); scopeBindings.set(target, bindings) }
    const known = bindings.get(meaning)
    if (known !== undefined) return known
    const bound = checker.getSymbolsInScope(node, meaning).includes(target)
    bindings.set(meaning, bound)
    return bound
  }
  const visit = (node: ts.Node): void => {
    work.item()
    if (!complete || visited.has(node)) return
    visited.add(node)
    if (ts.isTypeReferenceNode(node)) complete = resolved(node.typeName, ts.SymbolFlags.Type)
    else if (ts.isExpressionWithTypeArguments(node)) complete = resolved(node.expression, ts.SymbolFlags.Type)
    else if (ts.isTypeQueryNode(node)) complete = resolved(node.exprName, ts.SymbolFlags.Value)
    else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      complete = !node.moduleSpecifier || resolved(node.moduleSpecifier, ts.SymbolFlags.Namespace, false)
    else if (ts.isExternalModuleReference(node)) complete = !!node.expression && resolved(node.expression, ts.SymbolFlags.Namespace, false)
    else if (ts.isImportSpecifier(node) || ts.isExportSpecifier(node) || ts.isNamespaceImport(node) || ts.isImportEqualsDeclaration(node))
      complete = resolved(node.name)
    else if (ts.isImportClause(node) && node.name) complete = resolved(node.name)
    else if (ts.isImportTypeNode(node)) {
      complete = ts.isLiteralTypeNode(node.argument) && resolved(node.argument.literal, ts.SymbolFlags.Namespace, !node.qualifier)
        && (!node.qualifier || resolved(node.qualifier, node.isTypeOf ? ts.SymbolFlags.Value : ts.SymbolFlags.Type))
    } else if (ts.isIdentifier(node) && roots.has(node.getSourceFile()) && !label(node)) complete = resolved(node)
    if (complete) ts.forEachChild(node, visit)
  }
  while (pending.length) {
    work.boundary()
    visit(pending.pop()!)
    if (!complete) return false
  }
  return work.finish(roots.size === projectPaths.length)
}

function label(node: ts.Identifier): boolean {
  const parent = node.parent
  return (ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node
}
