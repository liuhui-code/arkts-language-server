import { createHash } from "node:crypto"
import type { ProjectSyntaxProfile } from "./project-operation-scopes.js"

/** Syntax/configuration compatibility only. A matching key never proves current
 * source bytes, directory membership, or a completed dependency graph. */
export function operationScopeProfileKey(profile: ProjectSyntaxProfile): string {
  const dependencies = profile.dependencies
  return createHash("sha256").update(JSON.stringify([profile.options, [...profile.nativePackages ?? []],
    dependencies && [dependencies.rootPath, dependencies.sdk, dependencies.boundary,
      dependencies.sdkRoots, [...dependencies.baselineSdk], [...dependencies.baselineSourceHashes]]]))
    .digest("hex")
}
