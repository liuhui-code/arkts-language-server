const DARWIN_PS_LINE = /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\d+)\s+([0-9]+(?:\.[0-9]+)?)\s+(.+?)\s*$/

export const PROCESS_RESOURCE_PROBE_CAPABILITIES = Object.freeze({
  processTree: true,
  rssBytes: true,
  cpuPercent: Object.freeze({
    darwin: "ps-reported",
    linux: "lifetime-average",
  }),
  nodeHeap: Object.freeze({
    available: false,
    reason: "Node heap requires an opt-in preload IPC channel; this probe does not sample it.",
  }),
})

export function parseDarwinPsOutput(
  output,
  { maxBytes = 1024 * 1024, maxProcesses = 8_192 } = {},
) {
  positiveInteger(maxBytes, "macOS ps byte limit")
  positiveInteger(maxProcesses, "macOS ps process limit")
  const text = String(output)
  if (Buffer.byteLength(text) > maxBytes) {
    throw probeError("EPROBE_LIMIT", `macOS ps output exceeded ${maxBytes} bytes`)
  }

  const rows = text
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
  if (rows.length > maxProcesses) {
    throw probeError(
      "EPROBE_LIMIT",
      `macOS ps output exceeded ${maxProcesses} process rows`,
    )
  }

  const processes = rows.map((line) => {
    const match = DARWIN_PS_LINE.exec(line)
    if (!match) {
      throw probeError("EPROBE_PARSE", "macOS ps returned a malformed process row")
    }
    const pid = unsignedInteger(match[1], "macOS ps pid")
    if (pid === 0) throw probeError("EPROBE_PARSE", "macOS ps pid was zero")
    const rssKiB = unsignedInteger(match[4], "macOS ps RSS")
    const rssBytes = rssKiB * 1_024
    if (!Number.isSafeInteger(rssBytes)) {
      throw probeError("EPROBE_PARSE", "macOS ps RSS exceeded the safe integer range")
    }
    const cpuPercent = Number(match[5])
    if (!Number.isFinite(cpuPercent) || cpuPercent < 0) {
      throw probeError("EPROBE_PARSE", "macOS ps CPU percent was not finite")
    }
    return Object.freeze({
      pid,
      parentPid: unsignedInteger(match[2], "macOS ps parent pid"),
      startIdentity: `darwin:${match[3].replace(/\s+/gu, " ")}`,
      rssBytes,
      cpuPercent,
      command: match[6],
    })
  })

  return Object.freeze(processes)
}

export function parseLinuxProcStat(output) {
  const match = /^(\d+) \((.*)\) (\S) (.+)$/u.exec(String(output).trim())
  if (!match) throw probeError("EPROBE_PARSE", "Linux proc stat was malformed")

  const fields = match[4].trim().split(/\s+/u)
  if (fields.length < 21) {
    throw probeError("EPROBE_PARSE", "Linux proc stat omitted required fields")
  }

  const pid = unsignedInteger(match[1], "Linux proc stat pid")
  const parentPid = unsignedInteger(fields[0], "Linux proc stat parent pid")
  const userTicks = unsignedInteger(fields[10], "Linux proc stat user CPU ticks")
  const systemTicks = unsignedInteger(fields[11], "Linux proc stat system CPU ticks")
  const startTimeTicks = unsignedInteger(fields[18], "Linux proc stat start time")
  const rssPages = integer(fields[20], "Linux proc stat RSS pages")
  const totalCpuTicks = userTicks + systemTicks
  if (!Number.isSafeInteger(totalCpuTicks)) {
    throw probeError(
      "EPROBE_PARSE",
      "Linux proc stat total CPU ticks exceeded the safe integer range",
    )
  }

  return Object.freeze({
    pid,
    parentPid,
    command: match[2],
    state: match[3],
    totalCpuTicks,
    startTimeTicks,
    rssPages,
  })
}

export function parseLinuxProcStatus(output) {
  const matches = [...String(output).matchAll(/^VmRSS:\s*(\d+)\s+kB\s*$/gmu)]
  if (matches.length !== 1) {
    throw probeError(
      "EPROBE_PARSE",
      "Linux proc status omitted a valid VmRSS value",
    )
  }
  const rssKiB = unsignedInteger(matches[0][1], "Linux proc status VmRSS")
  const rssBytes = rssKiB * 1_024
  if (!Number.isSafeInteger(rssBytes)) {
    throw probeError("EPROBE_PARSE", "Linux proc status VmRSS exceeded the safe integer range")
  }
  return rssBytes
}

export function createProcessResourceProbe({
  platform,
  now,
  runPs,
  readFile,
  procRoot = "/proc",
  clockTicksPerSecond,
  maxProcesses = 64,
  maxPsBytes = 1024 * 1024,
  maxPsProcesses = 8_192,
  maxProcBytes = 64 * 1_024,
}) {
  requiredFunction(now, "now")
  positiveInteger(maxProcesses, "sample process limit")
  if (platform === "linux") {
    requiredFunction(readFile, "readFile")
    positiveInteger(maxProcBytes, "Linux proc byte limit")
    return createLinuxProbe({
      now,
      readFile,
      procRoot,
      clockTicksPerSecond,
      maxProcesses,
      maxProcBytes,
    })
  }
  if (platform !== "darwin") return unsupportedPlatform(platform)
  requiredFunction(runPs, "runPs")
  positiveInteger(maxPsBytes, "macOS ps byte limit")
  positiveInteger(maxPsProcesses, "macOS ps process limit")

  async function processTable() {
    const output = await runPs({
      command: "/bin/ps",
      args: ["-axo", "pid=,ppid=,lstart=,rss=,%cpu=,comm="],
      maxBuffer: maxPsBytes,
      env: { LC_ALL: "C" },
    })
    return parseDarwinPsOutput(output, {
      maxBytes: maxPsBytes,
      maxProcesses: maxPsProcesses,
    })
  }

  return Object.freeze({
    async identify(pid) {
      const process = findProcess(await processTable(), pid)
      return Object.freeze({ pid: process.pid, startIdentity: process.startIdentity })
    },
    async sample(identity) {
      const timestamp = sampleTimestamp(now)
      const table = await processTable()
      const server = findProcess(table, identity?.pid)
      assertExpectedIdentity(server, identity)
      return processTreeSample(table, server, timestamp, maxProcesses)
    },
  })
}

function createLinuxProbe({
  now,
  readFile,
  procRoot,
  clockTicksPerSecond,
  maxProcesses,
  maxProcBytes,
}) {
  positiveInteger(clockTicksPerSecond, "Linux clock ticks per second")
  const root = String(procRoot).replace(/\/+$/u, "") || "/"

  async function readProc(relativePath) {
    const filePath = `${root}/${relativePath}`
    const value = await readFile(filePath, "utf8")
    const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value)
    if (Buffer.byteLength(text) > maxProcBytes) {
      throw probeError(
        "EPROBE_LIMIT",
        `Linux proc file exceeded ${maxProcBytes} bytes: ${filePath}`,
      )
    }
    return text
  }

  async function readStat(pid) {
    const stat = parseLinuxProcStat(await readProcessFile(pid, "stat"))
    if (stat.pid !== pid) {
      throw probeError(
        "EPROCESS_IDENTITY_CHANGED",
        `Linux proc stat for ${pid} reported pid ${stat.pid}`,
      )
    }
    return stat
  }

  async function readProcessFile(pid, relativePath) {
    try {
      return await readProc(`${pid}/${relativePath}`)
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ESRCH") {
        throw probeError("EPROCESS_NOT_FOUND", `process ${pid} has exited`)
      }
      throw error
    }
  }

  return Object.freeze({
    async identify(pid) {
      const normalizedPid = positiveInteger(pid, "process pid")
      const stat = await readStat(normalizedPid)
      return Object.freeze({
        pid: stat.pid,
        startIdentity: `linux:${stat.startTimeTicks}`,
      })
    },
    async sample(identity) {
      const timestamp = sampleTimestamp(now)
      const uptimeSeconds = parseLinuxProcUptime(await readProc("uptime"))
      const serverPid = positiveInteger(identity?.pid, "process pid")
      const queue = [{ pid: serverPid, expectedParentPid: undefined }]
      const visited = new Set([serverPid])
      const processes = []

      while (queue.length > 0 && processes.length < maxProcesses) {
        const { pid, expectedParentPid } = queue.shift()
        let stat
        let rssBytes
        let childPids
        try {
          stat = await readStat(pid)
          if (stat.state === "Z" || stat.state === "X") {
            throw probeError("EPROCESS_NOT_FOUND", `process ${pid} has exited`)
          }
          rssBytes = parseLinuxProcStatus(await readProcessFile(pid, "status"))
          childPids = parseLinuxProcChildren(
            await readProcessFile(pid, `task/${pid}/children`),
          )
        } catch (error) {
          if (pid !== serverPid && error?.code === "EPROCESS_NOT_FOUND") continue
          throw error
        }
        const process = {
          pid,
          parentPid: stat.parentPid,
          startIdentity: `linux:${stat.startTimeTicks}`,
          rssBytes,
          cpuPercent: lifetimeCpuPercent(stat, uptimeSeconds, clockTicksPerSecond),
        }
        if (expectedParentPid !== undefined && stat.parentPid !== expectedParentPid) {
          throw probeError(
            "EPROCESS_TREE_CHANGED",
            `process ${pid} no longer belonged to parent ${expectedParentPid}`,
          )
        }
        if (pid === serverPid) assertExpectedIdentity(process, identity)
        processes.push(Object.freeze({
          role: pid === serverPid ? "server" : "sidecar",
          ...process,
        }))

        for (const childPid of childPids) {
          if (visited.has(childPid)) continue
          visited.add(childPid)
          queue.push({ pid: childPid, expectedParentPid: pid })
        }
      }

      return Object.freeze({
        timestamp,
        truncated: queue.length > 0,
        processes: Object.freeze(processes),
      })
    },
  })
}

function parseLinuxProcUptime(output) {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s/u.exec(String(output).trim())
  const uptime = Number(match?.[1])
  if (!Number.isFinite(uptime) || uptime < 0) {
    throw probeError("EPROBE_PARSE", "Linux proc uptime was malformed")
  }
  return uptime
}

function parseLinuxProcChildren(output) {
  const text = String(output).trim()
  if (text.length === 0) return Object.freeze([])
  const pids = text.split(/\s+/u).map((value) => positiveInteger(Number(value), "child pid"))
  return Object.freeze([...new Set(pids)].sort((left, right) => left - right))
}

function lifetimeCpuPercent(stat, uptimeSeconds, clockTicksPerSecond) {
  const elapsedTicks = (uptimeSeconds * clockTicksPerSecond) - stat.startTimeTicks
  if (elapsedTicks <= 0) {
    if (stat.totalCpuTicks === 0) return 0
    throw probeError("EPROBE_PARSE", `process ${stat.pid} started after the reported uptime`)
  }
  return (stat.totalCpuTicks / elapsedTicks) * 100
}

function assertExpectedIdentity(process, expected) {
  if (typeof expected?.startIdentity !== "string"
    || process.startIdentity !== expected.startIdentity) {
    throw probeError(
      "EPROCESS_IDENTITY_CHANGED",
      `process ${process.pid} start identity changed`,
    )
  }
}

function sampleTimestamp(now) {
  const timestamp = now()
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw probeError(
      "EPROBE_CLOCK",
      "sample timestamp must be a finite non-negative number",
    )
  }
  return timestamp
}

function unsupportedPlatform(platform) {
  throw probeError("EPROBE_PLATFORM", `unsupported process probe platform: ${platform}`)
}

function findProcess(processes, pid) {
  const normalizedPid = positiveInteger(pid, "process pid")
  const process = processes.find((candidate) => candidate.pid === normalizedPid)
  if (!process) {
    throw probeError("EPROCESS_NOT_FOUND", `process ${normalizedPid} was not found`)
  }
  return process
}

function processTreeSample(table, server, timestamp, maxProcesses) {
  positiveInteger(maxProcesses, "sample process limit")
  const children = new Map()
  for (const process of table) {
    const siblings = children.get(process.parentPid) ?? []
    siblings.push(process)
    children.set(process.parentPid, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.pid - right.pid)
  }

  const queue = [server]
  const visited = new Set([server.pid])
  const processes = []
  while (queue.length > 0 && processes.length < maxProcesses) {
    const process = queue.shift()
    processes.push(Object.freeze({
      role: process.pid === server.pid ? "server" : "sidecar",
      pid: process.pid,
      parentPid: process.parentPid,
      startIdentity: process.startIdentity,
      rssBytes: process.rssBytes,
      cpuPercent: process.cpuPercent,
    }))
    for (const child of children.get(process.pid) ?? []) {
      if (visited.has(child.pid)) continue
      visited.add(child.pid)
      queue.push(child)
    }
  }

  return Object.freeze({
    timestamp,
    truncated: queue.length > 0,
    processes: Object.freeze(processes),
  })
}

function unsignedInteger(value, label) {
  const result = integer(value, label)
  if (result < 0) throw probeError("EPROBE_PARSE", `${label} was negative`)
  return result
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw probeError("EPROBE_CONFIG", `${label} must be a positive safe integer`)
  }
  return value
}

function requiredFunction(value, label) {
  if (typeof value !== "function") {
    throw probeError("EPROBE_CONFIG", `${label} must be a function`)
  }
  return value
}

function integer(value, label) {
  if (!/^-?\d+$/u.test(value)) {
    throw probeError("EPROBE_PARSE", `${label} was not an integer`)
  }
  const result = Number(value)
  if (!Number.isSafeInteger(result)) {
    throw probeError("EPROBE_PARSE", `${label} exceeded the safe integer range`)
  }
  return result
}

function probeError(code, message) {
  return Object.assign(new Error(message), { code })
}
