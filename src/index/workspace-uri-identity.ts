import { mkdir, realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import type { DocumentUri } from "../contracts/document.js"

export interface WorkspaceUriIdentity {
  clientRootUri: DocumentUri
  workspaceIdentity: DocumentUri
}

export async function canonicalFileWorkspaceRoot(rootUri: string): Promise<string> {
  const url = new URL(rootUri)
  if (url.protocol !== "file:") throw new Error(`workspace root must be a file URI: ${rootUri}`)
  return realpath(fileURLToPath(url))
}

export async function canonicalDirectory(directory: string): Promise<string> {
  const absolute = path.resolve(directory)
  await mkdir(absolute, { recursive: true })
  return realpath(absolute)
}

export function isEquivalentWorkspaceIdentity(identity: string, canonicalRoot: string): boolean {
  try {
    return path.resolve(fileURLToPath(identity)) === path.resolve(canonicalRoot)
  } catch {
    return false
  }
}

export function toWorkspaceIdentityUri(identity: WorkspaceUriIdentity, uri: DocumentUri): DocumentUri {
  const rebased = tryWorkspaceIdentityUri(identity, uri)
  if (rebased !== undefined) return rebased
  throw new Error(`document URI is outside workspace root: ${uri}`)
}

export function tryWorkspaceIdentityUri(
  identity: WorkspaceUriIdentity,
  uri: DocumentUri,
): DocumentUri | undefined {
  return tryRebaseFileUri(uri, identity.clientRootUri, identity.workspaceIdentity)
    ?? tryRebaseFileUri(uri, identity.workspaceIdentity, identity.workspaceIdentity)
}

export function tryClientWorkspaceUri(
  identity: WorkspaceUriIdentity,
  uri: DocumentUri,
): DocumentUri | undefined {
  return tryRebaseFileUri(uri, identity.workspaceIdentity, identity.clientRootUri)
}

function tryRebaseFileUri(
  documentUri: DocumentUri,
  sourceRootUri: DocumentUri,
  targetRootUri: DocumentUri,
): DocumentUri | undefined {
  try {
    const sourceRoot = fileURLToPath(sourceRootUri)
    const documentPath = fileURLToPath(documentUri)
    const relative = path.relative(sourceRoot, documentPath)
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return undefined
    }
    return pathToFileURL(path.join(fileURLToPath(targetRootUri), relative)).href
  } catch {
    return undefined
  }
}
