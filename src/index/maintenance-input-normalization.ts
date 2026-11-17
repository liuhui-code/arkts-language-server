import { fileURLToPath } from "node:url"
import type { SemanticWorkspaceFileChangeBatch } from "../contracts/semantic-engine.js"
import type { IndexInputChanges, IndexUncertainty } from "./maintenance-inputs.js"
import { toWorkspaceIdentityUri, type WorkspaceUriIdentity } from "./workspace-uri-identity.js"

/** Only disk-source admission inputs belong to the lexical index. Overlay and
 * resource-only changes still follow their existing semantic/diagnostic paths.
 */
export function normalizeIndexInputs(identity: WorkspaceUriIdentity,
  batch: SemanticWorkspaceFileChangeBatch): IndexInputChanges {
  const changes = batch.changes.filter(change => /\.(?:ets|ts)$/i.test(fileURLToPath(change.uri))).map(change => ({
    uri: toWorkspaceIdentityUri(identity, change.uri),
    kind: change.kind === "deleted" ? "removed" as const : change.kind,
  }))
  const uncertainty = new Set<IndexUncertainty>()
  if (batch.configurationChanged || batch.catalogRulesChanged) uncertainty.add("configuration")
  else if (batch.rootDirty && !batch.namespaceUncertain) uncertainty.add("watch-overflow")
  if (batch.namespaceUncertain) uncertainty.add("namespace")
  if (changes.some(change => change.kind === "created" || change.kind === "removed")) uncertainty.add("namespace")
  return { changes, uncertainty: [...uncertainty] }
}
