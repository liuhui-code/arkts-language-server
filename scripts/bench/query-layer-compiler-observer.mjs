const MAX_PROGRAMS = 128
const MAX_SOURCE_RECORDS = 65_536
const MAX_EVENTS = 4_096
const MAX_REGISTRIES = 128
const targetMethods = new Set(["findReferences", "getReferencesAtPosition", "getDefinitionAtPosition", "getImplementationAtPosition",
  "prepareCallHierarchy", "provideCallHierarchyIncomingCalls"])

/** Observe the actual compiler exports; every call still executes the original implementation. */
export function wrapCompilerForObservation(compiler, observer, capture) {
  return new Proxy(compiler, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver)
    if (key === "createDocumentRegistry" && observer) return (...args) => observer.registry(Reflect.apply(value, target, args))
    if (key !== "createLanguageService") return value
    return (...args) => {
      if (capture) capture.calls++
      const startedMs = observer ? performance.now() : 0
      const service = Reflect.apply(value, target, args)
      const completedMs = observer ? performance.now() : 0
      observer?.started({ startedMs, completedMs }, new Error().stack.split("\n").slice(2, 10))
      if (capture) capture.host = args[0]
      const observed = new Proxy(service, { get(serviceTarget, method, serviceReceiver) {
        const member = Reflect.get(serviceTarget, method, serviceReceiver)
        if (method === "dispose" && observer) return (...disposeArgs) => {
          const startedMs = performance.now()
          const result = Reflect.apply(member, serviceTarget, disposeArgs)
          const completedMs = performance.now()
          observer.disposed({ startedMs, completedMs }, new Error().stack.split("\n").slice(2, 10))
          return result
        }
        if (method === "getProgram" && observer) return (...queryArgs) => {
          const startedMs = performance.now()
          const program = Reflect.apply(member, serviceTarget, queryArgs)
          observer.observe(program, { startedMs, completedMs: performance.now() })
          return program
        }
        if (!targetMethods.has(method)) return member
        return (...queryArgs) => {
          if (capture) capture.targetQueryCalls++
          if (!observer) return Reflect.apply(member, serviceTarget, queryArgs)
          const startedMs = performance.now()
          let terminalStatus = "threw", returnedArrayLength = null
          try {
            const result = Reflect.apply(member, serviceTarget, queryArgs)
            terminalStatus = "returned"
            if (Array.isArray(result)) returnedArrayLength = result.length
            return result
          } finally {
            observer.targetCall(method, { startedMs, completedMs: performance.now() }, { terminalStatus, returnedArrayLength })
          }
        }
      } })
      if (capture) capture.service = observed
      return observed
    }
  } })
}

/** Identities of actual public returns; WeakMaps never keep Programs or ASTs alive. */
export function observeCompilerObjects({ checkpoint } = {}) {
  const programIds = new WeakMap()
  const sourceIds = new WeakMap()
  const programs = []
  const events = []
  const calls = []
  const registries = []
  const lifecycleEvents = []
  let successfulServiceDisposals = 0
  let serviceStarts = 0
  let sourceCount = 0
  let sourceRecords = 0
  let phase = "setup"
  let scenarioId
  let failure = null
  return {
    mark(nextPhase, details) {
      if (nextPhase === "worker-lifetime-start") phase = "worker-lifetime"
      else if (nextPhase === "preparation-start") phase = "preparation"
      else if (nextPhase === "query-start") { phase = "query"; scenarioId = details.scenarioId }
      else if (["preparation-complete", "query-complete", "query-failed"].includes(nextPhase)) {
        phase = "outside-request"
        scenarioId = undefined
      }
    },
    observe(program, timing) {
      if (failure) return
      if (events.length >= MAX_EVENTS) { failure = "QUERY_LAYER_COMPILER_EVENT_CAPACITY"; return }
      let programId = program ? programIds.get(program) : null
      if (program && programId === undefined) {
        const sources = program.getSourceFiles()
        if (programs.length >= MAX_PROGRAMS || sourceRecords + sources.length > MAX_SOURCE_RECORDS) {
          failure = "QUERY_LAYER_COMPILER_OBJECT_CAPACITY"
          return
        }
        programId = programs.length + 1
        programIds.set(program, programId)
        const records = sources.map(source => {
          let id = sourceIds.get(source)
          if (id === undefined) { id = ++sourceCount; sourceIds.set(source, id) }
          return { id, file: source.fileName }
        })
        sourceRecords += records.length
        programs.push({ id: programId, sources: records })
      }
      events.push({ phase, ...(scenarioId ? { scenarioId } : {}), programId, timestamp: Date.now(),
        ...timing, elapsedMs: timing.completedMs - timing.startedMs })
    },
    targetCall(method, timing, outcome) {
      if (failure) return
      if (calls.length >= MAX_EVENTS) { failure = "QUERY_LAYER_COMPILER_CALL_CAPACITY"; return }
      calls.push({ phase, ...(scenarioId ? { scenarioId } : {}), method, ...outcome,
        ...timing, elapsedMs: timing.completedMs - timing.startedMs })
    },
    registry(registry) {
      if (registries.length >= MAX_REGISTRIES) {
        failure ??= "QUERY_LAYER_COMPILER_REGISTRY_CAPACITY"
        return registry
      }
      const record = { id: registries.length + 1, acquired: 0, updated: 0, released: 0,
        observedOutstandingLeases: 0, peakOutstandingLeases: 0, unmatchedReleases: 0,
        untrackedUpdates: 0 }
      const leases = new Map()
      const knownPaths = new Map()
      registries.push({ record, knownPaths, reference: new WeakRef(registry) })
      return new Proxy(registry, { get(target, method, receiver) {
        const member = Reflect.get(target, method, receiver)
        if (!["acquireDocumentWithKey", "updateDocumentWithKey", "releaseDocumentWithKey",
          "acquireDocument", "updateDocument", "releaseDocument"].includes(method)) return member
        return (...args) => {
          const result = Reflect.apply(member, target, args)
          // Match only public bucket/path arguments; this is not a script-kind ownership census.
          if (!String(method).endsWith("WithKey")) {
            failure ??= "QUERY_LAYER_COMPILER_REGISTRY_UNKEYED_OPERATION"
            return result
          }
          const releasing = method === "releaseDocumentWithKey"
          if (!releasing) {
            const pathKey = JSON.stringify([args[1], args[6]])
            if (!knownPaths.has(pathKey) && knownPaths.size >= MAX_SOURCE_RECORDS) {
              failure ??= "QUERY_LAYER_COMPILER_REGISTRY_PATH_CAPACITY"
              return result
            }
            knownPaths.set(pathKey, [args[1], args[6]])
          }
          const key = JSON.stringify(releasing ? [args[1], args[0]] : [args[3], args[1]])
          const held = leases.get(key) ?? 0
          if (releasing) {
            record.released++
            if (held === 0) {
              record.unmatchedReleases++
              failure ??= "QUERY_LAYER_COMPILER_REGISTRY_UNMATCHED_RELEASE"
            } else {
              if (held === 1) leases.delete(key)
              else leases.set(key, held - 1)
              record.observedOutstandingLeases--
            }
          } else if (method === "updateDocumentWithKey") {
            record.updated++
            if (held === 0) {
              record.untrackedUpdates++
              failure ??= "QUERY_LAYER_COMPILER_REGISTRY_UNTRACKED_UPDATE"
            }
          } else {
            record.acquired++
            if (held === 0 && leases.size >= MAX_SOURCE_RECORDS) {
              failure ??= "QUERY_LAYER_COMPILER_REGISTRY_LEASE_CAPACITY"
              return result
            }
            leases.set(key, held + 1)
            record.observedOutstandingLeases++
            record.peakOutstandingLeases = Math.max(record.peakOutstandingLeases, record.observedOutstandingLeases)
          }
          return result
        }
      } })
    },
    started(timing, caller) {
      serviceStarts++
      recordLifecycle("createLanguageService", timing, caller)
    },
    disposed(timing, caller) {
      successfulServiceDisposals++
      recordLifecycle("dispose", timing, caller)
      checkpoint?.("service-disposed")
    },
    snapshot() {
      const registryReports = registries.map(({ record, knownPaths, reference }) => {
        let outstandingLeases = null
        try {
          const registry = reference.deref()
          if (!registry || typeof registry.getLanguageServiceRefCounts !== "function") {
            throw new Error("pinned fork reference statistics unavailable")
          }
          outstandingLeases = 0
          for (const [file, kind] of knownPaths.values()) {
            const stats = registry.getLanguageServiceRefCounts(file, kind)
            if (!Array.isArray(stats)) throw new Error("invalid registry statistics")
            for (const entry of stats) {
              if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string"
                || entry[1] !== undefined && (!Number.isSafeInteger(entry[1]) || entry[1] < 0)) {
                throw new Error("invalid registry lease")
              }
              outstandingLeases += entry[1] ?? 0
            }
          }
          if (outstandingLeases !== record.observedOutstandingLeases) {
            failure ??= "QUERY_LAYER_COMPILER_REGISTRY_STATS_MISMATCH"
          }
        } catch {
          failure ??= "QUERY_LAYER_COMPILER_REGISTRY_STATS_UNAVAILABLE"
        }
        return { ...record, outstandingLeases, leaseKeyScope: "public-base-bucket-and-path",
          observedPathKinds: knownPaths.size,
          outstandingLeaseSource: "pinned-fork-refcounts-for-observed-public-path-kind" }
      })
      return { boundary: "OFFICIAL_LANGUAGE_SERVICE_PUBLIC_OBJECTS", normalTimingEvidence: false,
        complete: failure === null, failure, programs, events, calls, lifecycleEvents,
        registries: registryReports, serviceStarts, successfulServiceDisposals,
        limits: { programs: MAX_PROGRAMS, sourceRecords: MAX_SOURCE_RECORDS, events: MAX_EVENTS, calls: MAX_EVENTS,
          registries: MAX_REGISTRIES, registryLeaseKeys: MAX_SOURCE_RECORDS } }
    },
  }

  function recordLifecycle(method, timing, caller) {
    if (lifecycleEvents.length >= MAX_EVENTS) { failure ??= "QUERY_LAYER_COMPILER_LIFECYCLE_CAPACITY"; return }
    lifecycleEvents.push({ phase, ...(scenarioId ? { scenarioId } : {}), method, terminalStatus: "returned", caller,
      ...timing, elapsedMs: timing.completedMs - timing.startedMs })
  }
}
