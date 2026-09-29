import { createHash } from "node:crypto"

import type {
  SemanticReference,
  SemanticReferencesOutcome,
  SemanticReferencesQuery,
} from "../../contracts/semantic-engine.js"

interface CacheEntry {
  readonly rootId: string
  readonly bytes: number
  readonly references: readonly SemanticReference[]
}

export interface ReferenceResultCacheStats {
  readonly entries: number
  readonly bytes: number
}

export class ReferenceResultCache {
  readonly #entries = new Map<string, CacheEntry>()
  readonly #rootGenerations = new Map<string, number>()
  #bytes = 0

  constructor(
    private readonly maxEntries = 128,
    private readonly maxBytes = 8 * 1_024 * 1_024,
  ) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error("reference result cache maxEntries must be positive")
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new Error("reference result cache maxBytes must be positive")
    }
  }

  get(query: SemanticReferencesQuery): SemanticReferencesOutcome | undefined {
    const key = this.#key(query)
    const entry = this.#entries.get(key)
    if (!entry) return undefined
    this.#entries.delete(key)
    this.#entries.set(key, entry)
    return { status: "complete", references: cloneReferences(entry.references) }
  }

  set(query: SemanticReferencesQuery, result: SemanticReferencesOutcome): boolean {
    if (result.status !== "complete") return false
    const rootId = query.document.workspaceId
    const key = this.#key(query)
    const references = cloneReferences(result.references)
    const bytes = Buffer.byteLength(JSON.stringify(references))
    if (bytes > this.maxBytes) return false
    this.#delete(key)
    this.#entries.set(key, { rootId, bytes, references })
    this.#bytes += bytes
    this.#evict()
    return true
  }

  invalidateRoot(rootId: string): void {
    for (const [key, entry] of this.#entries) {
      if (entry.rootId === rootId) this.#delete(key)
    }
    this.#rootGenerations.set(rootId, (this.#rootGenerations.get(rootId) ?? 0) + 1)
  }

  clear(): void {
    this.#entries.clear()
    this.#rootGenerations.clear()
    this.#bytes = 0
  }

  stats(): ReferenceResultCacheStats {
    return { entries: this.#entries.size, bytes: this.#bytes }
  }

  #evict(): void {
    while (this.#entries.size > this.maxEntries || this.#bytes > this.maxBytes) {
      const oldest = this.#entries.keys().next().value as string | undefined
      if (oldest === undefined) return
      this.#delete(oldest)
    }
  }

  #delete(key: string): void {
    const entry = this.#entries.get(key)
    if (!entry) return
    this.#entries.delete(key)
    this.#bytes -= entry.bytes
  }

  #key(query: SemanticReferencesQuery): string {
    return createHash("sha256").update(JSON.stringify([
      query.document.workspaceId,
      this.#rootGenerations.get(query.document.workspaceId) ?? 0,
      query.document.uri,
      query.document.version,
      createHash("sha256").update(query.document.text).digest("hex"),
      query.position.line,
      query.position.character,
      query.includeDeclaration,
    ])).digest("hex")
  }
}

function cloneReferences(
  references: readonly SemanticReference[],
): SemanticReference[] {
  return references.map(reference => ({
    ...reference,
    range: {
      start: { ...reference.range.start },
      end: { ...reference.range.end },
    },
  }))
}
