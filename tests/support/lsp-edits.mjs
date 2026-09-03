export function applyWorkspaceEdit(documents, workspaceEdit, { documentVersions } = {}) {
  if (workspaceEdit.documentChanges !== undefined && workspaceEdit.changes !== undefined) {
    throw new TypeError("WorkspaceEdit cannot combine changes and documentChanges")
  }
  if (workspaceEdit.documentChanges !== undefined) {
    for (const documentChange of workspaceEdit.documentChanges) {
      if (typeof documentChange?.kind === "string") {
        throw new TypeError(
          `WorkspaceEdit resource operations are not supported: ${documentChange.kind}`,
        )
      }
      if (!documentChange?.textDocument || !Array.isArray(documentChange.edits)) {
        throw new TypeError("WorkspaceEdit documentChanges supports only TextDocumentEdit entries")
      }
    }
    const updated = new Map(documents)
    for (const documentChange of workspaceEdit.documentChanges) {
      const { uri, version } = documentChange.textDocument
      if (!documents.has(uri)) throw new RangeError(`Unknown document URI in WorkspaceEdit: ${uri}`)
      if (!documentVersions?.has(uri)) {
        throw new RangeError(`Missing controlled snapshot version for WorkspaceEdit URI: ${uri}`)
      }
      const snapshotVersion = documentVersions.get(uri)
      if (snapshotVersion !== null && !Number.isSafeInteger(snapshotVersion)) {
        throw new TypeError(
          `Controlled snapshot version must be an integer or null for WorkspaceEdit URI: ${uri}`,
        )
      }
      if (version !== snapshotVersion) {
        throw new RangeError(
          `WorkspaceEdit version mismatch for ${uri}: expected ${snapshotVersion}, received ${version}`,
        )
      }
      updated.set(uri, applyTextEdits(updated.get(uri), documentChange.edits))
    }
    return sortedDocuments(updated)
  }
  const updated = new Map(documents)
  const changes = workspaceEdit.changes ?? {}
  const uris = Object.keys(changes).sort()
  for (const uri of uris) {
    if (!documents.has(uri)) throw new RangeError(`Unknown document URI in WorkspaceEdit: ${uri}`)
  }
  for (const uri of uris) {
    updated.set(uri, applyTextEdits(updated.get(uri), changes[uri]))
  }
  return sortedDocuments(updated)
}

export function applyTextEdits(source, edits) {
  const located = edits.map((edit) => ({
    ...edit,
    start: offsetAt(source, edit.range.start),
    end: offsetAt(source, edit.range.end),
  })).sort((left, right) => right.start - left.start || right.end - left.end)

  if (located.some((edit) => edit.start > edit.end)) {
    throw new RangeError("TextEdit range start is after its end")
  }
  for (let index = 1; index < located.length; index += 1) {
    if (located[index].end > located[index - 1].start) {
      throw new RangeError("Cannot apply overlapping TextEdits")
    }
  }

  let updated = source
  for (const edit of located) {
    updated = updated.slice(0, edit.start) + edit.newText + updated.slice(edit.end)
  }
  return updated
}

function offsetAt(source, position) {
  if (
    !Number.isInteger(position.line)
    || !Number.isInteger(position.character)
    || position.line < 0
    || position.character < 0
  ) {
    throw outOfBounds(position)
  }
  let offset = 0
  for (let line = 0; line < position.line; line += 1) {
    const newline = source.indexOf("\n", offset)
    if (newline < 0) throw outOfBounds(position)
    offset = newline + 1
  }
  const newline = source.indexOf("\n", offset)
  let lineEnd = newline < 0 ? source.length : newline
  if (lineEnd > offset && source[lineEnd - 1] === "\r") lineEnd -= 1
  if (position.character > lineEnd - offset) {
    throw outOfBounds(position)
  }
  return offset + position.character
}

function outOfBounds(position) {
  return new RangeError(
    `LSP position out of bounds at line ${position.line}, character ${position.character}`,
  )
}

function sortedDocuments(documents) {
  return new Map([...documents].sort(([left], [right]) => (
    left < right ? -1 : left > right ? 1 : 0
  )))
}
