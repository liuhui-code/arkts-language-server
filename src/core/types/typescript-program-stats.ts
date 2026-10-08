import path from "node:path"
import type ts from "typescript"

const observedPrograms = new WeakMap<ts.Program, number>()
let nextProgramSequence = 0
const observedCheckers = new WeakMap<ts.TypeChecker, number>()
let nextCheckerSequence = 0
const observedSourceFiles = new WeakSet<ts.SourceFile>()

/** Counts the existing Program only; does not create a second semantic owner. */
export function typescriptProgramStats(program: ts.Program | undefined, rootPath: string, sdkRoot?: string | null) {
  const sourceFiles = program?.getSourceFiles() ?? []
  const rootFileNames = program?.getRootFileNames() ?? []
  const observeSourceFileIdentity = process.env.ARKTS_REFERENCES_TRACE === "1"
  const counts = {
    // Post-query observation in this worker isolate, not a compiler build count.
    programSequence: sequenceFor(program),
    // This post-query getter is trace-only; identity may change for one Program.
    checkerSequence: observeSourceFileIdentity ? checkerSequenceFor(program) : 0,
    programSourceFiles: sourceFiles.length, programProjectFiles: 0, sdkSourceFiles: 0,
    projectSourceFilesReused: 0, projectSourceFilesFirstObserved: 0,
    sdkSourceFilesReused: 0, sdkSourceFilesFirstObserved: 0,
    programRootFiles: rootFileNames.length, programProjectRootFiles: 0, sdkRootFiles: 0,
    otherRootFiles: 0, projectTextCodeUnits: 0, sdkTextCodeUnits: 0,
    otherSourceFiles: 0, otherTextCodeUnits: 0,
  }
  for (const sourceFile of sourceFiles) {
    const reused = observeSourceFileIdentity && observedSourceFiles.has(sourceFile)
    if (observeSourceFileIdentity && !reused) observedSourceFiles.add(sourceFile)
    const filePath = path.resolve(sourceFile.fileName)
    if (sdkRoot && within(sdkRoot, filePath)) {
      counts.sdkSourceFiles += 1
      if (observeSourceFileIdentity) {
        if (reused) counts.sdkSourceFilesReused += 1
        else counts.sdkSourceFilesFirstObserved += 1
      }
      counts.sdkTextCodeUnits += sourceFile.text.length
    } else if (within(rootPath, filePath)) {
      counts.programProjectFiles += 1
      if (observeSourceFileIdentity) {
        if (reused) counts.projectSourceFilesReused += 1
        else counts.projectSourceFilesFirstObserved += 1
      }
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

function sequenceFor(program: ts.Program | undefined): number {
  if (!program) return 0
  const existing = observedPrograms.get(program)
  if (existing !== undefined) return existing
  const sequence = ++nextProgramSequence
  observedPrograms.set(program, sequence)
  return sequence
}

function checkerSequenceFor(program: ts.Program | undefined): number {
  if (!program) return 0
  try {
    const checker = program.getTypeChecker()
    const existing = observedCheckers.get(checker)
    if (existing !== undefined) return existing
    const sequence = ++nextCheckerSequence
    observedCheckers.set(checker, sequence)
    return sequence
  } catch {
    // Optional observation must not change a completed semantic response.
    return 0
  }
}

function within(rootPath: string, filePath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(filePath))
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
