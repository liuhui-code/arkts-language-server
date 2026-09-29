export function requestReferenceLocations({
  server,
  id,
  uri,
  position,
  includeDeclaration,
  timeoutMs,
}) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/references",
    params: {
      textDocument: { uri },
      position,
      context: { includeDeclaration },
    },
  })
  return server.response(id, timeoutMs)
}
