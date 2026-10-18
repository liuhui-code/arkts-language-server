import { randomUUID } from "node:crypto"

import type { SemanticCompletion } from "../contracts/semantic-engine.js"

const MAX_COMPLETION_RESOLUTIONS = 512

export interface CompletionResolutionRecord {
  documentUri: string
  documentVersion: number
  position: { line: number; character: number }
  completion: SemanticCompletion
  /** A closed-source handle binds exact bytes, not the internal numeric version zero. */
  diskSourceSha256?: string
}

export interface CompletionResolutionData {
  arktsCompletionId: string
}

export class CompletionResolutionStore {
  private readonly entries = new Map<string, CompletionResolutionRecord>()

  remember(record: CompletionResolutionRecord): CompletionResolutionData {
    const id = randomUUID()
    this.entries.set(id, record)
    while (this.entries.size > MAX_COMPLETION_RESOLUTIONS) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return { arktsCompletionId: id }
  }

  find(data: unknown): CompletionResolutionRecord | undefined {
    if (
      data === null
      || typeof data !== "object"
      || Array.isArray(data)
      || Object.keys(data).length !== 1
      || typeof (data as { arktsCompletionId?: unknown }).arktsCompletionId !== "string"
    ) return undefined
    return this.entries.get((data as CompletionResolutionData).arktsCompletionId)
  }

  forgetDocument(documentUri: string): void {
    for (const [id, record] of this.entries) {
      if (record.documentUri === documentUri) this.entries.delete(id)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}
