import fs from "node:fs"
import path from "node:path"
import type { ProjectSourceSnapshot } from "../core/workspace/semantic-workspace-view.js"

/** Worker-local metadata from an actual guarded regular-file read, not a live
 * path lookup or a source/AST cache. Unknown/legacy producers cannot lend it. */
export class SourceReadOrigin {
  private constructor(readonly file: string, readonly root: string,
    readonly physicalPath: string, readonly configurationIdentity: string) { Object.freeze(this) }

  static fromSnapshot(file: string, lexicalRoot: string, physicalRoot: string,
    snapshot: ProjectSourceSnapshot | null | undefined): SourceReadOrigin | undefined {
    if (!snapshot?.identity || !path.isAbsolute(file) || !path.isAbsolute(lexicalRoot)
      || !path.isAbsolute(physicalRoot)) return undefined
    const relative = path.relative(lexicalRoot, file)
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path.sep)) return undefined
    const physical = snapshot.identity.physicalPath, mode = snapshot.mode
    if (physical !== path.resolve(physicalRoot, relative) || !Number.isSafeInteger(mode)
      || mode! < 0 || (mode! & fs.constants.S_IFMT) !== fs.constants.S_IFREG) return undefined
    try {
      const value: unknown = JSON.parse(snapshot.identity.stamp)
      if (!Array.isArray(value) || value.length !== 6 || value[0] !== physical) return undefined
      const [, dev, ino, size, mtime, ctime] = value
      if (!Number.isSafeInteger(dev) || dev < 0 || !Number.isSafeInteger(ino) || ino <= 0
        || !Number.isSafeInteger(size) || size < 0 || !Number.isFinite(mtime) || !Number.isFinite(ctime)) return undefined
      const stamp = [dev, ino, mode, size, mtime, ctime]
      return new SourceReadOrigin(path.resolve(file), physicalRoot, physical,
        JSON.stringify([path.resolve(file), [], physical, null, stamp, stamp]))
    } catch { return undefined }
  }
}
