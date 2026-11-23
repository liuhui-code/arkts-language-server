const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR), root = path.join(directory, "workspace")
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  const physicalRoot = fs.realpathSync.native(root)
  let influenceBuilds = 0, cumulativeGraphRebuilds = 0, graphRebuilds = 0, graphTraversals = 0, leafStats = 0, leafStatsByPhase = {}, count = 0, sourceReads = 0, firstRead, firstResolution, callers = {}, statCallers = {}
  const isNoise = file => typeof file === "string" && (file.startsWith(root + path.sep)
    || file.startsWith(physicalRoot + path.sep)) && /Unused\d+\.ts$/.test(file)
  let membershipEnumerations = 0, roleTokenLookups = 0
  let identityFormats = 0, identityParses = 0, stampArrayComparisons = 0, groupNormalizations = 0, groupDiscoveries = 0, groupDepth = 0, roleCatalogChanges = 0, roleParses = 0, overlayValidationLookups = 0, overlayValidationDepth = 0
  const isIdentity = value => Array.isArray(value) && value.length === 6 && isNoise(value[0])
    && Array.isArray(value[1]) && value[3] === null && Array.isArray(value[4])
  const every = Array.prototype.every
  Array.prototype.every = function(callback, ...args) {
    if (this.length === 6 && typeof this[0] === "number" && typeof this[5] === "number"
      && new Error().stack.includes("configurationSourceIdentity")) stampArrayComparisons++
    return Reflect.apply(every, this, [callback, ...args])
  }
  const stringify = JSON.stringify, parse = JSON.parse
  JSON.stringify = function(value, ...args) {
    if (isIdentity(value)) identityFormats++
    return Reflect.apply(stringify, this, [value, ...args])
  }
  JSON.parse = function(...args) {
    const value = Reflect.apply(parse, this, args)
    if (isIdentity(value)) identityParses++
    return value
  }
  const lstat = fs.lstatSync
  fs.lstatSync = function(file, ...args) { if (isNoise(file)) { leafStats++; const phase = globalThis.__scopeLeafPhase?.() ?? "outside"; leafStatsByPhase[phase] = (leafStatsByPhase[phase] ?? 0) + 1; if (process.env.ARKTS_TEST_DIRECTORY_LSTAT_STACKS === "1") { const key = new Error().stack.split("\n").slice(2, 7).map(line => line.replace(/ \(.*/, "")).join(" / "); statCallers[key] = (statCallers[key] ?? 0) + 1 } } return Reflect.apply(lstat, this, [file, ...args]) }
  const open = fs.openSync
  fs.openSync = function(file, ...args) {
    if (isNoise(file)) { sourceReads++; firstRead ??= new Error().stack }
    return Reflect.apply(open, this, [file, ...args])
  }
  const native = fs.realpathSync.native
  fs.realpathSync.native = function(file, ...args) {
    if (typeof file === "string" && (file.startsWith(root + path.sep) || file.startsWith(physicalRoot + path.sep)) && /Unused\d+\.ts$/.test(file)) { count++; const stack = new Error().stack; firstResolution ??= stack; const caller = stack.split("\n").slice(2, 5).map(line => line.replace(/ \(.*/, "")).join(" / "); callers[caller] = (callers[caller] ?? 0) + 1 }
    return Reflect.apply(native, this, [file, ...args])
  }
  globalThis.__scopeFactsGateLog = row => fs.appendFileSync(path.join(directory, "facts-gates.jsonl"), JSON.stringify(row) + "\n")
  globalThis.__scopeNamespaceEnumeration = scanRoot => { if (scanRoot === root || scanRoot === physicalRoot) membershipEnumerations++ }
  globalThis.__scopeRoleToken = file => { if (isNoise(file) && new Error().stack.includes("ProjectOperationScopes.ensure")) roleTokenLookups++ }
  globalThis.__scopeOverlayLookup = file => { if (overlayValidationDepth && isNoise(file)) overlayValidationLookups++ }
  globalThis.__scopeOverlayValidation = run => { overlayValidationDepth++; try { return run() } finally { overlayValidationDepth-- } }
  let finalFactOwners = new WeakMap(), duplicateFinalConfigurationComparisons = 0
  globalThis.__scopeConfigurationFactCompare = (owner, file, kind) => {
    if (globalThis.__scopeLeafPhase?.() !== "final" || !isNoise(file)) return
    const key = kind + ":" + file, stamp = owner.resetEpoch + ":" + owner.revision
    const seen = finalFactOwners.get(owner) ?? new Map()
    if (seen.get(key) === stamp) duplicateFinalConfigurationComparisons++
    seen.set(key, stamp); finalFactOwners.set(owner, seen)
  }
  let membershipRawPassesByPhase = {}
  globalThis.__scopeMembershipRawPass = () => {
    const phase = globalThis.__scopeLeafPhase?.() ?? "outside"
    membershipRawPassesByPhase[phase] = (membershipRawPassesByPhase[phase] ?? 0) + 1
  }
  const roleCatalogs = new WeakMap()
  globalThis.__scopeRoleParsed = file => { if (isNoise(file)) roleParses++ }
  globalThis.__scopeRoleCatalog = (graph, roles) => {
    if (roleCatalogs.has(graph) && roleCatalogs.get(graph) !== roles) roleCatalogChanges++
    roleCatalogs.set(graph, roles)
  }
  globalThis.__scopeGroupNormalize = file => { if (groupDepth && isNoise(file)) groupNormalizations++ }
  globalThis.__scopeGroupDiscovery = run => { groupDiscoveries++; groupDepth++; try { return run() } finally { groupDepth-- } }
  globalThis.__scopeGraphRebuild = () => { graphRebuilds++; cumulativeGraphRebuilds++ }
  globalThis.__scopeInfluenceBuild = () => { influenceBuilds++ }
  globalThis.__scopeGraphTraversal = () => { graphTraversals++ }
  globalThis.__directoryResolutionCount = async (request, run) => {
    membershipEnumerations = 0; roleTokenLookups = 0; finalFactOwners = new WeakMap(); duplicateFinalConfigurationComparisons = 0; membershipRawPassesByPhase = {}; identityFormats = 0; identityParses = 0; stampArrayComparisons = 0; groupNormalizations = 0; groupDiscoveries = 0; roleCatalogChanges = 0; roleParses = 0; overlayValidationLookups = 0; influenceBuilds = 0; graphRebuilds = 0; graphTraversals = 0; leafStats = 0; leafStatsByPhase = {}; count = 0; sourceReads = 0; firstRead = undefined; firstResolution = undefined; callers = {}; statCallers = {}
    try { return await run() }
    finally { fs.appendFileSync(path.join(directory, "directory-resolution-count.jsonl"),
      JSON.stringify({ method: request.method, id: request.id, membershipEnumerations, roleTokenLookups, identityFormats, identityParses, stampArrayComparisons, groupNormalizations, groupDiscoveries, roleCatalogChanges, roleParses, overlayValidationLookups, graphRebuilds, cumulativeGraphRebuilds, influenceBuilds, graphTraversals, count, sourceReads, leafStats, leafStatsByPhase, duplicateFinalConfigurationComparisons, membershipRawPassesByPhase, firstRead, firstResolution, callers, statCallers }) + "\n") }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const signature = "async function answerRequest(request) {"
      if (source.split(signature).length !== 2) throw Error("unique request observation required")
      source = source.replace(signature, "async function answerRequest(request) { return globalThis.__directoryResolutionCount(request, () => observedDirectoryRequest(request)) } async function observedDirectoryRequest(request) {")
      const membershipMarker = /validateRequestInput\(owner, 0, current\d*\.revision, \(\) => \{/g
      if ([...source.matchAll(membershipMarker)].length !== 1) throw Error("unique membership callback required")
      source = source.replace(membershipMarker, marker => marker + " globalThis.__scopeMembershipRawPass();")
      for (const [name, kind] of [["identities", 0], ["pathIdentities", 1]]) {
        const marker = `for (const [filePath, identity] of ${name}) {`
        if (source.split(marker).length !== 2) throw Error("unique configuration fact loop required")
        source = source.replace(marker, marker + ` globalThis.__scopeConfigurationFactCompare(this, filePath, ${kind});`)
      }
      if (!source.includes("function* listWorkspaceSourcePaths(")) throw Error("actual namespace generator required")
      source += `\n{
        if (process.env.ARKTS_TEST_FACTS_GATE === '1') {
          const ensure = ProjectOperationScopes.prototype.ensure;
          ProjectOperationScopes.prototype.ensure = function(workspace, ...args) {
            const state = this.factsState, catalog = workspace[WORKSPACE_MEMBERSHIP_ORIGIN]?.catalog ?? workspace.projectMembership;
            const row = { before: !!state, reset: workspace.resetTypeEngine,
              oldReset: state?.resetEpoch, resetEpoch: workspace.typeEngineResetEpoch,
              oldRevision: state?.contentRevision, revision: workspace.contentRevision,
              oldCatalogRevision: state?.catalog.revision, catalogRevision: catalog?.revision,
              sameCatalog: state?.catalog === catalog, sameRoot: state?.canonicalRootId === workspace.canonicalRootId,
              aliasesSame: state?.aliases === JSON.stringify([...(workspace.overlayPaths ?? [])].filter(([file, alias]) => file !== alias)),
              oldAliases: state?.aliases, aliases: [...(workspace.overlayPaths ?? [])].filter(([file, alias]) => file !== alias),
              pathsSame: state?.paths.length === workspace.projectMembership?.paths.length && state?.paths.every((file, i) => workspace.projectMembership.paths[i] === file),
              sameOverlays: this.overlayState?.current(), rolesDirty: this.rolesDirty,
              overlayDelta: this.overlayState && typeof changedOverlayPaths === 'function' ? changedOverlayPaths(this.overlayState, this.access.overlayState()) : undefined };
            try { return Reflect.apply(ensure, this, [workspace, ...args]) }
            finally { row.after = !!this.factsState; row.oldGeneration = state?.generation; row.generation = this.resolutionGeneration;
              globalThis.__scopeFactsGateLog(row) }
          }
        }
        const enumerate = listWorkspaceSourcePaths;
        listWorkspaceSourcePaths = function*(...args) { globalThis.__scopeNamespaceEnumeration(args[0]); yield* Reflect.apply(enumerate, this, args) };
        globalThis.__scopeLeafPhase = () => finalizing ? "final" : active ? "query" : preparation ? "prepare" : "outside";
        if (process.env.ARKTS_TEST_UNOWNED_OVERLAY_STATE === '1') {
          const state = SemanticDocumentStore.prototype.overlayState, clones = new WeakMap();
          SemanticDocumentStore.prototype.overlayState = function(...args) {
            const actual = Reflect.apply(state, this, args);
            if (!clones.has(actual)) clones.set(actual, Object.freeze({ ...actual }));
            return clones.get(actual)
          }
        }
        if (process.env.ARKTS_TEST_UNOWNED_MEMBERSHIP === '1') {
          const membershipFor = SemanticDocumentStore.prototype.membershipFor, clones = new WeakMap();
          SemanticDocumentStore.prototype.membershipFor = function(...args) {
            const snapshot = Reflect.apply(membershipFor, this, args);
            if (!clones.has(snapshot)) clones.set(snapshot, Object.freeze({ ...snapshot, paths: Object.freeze([...snapshot.paths]) }));
            return clones.get(snapshot)
          }
        }
        const tokenFor = SemanticDocumentStore.prototype.tokenFor;
        SemanticDocumentStore.prototype.tokenFor = function(root, revision, file, ...args) {
          globalThis.__scopeRoleToken(file);
          return Reflect.apply(tokenFor, this, [root, revision, file, ...args])
        };
        const overlayFor = SemanticDocumentStore.prototype.overlayFor;
        SemanticDocumentStore.prototype.overlayFor = function(file, ...args) { globalThis.__scopeOverlayLookup(file); return Reflect.apply(overlayFor, this, [file, ...args]) };
        const overlaysCurrent = ProjectOperationScopes.prototype.overlaysCurrent;
        ProjectOperationScopes.prototype.overlaysCurrent = function(...args) { return globalThis.__scopeOverlayValidation(() => Reflect.apply(overlaysCurrent, this, args)) };
        const parseRole = projectSourceRole;
        projectSourceRole = function(file, ...args) { globalThis.__scopeRoleParsed(file); return Reflect.apply(parseRole, this, [file, ...args]) };
        const discover = SemanticGroups.prototype.discover;
        SemanticGroups.prototype.discover = function(...args) { return globalThis.__scopeGroupDiscovery(() => Reflect.apply(discover, this, args)) };
        const identity = resolvedPathIdentity;
        resolvedPathIdentity = function(file) { globalThis.__scopeGroupNormalize(file); return identity(file) };
        const update = ScopeDependencyGraph.prototype.update;
        ScopeDependencyGraph.prototype.update = function(workspace, roles, ...args) { globalThis.__scopeRoleCatalog(this, roles); return Reflect.apply(update, this, [workspace, roles, ...args]) };
        const effects = ScopeDependencyGraph.prototype.effects;
        ScopeDependencyGraph.prototype.effects = function(...args) { globalThis.__scopeInfluenceBuild(); return Reflect.apply(effects, this, args) };
        const begin = ScopeModuleBindings.prototype.begin;
        ScopeModuleBindings.prototype.begin = function(...args) { globalThis.__scopeGraphRebuild(); return Reflect.apply(begin, this, args) };
        const current = ScopeDependencyGraph.prototype.currentNodes;
        ScopeDependencyGraph.prototype.currentNodes = function(...args) {
          const nodes = this.nodes, original = Object.getOwnPropertyDescriptor(nodes, "values"), values = nodes.values;
          nodes.values = function(...inner) { globalThis.__scopeGraphTraversal(); return Reflect.apply(values, this, inner) };
          try { return Reflect.apply(current, this, args) }
          finally { if (original) Object.defineProperty(nodes, "values", original); else delete nodes.values }
        };
      }\n`
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
