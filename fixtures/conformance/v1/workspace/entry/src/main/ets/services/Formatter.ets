/** Returns a value unchanged. */
export function format<T>(value: T): T
/** Adds a suffix to a formatted value. */
export function format<T>(value: T, suffix: string): string
export function format<T>(value: T, suffix?: string): T | string {
  return suffix === undefined ? value : `${value}${suffix}`
}
