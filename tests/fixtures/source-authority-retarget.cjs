const fs=require('node:fs'),path=require('node:path'),Module=require('node:module')
const {threadId}=require('node:worker_threads')
const dir=path.dirname(process.env.ARKTS_LSP_LOG_DIR||'')
if(!path.basename(dir).startsWith('arkts-semantic-ready-'))throw Error('private fixture required')
const planFile=path.join(dir,'source-authority-retarget')
let plan,calls=0,fired=false
const native=fs.realpathSync.native
fs.realpathSync.native=function(file,...args){
 if(plan&&!fired&&String(file)===plan.file&&++calls===2){
  if(!fs.lstatSync(plan.link).isSymbolicLink())throw Error('only isolated symlink/junction may be replaced')
  const before=native.call(this,file,...args)
  fs.rmSync(plan.link)
  fs.symlinkSync(plan.after,plan.link,process.platform==='win32'?'junction':'dir')
  fired=true;fs.unlinkSync(planFile)
  fs.writeFileSync(planFile+'.fired',JSON.stringify({before,after:native.call(this,file,...args),threadId}))
 }
 return native.call(this,file,...args)
}
globalThis.__sourceAuthorityRetarget=query=>{
 if(!fired&&fs.existsSync(planFile)){plan=JSON.parse(fs.readFileSync(planFile));calls=0}
}
const compile=Module.prototype._compile
Module.prototype._compile=function(source,file){
 if(['server.cjs','semantic-worker.cjs'].includes(path.basename(file))){
  const seam=/function sourceReferenceAuthority\(([\w$]+), ([\w$]+)\) \{/g
  const found=[...source.matchAll(seam)]
  if(found.length!==1)throw Error('unique actual source authority required')
  source=source.replace(seam,match=>match+`globalThis.__sourceAuthorityRetarget(${found[0][1]});`)
 }
 return compile.call(this,source,file)
}
