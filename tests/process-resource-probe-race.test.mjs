import assert from "node:assert/strict"
import test from "node:test"
import { createProcessResourceProbe } from "./support/process-resource-probe.mjs"

for (const child of [false, true]) {
  test(`Linux ${child ? "child" : "root"} exiting between stat and status is not a malformed RSS sample`, async () => {
    const probe = fixture({ child, nextState: "Z" })
    const identity = await probe.identify(410)
    if (child) {
      const sample = await probe.sample(identity)
      assert.deepEqual(sample.processes.map(({ pid, rssBytes }) => ({ pid, rssBytes })), [{ pid: 410, rssBytes: 2048 }])
    } else await assert.rejects(() => probe.sample(identity), { code: "EPROCESS_NOT_FOUND" })
  })
}

test("a live process without VmRSS still fails closed", async () => {
  const probe = fixture({ child: false, nextState: "S" })
  await assert.rejects(async () => probe.sample(await probe.identify(410)), { code: "EPROBE_PARSE" })
})

test("a reused PID cannot turn an invalid old RSS read into a valid sample", async () => {
  const probe = fixture({ child: false, nextState: "S", reused: true })
  await assert.rejects(async () => probe.sample(await probe.identify(410)), { code: "EPROCESS_IDENTITY_CHANGED" })
})

function fixture({ child, nextState, reused = false }) {
  const subject = child ? 411 : 410
  let transitioned = false
  return createProcessResourceProbe({ platform: "linux", procRoot: "/virtual-proc", now: () => 4000,
    clockTicksPerSecond: 100, readFile: async file => {
      if (file === "/virtual-proc/uptime") return "100.00 50.00\n"
      if (file.endsWith("/stat")) {
        const pid = Number(file.split("/").at(-2))
        const changed = pid === subject && transitioned
        const fields = Array(21).fill("0")
        fields[0] = pid === 410 ? "1" : "410"
        fields[18] = changed && reused ? "6000" : "5000"
        return `${pid} (node) ${changed ? nextState : "S"} ${fields.join(" ")}`
      }
      if (file === `/virtual-proc/${subject}/status`) { transitioned = true; return "Name:\tnode\n" }
      if (file === "/virtual-proc/410/status") return "Name:\tnode\nVmRSS:\t2 kB\n"
      if (file.endsWith("/children")) return child && file.includes("/410/") ? "411" : ""
      throw Object.assign(new Error("missing proc entry"), { code: "ENOENT" })
    } })
}
