const fs=require("node:fs"),path=require("node:path"),Module=require("node:module")
if(require("node:worker_threads").isMainThread&&process.env.ARKTS_LSP_LOG_DIR){
 const directory=path.dirname(process.env.ARKTS_LSP_LOG_DIR)
 if(!path.basename(directory).startsWith("arkts-semantic-ready-"))throw Error("isolated current-index fixture required")
 const arm=path.join(directory,"arm-current-index.json")
 globalThis.__currentIndexStatus=value=>{
  const qualification=value?.indexProof?.qualification
  if(value?.state!=="ready"||!qualification)return
  fs.writeFileSync(path.join(directory,"latest-current-index.json"),JSON.stringify(qualification))
  if(!fs.existsSync(arm))return
  const baseline=JSON.parse(fs.readFileSync(arm,"utf8"))
  if(qualification.input.issuer===baseline.issuer&&qualification.input.revision>baseline.revision)
   fs.writeFileSync(path.join(directory,"edited-index-qualified.json"),JSON.stringify(qualification))
 }
 globalThis.__currentIndexReconcile=(root,kind)=>{
  if(fs.existsSync(arm))fs.appendFileSync(path.join(directory,"current-index-reconcile.jsonl"),JSON.stringify({root,kind})+"\n")
 }
 const compile=Module.prototype._compile
 Module.prototype._compile=function(source,file){
  if(path.basename(file)==="server.cjs")source+=`\n{
   const status=SidecarWorkspaceIndex.prototype.status;
   SidecarWorkspaceIndex.prototype.status=async function(...args){const value=await Reflect.apply(status,this,args);globalThis.__currentIndexStatus(value);return value};
   const reconcile=ReferenceNamespaceAdmission.prototype.requestReconciliation;
   ReferenceNamespaceAdmission.prototype.requestReconciliation=function(...args){globalThis.__currentIndexReconcile(...args);return Reflect.apply(reconcile,this,args)};
  }\n`;
  return Reflect.apply(compile,this,[source,file])
 }
}
