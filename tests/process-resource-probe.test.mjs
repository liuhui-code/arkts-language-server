import assert from "node:assert/strict"
import test from "node:test"

import {
  createProcessResourceProbe,
  PROCESS_RESOURCE_PROBE_CAPABILITIES,
  parseDarwinPsOutput,
  parseLinuxProcStat,
  parseLinuxProcStatus,
} from "./support/process-resource-probe.mjs"

test("parses an immutable macOS ps process table", () => {
  const processes = parseDarwinPsOutput(`
  410   1 Mon Sep  1 09:08:07 2026  2048  1.5 /usr/local/bin/node
  411 410 Mon Sep  1 09:08:08 2026   512  0.2 /opt/arkts-index-sidecar
`)

  assert.deepEqual(processes, [
    {
      pid: 410,
      parentPid: 1,
      startIdentity: "darwin:Mon Sep 1 09:08:07 2026",
      rssBytes: 2_097_152,
      cpuPercent: 1.5,
      command: "/usr/local/bin/node",
    },
    {
      pid: 411,
      parentPid: 410,
      startIdentity: "darwin:Mon Sep 1 09:08:08 2026",
      rssBytes: 524_288,
      cpuPercent: 0.2,
      command: "/opt/arkts-index-sidecar",
    },
  ])
  assert.ok(Object.isFrozen(processes))
  assert.ok(Object.isFrozen(processes[0]))
  assert.throws(() => processes.push(processes[0]), TypeError)
})

test("rejects macOS ps output above the configured byte limit", () => {
  assert.throws(
    () => parseDarwinPsOutput("123 1 Mon Sep 1 09:08:07 2026 1 0.0 node", { maxBytes: 8 }),
    {
      code: "EPROBE_LIMIT",
      message: "macOS ps output exceeded 8 bytes",
    },
  )
})

test("rejects a macOS process table above the configured row limit", () => {
  const output = [
    "410 1 Mon Sep 1 09:08:07 2026 1 0.0 node",
    "411 410 Mon Sep 1 09:08:08 2026 1 0.0 arkts-index-sidecar",
  ].join("\n")

  assert.throws(() => parseDarwinPsOutput(output, { maxProcesses: 1 }), {
    code: "EPROBE_LIMIT",
    message: "macOS ps output exceeded 1 process rows",
  })
})

test("rejects unsafe numeric facts in macOS ps output", () => {
  const invalidRows = [
    "9007199254740992 1 Mon Sep 1 09:08:07 2026 1 0.0 node",
    "410 1 Mon Sep 1 09:08:07 2026 9007199254740992 0.0 node",
    `410 1 Mon Sep 1 09:08:07 2026 1 ${"9".repeat(400)} node`,
  ]

  for (const row of invalidRows) {
    assert.throws(() => parseDarwinPsOutput(row), {
      code: "EPROBE_PARSE",
    })
  }
})

test("parses Linux proc stat fields when the process name contains parentheses", () => {
  const stat = parseLinuxProcStat(
    "912 (arkts worker (io)) S 410 0 0 0 0 0 0 0 0 0 120 30 0 0 20 0 3 0 5000 100000 32",
  )

  assert.deepEqual(stat, {
    pid: 912,
    parentPid: 410,
    command: "arkts worker (io)",
    state: "S",
    totalCpuTicks: 150,
    startTimeTicks: 5_000,
    rssPages: 32,
  })
  assert.ok(Object.isFrozen(stat))
})

test("rejects Linux proc stat when combined CPU ticks are unsafe", () => {
  assert.throws(() => parseLinuxProcStat(linuxStat({
    pid: 912,
    parentPid: 410,
    command: "node",
    userTicks: Number.MAX_SAFE_INTEGER,
    systemTicks: 1,
    startTimeTicks: 5_000,
  })), {
    code: "EPROBE_PARSE",
    message: "Linux proc stat total CPU ticks exceeded the safe integer range",
  })
})

test("parses Linux VmRSS only when proc status reports KiB", () => {
  assert.equal(parseLinuxProcStatus("Name:\tnode\nVmRSS:\t2048 kB\n"), 2_097_152)
  assert.throws(() => parseLinuxProcStatus("Name:\tnode\nVmRSS:\t2048 MB\n"), {
    code: "EPROBE_PARSE",
    message: "Linux proc status omitted a valid VmRSS value",
  })
})

test("samples an injected macOS server and its sidecar process tree", async () => {
  const psOutput = [
    "410 1 Mon Sep 1 09:08:07 2026 2048 1.5 /usr/local/bin/node",
    "411 410 Mon Sep 1 09:08:08 2026 512 0.2 /opt/arkts-index-sidecar",
    "412 411 Mon Sep 1 09:08:09 2026 256 0.1 sidecar-helper",
    "999 1 Mon Sep 1 09:08:10 2026 9999 9.9 unrelated",
  ].join("\n")
  const psCalls = []
  const probe = createProcessResourceProbe({
    platform: "darwin",
    now: () => 1_725_180_487_000,
    runPs: async (request) => {
      psCalls.push(request)
      return psOutput
    },
  })

  const identity = await probe.identify(410)
  const sample = await probe.sample(identity)

  assert.deepEqual(identity, {
    pid: 410,
    startIdentity: "darwin:Mon Sep 1 09:08:07 2026",
  })
  assert.deepEqual(sample, {
    timestamp: 1_725_180_487_000,
    truncated: false,
    processes: [
      {
        role: "server",
        pid: 410,
        parentPid: 1,
        startIdentity: "darwin:Mon Sep 1 09:08:07 2026",
        rssBytes: 2_097_152,
        cpuPercent: 1.5,
      },
      {
        role: "sidecar",
        pid: 411,
        parentPid: 410,
        startIdentity: "darwin:Mon Sep 1 09:08:08 2026",
        rssBytes: 524_288,
        cpuPercent: 0.2,
      },
      {
        role: "sidecar",
        pid: 412,
        parentPid: 411,
        startIdentity: "darwin:Mon Sep 1 09:08:09 2026",
        rssBytes: 262_144,
        cpuPercent: 0.1,
      },
    ],
  })
  assert.deepEqual(psCalls, Array(2).fill({
    command: "/bin/ps",
    args: ["-axo", "pid=,ppid=,lstart=,rss=,%cpu=,comm="],
    maxBuffer: 1_048_576,
    env: { LC_ALL: "C" },
  }))
  assert.ok(Object.isFrozen(identity))
  assert.ok(Object.isFrozen(sample))
  assert.ok(Object.isFrozen(sample.processes))
  assert.ok(sample.processes.every(Object.isFrozen))
  assert.throws(() => {
    sample.processes[0].rssBytes = 0
  }, TypeError)
})

test("rejects a reused server PID when its start identity changes", async () => {
  const outputs = [
    "410 1 Mon Sep 1 09:08:07 2026 2048 1.5 node",
    "410 1 Mon Sep 1 09:09:07 2026 1024 0.1 replacement",
  ]
  const probe = createProcessResourceProbe({
    platform: "darwin",
    now: () => 2_000,
    runPs: async () => outputs.shift(),
  })

  const identity = await probe.identify(410)
  await assert.rejects(() => probe.sample(identity), {
    code: "EPROCESS_IDENTITY_CHANGED",
    message: "process 410 start identity changed",
  })
})

test("bounds a process-tree sample and reports truncation", async () => {
  const output = [
    "410 1 Mon Sep 1 09:08:07 2026 2048 1.5 node",
    "412 410 Mon Sep 1 09:08:09 2026 256 0.1 second-sidecar",
    "411 410 Mon Sep 1 09:08:08 2026 512 0.2 first-sidecar",
  ].join("\n")
  const probe = createProcessResourceProbe({
    platform: "darwin",
    now: () => 3_000,
    maxProcesses: 2,
    runPs: async () => output,
  })

  const sample = await probe.sample(await probe.identify(410))

  assert.equal(sample.truncated, true)
  assert.deepEqual(sample.processes.map(({ pid }) => pid), [410, 411])
  assert.equal(sample.processes.length, 2)
})

test("samples an injected Linux proc server and sidecar tree", async () => {
  const files = new Map([
    ["/virtual-proc/uptime", "100.00 50.00\n"],
    ["/virtual-proc/410/stat", linuxStat({
      pid: 410,
      parentPid: 1,
      command: "node server",
      userTicks: 120,
      systemTicks: 30,
      startTimeTicks: 5_000,
    })],
    ["/virtual-proc/410/status", "Name:\tnode\nVmRSS:\t2048 kB\n"],
    ["/virtual-proc/410/task/410/children", "411\n"],
    ["/virtual-proc/411/stat", linuxStat({
      pid: 411,
      parentPid: 410,
      command: "arkts-index-sidecar",
      userTicks: 40,
      systemTicks: 10,
      startTimeTicks: 8_000,
    })],
    ["/virtual-proc/411/status", "Name:\tarkts-index\nVmRSS:\t512 kB\n"],
    ["/virtual-proc/411/task/411/children", ""],
  ])
  const reads = []
  const probe = createProcessResourceProbe({
    platform: "linux",
    procRoot: "/virtual-proc",
    clockTicksPerSecond: 100,
    now: () => 4_000,
    readFile: async (filePath) => {
      reads.push(filePath)
      if (!files.has(filePath)) throw Object.assign(new Error("missing fixture"), { code: "ENOENT" })
      return files.get(filePath)
    },
  })

  const identity = await probe.identify(410)
  const sample = await probe.sample(identity)

  assert.deepEqual(identity, { pid: 410, startIdentity: "linux:5000" })
  assert.deepEqual(sample, {
    timestamp: 4_000,
    truncated: false,
    processes: [
      {
        role: "server",
        pid: 410,
        parentPid: 1,
        startIdentity: "linux:5000",
        rssBytes: 2_097_152,
        cpuPercent: 3,
      },
      {
        role: "sidecar",
        pid: 411,
        parentPid: 410,
        startIdentity: "linux:8000",
        rssBytes: 524_288,
        cpuPercent: 2.5,
      },
    ],
  })
  assert.deepEqual(reads, [
    "/virtual-proc/410/stat",
    "/virtual-proc/uptime",
    "/virtual-proc/410/stat",
    "/virtual-proc/410/status",
    "/virtual-proc/410/task/410/children",
    "/virtual-proc/411/stat",
    "/virtual-proc/411/status",
    "/virtual-proc/411/task/411/children",
  ])
})

test("treats a Linux zombie without VmRSS as an exited process", async () => {
  let statReads = 0
  const probe = createProcessResourceProbe({
    platform: "linux",
    procRoot: "/virtual-proc",
    clockTicksPerSecond: 100,
    now: () => 4_000,
    readFile: async (filePath) => {
      if (filePath === "/virtual-proc/410/stat") {
        statReads += 1
        return linuxStat({
          pid: 410,
          parentPid: 1,
          command: "node",
          state: statReads === 1 ? "S" : "Z",
          userTicks: 1,
          systemTicks: 1,
          startTimeTicks: 5_000,
        })
      }
      if (filePath === "/virtual-proc/uptime") return "100.00 50.00\n"
      throw Object.assign(new Error("missing fixture"), { code: "ENOENT" })
    },
  })

  const identity = await probe.identify(410)
  await assert.rejects(() => probe.sample(identity), {
    code: "EPROCESS_NOT_FOUND",
    message: "process 410 has exited",
  })
})

test("treats a Linux proc entry disappearing before sampling as an exited process", async () => {
  let statReads = 0
  const probe = createProcessResourceProbe({
    platform: "linux",
    procRoot: "/virtual-proc",
    clockTicksPerSecond: 100,
    now: () => 4_000,
    readFile: async (filePath) => {
      if (filePath === "/virtual-proc/410/stat") {
        statReads += 1
        if (statReads > 1) {
          throw Object.assign(new Error("process disappeared"), { code: "ENOENT" })
        }
        return linuxStat({
          pid: 410,
          parentPid: 1,
          command: "node",
          userTicks: 1,
          systemTicks: 1,
          startTimeTicks: 5_000,
        })
      }
      if (filePath === "/virtual-proc/uptime") return "100.00 50.00\n"
      throw Object.assign(new Error("missing fixture"), { code: "ENOENT" })
    },
  })

  const identity = await probe.identify(410)
  await assert.rejects(() => probe.sample(identity), {
    code: "EPROCESS_NOT_FOUND",
    message: "process 410 has exited",
  })
})

test("omits a Linux child that exits while its process tree is sampled", async () => {
  const files = new Map([
    ["/virtual-proc/uptime", "100.00 50.00\n"],
    ["/virtual-proc/410/stat", linuxStat({
      pid: 410,
      parentPid: 1,
      command: "node",
      userTicks: 1,
      systemTicks: 1,
      startTimeTicks: 5_000,
    })],
    ["/virtual-proc/410/status", "Name:\tnode\nVmRSS:\t2048 kB\n"],
    ["/virtual-proc/410/task/410/children", "411\n"],
  ])
  const probe = createProcessResourceProbe({
    platform: "linux",
    procRoot: "/virtual-proc",
    clockTicksPerSecond: 100,
    now: () => 4_000,
    readFile: async (filePath) => {
      if (!files.has(filePath)) {
        throw Object.assign(new Error("process disappeared"), { code: "ENOENT" })
      }
      return files.get(filePath)
    },
  })

  const sample = await probe.sample(await probe.identify(410))

  assert.deepEqual(sample.processes.map(({ pid }) => pid), [410])
  assert.equal(sample.truncated, false)
})

test("rejects a Linux proc file after the injected read exceeds its byte limit", async () => {
  const probe = createProcessResourceProbe({
    platform: "linux",
    procRoot: "/virtual-proc",
    clockTicksPerSecond: 100,
    maxProcBytes: 8,
    now: () => 4_000,
    readFile: async () => "912 (node) S 1 0 0 0 0 0 0 0 0 0 1 1 0 0 0 0 0 0 1",
  })

  await assert.rejects(() => probe.identify(912), {
    code: "EPROBE_LIMIT",
    message: "Linux proc file exceeded 8 bytes: /virtual-proc/912/stat",
  })
})

test("rejects invalid probe dependencies and limits at construction", () => {
  assert.throws(() => createProcessResourceProbe({
    platform: "darwin",
    now: 42,
    runPs: async () => "",
  }), { code: "EPROBE_CONFIG", message: "now must be a function" })
  assert.throws(() => createProcessResourceProbe({
    platform: "darwin",
    now: () => 0,
    runPs: "ps",
  }), { code: "EPROBE_CONFIG", message: "runPs must be a function" })
  assert.throws(() => createProcessResourceProbe({
    platform: "darwin",
    now: () => 0,
    runPs: async () => "",
    maxProcesses: 0,
  }), { code: "EPROBE_CONFIG", message: "sample process limit must be a positive safe integer" })
  assert.throws(() => createProcessResourceProbe({
    platform: "linux",
    now: () => 0,
    readFile: null,
    clockTicksPerSecond: 100,
  }), { code: "EPROBE_CONFIG", message: "readFile must be a function" })
  assert.throws(() => createProcessResourceProbe({
    platform: "linux",
    now: () => 0,
    readFile: async () => "",
    clockTicksPerSecond: 0.5,
  }), {
    code: "EPROBE_CONFIG",
    message: "Linux clock ticks per second must be a positive safe integer",
  })
})

test("rejects a non-finite sample timestamp", async () => {
  const probe = createProcessResourceProbe({
    platform: "darwin",
    now: () => Number.NaN,
    runPs: async () => "410 1 Mon Sep 1 09:08:07 2026 1 0.0 node",
  })
  const identity = await probe.identify(410)

  await assert.rejects(() => probe.sample(identity), {
    code: "EPROBE_CLOCK",
    message: "sample timestamp must be a finite non-negative number",
  })
})

test("declares CPU semantics and the unsampled Node heap gap", () => {
  assert.deepEqual(PROCESS_RESOURCE_PROBE_CAPABILITIES, {
    processTree: true,
    rssBytes: true,
    cpuPercent: {
      darwin: "ps-reported",
      linux: "lifetime-average",
    },
    nodeHeap: {
      available: false,
      reason: "Node heap requires an opt-in preload IPC channel; this probe does not sample it.",
    },
  })
  assert.ok(Object.isFrozen(PROCESS_RESOURCE_PROBE_CAPABILITIES))
  assert.ok(Object.isFrozen(PROCESS_RESOURCE_PROBE_CAPABILITIES.cpuPercent))
  assert.ok(Object.isFrozen(PROCESS_RESOURCE_PROBE_CAPABILITIES.nodeHeap))
})

function linuxStat({
  pid,
  parentPid,
  command,
  state = "S",
  userTicks,
  systemTicks,
  startTimeTicks,
}) {
  const fields = Array(21).fill("0")
  fields[0] = String(parentPid)
  fields[10] = String(userTicks)
  fields[11] = String(systemTicks)
  fields[18] = String(startTimeTicks)
  return `${pid} (${command}) ${state} ${fields.join(" ")}`
}
