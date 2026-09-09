import path from "node:path"

import ts from "typescript"

import type { ProjectSdkSelection } from "../../../core/sdk/project-sdk.js"
import { OHOS_TYPESCRIPT_BACKEND_IDENTITY } from "./identity.js"

const registries = new Map<string, ts.DocumentRegistry>()

export function officialDocumentRegistryFor(sdk: ProjectSdkSelection): ts.DocumentRegistry {
  const key = JSON.stringify([
    OHOS_TYPESCRIPT_BACKEND_IDENTITY.revision,
    sdk.path ? path.resolve(sdk.path) : null,
    sdk.identity?.status ?? "unavailable",
    sdk.identity?.apiVersion ?? null,
    sdk.identity?.componentVersion ?? null,
    "ets",
  ])
  let registry = registries.get(key)
  if (!registry) {
    registry = ts.createDocumentRegistry(ts.sys.useCaseSensitiveFileNames)
    registries.set(key, registry)
  }
  return registry
}
