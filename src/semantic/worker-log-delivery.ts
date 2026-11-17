import type { StructuredLogger, StructuredInfoEntry } from "../observability/logger.js"

interface WorkerLog extends StructuredInfoEntry { readonly level: "info" | "error" }
const MAX_ROWS = 64
const MAX_BYTES = 64 * 1024

/** Parent-owned, bounded I/O batching. The Worker still streams each source
 * start immediately so cancellation observers do not wait for a sync check. */
export class WorkerLogDelivery {
  private rows: StructuredInfoEntry[] = []
  private bytes = 0
  private scheduled: NodeJS.Immediate | undefined

  constructor(private readonly logger?: StructuredLogger) {}

  enqueue(log: WorkerLog): void {
    if (!this.logger) return
    if (log.level === "error" || !this.logger.infoBatch) {
      this.flush()
      this.logger[log.level](log.event, log.fields)
      return
    }
    const bytes = Buffer.byteLength(JSON.stringify(log))
    if (bytes > MAX_BYTES) {
      this.flush()
      this.logger.info(log.event, log.fields)
      return
    }
    if (this.rows.length >= MAX_ROWS || this.bytes + bytes > MAX_BYTES) this.flush()
    this.rows.push({ event: log.event, fields: log.fields })
    this.bytes += bytes
    if (this.rows.length === MAX_ROWS) this.flush()
    else this.scheduled ??= setImmediate(() => { this.scheduled = undefined; this.flush() })
  }

  /** Drain before forwarding a request terminal, a failure, or retiring the owner. */
  flush(): void {
    if (this.scheduled) clearImmediate(this.scheduled)
    this.scheduled = undefined
    if (!this.rows.length) return
    const rows = this.rows
    this.rows = []
    this.bytes = 0
    this.logger!.infoBatch!(rows)
  }
}
