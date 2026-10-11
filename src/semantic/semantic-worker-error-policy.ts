export const SEMANTIC_WORKER_ERROR_CODES = Object.freeze([
  "client-cancelled",
  "content-modified",
  "invalid-request",
  "workspace-incomplete",
  "queue-overflow",
  "worker-unavailable",
  "restart-required",
  "internal-error",
] as const)

export type SemanticWorkerErrorCode = typeof SEMANTIC_WORKER_ERROR_CODES[number]

export const SEMANTIC_WORKER_ERROR_MESSAGES: Readonly<Record<SemanticWorkerErrorCode, string>> =
  Object.freeze({
    "client-cancelled": "Semantic request cancelled",
    "content-modified": "Semantic document changed",
    "invalid-request": "Invalid semantic worker request",
    "workspace-incomplete": "Semantic workspace is incomplete",
    "queue-overflow": "Semantic worker queue is full",
    "worker-unavailable": "Semantic worker unavailable",
    "restart-required": "Semantic worker restart required",
    "internal-error": "Semantic worker request failed",
  })

export interface SemanticWorkerError {
  readonly code: SemanticWorkerErrorCode
  readonly message: string
}
