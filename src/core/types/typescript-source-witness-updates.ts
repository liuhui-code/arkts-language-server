import path from "node:path"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { canonicalExistingPath, isWithinRoot } from "./typescript-source-boundary.js"
import { safeRead } from "./typescript-safe-source-read.js"

/** Preserve the catalog token and stable read that own a known closed-source delta. */
export function observeAdmittedSourceRead(filePath: string, witness: LoadedConfigurationWitness | undefined,
  sdkRoot: string | null, access: ProjectFileAccessPort | undefined, rootId: string,
  revision: number, admitted: boolean): void {
  if (!admitted || !access || sdkRoot && isWithinRoot(sdkRoot, filePath)) return
  witness?.observeChangedSourceRead(filePath, () => {
    const token = access.tokenFor(rootId, revision, filePath)
    return token === undefined ? null : access.read(rootId, revision, filePath, token)
  })
}

/** An admitted script replaces its own prior disk fact, never SDK/configuration input. */
export function observePreparedSourceRead(document: SemanticWorkspaceView["documents"][number],
  witness: LoadedConfigurationWitness | undefined, boundary: {
    rootPath: string; workspacePhysicalRoot: string | undefined
    sdkRoot: string | null; sdkPhysicalRoot: string | undefined
  }): void {
  const filePath = path.resolve(document.path)
  if (!witness || !boundary.workspacePhysicalRoot || !/\.(?:ets|ts)$/.test(filePath)
    || !isWithinRoot(boundary.rootPath, filePath)
    || boundary.sdkRoot && isWithinRoot(boundary.sdkRoot, filePath)) return
  // Only a previously loaded positive source fact can change. The witness still
  // checks both sides of this actual bounded byte read; cache hits never restamp it.
  witness.observeChangedSourceRead(filePath, () => {
    const physical = canonicalExistingPath(filePath)
    if (!physical || !isWithinRoot(boundary.workspacePhysicalRoot!, physical)
      || boundary.sdkPhysicalRoot && isWithinRoot(boundary.sdkPhysicalRoot, physical)) return null
    const content = safeRead(filePath)
    return canonicalExistingPath(filePath) === physical && (document.overlay || content === document.content)
      ? content : null
  })
}
