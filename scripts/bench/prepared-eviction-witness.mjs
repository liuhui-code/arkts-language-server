/** A current native empty-owner witness may originate in startup or a preceding query. */
export function observedEmptyContext(events, timeline, rootUri, pid) {
  let start = timeline.find(event => event.phase === "request-start")?.timestamp
  if (start === undefined) return null
  const initialization = events.find(event => event.event === "semantic.initialization.started"
    && event.rootUri === rootUri && event.pid === pid)
  if (initialization) start = Math.min(start, Date.parse(initialization.ts))
  const index = events.findLastIndex(event => event.event === "semantic.context.evict"
    && event.reason === "memory-level3" && event.residentContextCount === 0 && event.pid === pid
    && Date.parse(event.ts) >= start)
  if (index < 0 || events.slice(index + 1).some(event => event.event === "semantic.context.create"
    || event.event === "semantic.worker.started")) return null
  return events[index]
}
