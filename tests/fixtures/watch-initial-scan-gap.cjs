const fs=require('node:fs'),path=require('node:path'),Module=require('node:module')
if(!require('node:worker_threads').isMainThread&&process.env.ARKTS_LSP_LOG_DIR){
 const root=path.dirname(process.env.ARKTS_LSP_LOG_DIR)
 if(!path.basename(root).startsWith('arkts-semantic-ready-'))throw Error('private fixture required')
 let paused=false
 const record=row=>fs.appendFileSync(path.join(root,'scan-gap-events.jsonl'),JSON.stringify({at:new Date().toISOString(),...row})+'\n')
 globalThis.__pauseOriginalMembershipScan=entry=>{
  if(paused||entry.status!=='complete'||!entry.completeProof)return entry
  paused=true;record({event:'original-scan-captured',sources:entry.paths.length,hasStrongProof:true})
  fs.writeFileSync(path.join(root,'scan-gap-captured.json'),JSON.stringify({sources:entry.paths.length}))
  const start=performance.now(),cell=new Int32Array(new SharedArrayBuffer(4))
  while(!fs.existsSync(path.join(root,'scan-gap-release'))){
   if(performance.now()-start>10000)throw Error('private initial-scan gate not released in10s')
   Atomics.wait(cell,0,0,10)
  }
  record({event:'original-scan-released',elapsedMs:performance.now()-start})
  return entry
 }
 const compile=Module.prototype._compile
 Module.prototype._compile=function(source,file){
  if(path.basename(file)==='semantic-worker.cjs')source+=`\n{
    const scan=SemanticDocumentStore.prototype.scanProjectMembership;
    SemanticDocumentStore.prototype.scanProjectMembership=function(...args){
      return globalThis.__pauseOriginalMembershipScan(Reflect.apply(scan,this,args))
    };
  }\n`
  return Reflect.apply(compile,this,[source,file])
 }
}
