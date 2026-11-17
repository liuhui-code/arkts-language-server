import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { projectRoot } from "./lsp-process.mjs"

export function nativeWireAuditOptions(audit) {
  const native = process.env.ARKTS_TEST_NATIVE_BINARY ?? path.join(projectRoot, "target/release",
    process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  const preload = path.join(projectRoot, "tests/fixtures/index/native-child-lifetime-audit.cjs")
  return { ARKTS_INDEX_SIDECAR_PATH: native, ARKTS_TEST_NATIVE_BINARY: native,
    ARKTS_TEST_NATIVE_WIRE_AUDIT: audit, NODE_OPTIONS: [process.env.NODE_OPTIONS,
      "--require="+JSON.stringify(preload)].filter(Boolean).join(" ") }
}

export function readNativeWireAudit(file) {
  const rows = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
  assert.ok(rows.length, "Native audit must not be empty")
  assert.ok(!rows.some(row => ["audit-error", "stdin-error", "spawn-error"].includes(row.kind)),
    "Native observation must not hide protocol or transport errors")
  return rows
}
