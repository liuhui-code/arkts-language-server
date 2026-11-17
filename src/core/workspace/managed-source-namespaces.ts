import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ManagedSourceDirectory, ManagedSourceRegistration } from "../../contracts/managed-source-namespace.js"
import { relativePathWithinRoot } from "../../project/path-identity.js"
import { canonicalWorkspaceRoot } from "./physical-path-identity.js"

export function observeManagedDirectory(directory: string): ManagedSourceDirectory {
  const before = fs.lstatSync(directory, { bigint: true })
  const canonical = fs.realpathSync.native(directory)
  const after = fs.lstatSync(canonical, { bigint: true })
  if (!before.isDirectory() || before.isSymbolicLink() || !after.isDirectory()
    || before.ino <= 0n || before.dev !== after.dev || before.ino !== after.ino
    || before.birthtimeNs !== after.birthtimeNs) throw new Error("Managed cache directory identity is unavailable")
  return Object.freeze({ directory: canonical, dev: String(after.dev), ino: String(after.ino),
    birthtimeNs: String(after.birthtimeNs) })
}

export function sameManagedDirectory(left: ManagedSourceDirectory, right: ManagedSourceDirectory): boolean {
  return left.directory === right.directory && left.dev === right.dev && left.ino === right.ino
    && left.birthtimeNs === right.birthtimeNs
}

function current(directory: ManagedSourceDirectory): boolean {
  try { return sameManagedDirectory(directory, observeManagedDirectory(directory.directory)) }
  catch { return false }
}

/** An engine-owned root policy. Scans retain only identities actually used to skip a leaf. */
export class ManagedSourceNamespaces {
  private epoch = 0
  get generation(): number { return this.epoch }
  private readonly roots = new Map<string, readonly ManagedSourceDirectory[]>()
  constructor(registrations: readonly ManagedSourceRegistration[] = []) {
    for (const entry of registrations) this.replace(entry.rootPath, entry.directories)
  }
  replace(rootPath: string, directories: readonly ManagedSourceDirectory[]): void {
    this.epoch++
    const root = path.resolve(rootPath)
    if (directories.length === 0) this.roots.delete(root)
    else this.roots.set(root, Object.freeze(directories.map(entry => Object.freeze({ ...entry }))))
  }
  registrations(): ManagedSourceRegistration[] {
    return [...this.roots].map(([rootPath, directories]) => ({ rootPath, directories }))
  }
  clear(): void { this.epoch++; this.roots.clear() }

  view(rootPath: string) {
    if (this.roots.size === 0) return { excluded: (_candidate: string, _physical?: string) => false, validate: () => {} }
    const root = canonicalWorkspaceRoot(rootPath)
    const entries = this.roots.get(path.resolve(rootPath))
      ?? [...this.roots].find(([key]) => canonicalWorkspaceRoot(key) === root)?.[1] ?? []
    const directories = entries.filter(entry => {
      const relative = relativePathWithinRoot(root, entry.directory)
      return relative !== undefined && relative !== ""
    })
    const skipped = new Set<ManagedSourceDirectory>()
    return {
      excluded: (candidate: string, physicalPath?: string): boolean => {
        const relative = relativePathWithinRoot(path.resolve(rootPath), path.resolve(candidate))
          ?? relativePathWithinRoot(root, path.resolve(candidate))
        if (physicalPath === undefined && relative === undefined) return false
        const physical = physicalPath ?? path.join(root, relative!)
        for (const entry of directories) {
          if (relativePathWithinRoot(entry.directory, physical) === undefined || !current(entry)) continue
          skipped.add(entry)
          return true
        }
        return false
      },
      validate: (): void => {
        for (const entry of skipped) if (!current(entry)) {
          throw new Error("Managed cache namespace changed during source enumeration")
        }
      },
    }
  }
  excludedUri(rootUri: string, uri: string): boolean {
    try { return this.view(fileURLToPath(rootUri)).excluded(fileURLToPath(uri)) }
    catch { return false }
  }
}
