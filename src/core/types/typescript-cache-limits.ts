export const MAX_SCRIPTS = 512
export const MAX_SCRIPT_BYTES = 16 * 1024 * 1024
export const MAX_LAZY_SNAPSHOTS = 128
export const MAX_LAZY_SNAPSHOT_BYTES = 8 * 1024 * 1024

export function cacheLimit(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 0 || value > fallback) {
    throw new RangeError(`${label} must be an integer between 0 and ${fallback}`)
  }
  return value
}
