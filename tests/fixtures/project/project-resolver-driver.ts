import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"

export function resolveMultiRootDocuments() {
  const resolver = new SingleRootProjectResolver("file:///Fallback")
  resolver.configure([
    "file:///Workspace",
    "file:///Workspace/packages/app",
    "file:///WorkspaceTwo",
  ])
  return {
    first: resolver.projectFor("file:///Workspace/src/First.ets").rootUri,
    nested: resolver.projectFor("file:///Workspace/packages/app/src/Nested.ets").rootUri,
    sibling: resolver.projectFor("file:///WorkspaceTwo/src/Second.ets").rootUri,
    prefixCollision: resolver.projectFor("file:///WorkspaceTwofold/Outside.ets").rootUri,
  }
}
