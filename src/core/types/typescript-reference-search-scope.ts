import path from "node:path"
import type ts from "typescript"

/** Never unions Programs: only a completed, unique-anchor search can prove scope. */
export function completedReferenceSearchPaths(
  before: ts.Program | undefined,
  after: ts.Program | undefined,
  definitions: number,
  returnedSymbols: boolean,
  rootPath: string,
): readonly string[] | undefined {
  if (!before || before !== after || definitions !== 1 || !returnedSymbols) return undefined
  return before.getSourceFiles().map(source => path.resolve(source.fileName)).filter(filePath => {
    const relative = path.relative(rootPath, filePath)
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  })
}
