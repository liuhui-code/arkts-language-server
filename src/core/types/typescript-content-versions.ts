import path from "node:path"

/** Compiler host versions must survive eviction and re-insertion of a disk script. */
export class TypeScriptContentVersions {
  revision = 0
  receivedRevision = 0
  private readonly files = new Map<string, number>()

  update(revision: number | undefined, changedPaths: readonly string[] | undefined,
    contentChangedPaths: readonly string[] | undefined = changedPaths): string[] {
    if (revision !== undefined) {
      this.receivedRevision = revision
      if (changedPaths === undefined || changedPaths.length > 0) this.revision = revision
    }
    const paths = (contentChangedPaths ?? []).map(filePath => path.resolve(filePath))
    for (const filePath of paths) this.files.set(filePath, this.receivedRevision)
    return paths
  }

  scriptVersion(
    filePath: string, residentVersion: number | undefined, member: boolean, fingerprint?: string, admissionToken?: string,
  ): string {
    const diskVersion = this.files.get(filePath) ?? 0
    return residentVersion !== undefined ? `${residentVersion}:content-${diskVersion}:${fingerprint}`
      : member ? `content-${diskVersion}:admission-${admissionToken}:${fingerprint ?? "unloaded"}` : "0"
  }

  delete(filePath: string): void {
    this.files.delete(filePath)
  }

  clear(): void {
    this.files.clear()
  }
}
