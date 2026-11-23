import type { RetainedInputFact } from "./retained-input-fact.js"
export const REFERENCE_QUERY_CACHE_PREFIX = "reference-query-proof-v1:"

interface ReferenceQueryBase {
  readonly version: 1
  readonly path: string
  readonly sourceSha256: string
  readonly compilerSha256: string
  readonly includeDeclaration: boolean
}
export interface LexicalReferenceQueryProof extends ReferenceQueryBase {
  readonly coverage: "lexical-block"
  readonly declarationStart: number
  readonly scopeStart: number
  readonly scopeEnd: number
}
export interface FullProgramReferenceQueryProof extends ReferenceQueryBase {
  readonly coverage: "full-program"
  readonly scope: "program" | "workspace" | "candidates"
  readonly anchor: Readonly<{ path: string; start: number; length: number }>
  readonly searchedPaths: readonly string[]
  readonly facts: readonly RetainedInputFact[]
}
export type ReferenceQueryProof = LexicalReferenceQueryProof | FullProgramReferenceQueryProof

export function readProofDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length) return undefined
  const data: Record<string, unknown> = {}
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !("value" in descriptor)) return undefined
    data[key] = descriptor.value
  }
  return data
}
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0
const nonempty = (v: unknown): v is string => typeof v === "string" && v.length > 0
export function readProofDataArray(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined
  const result: unknown[] = []
  if (Reflect.ownKeys(value).length !== value.length + 1) return undefined
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
    if (!descriptor || !("value" in descriptor)) return undefined
    result.push(descriptor.value)
  }
  return result
}

export function readReferenceQueryProof(value: unknown): ReferenceQueryProof | undefined {
  if (!value || typeof value !== "object") return undefined
  const coverage = Object.getOwnPropertyDescriptor(value, "coverage")
  if (!coverage || !("value" in coverage)) return undefined
  const lexical = coverage.value === "lexical-block"
  if (!lexical && coverage.value !== "full-program") return undefined
  const keys = ["version", "coverage", "path", "sourceSha256", "compilerSha256", "includeDeclaration",
    ...lexical ? ["declarationStart", "scopeStart", "scopeEnd"] : ["scope", "anchor", "searchedPaths", "facts"]]
  const data = readProofDataRecord(value, keys)
  const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)
  if (!data || data.version !== 1 || !nonempty(data.path) || !hash(data.sourceSha256)
    || !hash(data.compilerSha256) || typeof data.includeDeclaration !== "boolean") return undefined
  if (lexical) {
    if (![data.declarationStart, data.scopeStart, data.scopeEnd].every(integer)
      || Number(data.scopeStart) > Number(data.declarationStart) || Number(data.declarationStart) >= Number(data.scopeEnd)) return undefined
  } else {
    if (!["program", "workspace", "candidates"].includes(String(data.scope))) return undefined
    const anchor = readProofDataRecord(data.anchor, ["path", "start", "length"])
    const paths = readProofDataArray(data.searchedPaths), facts = readProofDataArray(data.facts)
    if (!anchor || !nonempty(anchor.path) || !integer(anchor.start) || !integer(anchor.length) || !anchor.length
      || !paths?.length || !paths.every(nonempty) || new Set(paths).size !== paths.length || !facts?.length) return undefined
    const copied: RetainedInputFact[] = []
    for (const value of facts) {
      const fact = readProofDataRecord(value, ["filePath", "identity", "directoryOnly"])
      if (!fact || !nonempty(fact.filePath) || !nonempty(fact.identity) || typeof fact.directoryOnly !== "boolean") return undefined
      copied.push(Object.freeze(fact) as unknown as RetainedInputFact)
    }
    data.anchor = Object.freeze(anchor)
    data.searchedPaths = Object.freeze(paths)
    data.facts = Object.freeze(copied)
  }
  return Object.freeze(data) as unknown as ReferenceQueryProof
}

/** Bounded trace codes; no source text, diagnostics or user paths. */
export type ReferenceQueryProofRefusal = "program-unobserved" | "compiler-unidentified" | "sdk-environment-unqualified"
  | "anchor-count-unproven" | "query-source-unproven" | "anchor-not-project-export" | "anchor-declaration-unproven"
  | "anchor-merge-unproven" | "program-diagnostics" | "unresolved-type-inputs" | "original-inputs-unproven"
