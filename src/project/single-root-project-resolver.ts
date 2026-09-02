import path from "node:path"
import { fileURLToPath } from "node:url"

import type { DocumentUri, WorkspaceDescriptor } from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"

export class SingleRootProjectResolver implements ProjectResolverPort {
  private workspaces: WorkspaceDescriptor[]

  constructor(defaultRootUri: DocumentUri) {
    this.workspaces = [descriptor(defaultRootUri)]
  }

  configure(rootUris: readonly DocumentUri[]): void {
    const uniqueRoots = [...new Set(rootUris.filter((candidate) => candidate.startsWith("file:")))]
    if (uniqueRoots.length > 0) this.workspaces = uniqueRoots.map(descriptor)
  }

  projectFor(documentUri: DocumentUri): WorkspaceDescriptor {
    const containing = this.workspaces
      .filter((workspace) => containsDocument(workspace.rootUri, documentUri))
      .sort((left, right) => right.rootUri.length - left.rootUri.length)
    return containing[0] ?? this.workspaces[0]
  }
}

function descriptor(rootUri: DocumentUri): WorkspaceDescriptor {
  return { id: rootUri, rootUri }
}

function containsDocument(rootUri: DocumentUri, documentUri: DocumentUri): boolean {
  if (!rootUri.startsWith("file:") || !documentUri.startsWith("file:")) return false
  try {
    const relative = path.relative(fileURLToPath(rootUri), fileURLToPath(documentUri))
    return relative === ""
      || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  } catch {
    return false
  }
}
