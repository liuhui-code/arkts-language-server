import path from "node:path"

/** Compiler host versions must survive eviction and re-insertion of a disk script. */
export class TypeScriptContentVersions {
  revision = 0
  private readonly files = new Map<string, number>()

  update(revision: number | undefined, changedPaths: readonly string[] | undefined): string[] {
    if (revision !== undefined) this.revision = revision
    const paths = (changedPaths ?? []).map(filePath => path.resolve(filePath))
    for (const filePath of paths) this.files.set(filePath, this.revision)
    return paths
  }

  scriptVersion(
    filePath: string, residentVersion: number | undefined, member: boolean, fingerprint?: string,
  ): string {
    const diskVersion = this.files.get(filePath) ?? 0
    return residentVersion !== undefined ? `${residentVersion}:content-${diskVersion}:${fingerprint}`
      : member ? `content-${diskVersion}` : "0"
  }

  delete(filePath: string): void {
    this.files.delete(filePath)
  }

  clear(): void {
    this.files.clear()
  }
}
