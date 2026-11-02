const fs = require('node:fs'), path = require('node:path')
const {isMainThread,threadId}=require('node:worker_threads')
if(!isMainThread && process.env.ARKTS_LSP_LOG_DIR){
 const dir=path.dirname(process.env.ARKTS_LSP_LOG_DIR)
 if(!path.basename(dir).startsWith('arkts-semantic-ready-'))throw Error('private readiness fixture required')
 const arm=path.join(dir,'arm-catalog-cancel'), entered=path.join(dir,'catalog-cancel-entered.json')
 const load=Atomics.load, lstat=fs.lstatSync
 let cancellation
 Atomics.load=function(view,index){
  const value=Reflect.apply(load,Atomics,[view,index])
  if(view instanceof Int32Array && view.length===1 && view.buffer instanceof SharedArrayBuffer)cancellation=view
  return value
 }
 fs.lstatSync=function(file,...args){
  if(path.basename(String(file))==='Filler0000.ets'&&fs.existsSync(arm)&&!fs.existsSync(entered)){
   const caller=new Error().stack
   if(caller.includes('scanProjectMembership')&&!caller.includes('prepareRoot')){
    if(!cancellation || Reflect.apply(load,Atomics,[cancellation,0])!==0)throw Error('active real cancellation cell required')
    const current=cancellation
    const temporary=entered+'.tmp'
    fs.writeFileSync(temporary,JSON.stringify({pid:process.pid,threadId,caller}))
    fs.renameSync(temporary,entered)
    // Observe the real protocol cancellation cell; never fabricate cancellation or a response.
    const deadline=Date.now()+5000, sleep=new Int32Array(new SharedArrayBuffer(4))
    while(Reflect.apply(load,Atomics,[current,0])===0){
     if(Date.now()>deadline)throw Error('client cancellation did not reach entered catalog scan')
     Atomics.wait(sleep,0,0,5)
    }
   }
  }
  return Reflect.apply(lstat,this,[file,...args])
 }
}
