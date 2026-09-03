import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const SCHEMA = "arkts-language-server.artifact-manifest"
const SCHEMA_VERSION = 1

export async function createArtifactManifest({
  root,
  version,
  commit,
  platform,
  toolchains,
}) {
  const rootStat = await fs.lstat(root)
  if (rootStat.isSymbolicLink()) {
    throw new Error("artifact staging root must not be a symbolic link")
  }

  const files = []
  await collectFiles(root, [], files)

  return {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    version,
    commit,
    platform: sortedRecord(platform),
    toolchains: sortedRecord(toolchains),
    files: files.sort((left, right) => compareOrdinal(left.path, right.path)),
  }
}

async function collectFiles(root, segments, files) {
  const directoryPath = path.join(root, ...segments)
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })

  for (const entry of entries) {
    const entrySegments = [...segments, entry.name]
    if (entry.isSymbolicLink()) {
      throw new Error(`artifact staging tree contains a symbolic link: ${entrySegments.join("/")}`)
    }
    if (entry.isDirectory()) {
      await collectFiles(root, entrySegments, files)
      continue
    }
    if (!entry.isFile()) continue

    const filePath = path.join(root, ...entrySegments)
    const [contents, stat] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)])
    files.push({
      path: entrySegments.join("/"),
      size: stat.size,
      mode: `0${(stat.mode & 0o777).toString(8)}`,
      sha256: createHash("sha256").update(contents).digest("hex"),
    })
  }
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => (
    compareOrdinal(left, right)
  )))
}

function compareOrdinal(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
