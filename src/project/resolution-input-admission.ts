import { AsyncLocalStorage } from "node:async_hooks"

const active = new AsyncLocalStorage<{ rebased: Set<object>; observedNamespaces: Set<object> }>()

/** A repair cannot erase an earlier unproven input encountered by this command. */
export function noteResolutionInputRebase(owner: object): void { active.getStore()?.rebased.add(owner) }
export function resolutionInputWasRebased(owner: object): boolean { return active.getStore()?.rebased.has(owner) === true }

/** A store enumeration is not a watcher notification or permission to discard a consumer's negative proof. */
export function noteUnnotifiedSourceNamespace(owner: object): void { active.getStore()?.observedNamespaces.add(owner) }
export function unnotifiedSourceNamespaceWasObserved(owner: object): boolean { return active.getStore()?.observedNamespaces.has(owner) === true }

export async function withResolutionInputAdmission<Result>(run: () => Result | PromiseLike<Result>): Promise<Result> {
  if (active.getStore()) return run()
  const inputs = { rebased: new Set<object>(), observedNamespaces: new Set<object>() }
  return active.run(inputs, async () => {
    try { return await run() } finally { inputs.rebased.clear(); inputs.observedNamespaces.clear() }
  })
}
