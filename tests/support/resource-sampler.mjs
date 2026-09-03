export function createResourceSampler({ pids, probe, clock, intervalMs }) {
  const explicitPids = [...new Set(pids)].sort((left, right) => left - right)
  const samples = []
  let state = "idle"
  let inFlight = null
  let initialSample
  let timer
  let stopPromise

  function collect() {
    if (state !== "running") return Promise.resolve()
    if (inFlight) return inFlight

    const timestamp = clock.now()
    inFlight = Promise.resolve()
      .then(() => probe([...explicitPids]))
      .then((processes) => {
        samples.push({
          timestamp,
          processes: processes
            .map(({ pid, rssBytes, cpuPercent }) => ({ pid, rssBytes, cpuPercent }))
            .sort((left, right) => left.pid - right.pid),
        })
      })
      .catch((error) => {
        samples.push({ timestamp, error: controlledError(error) })
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return {
    start() {
      if (state === "idle") {
        state = "running"
        timer = clock.setInterval(collect, intervalMs)
        initialSample = collect()
      }
      return initialSample
    },
    stop() {
      if (stopPromise) return stopPromise

      if (state === "running") {
        state = "stopped"
        clock.clearInterval(timer)
        stopPromise = Promise.resolve(inFlight).then(() => undefined)
      } else {
        state = "stopped"
        stopPromise = Promise.resolve()
      }
      return stopPromise
    },
    snapshot() {
      return samples.map((sample) => (
        sample.processes
          ? {
              timestamp: sample.timestamp,
              processes: sample.processes.map((process) => ({ ...process })),
            }
          : { timestamp: sample.timestamp, error: { ...sample.error } }
      ))
    },
  }
}

function controlledError(error) {
  const summary = {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : String(error),
  }
  if (["number", "string"].includes(typeof error?.code)) summary.code = error.code
  return summary
}
