import fs from "node:fs"
import path from "node:path"

import type { SemanticOperationControl } from "./document-store.js"

export const SOURCE_EXTENSIONS = [".ets", ".ts"]

export interface WorkspaceSourceEntry {
  path: string
  physicalPath?: string
}

interface SourceDirectory {
  path: string
  physicalPath: string
  directory: fs.Dir
  identity: fs.BigIntStats
  root: boolean
  checkNativePath: boolean
}

type DirectoryObservation = Pick<SourceDirectory, "path" | "physicalPath" | "identity" | "root">

/** Retain the actual enumeration identities; overflow falls back to ordinary enumeration. */
export class WorkspaceNamespaceWitness {
  private readonly directories: DirectoryObservation[] = []
  private bytes = 0
  private provable = true
  constructor(private readonly maxBytes: number) {}

  observe(directory: DirectoryObservation): void {
    if (!this.provable) return
    const bytes = 512 + 2 * (directory.path.length + directory.physicalPath.length)
    if (this.bytes + bytes > this.maxBytes) {
      this.provable = false
      this.directories.length = 0
      return
    }
    this.directories.push({ path: directory.path, physicalPath: directory.physicalPath,
      identity: directory.identity, root: directory.root })
    this.bytes += bytes
  }

  current(control: SemanticOperationControl): boolean {
    if (!this.provable) return false
    try {
      for (const directory of this.directories) {
        control.checkpoint()
        if (!sameDirectory(directory.identity, directoryIdentity(directory.path, directory.root))
          || fs.realpathSync.native(directory.path) !== directory.physicalPath
          || !sameDirectory(directory.identity, directoryIdentity(directory.path, directory.root))) return false
      }
      control.checkpoint()
      return true
    } catch { control.checkpoint(); return false }
  }
}

function directoryIdentity(directoryPath: string, root: boolean): fs.BigIntStats {
  return root ? fs.statSync(directoryPath, { bigint: true }) : fs.lstatSync(directoryPath, { bigint: true })
}

function sameDirectory(expected: fs.BigIntStats, current: fs.BigIntStats): boolean {
  return current.isDirectory() && expected.dev === current.dev && expected.ino === current.ino
    && expected.mtimeNs === current.mtimeNs && expected.ctimeNs === current.ctimeNs
}

/** Injected path lists never supply trusted directory-derived physical identities. */
export function* unresolvedSourceEntries(paths: Iterable<string>): Generator<WorkspaceSourceEntry> {
  for (const sourcePath of paths) yield { path: sourcePath }
}

export function* listWorkspaceSourcePaths(
  rootPath: string,
  operationControl: SemanticOperationControl,
  includePath: (sourcePath: string, directoryTraversal: boolean, physicalPath?: string) => boolean,
  rootPhysicalPath?: string,
  observeDirectory?: (directory: DirectoryObservation) => void,
): Generator<WorkspaceSourceEntry> {
  const pending: SourceDirectory[] = []
  const open = (directoryPath: string, physicalPath: string, root = false): void => {
    const identity = directoryIdentity(directoryPath, root)
    if (!identity.isDirectory()) throw new Error("source directory entry changed before enumeration")
    const checkNativePath = root || typeof identity.ino !== "bigint" || identity.ino <= 0n
      || typeof identity.dev !== "bigint" || identity.dev < 0n
    if (checkNativePath && fs.realpathSync.native(directoryPath) !== physicalPath) {
      throw new Error("source directory path changed before membership enumeration")
    }
    const directory = fs.opendirSync(directoryPath)
    try {
      if (!sameDirectory(identity, directoryIdentity(directoryPath, root))
        || (checkNativePath && fs.realpathSync.native(directoryPath) !== physicalPath)) {
        throw new Error("source directory changed while opening membership enumeration")
      }
      pending.push({ path: directoryPath, physicalPath, directory, identity, root, checkNativePath })
    } catch (error) {
      directory.closeSync()
      throw error
    }
  }
  const close = (current: SourceDirectory): void => {
    let failure: unknown
    try {
      operationControl.checkpoint()
      if (!sameDirectory(current.identity, directoryIdentity(current.path, current.root))
        || (current.checkNativePath && fs.realpathSync.native(current.path) !== current.physicalPath)) {
        throw new Error("source directory changed during membership enumeration")
      }
    } catch (error) { failure = error }
    try { current.directory.closeSync() } catch (error) { failure ??= error }
    if (failure) throw failure
    observeDirectory?.(current)
  }
  try {
    open(rootPath, rootPhysicalPath ?? fs.realpathSync.native(rootPath), true)
    while (pending.length > 0) {
      const current = pending[pending.length - 1]
      const entry = current.directory.readSync()
      if (entry === null) {
        pending.pop()
        close(current)
        continue
      }
      operationControl.checkpoint()
      if (entry.name === ".arkline" || entry.name === ".git" || entry.name === "build"
        || entry.name === "node_modules" || entry.name === "oh_modules") continue
      const entryPath = path.resolve(current.path, entry.name)
      if (entry.isDirectory()) {
        // Real non-symlink entries inherit the witnessed parent; all ancestors
        // are revalidated before this scan can publish complete membership.
        const physicalPath = path.join(current.physicalPath, entry.name)
        if (includePath(entryPath, true, physicalPath)) open(entryPath, physicalPath)
      } else if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
        const physicalPath = path.join(current.physicalPath, entry.name)
        if (includePath(entryPath, false, physicalPath)) yield { path: entryPath, physicalPath }
      }
    }
  } finally {
    let closeError: unknown
    while (pending.length > 0) {
      try { close(pending.pop()!) } catch (error) { closeError ??= error }
    }
    if (closeError) throw closeError
  }
}
