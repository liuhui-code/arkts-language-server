import type { SemanticWorkerMethod, SemanticWorkerRequestArgsByMethod, SemanticWorkerExpectedDocumentVersion } from "./worker-protocol.js"

export type RootSemanticWorkerMutationInput =
  | {
      readonly kind: "open" | "change"
      readonly uri: string
      readonly documentVersion: number
      readonly text: string
    }
  | {
      readonly kind: "close"
      readonly uri: string
      readonly documentVersion: number
    }
  | {
      readonly kind: "workspaceFilesChanged"
      readonly rootUri: string
      readonly rootDirty: boolean
      readonly resourceDirty: boolean
      readonly resourceChanged: boolean
      readonly changes: readonly {
        readonly uri: string
        readonly kind: "created" | "changed" | "deleted"
      }[]
    }

export type RootSemanticWorkerRequestInput = {
  readonly [Method in SemanticWorkerMethod]: {
    readonly method: Method
    readonly uri: string
    readonly expectedDocumentVersion: SemanticWorkerExpectedDocumentVersion<Method>
    readonly args: SemanticWorkerRequestArgsByMethod[Method]
  }
}[SemanticWorkerMethod]
