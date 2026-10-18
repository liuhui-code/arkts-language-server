export function hasOwn(message, key) {
  return message !== null
    && typeof message === "object"
    && Object.prototype.hasOwnProperty.call(message, key)
}

export function isResponse(message) {
  return hasOwn(message, "id") && !hasOwn(message, "method")
}

export function isServerRequest(message) {
  return hasOwn(message, "id") && typeof message.method === "string"
}

export function isNotification(message) {
  return !hasOwn(message, "id") && typeof message?.method === "string"
}

export function messageKind(message) {
  if (isResponse(message)) return "response"
  if (isServerRequest(message)) return "request"
  if (isNotification(message)) return "notification"
  return "unknown"
}

export function protocolFailure(code, message, details = {}) {
  return Object.assign(new Error(`LSP protocol failure: ${message}`), { code, ...details })
}

export function contentLengthFromHeader(header) {
  const contentLengthLines = header.split("\r\n")
    .filter((line) => /^Content-Length:/i.test(line))
  const contentLength = contentLengthLines.length === 1
    ? /^Content-Length:\s*(\d+)\s*$/i.exec(contentLengthLines[0])
    : null
  const length = Number(contentLength?.[1])
  return contentLength && Number.isSafeInteger(length) ? length : undefined
}
