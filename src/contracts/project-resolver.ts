import type { DocumentUri, WorkspaceDescriptor } from "./document.js"

export interface ProjectResolverPort {
  configure(rootUris: readonly DocumentUri[]): void
  projectFor(documentUri: DocumentUri): WorkspaceDescriptor
}
