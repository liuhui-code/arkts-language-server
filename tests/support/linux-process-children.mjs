/** Optional CONFIG_PROC_CHILDREN fallback. Never turn denied visibility into an empty tree.
 * One bounded PID/PPID scan per sample; like live children reads, not an atomic snapshot.
 * Revalidate each scanned child birth identity and parent when its RSS is sampled.
 */
export function linuxProcessChildren({ readProc, readStat, readDirectory, root, maxProcesses,
  parseChildren, isExited, error }) {
  let table
  async function scan() {
    if (typeof readDirectory !== "function") throw error("EPROBE_PLATFORM", "Linux proc children unavailable without directory enumeration")
    assertVisibleProc(await readProc("self/mountinfo"), root, error)
    const entries = (await readDirectory(root)).filter(name => /^[1-9]\d*$/u.test(name))
    if (entries.length > maxProcesses) throw error("EPROBE_LIMIT", `Linux proc table exceeded ${maxProcesses} processes`)
    const rows = []
    for (const name of entries) {
      try { rows.push(await readStat(Number(name))) }
      catch (failure) {
        if (failure?.code !== "EPROCESS_NOT_FOUND") throw failure
      }
    }
    return rows
  }
  return async parent => {
    try {
      return parseChildren(await readProc(`${parent.pid}/task/${parent.pid}/children`))
        .map(pid => ({ pid }))
    } catch (failure) {
      if (failure?.code !== "ENOENT") throw failure
      const current = await readStat(parent.pid)
      if (current.startTimeTicks !== parent.startTimeTicks) throw error("EPROCESS_IDENTITY_CHANGED", `process ${parent.pid} start identity changed`)
      if (isExited(current)) throw error("EPROCESS_NOT_FOUND", `process ${parent.pid} has exited`)
      table ??= await scan()
      return table.filter(row => row.parentPid === parent.pid && !isExited(row))
        .sort((a, b) => a.pid - b.pid)
        .map(row => ({ pid: row.pid, expectedStartTimeTicks: row.startTimeTicks }))
    }
  }
}

function assertVisibleProc(mountinfo, root, error) {
  let found = false
  const unavailable = () => error("EPROBE_PLATFORM", "Linux proc directory visibility is not unrestricted")
  const decode = value => value.replace(/\\([0-7]{3})/gu, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
  for (const line of mountinfo.trim().split("\n")) {
    const fields = line.split(" ")
    const separator = fields.indexOf("-")
    if (separator < 6 || fields.length < separator + 4) throw unavailable()
    const mountpoint = decode(fields[4])
    if (mountpoint.startsWith(`${root}/`) && /^[1-9]\d*(?:\/|$)/u.test(mountpoint.slice(root.length + 1))) throw unavailable()
    if (mountpoint !== root) continue
    found = true
    if (decode(fields[3]) !== "/" || fields[separator + 1] !== "proc") throw unavailable()
    const options = `${fields[5]},${fields[separator + 3]}`.split(",")
    if (options.some(option => option.startsWith("hidepid=") && !["hidepid=0", "hidepid=off"].includes(option))) throw unavailable()
  }
  if (!found) throw unavailable()
}
