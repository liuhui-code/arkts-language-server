export interface SemanticContextLease<Context> {
  readonly contextId: string
  readonly context: Context
  release(): void
}

export function createContextLease<Context>(
  contextId: string,
  context: Context,
  releaseLease: () => void,
): SemanticContextLease<Context> {
  let released = false
  return Object.freeze({
    contextId,
    context,
    release() {
      if (released) return
      released = true
      releaseLease()
    },
  })
}
