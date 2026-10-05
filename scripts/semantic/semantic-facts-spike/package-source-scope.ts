import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type ts from "typescript"

/** Compiler dependency sources are not project members or query-selection roots. */
export function admittedPackageSources(
  program: ts.Program, root: string, pinned: Readonly<Record<string, string>>,
): Map<string, ts.SourceFile> {
  const admitted = new Map<string, ts.SourceFile>()
  for (const source of program.getSourceFiles()) {
    const file = pinnedPackageFile(root, source.fileName, pinned)
    if (!file) continue
    const text = fs.readFileSync(fs.realpathSync(source.fileName), "utf8")
    if (source.text !== text || digest(text) !== pinned[file]) {
      throw new Error(`pinned package Program source changed: ${file}`)
    }
    const existing = admitted.get(file)
    if (existing && existing.text !== source.text) {
      throw new Error(`duplicate pinned package Program source differs: ${file}`)
    }
    admitted.set(file, source)
  }
  return admitted
}

export function pinnedPackageFile(
  root: string, fileName: string, pinned: Readonly<Record<string, string>>,
): string | null {
  if (!path.isAbsolute(fileName)) return null
  const lexical = path.resolve(fileName)
  const realRoot = fs.realpathSync(root)
  if (!within(path.resolve(root), lexical) && !within(realRoot, lexical)) return null
  let physical: string
  try { physical = fs.realpathSync(lexical) } catch { return null }
  if (!within(realRoot, physical)) return null
  const relative = path.relative(realRoot, physical).split(path.sep).join("/")
  return Object.hasOwn(pinned, relative) ? relative : null
}

function within(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}
