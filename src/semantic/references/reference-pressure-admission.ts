/** One pressure epoch per reference operation; the first bounded verifier remains admissible. */
export function referencePressureAdmission(enabled: boolean | undefined, epoch: number,
  refresh: () => { readonly level: string; readonly epoch: number }): (() => boolean) | undefined {
  if (!enabled) return undefined
  let started = false
  return () => {
    const current = refresh()
    if (started && (current.level === "level3" || current.epoch !== epoch)) return false
    started = true
    return true
  }
}
