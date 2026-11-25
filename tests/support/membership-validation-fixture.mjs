import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
import { projectRoot } from "./lsp-process.mjs"

export function membershipValidationFixture(t, scopeCurrent = () => true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-membership-union-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const entry = path.join(root, "entry.ts"), outfile = path.join(root, "entry.cjs")
  fs.writeFileSync(entry, ["project/request-input-validation", "project/source-file-identity",
    "project/validated-source-directory", "project/loaded-configuration-witness", "project/configuration-source-identity", "core/workspace/complete-membership-proof",
    "core/workspace/workspace-source-enumerator", "core/workspace/workspace-disk-source", "core/workspace/admitted-project-source-read", "core/workspace/project-membership-access", "core/types/typescript-source-boundary", "project/source-read-origin"].map(file =>
    `export * from ${JSON.stringify(path.join(projectRoot, "src", file + ".ts"))}`).join("\n"))
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", target: "node20" })
  const api = createRequire(import.meta.url)(outfile), source = path.join(root, "Source.ts")
  fs.writeFileSync(source, "export const value = 1\n")
  const timestamp = new Date(Math.floor(Date.now() / 1000) * 1000 - 10_000)
  fs.utimesSync(source, timestamp, timestamp)
  const directories = new api.WorkspaceNamespaceWitness(1024 * 1024)
  directories.observe({ path: root, physicalPath: fs.realpathSync.native(root),
    identity: fs.lstatSync(root, { bigint: true }), root: false })
  const token = api.sourceStatIdentity(fs.lstatSync(source))
  const catalog = { paths: [source], diskIdentities: new Map([[source, token]]),
    revision: 1, status: "complete", pathBytes: Buffer.byteLength(source) }
  const proof = api.captureCompleteMembershipProof(catalog, directories, scopeCurrent)
  return { api, source, catalog, proof, token, timestamp, directories }
}
