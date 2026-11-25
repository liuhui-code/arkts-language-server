// Observe actual namespace results during a public LSP session; never supply them.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module')
const directory=process.env.ARKTS_LSP_LOG_DIR&&path.dirname(process.env.ARKTS_LSP_LOG_DIR)
if(!directory||!path.basename(directory).startsWith('arkts-semantic-ready-'))throw Error('isolated fixture required')
globalThis.__diskNamespaceObserved=value=>fs.appendFileSync(path.join(directory,'disk-namespace.jsonl'),JSON.stringify(value)+'\n')
const compile=Module.prototype._compile
Module.prototype._compile=function(source,file){
 if(path.basename(file)==='semantic-worker.cjs')source+='\n{ const original=projectSourceNamespace; projectSourceNamespace=function(...args){const value=Reflect.apply(original,this,args);globalThis.__diskNamespaceObserved(value);return value}; }\n'
 return Reflect.apply(compile,this,[source,file])
}
