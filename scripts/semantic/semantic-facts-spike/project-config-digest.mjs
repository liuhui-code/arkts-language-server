import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const CONFIG_NAMES = new Set(["build-profile.json5", "oh-package.json5", "oh-package-lock.json5"])
const INSTALL_NAMES = new Set(["oh_modules", "node_modules"])
const MAX_ENTRIES = 100_000
const MAX_CONFIG_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 16 * 1024 * 1024

/** Conservative snapshot for the default, dependency-uninstalled project host. */
export async function digestProjectConfiguration(workspaceRoot, { allowInstalled = false } = {}) {
  const root = await fs.realpath(workspaceRoot)
  const pending = [root]
  const configs = []
  let visited = 0
  let totalBytes = 0
  while (pending.length) {
    const directory = pending.pop()
    const entries = await fs.readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => ordinal(a.name, b.name))
    for (const entry of entries) {
      if (++visited > MAX_ENTRIES) throw new Error("project configuration scan exceeds entry budget")
      if (entry.name === ".git") continue
      const absolute = path.join(directory, entry.name)
      if (entry.name === "oh_modules" && allowInstalled && entry.isDirectory()) continue
      if (INSTALL_NAMES.has(entry.name)) {
        throw new Error(`installed dependencies are not pinned: ${absolute}`)
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`project configuration scan cannot pin symbolic link: ${absolute}`)
      }
      if (entry.isDirectory()) {
        pending.push(absolute)
        continue
      }
      if (!entry.isFile()) throw new Error(`project configuration scan found non-file: ${absolute}`)
      if (!CONFIG_NAMES.has(entry.name)) continue
      const stat = await fs.stat(absolute)
      if (stat.size > MAX_CONFIG_BYTES) throw new Error(`project configuration file exceeds budget: ${absolute}`)
      const contents = await fs.readFile(absolute)
      totalBytes += contents.length
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error("project configuration inputs exceed byte budget")
      configs.push([path.relative(root, absolute).split(path.sep).join("/"),
        createHash("sha256").update(contents).digest("hex")])
    }
  }
  configs.sort((a, b) => ordinal(a[0], b[0]))
  return createHash("sha256").update(JSON.stringify([root, configs])).digest("hex")
}

function ordinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}
