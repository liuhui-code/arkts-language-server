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
