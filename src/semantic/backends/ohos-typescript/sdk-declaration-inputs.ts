import path from "node:path"
import type ts from "typescript"

interface CompilerDeclaration extends ts.SourceFile {
  imports?: readonly ts.StringLiteralLike[]
  resolvedModules?: ts.ModeAwareCache<ts.ResolvedModuleFull | undefined>
  resolvedTypeReferenceDirectiveNames?: ts.ModeAwareCache<ts.ResolvedTypeReferenceDirective | undefined>
}

/** Read the pinned compiler's completed resolution table; skipLibCheck hides these failures. */
export function sdkDeclarationInputCheck(program: ts.Program, checkpoint: () => void = () => {}) {
  return (source: ts.SourceFile): boolean => {
    const file = source as CompilerDeclaration
    if (file.referencedFiles.some(reference => {
      checkpoint()
      return !program.getSourceFile(path.resolve(path.dirname(file.fileName), reference.fileName))
    })) return false
    let complete = true
    file.resolvedModules?.forEach((resolution, name) => {
      checkpoint()
      // Ambient and wildcard modules have no physical resolution. Ask the
      // compiler about its own import literal, never reimplement that binding.
      const bound = resolution ? program.getSourceFile(resolution.resolvedFileName)
        : file.imports?.some(reference => reference.text === name
          && program.getTypeChecker().getSymbolAtLocation(reference) !== undefined)
      if (!bound) complete = false
    })
    file.resolvedTypeReferenceDirectiveNames?.forEach(resolution => {
      checkpoint()
      if (!resolution?.resolvedFileName || !program.getSourceFile(resolution.resolvedFileName)) complete = false
    })
    return complete
  }
}
