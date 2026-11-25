export interface ReferenceVerifierTicket {
  readonly generation: number
  readonly id: number
}

export function verifierTicket(value: unknown): ReferenceVerifierTicket | undefined {
  if (!value || typeof value !== "object") return undefined
  const ticket = value as ReferenceVerifierTicket
  return Number.isSafeInteger(ticket.generation) && ticket.generation > 0
    && Number.isSafeInteger(ticket.id) && ticket.id > 0 ? ticket : undefined
}
