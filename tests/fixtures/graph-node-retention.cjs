const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const threads = require("node:worker_threads")
if (process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private node fixture required")
  const signals = process.env.ARKTS_LSP_LOG_DIR
  const arm = path.join(signals, "arm-node-catalog.json"), compile = Module.prototype._compile
  if (threads.isMainThread) {
    Module.prototype._compile = function(source, file) {
      if (path.basename(file) === "server.cjs") {
        const marker = /const winner = cancelSemanticWorkerRequest\((record\d*)\.cancelCell, (reason\d*)\);/g
        if ([...source.matchAll(marker)].length !== 1) throw Error("unique contextual node cancellation required")
        source = source.replace(marker, (text, record, reason) => text + `if(require('node:fs').existsSync(${JSON.stringify(arm)})){const fs=require('node:fs'),file=require('node:path').join(${JSON.stringify(signals)},'node-cancel-'+${record}.wire?.id+'-'+${reason}+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify({workerRequestId:${record}.wire?.id,method:${record}.input.method,requested:${reason},winner,stateGeneration:${record}.stateGeneration}));fs.renameSync(file+'.tmp',file)}`)
      }
      return Reflect.apply(compile, this, [source, file])
    }
  } else {
    let replacements = new Set(), resolutions = [], roleDirectoryInputs = [], ownerRetentionVisits = 0, topologyScans = 0, inputInfluenceBuilds = 0, updateDepth = 0, method, requestId, graphStates = [], aliasTransitions = [], factPasses = [], factDecisions = [], enumerations = []
    const graphIds = new WeakMap(); let graphSerial = 0
    const graphId = graph => { if (!graphIds.has(graph)) graphIds.set(graph, ++graphSerial); return graphIds.get(graph) }
    const noise = file => typeof file === "string" && /[/\\]Unused\d+\.ts$/.test(file)
    globalThis.__nodeRetentionChanged = file => { if (noise(file)) replacements.add(path.basename(file)) }
    globalThis.__nodeRetentionResolved = (name, file) => { if (noise(file)) resolutions.push([path.basename(file), name]) }
    globalThis.__nodeRetentionTopologyScan = () => { topologyScans++ }
    globalThis.__nodeRetentionInfluence = () => { if (updateDepth) inputInfluenceBuilds++ }
    globalThis.__nodeRetentionDepth = delta => { updateDepth += delta }
    globalThis.__nodeRetentionAliases = row => aliasTransitions.push(row)
    globalThis.__nodeRetentionState = graph => graphStates.push({ graphId: graphId(graph),
      rebuilding: graph.rebuilding, topologyDirty: graph.topologyDirty, topologyVersion: graph.revision,
      inputVersion: graph.inputRevision, nodes: graph.nodes.size, bindingOwners: graph.bindings.entries.size,
      liveBindingOwners: graph.bindings.references?.size ?? null,
      bindingReferences: graph.bindings.references ? [...graph.bindings.references.values()].reduce((n, count) => n + count, 0) : null,
      sourceReferences: graph.bindings.boundaries.references ? [...graph.bindings.boundaries.references.values()].reduce((n, count) => n + count, 0) : null,
      draftOwners: graph.bindings.pending?.size ?? null })
    const driveIdentity = file => file.replace(/^[a-z]:/i, drive => drive.toLowerCase())
    globalThis.__nodeRetentionCommitted = (file, graph) => {
      const paused = path.join(signals, "node-catalog-paused")
      if (method !== "typeDefinitions" || !fs.existsSync(arm) || fs.existsSync(paused)
        || driveIdentity(file) !== driveIdentity(JSON.parse(fs.readFileSync(arm, "utf8")).file)) return
      fs.writeFileSync(paused + ".tmp", JSON.stringify({ workerRequestId: requestId, pid: process.pid,
        threadId: threads.threadId, graphId: graphId(graph), file, stage: "actual node replacement committed before topology publication" }))
      fs.renameSync(paused + ".tmp", paused)
      const cell = new Int32Array(new SharedArrayBuffer(4)), until = Date.now() + 5000
      while (!fs.existsSync(path.join(signals, "resume-node-catalog"))) {
        if (Date.now() > until) throw Error("controlled node cancellation not acknowledged")
        Atomics.wait(cell, 0, 0, 5)
      }
    }
    globalThis.__nodeRetentionRoleDirectory = count => roleDirectoryInputs.push(count)
    globalThis.__nodeRetentionRetain = () => ownerRetentionVisits++
    globalThis.__nodeRetentionEnumeration = root => enumerations.push(root)
    globalThis.__nodeRetentionFacts = (workspace, paths) => factPasses.push({
      inputRevision: workspace.contentRevision, files: paths ? [...paths] : null,
      membershipFiles: workspace.projectMembership?.paths.length ?? null })
    globalThis.__nodeRetentionFactDecision = (scope, workspace) => {
      const state = scope.factsState
      factDecisions.push({ state: !!state, sameOverlay: scope.overlayState?.current() === true,
        sameCatalog: state?.catalog === scope.access.membershipFor(scope.root),
        sameGeneration: state?.generation === scope.generation(), rolesDirty: scope.rolesDirty,
        previousRevision: state?.contentRevision, currentRevision: workspace.contentRevision,
        overlayCount: workspace.documents.filter(document => document.overlay).length })
    }
    globalThis.__nodeRetentionMembershipPause = () => {
      const paused = path.join(signals, "membership-catalog-paused")
      if (method !== "diagnose" || !fs.existsSync(arm) || fs.existsSync(paused)
        || JSON.parse(fs.readFileSync(arm, "utf8")).stage !== "before-membership") return
      fs.writeFileSync(paused, JSON.stringify({ workerRequestId: requestId, method }))
      const cell = new Int32Array(new SharedArrayBuffer(4)), until = Date.now() + 5000
      while (!fs.existsSync(path.join(signals, "resume-membership-catalog"))) {
        if (Date.now() > until) throw Error("controlled membership observation not resumed")
        Atomics.wait(cell, 0, 0, 5)
      }
    }
    globalThis.__nodeRetentionRequest = async (request, run) => {
      replacements = new Set(); resolutions = []; roleDirectoryInputs = []; ownerRetentionVisits = 0; topologyScans = 0; inputInfluenceBuilds = 0; method = request.method; requestId = request.id; graphStates = []; aliasTransitions = []; factPasses = []; factDecisions = []; enumerations = []
      try { return await run() }
      finally { fs.appendFileSync(path.join(directory, "graph-node-retention.jsonl"), JSON.stringify({
        id: request.id, method: request.method, replacements: [...replacements].sort(), resolutions,
        topologyScans, inputInfluenceBuilds, roleDirectoryInputs, ownerRetentionVisits, graphStates, aliasTransitions, factPasses, factDecisions, enumerations }) + "\n"); method = undefined }
    }
    Module.prototype._compile = function(source, file) {
      if (path.basename(file) === "semantic-worker.cjs") {
        const signature = "async function answerRequest(request) {"
        if (source.split(signature).length !== 2) throw Error("unique node request boundary required")
        source = source.replace(signature, "async function answerRequest(request) {return globalThis.__nodeRetentionRequest(request,()=>nodeRetentionRequest(request))} async function nodeRetentionRequest(request) {")
        const projection = "const authoritative = new Map([...roles].map"
        if (source.split(projection).length !== 2) throw Error("unique role directory build required")
        source = source.replace(projection, "globalThis.__nodeRetentionRoleDirectory(roles.size); " + projection)
        source += `\n{
          const enumerate=listWorkspaceSourcePaths;
          listWorkspaceSourcePaths=function*(...args){globalThis.__nodeRetentionEnumeration(args[0]);yield* Reflect.apply(enumerate,this,args)};
          const member=ProjectOperationScopes.prototype.sameMembership;
          ProjectOperationScopes.prototype.sameMembership=function(...args){globalThis.__nodeRetentionMembershipPause();return Reflect.apply(member,this,args)};
          const ensure=ProjectOperationScopes.prototype.ensure;
          ProjectOperationScopes.prototype.ensure=function(workspace,...args){globalThis.__nodeRetentionFactDecision(this,workspace);return Reflect.apply(ensure,this,[workspace,...args])};
          const facts=ProjectOperationScopes.prototype.updateFacts;
          ProjectOperationScopes.prototype.updateFacts=function(workspace,membership,paths){globalThis.__nodeRetentionFacts(workspace,paths);return Reflect.apply(facts,this,[workspace,membership,paths])};
          const update=ScopeDependencyGraph.prototype.update;
          ScopeDependencyGraph.prototype.update=function(...args){
            if(process.env.ARKTS_TEST_LOSE_PENDING_TOPOLOGY==='1' && this.rebuilding)this.topologyDirty=false;
            const graph=this,nodes=this.nodes, descriptor=Object.getOwnPropertyDescriptor(nodes,'set'),set=nodes.set;
            const iteratorDescriptor=Object.getOwnPropertyDescriptor(nodes,Symbol.iterator),iterate=nodes[Symbol.iterator];
            nodes.set=function(file,value){const changed=this.get(file)!==value;const result=Reflect.apply(set,this,[file,value]);if(changed){globalThis.__nodeRetentionChanged(file);globalThis.__nodeRetentionCommitted(file,graph)}return result};
            nodes[Symbol.iterator]=function(...inner){globalThis.__nodeRetentionTopologyScan();return Reflect.apply(iterate,this,inner)};
            globalThis.__nodeRetentionDepth(1);
            try{return Reflect.apply(update,this,args)}finally{globalThis.__nodeRetentionState(this);globalThis.__nodeRetentionDepth(-1);if(descriptor)Object.defineProperty(nodes,'set',descriptor);else delete nodes.set;if(iteratorDescriptor)Object.defineProperty(nodes,Symbol.iterator,iteratorDescriptor);else delete nodes[Symbol.iterator]}
          };
          const effects=ScopeDependencyGraph.prototype.effects;
          ScopeDependencyGraph.prototype.effects=function(...args){globalThis.__nodeRetentionInfluence();return Reflect.apply(effects,this,args)};
          const retain=ScopeModuleBindings.prototype.retain;
          ScopeModuleBindings.prototype.retain=function(...args){globalThis.__nodeRetentionRetain();return Reflect.apply(retain,this,args)};
          const resolve=ScopeModuleBindings.prototype.resolve;
          ScopeModuleBindings.prototype.resolve=function(name,file,...args){globalThis.__nodeRetentionResolved(name,file);return Reflect.apply(resolve,this,[name,file,...args])};
          const begin=ScopeModuleBindings.prototype.begin;
          ScopeModuleBindings.prototype.begin=function(...args){
            const aliases=this.aliases,beforeOwners=this.entries.size;
            const result=Reflect.apply(begin,this,args);
            if(aliases!==this.aliases)globalThis.__nodeRetentionAliases({before:aliases,after:this.aliases,beforeOwners,afterOwners:this.entries.size});
            return result;
          };
        }\n`
      }
      return Reflect.apply(compile, this, [source, file])
    }
  }
}
