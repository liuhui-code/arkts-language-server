import ts from "typescript"

export function normalizedDefinitionSpan(
  sourceFile: ts.SourceFile | undefined,
  content: string,
  definition: {
    textSpan: ts.TextSpan
    name?: string
    kind?: ts.ScriptElementKind
  },
): ts.TextSpan {
  const current = content.slice(
    definition.textSpan.start,
    definition.textSpan.start + definition.textSpan.length,
  )
  if (!definition.name || current === definition.name || !sourceFile) {
    return definition.textSpan
  }
  let best: ts.Identifier | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  const visit = (node: ts.Node): void => {
    const name = ts.isStructDeclaration(node) ? node.name : undefined
    if (name && name.text === definition.name) {
      const distance = Math.abs(name.getStart(sourceFile) - definition.textSpan.start)
      if (distance < bestDistance) {
        best = name
        bestDistance = distance
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return best
    ? { start: best.getStart(sourceFile), length: best.getWidth(sourceFile) }
    : definition.textSpan
}
