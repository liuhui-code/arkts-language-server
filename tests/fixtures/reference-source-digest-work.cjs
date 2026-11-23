// Actual filesystem observations during a public child-process LSP session.
const fs=require('node:fs'),path=require('node:path'),{threadId}=require('node:worker_threads')
const directory=process.env.ARKTS_LSP_LOG_DIR&&path.dirname(process.env.ARKTS_LSP_LOG_DIR)
if(!directory||!path.basename(directory).startsWith('arkts-semantic-ready-'))throw Error('isolated test required')
const emit=(event,file)=>fs.appendFileSync(path.join(directory,'digest-work.ndjson'),JSON.stringify({event,file:String(file),threadId})+'\n')
for(const name of ['openSync','lstatSync']){
 const original=fs[name]
 fs[name]=function(file,...args){
  if(typeof file==='string'&&/^DigestNoise\d+\.ts$/.test(path.basename(file)))emit(name,file)
  return Reflect.apply(original,this,[file,...args])
 }
}
const Module=require('node:module'),compile=Module.prototype._compile
Module.prototype._compile=function(source,file){
 if(path.basename(file)==='semantic-worker.cjs'){
  const needle='return old.digest;'
  if(source.includes('function projectSourceDigest(')){
   if(source.split(needle).length!==2)throw Error('unique retained digest seam required')
   source=source.replace(needle,'{ globalThis.__digestReuseWindow(); return old.digest; }')
  }
 }
 return compile.call(this,source,file)
}
globalThis.__digestReuseWindow=()=>{
 const arm=path.join(directory,'digest-race-arm.json')
 if(!fs.existsSync(arm))return
 const {file,text}=JSON.parse(fs.readFileSync(arm,'utf8'));fs.unlinkSync(arm)
 fs.writeFileSync(file,text);emit('race-edit',file)
}
const stringify=JSON.stringify
JSON.stringify=function(value,...args){
 if(Array.isArray(value)&&value.length===6&&typeof value[0]==='string'
  &&/^DigestNoise\d+\.ts$/.test(path.basename(value[0]))&&new Error().stack.includes('projectSourceDigest'))emit('source-identity-string',value[0])
 return Reflect.apply(stringify,this,[value,...args])
}
