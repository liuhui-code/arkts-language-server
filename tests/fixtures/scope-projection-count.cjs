const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
if(!require('node:worker_threads').isMainThread && process.env.ARKTS_LSP_LOG_DIR){
 const directory=path.dirname(process.env.ARKTS_LSP_LOG_DIR);
 if(!path.basename(directory).startsWith('arkts-semantic-ready-'))throw Error('private projection fixture required');
 let request,projectDepth=0;
 globalThis.__projectionRequest=async(input,run)=>{
  request={id:input.id,method:input.method,memberNormalizations:0};
  try{return await run()}finally{fs.appendFileSync(path.join(directory,'scope-projection-count.jsonl'),JSON.stringify(request)+'\n');request=undefined;}
 };
 globalThis.__projectionPath=file=>{if(request && projectDepth && /Unused\d+\.ts$/.test(file))request.memberNormalizations++};
 globalThis.__projectionDepth=amount=>{projectDepth+=amount};
 const compile=Module.prototype._compile;
 Module.prototype._compile=function(source,file){
  if(path.basename(file)==='semantic-worker.cjs'){
   const once=(from,to)=>{if(source.split(from).length!==2)throw Error('unique projection fixture boundary: '+from);source=source.replace(from,to)};
   once('async function answerRequest(request) {','async function answerRequest(request) {return globalThis.__projectionRequest(request,()=>projectionAnswer(request))} async function projectionAnswer(request) {');
   once('function resolvedPathIdentity(filePath) {','function resolvedPathIdentity(filePath) {globalThis.__projectionPath(filePath);');
   source+=`\n{const project=ProjectOperationScopes.prototype.project;ProjectOperationScopes.prototype.project=function(...args){globalThis.__projectionDepth(1);try{return Reflect.apply(project,this,args)}finally{globalThis.__projectionDepth(-1)}};}\n`;
  }
  return Reflect.apply(compile,this,[source,file]);
 };
}
