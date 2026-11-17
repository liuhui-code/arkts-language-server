import type { NativeProof } from "./managed-cache-namespace.js"
import type { IndexInput } from "../contracts/index-evidence.js"
import { asRecord, SidecarProtocolError } from "./sidecar-protocol-validation.js"
import { decodeInput, sameInput } from "./versioned-index-proof.js"

export interface IndexFileIntent {
  uri: string
  kind: "created" | "changed" | "removed"
}
export type IndexUncertainty = "namespace" | "configuration" | "watch-overflow" | "reconnected"
export interface IndexInputChanges {
  changes: IndexFileIntent[]
  uncertainty: IndexUncertainty[]
  managedCacheNamespaces?: readonly NativeProof[]
}
export interface InputDelivery extends IndexInputChanges { input: IndexInput }

export class IndexInputObservationError extends Error {
  constructor(message: string) { super(message); this.name = "IndexInputObservationError" }
}
interface InputObserver {
  input: IndexInput | undefined
  finish(error?: Error): void
}

// Existing Native NDJSON input bounds, not source/result limits or RSS budgets.
const MAX_URIS = 256
const MAX_URI_BYTES = 4096
const MAX_TOTAL_BYTES = 64 * 1024

/** Immediate proof revocation, one delivery and one bounded latest successor. */
export class MaintenanceInputs {
  private input?: IndexInput
  private observed?: IndexInput
  private deliveryInput?: IndexInput
  private admissionInput?: IndexInput
  private readonly observers = new Set<InputObserver>()
  private lastReconciled = 0
  private readonly pending = new Map<string, IndexFileIntent>()
  private readonly uncertainty = new Set<IndexUncertainty>()
  private bytes = 0
  private namespaces?: readonly NativeProof[]
  private collapsed = false
  private delivering?: Promise<void>
  private failure?: Error
  constructor(private readonly issuer: string,
    private readonly send: (payload: InputDelivery) => Promise<unknown>,
    private readonly onFailure?: (error: Error) => void) {}

  get current(): IndexInput | undefined { return this.input }

  /** A full start owns a bounded admission handshake, not the mutation queue. */
  expectAdmission(input: IndexInput): void {
    if (this.admissionInput) throw new Error("index admission is already pending")
    this.admissionInput = input
  }
  finishAdmission(input: IndexInput): void {
    if (this.admissionInput === input) this.admissionInput = undefined
    this.notify()
  }

  /** A bootstrap/reconcile-only token is observed by start itself. Delivered
   * mutations must reach their exact ACK first, never global queue quiescence. */
  async waitForAdmission(input: IndexInput, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new DOMException("Index request aborted", "AbortError")
    if (this.failure) throw this.failure
    if (input !== this.input) throw new IndexInputObservationError("index input changed before admission")
    if (this.admissionInput !== input) throw new IndexInputObservationError("index admission is not owned")
    if (this.deliveryInput === input) await this.waitForObserved(input, signal)
  }

  /** Subscribe to this exact input only. Supersession and cancellation detach
   * immediately; neither waits for global quiescence nor cancels shared IO.
   */
  waitForObserved(input: IndexInput | undefined, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new DOMException("Index request aborted", "AbortError"))
    const error = this.observationError(input)
    if (error) return Promise.reject(error)
    if (this.isObserved(input)) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const aborted = () => observer.finish(new DOMException("Index request aborted", "AbortError"))
      const observer: InputObserver = { input, finish: error => {
        if (!this.observers.delete(observer)) return
        signal?.removeEventListener("abort", aborted)
        if (error) reject(error)
        else resolve()
      } }
      this.observers.add(observer)
      signal?.addEventListener("abort", aborted, { once: true })
      if (signal?.aborted) aborted()
    })
  }

  private observationError(input: IndexInput | undefined): Error | undefined {
    if (this.failure) return this.failure
    if (input !== this.input) return new IndexInputObservationError("index input changed before read")
    if (!this.isObserved(input) && input !== this.deliveryInput && input !== this.admissionInput) {
      return new IndexInputObservationError("index input was not acknowledged")
    }
    return undefined
  }
  private notify(): void {
    for (const observer of this.observers) {
      const error = this.observationError(observer.input)
      if (error || this.isObserved(observer.input)) observer.finish(error)
    }
  }

  isObserved(input: IndexInput | undefined): boolean {
    return input === undefined ? this.observed === undefined
      : this.observed !== undefined && sameInput(input, this.observed)
  }
  acknowledge(input: IndexInput): void {
    if (!this.observed || this.observed.revision < input.revision) this.observed = input
    this.notify()
  }
  acknowledgeReconcile(input: IndexInput): void {
    this.acknowledge(input)
    this.lastReconciled = Math.max(this.lastReconciled, input.revision)
  }

  forReconcile(): IndexInput {
    if (this.failure) throw this.failure
    const input = this.input && this.input.revision > this.lastReconciled ? this.input : this.advance()
    return input
  }

  observe(value: IndexInputChanges): void {
    if (this.failure || (value.changes.length === 0 && value.uncertainty.length === 0)) return
    this.advance(true)
    if (value.managedCacheNamespaces) this.namespaces = Object.freeze(value.managedCacheNamespaces.map(row => Object.freeze({ ...row })))
    for (const reason of value.uncertainty) this.uncertainty.add(reason)
    for (const change of value.changes) {
      if (this.collapsed) break
      const bytes = Buffer.byteLength(change.uri, "utf8")
      const old = this.pending.get(change.uri)
      if (bytes > MAX_URI_BYTES || !bytes || (!old &&
        (this.pending.size >= MAX_URIS || this.bytes + bytes > MAX_TOTAL_BYTES))) {
        this.pending.clear()
        this.bytes = 0
        this.collapsed = true
        this.uncertainty.add("watch-overflow")
        break
      }
      if (!old) this.bytes += bytes
      this.pending.set(change.uri, { ...change })
    }
    this.schedule()
  }

  async flush(): Promise<void> {
    if (this.failure) throw this.failure
    while (this.delivering) await this.delivering
    if (this.failure) throw this.failure
  }

  stop(error: Error): void {
    this.failure ??= error
    this.pending.clear()
    this.namespaces = undefined
    this.uncertainty.clear()
    this.bytes = 0
    this.notify()
  }

  private advance(delivery = false): IndexInput {
    const revision = (this.input?.revision ?? 0) + 1
    if (!Number.isSafeInteger(revision)) throw new Error("index input revision exhausted")
    this.input = Object.freeze({ issuer: this.issuer, revision })
    this.deliveryInput = delivery ? this.input : undefined
    this.notify()
    return this.input
  }

  private schedule(): void {
    if (this.delivering || this.failure) return
    this.delivering = Promise.resolve().then(async () => {
      while (!this.failure && (this.pending.size || this.uncertainty.size)) {
        const payload: InputDelivery = { input: this.input!, changes: [...this.pending.values()],
          uncertainty: [...this.uncertainty],
          ...(this.namespaces ? { managedCacheNamespaces: this.namespaces } : {}) }
        this.namespaces = undefined
        this.pending.clear()
        this.uncertainty.clear()
        this.bytes = 0
        this.collapsed = false
        const result = asRecord(await this.send(payload))
        if (this.failure) throw this.failure
        const status = asRecord(result.status)
        if (typeof result.accepted !== "boolean" || status.statusScope !== "task"
          || !sameInput(decodeInput(status.observedInput), payload.input)) {
          throw new SidecarProtocolError("index sidecar returned the wrong observed input acknowledgment")
        }
        this.acknowledge(payload.input)
      }
      if (this.failure) throw this.failure
    }).catch(value => {
      const error = value instanceof Error ? value : new Error(String(value))
      const first = this.failure === undefined
      this.stop(error)
      if (first) this.onFailure?.(error)
      throw error
    }).finally(() => {
      this.delivering = undefined
      if (!this.failure && (this.pending.size || this.uncertainty.size)) this.schedule()
    })
    // Observation is synchronous; readers/catalogs explicitly await flush.
    // Still consume a delivery failure if no subscriber is waiting yet.
    void this.delivering.catch(() => {})
  }
}
