const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  const armFile = path.join(directory, "arm-final-member.json"), output = path.join(directory, "final-member-events.jsonl")
  let done = false, nativeDepth = 0, serial = 0
  const ids = new WeakMap(), wrapped = new WeakSet()
  const event = row => fs.appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n")
  const arm = stage => {
    if (done || !globalThis.__finalMemberPhase?.() || !fs.existsSync(armFile)) return
    if (process.env.ARKTS_TEST_MEMBER_RACE_AFTER_RESIDENT === "1"
      && !(globalThis.__residentReferenceCompleted && globalThis.__residentReferenceCommand)) return
    if (process.env.ARKTS_TEST_MEMBER_RACE_AFTER_DIAG === "1" && !globalThis.__diagnosticQueryCompleted) return
    if (process.env.ARKTS_TEST_MEMBER_RACE_AFTER_RESOLVE === "1" && !globalThis.__completionResolutionCompleted) return
    const value = JSON.parse(fs.readFileSync(armFile, "utf8"))
    return value.stage === stage ? value : undefined
  }
  const mutate = value => {
    done = true
    if (value.kind === "source") fs.writeFileSync(value.file, "class LateFinalGlobal {}\n")
    else if (value.kind === "directory-cycle") { fs.mkdirSync(value.file); fs.rmdirSync(value.file) }
    else if (value.kind === "created") fs.writeFileSync(value.file, "class LateCreatedGlobal {}\n")
    else if (value.kind === "sdk") {
      const metadata = JSON.parse(fs.readFileSync(value.file, "utf8"))
      fs.writeFileSync(value.file, JSON.stringify({ ...metadata, version: "after-final-race" }))
    } else throw Error("unknown private race")
    event({ event: "mutated", ...value })
  }
  const lstat = fs.lstatSync
  fs.lstatSync = function(file, ...args) {
    const value = nativeDepth && arm("during")
    if (value && file === value.trigger) mutate(value)
    return Reflect.apply(lstat, this, [file, ...args])
  }
  globalThis.__forcedPreparedReference = () => event({ event: "forced-resident-miss" })
  globalThis.__memberRaceBefore = () => { const value = arm("before"); if (value) mutate(value) }
  globalThis.__memberRaceFinalEntry = () => { const value = arm("entry"); if (value) mutate(value) }
  globalThis.__memberRaceFactory = proof => {
    const id = ++serial, current = proof.current
    ids.set(proof, id)
    if (done) event({ event: "created-proof", proof: id })
    proof.current = function(...args) {
      nativeDepth++
      try {
        const valid = Reflect.apply(current, this, args)
        if (done && globalThis.__finalMemberPhase()) event({ event: "member-return", proof: id, valid, invalidated: proof.invalidated })
        const value = valid && arm("after"); if (value) mutate(value)
        return valid
      } finally { nativeDepth-- }
    }
    return proof
  }
  globalThis.__memberRaceScope = workspace => {
    const proof = globalThis.__memberOperationProof(workspace)
    if (!proof || wrapped.has(proof)) return workspace
    wrapped.add(proof)
    const current = proof.current
    proof.current = function(...args) {
      const valid = Reflect.apply(current, this, args)
      if (done && globalThis.__finalMemberPhase()) event({ event: "scope-return", valid,
        obligations: globalThis.__remainingMemberObligations() })
      return valid
    }
    return workspace
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      if (process.env.ARKTS_TEST_MEMBER_RACE_AFTER_RESIDENT === "1") {
        const answer = "async function answerRequest(request) {"
        if (source.split(answer).length !== 2) throw Error("unique resident request boundary required")
        source = source.replace(answer, `async function answerRequest(request) {
          globalThis.__residentReferenceCommand=request.method==='references';
          globalThis.__residentReferenceCompleted=false;
          try{return await residentObservedAnswer(request)}finally{globalThis.__residentReferenceCommand=false}
        } async function residentObservedAnswer(request) {`)
        source += `\n{
          if(process.env.ARKTS_TEST_MEMBER_RACE_PREPARED_REFERENCE==='1') {
            const resident=TypeScriptLanguageServiceEngine.prototype.residentReferences;
            let missed=false;
            TypeScriptLanguageServiceEngine.prototype.residentReferences=function(...args) {
              if(globalThis.__residentReferenceCommand&&!missed) {
                missed=true;globalThis.__forcedPreparedReference();return undefined
              }
              return Reflect.apply(resident,this,args)
            };
            const references=TypeScriptLanguageServiceEngine.prototype.references;
            TypeScriptLanguageServiceEngine.prototype.references=function(...args) {
              const result=Reflect.apply(references,this,args);
              if(result?.status==='complete')globalThis.__residentReferenceCompleted=true;
              return result
            };
          }
          const query=queryAdmittedReferences;
          queryAdmittedReferences=(...args)=>{
            const result=query(...args);
            if(result?.status==='complete')globalThis.__residentReferenceCompleted=true;
            return result
          };
        }\n`
      }
      const boundary = "finalizing = true;"
      if (source.split(boundary).length !== 2) throw Error("unique final input boundary required")
      source = source.replace(boundary, boundary + " globalThis.__memberRaceFinalEntry();")
      source += `\n{
      globalThis.__finalMemberPhase = () => finalizing;
      globalThis.__memberOperationProof = workspace => workspace[OPERATION_SCOPE];
      globalThis.__remainingMemberObligations = () => [...(finalMemberships?.values() ?? [])].reduce((sum, item) => sum + item.consumers.size, 0);
      if (process.env.ARKTS_TEST_MEMBER_RACE_AFTER_DIAG === '1') {
        const diagnose = TypeScriptLanguageServiceEngine.prototype.diagnostics;
        TypeScriptLanguageServiceEngine.prototype.diagnostics = function(...args) {
          const result = Reflect.apply(diagnose, this, args);
          globalThis.__diagnosticQueryCompleted = true;
          return result
        };
      }
      if (process.env.ARKTS_TEST_MEMBER_RACE_AFTER_RESOLVE === '1') {
        const resolve = TypeScriptLanguageServiceEngine.prototype.resolveCompletion;
        TypeScriptLanguageServiceEngine.prototype.resolveCompletion = function(...args) {
          const result = Reflect.apply(resolve, this, args);
          globalThis.__completionResolutionCompleted = true;
          return result
        };
      }
      const capture = captureCompleteMembershipProof;
      captureCompleteMembershipProof = function(...args) { return globalThis.__memberRaceFactory(Reflect.apply(capture, this, args)) };
      const same = ProjectOperationScopes.prototype.sameMembership;
      ProjectOperationScopes.prototype.sameMembership = function(...args) { globalThis.__memberRaceBefore(); return Reflect.apply(same, this, args) };
      const project = ProjectOperationScopes.prototype.project;
      ProjectOperationScopes.prototype.project = function(...args) { return globalThis.__memberRaceScope(Reflect.apply(project, this, args)) };
    }\n`
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
