import type { DocumentUri, WorkspaceDescriptor } from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"

export class SingleRootProjectResolver implements ProjectResolverPort {
  private workspace: WorkspaceDescriptor

  constructor(defaultRootUri: DocumentUri) {
    this.workspace = descriptor(defaultRootUri)
  }

  configure(rootUris: readonly DocumentUri[]): void {
    const rootUri = rootUris.find((candidate) => candidate.startsWith("file:"))
    if (rootUri) this.workspace = descriptor(rootUri)
  }

  projectFor(_documentUri: DocumentUri): WorkspaceDescriptor {
    return this.workspace
  }
}

function descriptor(rootUri: DocumentUri): WorkspaceDescriptor {
  return { id: rootUri, rootUri }
}
