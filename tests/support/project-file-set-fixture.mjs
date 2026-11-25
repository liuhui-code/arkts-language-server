import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export function createWorkspace(t, name, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `arkts-project-set-${name}-`))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, "utf8")
  }
  return root
}

export function syncPosition(store, workspaceRoot, documentPath, version = 1) {
  const content = fs.readFileSync(documentPath, "utf8")
  store.sync({
    path: documentPath,
    content,
    documentVersion: version,
    workspaceRoot,
  })
  return viewPathPosition(workspaceRoot, documentPath, version)
}

export function viewPathPosition(workspaceRoot, documentPath, version = 1) {
  return {
    path: documentPath,
    line: 1,
    column: 1,
    documentVersion: version,
    workspaceRoot,
  }
}
