import type { RootSemanticWorkerRequestInput } from "./semantic-worker-command-input.js"
import { takeNextSemanticWorkerRequest } from "./semantic-request-lanes.js"
import { MAX_SEMANTIC_WORKER_TEXT_BYTES } from "./worker-protocol.js"

interface PendingRead { readonly input: RootSemanticWorkerRequestInput }

/** Bound source owners and retained input, rather than mistaking cursor reads for new owners. */
export class SemanticWorkerPendingReads<T extends PendingRead> {
  static readonly maxSources = 64
  static readonly maxInputBytes = MAX_SEMANTIC_WORKER_TEXT_BYTES
  readonly #records: T[] = []
  readonly #sources = new Map<string, number>()
  readonly #weights = new Map<T, number>()
  #bytes = 0

  add(record: T): boolean {
    const source = record.input.uri
    const count = this.#sources.get(source) ?? 0
    const bytes = Buffer.byteLength(JSON.stringify(record.input), "utf8")
    if ((!count && this.#sources.size >= SemanticWorkerPendingReads.maxSources)
      || this.#bytes + bytes > SemanticWorkerPendingReads.maxInputBytes) return false
    this.#records.push(record)
    this.#sources.set(source, count + 1)
    this.#weights.set(record, bytes)
    this.#bytes += bytes
    return true
  }

  take(detachedReference: boolean, bypassed?: T): { request?: T; bypassedDiagnostic?: T } {
    const selected = takeNextSemanticWorkerRequest(this.#records, detachedReference, bypassed)
    if (selected.request) this.#release(selected.request)
    return selected
  }

  remove(record: T): boolean {
    const index = this.#records.indexOf(record)
    if (index < 0) return false
    this.#records.splice(index, 1)
    this.#release(record)
    return true
  }

  drain(): T[] {
    const records = this.#records.splice(0)
    this.#sources.clear()
    this.#weights.clear()
    this.#bytes = 0
    return records
  }

  #release(record: T): void {
    const bytes = this.#weights.get(record)
    if (bytes === undefined) throw new Error("Pending semantic read has no admission weight")
    this.#weights.delete(record)
    this.#bytes -= bytes
    const count = this.#sources.get(record.input.uri)! - 1
    if (count) this.#sources.set(record.input.uri, count)
    else this.#sources.delete(record.input.uri)
  }
}
