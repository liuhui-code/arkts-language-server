import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { CompletionItem } from "vscode-languageserver/node.js"

// Only fields authored in the list may survive loss of its compiler context.
// In particular, never echo client-supplied additionalTextEdits or commands.
export function immutableCompletionItem(item: CompletionItem): CompletionItem {
  return {
    label: item.label, kind: item.kind, insertText: item.insertText,
    filterText: item.filterText, sortText: item.sortText, commitCharacters: item.commitCharacters,
    insertTextFormat: item.insertTextFormat, textEdit: item.textEdit,
  }
}

/** Bounded storage must not turn ordinary eviction into an invalid-params error.
 * A session-local authenticated UUIDv8 proves the immutable list fields even
 * after eviction. Its 122 custom bits contain a 32-bit counter and 90 MAC bits.
 * It is an opaque protocol handle, never a source authority or edit permit.
 */
export class CompletionItemTickets {
  private key = randomBytes(32)
  private counter = 0

  issue(item: CompletionItem): string {
    if (this.counter === 0xffff_ffff) throw new Error("Completion ticket counter exhausted")
    const bytes = this.bytes(++this.counter, item)
    const hex = bytes.toString("hex")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  recover(id: string, item: CompletionItem): CompletionItem | undefined {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)) return undefined
    const bytes = Buffer.from(id.replaceAll("-", ""), "hex")
    const counter = bytes.readUInt32BE(0)
    if (counter === 0 || counter > this.counter) return undefined
    try {
      if (!timingSafeEqual(bytes, this.bytes(counter, item))) return undefined
      return { ...immutableCompletionItem(item), data: { arktsCompletionId: id } }
    } catch {
      // Invalid/unreasonably nested wire fields are not valid issued items.
      return undefined
    }
  }

  clear(): void {
    this.key = randomBytes(32)
    this.counter = 0
  }

  private bytes(counter: number, item: CompletionItem): Buffer {
    const payload = JSON.stringify(canonical(immutableCompletionItem(item)))
    const bytes = Buffer.alloc(16)
    bytes.writeUInt32BE(counter, 0)
    createHmac("sha256", this.key).update(String(counter)).update(":").update(payload)
      .digest().copy(bytes, 4, 0, 12)
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
    return bytes
  }
}

function canonical(value: unknown, depth = 0): unknown {
  if (depth > 8) throw new Error("Invalid completion field nesting")
  if (Array.isArray(value)) return value.map(entry => canonical(entry, depth + 1))
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => [key, canonical(entry, depth + 1)]))
  }
  return value
}
