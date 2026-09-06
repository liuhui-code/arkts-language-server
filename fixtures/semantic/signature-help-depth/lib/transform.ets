/** Returns a value unchanged. */
export function transform<T>(value: T): T
/** Maps a value while preserving its type. */
export function transform<T>(value: T, mapper: (value: T) => T): T
export function transform<T>(value: T, mapper?: (value: T) => T): T {
  return mapper ? mapper(value) : value
}

export function wrap<T>(value: T): T {
  return value
}
