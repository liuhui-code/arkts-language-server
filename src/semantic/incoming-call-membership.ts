import { fileURLToPath } from "node:url"
import type { SemanticDocumentStore } from "../core/workspace/document-store.js"

/** Preserve incoming-calls' explicit failure contract before changing its compiler scope. */
export function prepareIncomingCallMembership(documents: SemanticDocumentStore, rootUri: string):
  { status: "incomplete"; reason: "source-unavailable" | "project-membership-incomplete" } | undefined {
  const rootPath = fileURLToPath(rootUri)
  const refresh = documents.refreshProjectMembership(rootPath)
  if (refresh.removedPaths.length > 0) return { status: "incomplete", reason: "source-unavailable" }
  if (documents.membershipFor(rootPath).status !== "complete") {
    return { status: "incomplete", reason: "project-membership-incomplete" }
  }
  return undefined
}
