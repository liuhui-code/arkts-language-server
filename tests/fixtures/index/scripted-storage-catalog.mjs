export function storageCatalog(status, progress, generation, complete) {
  const stages = [
    ["writing", 1, 0, 1],
    ["committing", 1, 0, 2],
    ["checkpointing", 1, 0, 3],
    ["checkpointing", 1, 2_000, 3],
    ["validating", 1, 0, 4],
    ["publishing", 1, 0, 5],
  ]
  let position = 0
  const timer = setInterval(() => {
    const stage = stages[position++]
    if (!stage) {
      clearInterval(timer)
      complete()
      progress({ ...status("ready", "ready", "ready", null),
        committedGeneration: generation, discovered: 1, indexed: 1, totalFiles: 1 })
      return
    }
    const [name, writtenDocuments, stageElapsedMs, activitySequence] = stage
    progress({ ...status("activating", "warming", "stale", generation),
      discovered: 1, indexed: 1, totalFiles: 1,
      storage: { stage: name, writtenDocuments, writtenRows: 2, stageElapsedMs,
        activitySequence, walFrames: 0, checkpointedFrames: 0 },
    })
  }, 40)
  return timer
}
