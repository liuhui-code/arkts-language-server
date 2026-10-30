import type { CompletionItem } from "vscode-languageserver/node.js"

import type { SemanticCompletion } from "../contracts/semantic-engine.js"
import { CompletionItemTickets } from "./completion-item-ticket.js"

export const MAX_COMPLETION_RESOLUTIONS = 512

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

interface CompletionResolutionEntry {
  item: CompletionItem
  record?: CompletionResolutionRecord
}

export class CompletionResolutionStore {
  private readonly entries = new Map<string, CompletionResolutionEntry>()
  private readonly tickets = new CompletionItemTickets()

  remember(record: CompletionResolutionRecord, build: (data: CompletionResolutionData) => CompletionItem): CompletionItem {
    const item = build({ arktsCompletionId: "" })
    const id = this.tickets.issue(item)
    item.data = { arktsCompletionId: id }
    this.entries.set(id, { item, record })
    while (this.entries.size > MAX_COMPLETION_RESOLUTIONS) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      const expired = this.entries.get(oldest)
      if (expired) expired.record = undefined
      this.entries.delete(oldest)
    }
    return item
  }

  find(clientItem: CompletionItem): CompletionResolutionEntry | undefined {
    if (clientItem === null || typeof clientItem !== "object" || Array.isArray(clientItem)) return undefined
    const data: unknown = clientItem.data
    if (
      data === null
      || typeof data !== "object"
      || Array.isArray(data)
      || Object.keys(data).length !== 1
      || typeof (data as { arktsCompletionId?: unknown }).arktsCompletionId !== "string"
    ) return undefined
    const id = (data as CompletionResolutionData).arktsCompletionId
    const entry = this.entries.get(id)
    if (entry) return entry
    const item = this.tickets.recover(id, clientItem)
    return item ? { item } : undefined
  }

  forgetDocument(documentUri: string): void {
    for (const entry of this.entries.values()) {
      if (entry.record?.documentUri === documentUri) entry.record = undefined
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.record = undefined
    this.entries.clear()
    this.tickets.clear()
  }
}
