import { spawn } from "node:child_process"
import path from "node:path"
import { resolveIndexCacheDirectory } from "./cache-directory.js"
import { resolveIndexSidecarPath } from "./sidecar-path.js"

/** Explicit administration mode owns stdout; it never creates an LSP connection. */
export async function runCacheCommand(args: readonly string[]): Promise<number> {
  const position = args.indexOf("--index-cache")
  const mode = args[position + 1]
  if ((mode !== "preview" && mode !== "clean") || args.includes("--stdio") || args.includes("--apply")) {
    throw new Error("usage: arkts-language-server --index-cache preview|clean [--cache-dir DIRECTORY] [cache options]")
  }
  const tail = args.slice(position + 2)
  let directory = resolveIndexCacheDirectory()
  const index = tail.indexOf("--cache-dir")
  if (index !== -1) {
    const value = tail[index + 1]
    if (!value || value.startsWith("--")) throw new Error("missing cache directory")
    directory = path.resolve(value)
    tail.splice(index, 2)
  }
  const command = ["--cache-gc", "--cache-dir", directory, ...tail]
  if (mode === "clean") command.push("--apply")
  return new Promise((resolve, reject) => {
    const child = spawn(resolveIndexSidecarPath(), command, { stdio: "inherit" })
    child.once("error", reject)
    child.once("close", (code, signal) => {
      if (signal) reject(new Error(`Index cache command terminated by ${signal}`))
      else resolve(code ?? 1)
    })
  })
}
