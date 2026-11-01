import assert from "node:assert/strict"
import test from "node:test"
import { createProcessResourceProbe } from "./support/process-resource-probe.mjs"

function fixture({ denied = false, reused = false, unreadable = false, maxProcesses = 64, malformed = false, maxProcProcesses = 8192, mountOptions = "rw", mountInfo } = {}) {
  let scanned = false
  let reusedReads = 0
  const stat = (pid, parent, birth = 5000) => {
    const fields = Array(21).fill("0")
    fields[0] = String(parent); fields[18] = String(birth)
    return `${pid} (node) S ${fields.join(" ")}`
  }
  return createProcessResourceProbe({ platform: "linux", procRoot: "/virtual-proc", now: () => 4000,
    clockTicksPerSecond: 100, maxProcesses, maxProcProcesses,
    readDirectory: async () => {
      assert.equal(denied, false, "never enumerate after permission denial")
      assert.equal(scanned, false, "only one enumeration per sample")
      scanned = true
      return mountOptions.includes("hidepid=") ? ["410"] : ["410", "411", "412", "self"]
    },
    readFile: async file => {
      if (file.endsWith("/mountinfo")) return mountInfo ?? `1 0 0:1 / /virtual-proc rw - proc proc ${mountOptions}\n`
      if (file.endsWith("/uptime")) return "100.00 50.00\n"
      if (file.endsWith("/children")) throw Object.assign(new Error("children unavailable"), { code: denied ? "EACCES" : "ENOENT" })
      if (file.endsWith("/status")) return "VmRSS:\t2 kB\n"
      if (file.endsWith("/stat")) {
        const pid = Number(file.split("/").at(-2))
        if (unreadable && pid === 412) throw Object.assign(new Error("permission denied"), { code: "EACCES" })
        if (malformed && pid === 412) return "not a proc stat"
        const birth = reused && pid === 411 && scanned ? (reusedReads++ > 0 ? 6000 : 5000) : 5000
        return stat(pid, pid === 410 ? 1 : pid === 411 ? 410 : 411, birth)
      }
      throw new Error(`unexpected read ${file}`)
    } })
}

test("Linux optional children absence preserves the live root and complete descendant RSS", async () => {
  const probe = fixture()
  const sample = await probe.sample(await probe.identify(410))
  assert.deepEqual(sample.processes.map(({ pid }) => pid), [410, 411, 412])
  assert.equal(sample.truncated, false)
  assert.equal(sample.processes.reduce((sum, p) => sum + p.rssBytes, 0), 6144)
})

for (const [name, options, code] of [
  ["hidepid=2 cannot certify an incomplete visible tree", { mountOptions: "rw,hidepid=2" }, "EPROBE_PLATFORM"],
  ["hidepid=4 cannot certify a ptrace-filtered tree", { mountOptions: "rw,hidepid=4" }, "EPROBE_PLATFORM"],
  ["missing mount evidence fails closed", { mountInfo: "" }, "EPROBE_PLATFORM"],
  ["masked PID mount fails closed", { mountInfo: "1 0 0:1 / /virtual-proc rw - proc proc rw\n2 1 0:2 / /virtual-proc/411 ro - tmpfs tmpfs ro\n" }, "EPROBE_PLATFORM"],
  ["malformed stat fails closed", { malformed: true }, "EPROBE_PARSE"],
  ["enumeration above the bound fails closed", { maxProcProcesses: 2 }, "EPROBE_LIMIT"],
  ["permission denial is not a missing optional feature", { denied: true }, "EACCES"],
  ["an unreadable enumerated process cannot produce a partial tree", { unreadable: true }, "EACCES"],
  ["a scanned child PID cannot be reused before sampling", { reused: true }, "EPROCESS_IDENTITY_CHANGED"],
]) {
  test(`Linux fallback ${name}`, async () => {
    const probe = fixture(options)
    await assert.rejects(() => probe.sample({ pid: 410, startIdentity: "linux:5000" }), { code })
  })
}

test("Linux fallback preserves bounded-tree truncation", async () => {
  const probe = fixture({ maxProcesses: 1 })
  const sample = await probe.sample(await probe.identify(410))
  assert.deepEqual(sample.processes.map(p => p.pid), [410])
  assert.equal(sample.truncated, true)
})

test("Linux missing children with a genuinely exited root remains process-not-found", async () => {
  let gone = false
  const fields = Array(21).fill("0"); fields[18] = "5000"
  const probe = createProcessResourceProbe({ platform: "linux", now: () => 4000, clockTicksPerSecond: 100,
    readDirectory: async () => { assert.fail("do not enumerate for a terminated root") },
    readFile: async file => {
      if (file.endsWith("/uptime")) return "100.00 50.00\n"
      if (file.endsWith("/stat")) return `410 (node) ${gone ? "Z" : "S"} ${fields.join(" ")}`
      if (file.endsWith("/status")) return "VmRSS:\t2 kB\n"
      gone = true
      throw Object.assign(new Error("missing children"), { code: "ENOENT" })
    } })
  await assert.rejects(() => probe.sample({ pid: 410, startIdentity: "linux:5000" }), { code: "EPROCESS_NOT_FOUND" })
})
