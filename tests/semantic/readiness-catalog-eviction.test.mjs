import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import test from 'node:test'
import {createReadinessFixture} from '../support/semantic-readiness-lsp.mjs'

test('an existing dirty readiness owner remains queryable after its four-entry catalog cache evicts its root', {timeout:60000},async t=>{
 const f=createReadinessFixture(t,{ARKTS_BENCHMARK_CONTROL:'0',ARKTS_MEMORY_BUDGET_MB:'4096',ARKTS_REFERENCES_RESIDENT_FAST_PATH:'1'})
 const text='export const value: number = 1\nvalue\n', roots=[f.workspace]
 fs.writeFileSync(path.join(f.workspace,'Main.ets'),text)
 for(let n=1;n<5;n++){const root=path.join(f.directory,`workspace${n}`);fs.mkdirSync(root);fs.writeFileSync(path.join(root,'Main.ets'),text);roots.push(root)}
 const folders=roots.map((root,i)=>({uri:pathToFileURL(root).href,name:`root${i}`}))
 await f.session.initialize({initializationOptions:{sdk:{path:f.sdk}},workspaceFolders:folders,timeoutMs:10000})
 for(const folder of folders){
  const prepared=await f.session.request('arkts/semanticReadiness',{rootUri:folder.uri,prepare:true},{timeoutMs:20000})
  assert.equal(prepared.error,undefined,JSON.stringify(prepared))
  assert.equal(prepared.result.semanticState,'ready')
 }
 const uri=f.uri('Main.ets');f.session.openDocument({uri,version:1,text})
 const hover=()=>f.session.request('textDocument/hover',{textDocument:{uri},position:{line:1,character:2}})
 assert.equal((await hover()).error,undefined)
 const changed=text+'export const extra = 2\n'
 const diagnosed=f.session.transport.notification('textDocument/publishDiagnostics',m=>m.params.uri===uri&&m.params.version===2,10000)
 f.session.changeDocument({uri,version:2,text:changed});await diagnosed
 // Four other full-root preparations displace the first catalog, not its resident compiler.
 for(const folder of folders.slice(1)){
  const prepared=await f.session.request('arkts/semanticReadiness',{rootUri:folder.uri,prepare:true},{timeoutMs:20000})
  assert.equal(prepared.error,undefined,JSON.stringify(prepared))
 }
 const before=f.events().filter(e=>e.event==='semantic.context.create').length
 assert.equal(before,5,'one retained owner per explicitly prepared root')
 for(let n=0;n<2;n++){const result=await hover();assert.equal(result.error,undefined,JSON.stringify(result));assert.ok(result.result)}
 assert.equal(f.events().filter(e=>e.event==='semantic.context.create').length,before,'catalog recovery must retain the existing compiler owner')
 await f.session.close()
})
