import fs from "node:fs"

/** A live JSONL writer may expose an unfinished tail; complete corrupt records still fail. */
export function completeLogEvents(file) {
  const source = fs.readFileSync(file, "utf8")
  const end = source.lastIndexOf("\n")
  return source.slice(0, end + 1).split("\n").filter(Boolean).map(JSON.parse)
}
