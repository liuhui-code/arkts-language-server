/** Internal ownership proof for one Native-managed directory; not a content proof. */
export interface ManagedSourceDirectory {
  readonly directory: string
  readonly dev: string
  readonly ino: string
  readonly birthtimeNs: string
}
export interface ManagedSourceRegistration {
  readonly rootPath: string
  readonly directories: readonly ManagedSourceDirectory[]
}
