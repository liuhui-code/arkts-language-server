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
}

export interface WorkspaceDescriptor {
  id: WorkspaceId
  rootUri: DocumentUri
}
