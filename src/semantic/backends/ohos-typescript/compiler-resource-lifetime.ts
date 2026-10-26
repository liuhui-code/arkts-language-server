/** A release can throw after taking effect. Only isolate exit settles that uncertainty. */
export class CompilerOwnershipUncertainError extends Error {
  constructor(cause: unknown) {
    super("Compiler document ownership is uncertain; isolate retirement required", { cause })
    this.name = "CompilerOwnershipUncertainError"
  }
}

// Keep the failed owner reachable, including its service and lease journal. Never
// repair a shared Registry by clearing it or guessing whether a release happened.
const retiredOwners = new Set<object>()
let failure: CompilerOwnershipUncertainError | undefined
let observer: ((error: CompilerOwnershipUncertainError) => void) | undefined

export function quarantineCompilerOwner(owner: object, cause: unknown): CompilerOwnershipUncertainError {
  retiredOwners.add(owner)
  if (!failure) {
    failure = cause instanceof CompilerOwnershipUncertainError ? cause : new CompilerOwnershipUncertainError(cause)
    observer?.(failure)
  }
  return failure
}

export function assertCompilerOwnership(): void { if (failure) throw failure }

export function observeCompilerOwnershipFailure(notify: (error: CompilerOwnershipUncertainError) => void): () => void {
  observer = notify
  if (failure) notify(failure)
  return () => { if (observer === notify) observer = undefined }
}
