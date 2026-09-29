import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { buildSync } from "esbuild"

const projectRoot = path.resolve(import.meta.dirname, "../..")
const require = createRequire(import.meta.url)

export async function createClassBindingInputFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-binding-input-"))
  const physicalRoot = path.join(root, "workspace")
  const clientRoot = path.join(root, "workspace-alias")
  fs.mkdirSync(path.join(physicalRoot, "nested"), { recursive: true })
  fs.symlinkSync(physicalRoot, clientRoot, "dir")
  fs.writeFileSync(path.join(physicalRoot, "Base.ets"), "export class Base {}\n")
  const auditPath = path.join(root, "audit.ndjson")
  const releasePath = path.join(root, "release")
  const sidecarPath = options.sidecarPath ?? path.join(root, "sidecar.mjs")
  if (!options.sidecarPath) {
    buildSync({ entryPoints: [path.join(projectRoot, "tests/fixtures/index/class-binding-held-status.mjs")],
    outfile: sidecarPath, bundle: true, platform: "node", format: "esm", target: "node20",
    define: { "process.env.ARKTS_INDEX_TEST_AUDIT": JSON.stringify(auditPath),
      "process.env.ARKTS_INDEX_TEST_RELEASE": JSON.stringify(releasePath) } })
    fs.chmodSync(sidecarPath, 0o755)
  }
  const adapterPath = path.join(root, "adapter.cjs")
  const statePath = path.join(root, "input-state.cjs")
  for (const [entry, outfile] of [
    ["src/index/sidecar-workspace-index.ts", adapterPath],
    ["src/semantic/references/reference-input-snapshot.ts", statePath],
  ]) buildSync({ entryPoints: [path.join(projectRoot, entry)], outfile,
    bundle: true, platform: "node", format: "cjs", target: "node20" })
  const { SidecarWorkspaceIndex } = require(adapterPath)
  const { ReferenceInputState } = require(statePath)
  const index = new SidecarWorkspaceIndex({ sidecarPath, requestTimeoutMs: 10_000 })
  const workspace = { id: "capture-workspace", rootUri: pathToFileURL(clientRoot).href }
  const release = () => fs.writeFileSync(releasePath, "release")
  t.after(async () => {
    release()
    await index.close(workspace.id)
    fs.rmSync(root, { recursive: true, force: true })
  })
  await index.open(workspace, path.join(root, "cache"))
  const uri = name => pathToFileURL(path.join(clientRoot, name)).href
  const document = { uri: uri("Child.ets"), workspaceId: workspace.id, version: 1,
    text: "import { Base } from './Base';\nclass Child extends Base {}" }
  const query = { expectedGeneration: 7,
    documentUris: [document.uri, ...["Base.ets", "Base.ts", "Base.d.ets", "Base.d.ts",
      "Base/index.ets", "Base/index.ts", "Base/index.d.ets", "Base/index.d.ts"].map(uri)],
    documentUri: document.uri, classNamePosition: { line: 1, character: 6 } }
  const state = new ReferenceInputState()
  const audit = () => fs.existsSync(auditPath)
    ? fs.readFileSync(auditPath, "utf8").split("\n").filter(Boolean).map(JSON.parse) : []
  return { root, physicalRoot, clientRoot, uri, workspace, index, state, document, query, audit, release,
    input: { workspace, query, documents: [document],
      projectConfiguration: { product: "phone", targets: { module: "tablet" } },
      sdkConfiguration: { path: path.join(root, "sdk"), apiVersion: 24 } },
    async holdStatus() {
      const settled = index.status(workspace.id).then(value => ({ value }), error => ({ error }))
      const deadline = performance.now() + 10_000
      while (!audit().some(entry => entry.event === "status.held")) {
        if (performance.now() > deadline) throw new Error(`held status not observed: ${JSON.stringify(audit())}`)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      return { async release() {
        release()
        const outcome = await settled
        if (outcome.error) throw outcome.error
        return outcome.value
      } }
    },
  }
}
