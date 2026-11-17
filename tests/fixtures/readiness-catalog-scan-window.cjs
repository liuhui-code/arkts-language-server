const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{createHash}=require('node:crypto')
const {isMainThread,threadId}=require('node:worker_threads')
function instrument(source){
 const phase=source.match(/function withRequestInputValidation\([\w$]+, [\w$]+\) \{\n  if \(([\w$]+) \|\| ([\w$]+)\) return run\(\);/)
 const request='async function answerRequest(request) {'
 const start=source.indexOf('function captureCompleteMembershipProof('),end=source.indexOf('\n// src/',start)
 if(!phase||source.split(request).length!==2||start<0||end<0)throw Error('catalog fixture requires actual request, native proof and phase entries')
 const native=source.slice(start,end),leaf=/const stat = ([\w.$]+\.lstatSync\(file\));/g
 const sites=[...native.matchAll(leaf)]
 if(sites.length!==1)throw Error('catalog fixture requires one actual native leaf observation')
 source=source.slice(0,start)+native.replace(leaf,(_,read)=>`const stat = globalThis.__catalogNativeLeaf(file, () => ${read});`)+source.slice(end)
 source=source.replace(request,request+'globalThis.__catalogWindow.request=request.id;')
 source+=`\nglobalThis.__catalogWindow.phase=()=>({active:!!${phase[1]},finalizing:!!${phase[2]}});
 {const state=globalThis.__catalogWindow,scan=SemanticDocumentStore.prototype.scanProjectMembership,root=SemanticDocumentStore.prototype.prepareRoot;
 SemanticDocumentStore.prototype.scanProjectMembership=function(...args){const before=state.samples;state.scanDepth++;
  try{const entry=Reflect.apply(scan,this,args);if(entry.status==='complete'&&state.samples>before)state.observed={request:state.request,entry,file:state.lastFile,samples:state.samples-before};return entry}
  finally{state.scanDepth--}};
 SemanticDocumentStore.prototype.prepareRoot=function(...args){state.rootDepth++;
  try{globalThis.__catalogRootReuse(this);return Reflect.apply(root,this,args)}finally{state.rootDepth--}};
 }\n`
 return source
}
if(process.env.ARKTS_LSP_LOG_DIR&&isMainThread&&path.basename(process.argv[1]??'')==='server.cjs'){
 // Fail a stale probe before launching any Worker recovery, not during module load.
 instrument(fs.readFileSync(path.join(path.dirname(process.argv[1]),'semantic-worker.cjs'),'utf8'))
}
if(!isMainThread&&process.env.ARKTS_LSP_LOG_DIR){
 const dir=path.dirname(process.env.ARKTS_LSP_LOG_DIR),arm=path.join(dir,'arm-catalog-window.json'),observed=path.join(dir,'catalog-window-observed.json')
 if(!path.basename(dir).startsWith('arkts-semantic-ready-'))throw Error('private readiness fixture required')
 const state=globalThis.__catalogWindow={samples:0,scanDepth:0,rootDepth:0,nativeDepth:0,request:null}
 const plan=()=>fs.existsSync(arm)&&!fs.existsSync(observed)?JSON.parse(fs.readFileSync(arm,'utf8')):undefined
 const stack=()=>{const old=Error.stackTraceLimit;Error.stackTraceLimit=80;try{return new Error().stack}finally{Error.stackTraceLimit=old}}
 const mutate=(input,details)=>{
  const target=input.kind==='sdk'?path.join(dir,'sdk/ets/oh-uni-package.json'):path.join(dir,'workspace/ZZModel.ets')
  const beforePhysical=fs.realpathSync(target),before=fs.readFileSync(target,'utf8')
  const after=input.kind==='sdk'?before.replace('"24"','"25"'):before.replaceAll('markerNew','markerEnd')
  if(before===after)throw Error('catalog probe mutation must change actual bytes')
  if(input.kind==='namespace'){fs.renameSync(target,target+'.old');fs.symlinkSync(target+'.old',target)}else fs.writeFileSync(target,after)
  const actualAfter=fs.readFileSync(target,'utf8'),afterPhysical=fs.realpathSync(target),sha=s=>createHash('sha256').update(s).digest('hex')
  fs.writeFileSync(observed,JSON.stringify({...input,...details,requestId:state.request,pid:process.pid,threadId,
   caller:stack(),beforePhysical,afterPhysical,beforeSha:sha(before),afterSha:sha(actualAfter)}))
 }
 globalThis.__catalogRootReuse=store=>{
  const input=plan();if(input?.stage!=='root')return
  const prior=state.observed
  if(prior?.request!==state.request||![...store.projectFileSets.values()].includes(prior.entry))throw Error('root reuse must follow actual current-request native observation')
  mutate(input,{samplingKind:'root-cache-reuse',rootPreparation:true,timing:'after-native-observation-before-root-use',
   nativeObservation:{requestId:prior.request,triggerPath:prior.file,samples:prior.samples,catalogRevision:prior.entry.revision},phase:state.phase()})
 }
 globalThis.__catalogNativeLeaf=(file,read)=>{
  state.nativeDepth++
  try{const result=read();state.samples++;state.lastFile=file;return result}finally{state.nativeDepth--}
 }
 const lstat=fs.lstatSync
 fs.lstatSync=function(file,...args){
  const input=plan()
  if(input&&input.stage!=='root'&&['Filler0000.ets','ZZModel.ets'].includes(path.basename(String(file)))){
   const caller=stack(),full=state.scanDepth>0&&caller.includes('safeLstat'),native=state.nativeDepth>0,phase=state.phase()
   if(full){state.samples++;state.lastFile=String(file)}
   const source=input.kind==='source',trigger=source?'ZZModel.ets':'Filler0000.ets'
   // Catalogued after-observation cases target the actual retained final leaf,
   // not a rejected cache probe or an earlier unrelated namespace observation.
   const qualified=source?(input.catalogued?native&&phase.finalizing:full):(native||full)
   if(qualified&&state.rootDepth===0&&path.basename(String(file))===trigger){
    const before=input.stage==='pre-after'?Reflect.apply(lstat,this,[file,...args]):undefined
    mutate(input,{samplingKind:full?'full-enumeration':phase.finalizing?'retained-final-proof':'retained-query-proof',rootPreparation:false,
     triggerPath:String(file),phase,timing:before?'after-native-observation':'before-native-observation'})
    if(before)return before
   }
  }else if(input?.stage==='root'&&state.scanDepth>0&&['Filler0000.ets','ZZModel.ets'].includes(path.basename(String(file)))&&stack().includes('safeLstat')){
   state.samples++;state.lastFile=String(file)
  }
  return Reflect.apply(lstat,this,[file,...args])
 }
 const compile=Module.prototype._compile
 Module.prototype._compile=function(source,file){return Reflect.apply(compile,this,[path.basename(file)==='semantic-worker.cjs'?instrument(source):source,file])}
}
