export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
export const DEFAULT_INITIALIZE_TIMEOUT_MS = 30_000
export const DEFAULT_TERMINATION_TIMEOUT_MS = 1_000

export function resolveRequestTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_REQUEST_TIMEOUT_MS
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError("index sidecar request timeout must be a positive number")
  }
  return timeout
}

export function resolveInitializeTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_INITIALIZE_TIMEOUT_MS
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError("index sidecar initialize timeout must be a positive number")
  }
  return timeout
}

export function resolveTerminationTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_TERMINATION_TIMEOUT_MS
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError("index sidecar termination timeout must be a positive number")
  }
  return timeout
}

export function resolvePositiveTimeout(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const timeout = value ?? fallback
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError(`index sidecar ${label} timeout must be a positive number`)
  }
  return timeout
}
