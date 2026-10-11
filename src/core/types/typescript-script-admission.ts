import { createHash } from "node:crypto"

const MAX_LAZY_WITNESSES = 4_096
type AdmissionObserver = (fields: Readonly<Record<string, number>>) => void

/** Bounded lazy-read evidence and preparation observations; never stores source text. */
export class TypeScriptScriptAdmission {
  private readonly preserveVersion = (process.env.ARKTS_L02_SAME_CONTENT_PROMOTION ?? "1") === "1"
  private readonly lazy = new Map<string, { fingerprint: string; version: string }>()
  private counters = { residentScriptsBefore: 0, generationBefore: 0, newResidentScripts: 0,
    promotedFromLazy: 0, promotedWithMatchingFingerprint: 0 }

  constructor(private readonly observer?: AdmissionObserver) {}

  begin(residentScriptsBefore: number, generationBefore: number): void {
    this.counters = { residentScriptsBefore, generationBefore, newResidentScripts: 0,
      promotedFromLazy: 0, promotedWithMatchingFingerprint: 0 }
  }

  admit(filePath: string, content: string, existing: boolean): void {
    if (!this.observer || existing) return
    this.counters.newResidentScripts += 1
    const witness = this.lazy.get(filePath)
    if (!witness) return
    this.counters.promotedFromLazy += 1
    if (witness.fingerprint === createHash("sha256").update(content).digest("hex")) {
      this.counters.promotedWithMatchingFingerprint += 1
    }
  }

  complete(residentScriptsAfter: number, generationAfter: number): void {
    try { this.observer?.({ ...this.counters, residentScriptsAfter, generationAfter }) }
    catch { /* Optional observation cannot fail an authoritative semantic query. */ }
  }

  observeLazy(filePath: string, fingerprint: string, version: string): void {
    if (!this.observer && !this.preserveVersion) return
    this.lazy.delete(filePath)
    this.lazy.set(filePath, { fingerprint, version })
    if (this.lazy.size > MAX_LAZY_WITNESSES) this.lazy.delete(this.lazy.keys().next().value!)
  }

  promotionVersion(filePath: string, fingerprint: string): string | undefined {
    const witness = this.lazy.get(filePath)
    return this.preserveVersion && witness?.fingerprint === fingerprint ? witness.version : undefined
  }

  forget(filePath: string): void { this.lazy.delete(filePath) }
  clear(): void { this.lazy.clear() }
}
