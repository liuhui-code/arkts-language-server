import path from "node:path"
import type ts from "typescript"

/** Counts the existing Program only; does not create a second semantic owner. */
export function typescriptProgramStats(program: ts.Program | undefined, rootPath: string, sdkRoot?: string | null) {
  const sourceFiles = program?.getSourceFiles() ?? []
  const rootFileNames = program?.getRootFileNames() ?? []
  const counts = {
    programSourceFiles: sourceFiles.length, programProjectFiles: 0, sdkSourceFiles: 0,
    programRootFiles: rootFileNames.length, programProjectRootFiles: 0, sdkRootFiles: 0,
    otherRootFiles: 0, projectTextCodeUnits: 0, sdkTextCodeUnits: 0,
    otherSourceFiles: 0, otherTextCodeUnits: 0,
  }
  for (const sourceFile of sourceFiles) {
    const filePath = path.resolve(sourceFile.fileName)
    if (sdkRoot && within(sdkRoot, filePath)) {
      counts.sdkSourceFiles += 1
      counts.sdkTextCodeUnits += sourceFile.text.length
    } else if (within(rootPath, filePath)) {
      counts.programProjectFiles += 1
      counts.projectTextCodeUnits += sourceFile.text.length
    } else {
      counts.otherSourceFiles += 1
      counts.otherTextCodeUnits += sourceFile.text.length
    }
  }
  for (const rootFileName of rootFileNames) {
    const filePath = path.resolve(rootFileName)
    if (sdkRoot && within(sdkRoot, filePath)) counts.sdkRootFiles += 1
    else if (within(rootPath, filePath)) counts.programProjectRootFiles += 1
    else counts.otherRootFiles += 1
  }
  return counts
}

function within(rootPath: string, filePath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(filePath))
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
