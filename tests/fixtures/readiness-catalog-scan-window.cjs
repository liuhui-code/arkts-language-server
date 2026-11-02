const fs = require('node:fs'), path = require('node:path'), {createHash}=require('node:crypto')
const {isMainThread,threadId}=require('node:worker_threads')
if(!isMainThread && process.env.ARKTS_LSP_LOG_DIR){
 const dir=path.dirname(process.env.ARKTS_LSP_LOG_DIR), arm=path.join(dir,'arm-catalog-window.json'), observed=path.join(dir,'catalog-window-observed.json')
 if(!path.basename(dir).startsWith('arkts-semantic-ready-'))throw Error('private readiness fixture required')
 const lstat=fs.lstatSync
 fs.lstatSync=function(file,...args){
  if(['Filler0000.ets','ZZModel.ets'].includes(path.basename(String(file)))&&fs.existsSync(arm)&&!fs.existsSync(observed)){
   const previous=Error.stackTraceLimit;Error.stackTraceLimit=30
   const caller=new Error().stack;Error.stackTraceLimit=previous
   const {stage,kind}=JSON.parse(fs.readFileSync(arm,'utf8'))
   const sourceWindow=stage.startsWith('pre')&&kind==='source'
   const trigger=sourceWindow?'ZZModel.ets':'Filler0000.ets'
   if(path.basename(String(file))===trigger&&caller.includes('scanProjectMembership')&&(stage==='root'?caller.includes('prepareRoot'):!caller.includes('prepareRoot'))){
    // In the after case return the ACTUAL native observation taken before mutation.
    // In the before case the native observation is taken after mutation below.
    const nativeBefore=stage==='pre-after'?Reflect.apply(lstat,this,[file,...args]):undefined
    const target=kind==='sdk'?path.join(dir,'sdk','ets','oh-uni-package.json'):path.join(dir,'workspace','ZZModel.ets')
    const beforePhysical=fs.realpathSync(target)
    const before=fs.readFileSync(target,'utf8'),after=kind==='sdk'?before.replace('"24"','"25"'):before.replaceAll('markerNew','markerEnd')
    if(before===after)throw Error('catalog probe mutation must change actual bytes')
    if(kind==='namespace'){fs.renameSync(target,target+'.old');fs.symlinkSync(target+'.old',target)} else fs.writeFileSync(target,after)
    const actualAfter=fs.readFileSync(target,'utf8'),afterPhysical=fs.realpathSync(target)
    const sha=text=>createHash('sha256').update(text).digest('hex')
    fs.writeFileSync(observed,JSON.stringify({stage,kind,caller,pid:process.pid,threadId,triggerPath:String(file),timing:nativeBefore?'after-native-observation':'before-native-observation',beforePhysical,afterPhysical,beforeSha:sha(before),afterSha:sha(actualAfter)}))
    if(nativeBefore)return nativeBefore
   }
  }
  return Reflect.apply(lstat,this,[file,...args])
 }
}
