import ts from "typescript"
import { createHash } from "node:crypto"
import { globalDeclarationSummary, type GlobalDeclarationSummary } from "./global-declaration-summary.js"
import { sourceExportSummary, type SourceExportSummary } from "./source-export-summary.js"

export interface ProjectSourceRole { readonly ambient: boolean; readonly dependencies: string; readonly dependencyFree: boolean; readonly modules: readonly string[]; readonly opaque: boolean; readonly references: readonly string[]; readonly globals: GlobalDeclarationSummary; readonly exports: SourceExportSummary }

/** Syntax metadata only; this function never retains a SourceFile, binder or text. */
export function projectSourceRole(file: string, text: string, options: ts.CompilerOptions): ProjectSourceRole {
  const source = ts.createSourceFile(file, text, options.target ?? ts.ScriptTarget.ES2022, false,
    file.endsWith(".ets") ? ts.ScriptKind.ETS : ts.ScriptKind.TS, options)
  return projectSourceRoleFromFile(source, options)
}

export function projectSourceRoleFromFile(source: ts.SourceFile, options: ts.CompilerOptions): ProjectSourceRole {
  let ambient = !ts.isExternalModule(source) || source.hasNoDefaultLib
    || source.referencedFiles.length > 0 || source.typeReferenceDirectives.length > 0
    || source.libReferenceDirectives.length > 0
    || ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length ?? 0) > 0
  let moduleRequests = options.importHelpers === true || options.jsx === ts.JsxEmit.ReactJSX
    || options.jsx === ts.JsxEmit.ReactJSXDev || options.jsxImportSource !== undefined
  let opaque = /\.[cm]?jsx?$/i.test(source.fileName) || options.importHelpers === true || options.jsx === ts.JsxEmit.ReactJSX
    || options.jsx === ts.JsxEmit.ReactJSXDev || options.jsxImportSource !== undefined
    || source.typeReferenceDirectives.length > 0 || source.libReferenceDirectives.length > 0
  const imports: string[] = []
  const add = (name: ts.Expression | undefined) => { if (name && ts.isStringLiteralLike(name)) imports.push(name.text) }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node)
      || ts.isDecoratorOrAnnotation(node) || node.kind === ts.SyntaxKind.StructDeclaration
      || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) moduleRequests = true
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) moduleRequests = true
    // Conservative for namespaces/UMD/global augmentations, not for a module-local
    // `declare interface`: those declarations do not create project-wide names.
    if (ts.isModuleDeclaration(node) && (ts.isStringLiteral(node.name) || (node.flags & ts.NodeFlags.GlobalAugmentation) !== 0)
      || node.kind === ts.SyntaxKind.NamespaceExportDeclaration) ambient = true
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) add(node.name)
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier)
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression)
    if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) add(node.argument.literal)
      else opaque = true
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === "require")) { moduleRequests = true; add(node.arguments[0]); if (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0])) opaque = true }
    ts.forEachChild(node, visit)
    for (const doc of (node as ts.Node & { jsDoc?: readonly ts.JSDoc[] }).jsDoc ?? []) ts.forEachChild(doc, visit)
  }
  visit(source)
  const modules: string[] = JSON.parse(JSON.stringify(imports))
  const references: string[] = JSON.parse(JSON.stringify(source.referencedFiles.map(reference => reference.fileName)))
  const globals = globalDeclarationSummary(source)
  const exports = sourceExportSummary(source)
  return { ambient, modules, references, opaque, globals, exports, dependencyFree: !moduleRequests && !source.referencedFiles.length
    && !source.typeReferenceDirectives.length && !source.libReferenceDirectives.length, dependencies: createHash("sha256").update(JSON.stringify([imports, moduleRequests,
    source.referencedFiles.map(reference => reference.fileName), source.typeReferenceDirectives.map(reference => reference.fileName),
    source.libReferenceDirectives.map(reference => reference.fileName), globals, exports])).digest("hex") }
}
