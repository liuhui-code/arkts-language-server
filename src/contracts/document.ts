export type DocumentUri = string
export type WorkspaceId = string

export interface TextPosition {
  line: number
  character: number
}

export interface TextRange {
  start: TextPosition
  end: TextPosition
}

export interface DocumentSnapshot {
  uri: DocumentUri
  version: number
  text: string
  workspaceId: WorkspaceId
  /** Server-owned disk authority; never a client didOpen or an overlay. */
  source?: { readonly kind: "disk"; readonly rootUri: DocumentUri }
}

export interface WorkspaceDescriptor {
  id: WorkspaceId
  rootUri: DocumentUri
}
