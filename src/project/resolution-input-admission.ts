import { AsyncLocalStorage } from "node:async_hooks"

const active = new AsyncLocalStorage<Set<object>>()

/** A repair cannot erase an earlier unproven input encountered by this command. */
export function noteResolutionInputRebase(owner: object): void { active.getStore()?.add(owner) }
export function resolutionInputWasRebased(owner: object): boolean { return active.getStore()?.has(owner) === true }

export async function withResolutionInputAdmission<Result>(run: () => Result | PromiseLike<Result>): Promise<Result> {
  if (active.getStore()) return run()
  const inputs = new Set<object>()
  return active.run(inputs, async () => {
    try { return await run() } finally { inputs.clear() }
  })
}
