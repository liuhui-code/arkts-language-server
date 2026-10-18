import ts from "typescript"

import { createSourceDocument, type SourceDocument } from "./source-document.js"
import { versionedSnapshot } from "./typescript-versioned-snapshot.js"

export interface ScriptRecord {
  path: string
  content: string
  sourceContent: string
  virtualDocument: SourceDocument
  snapshot: ts.IScriptSnapshot
  version: number
  compilerVersion?: string
  documentVersion?: number
  overlay: boolean
  sourceFingerprint: string
  bytes: number
  lastAccess: number
}

type ScriptInput = Pick<ScriptRecord, "path" | "sourceContent" | "sourceFingerprint"
  | "compilerVersion" | "documentVersion" | "overlay" | "lastAccess">

/** Own the authoritative source-to-compiler text and its immutable snapshot together. */
export function createScriptRecord(input: ScriptInput, previous?: ScriptRecord): ScriptRecord {
  const virtualDocument = createSourceDocument(input.sourceContent)
  const content = virtualDocument.generatedContent
  const ancestor = previous?.overlay && input.overlay
    && Number.isSafeInteger(previous.documentVersion) && Number.isSafeInteger(input.documentVersion)
    && input.documentVersion === previous.documentVersion! + 1 ? previous.snapshot : undefined
  const snapshot = process.env.ARKTS_VERSIONED_OVERLAY_SNAPSHOTS === "1"
    ? versionedSnapshot(content, ancestor) : ts.ScriptSnapshot.fromString(content)
  return { ...input, content, virtualDocument, snapshot,
    version: (previous?.version ?? 0) + 1,
    bytes: Buffer.byteLength(input.sourceContent) + Buffer.byteLength(content) }
}
