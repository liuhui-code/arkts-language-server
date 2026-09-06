function format(value: string, count: number): string {
  return value.repeat(count)
}

export function buildHints(): string {
  const prefix = "😀"; const message = format("ok", 2)
  return prefix + message
}
