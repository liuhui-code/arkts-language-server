export function messageEpoch(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined
  const epoch = (value as { epoch?: unknown }).epoch
  return Number.isSafeInteger(epoch) ? epoch as number : undefined
}

export function workerLogMessage(value: unknown): {
  level: "info" | "error"
  event: string
  fields: Readonly<Record<string, string | number | boolean | null | undefined>>
} | undefined {
  if (!value || typeof value !== "object") return undefined
  const candidate = value as {
    workerEvent?: unknown
    level?: unknown
    event?: unknown
    fields?: unknown
  }
  if (candidate.workerEvent !== "log"
    || (candidate.level !== "info" && candidate.level !== "error")
    || typeof candidate.event !== "string"
    || candidate.event.length === 0
    || !candidate.fields
    || typeof candidate.fields !== "object"
    || Array.isArray(candidate.fields)) return undefined
  for (const field of Object.values(candidate.fields)) {
    if (field !== null && field !== undefined
      && typeof field !== "string" && typeof field !== "number" && typeof field !== "boolean") {
      return undefined
    }
  }
  return {
    level: candidate.level,
    event: candidate.event,
    fields: candidate.fields as Readonly<Record<string, string | number | boolean | null | undefined>>,
  }
}
