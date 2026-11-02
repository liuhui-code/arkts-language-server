import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createReadinessFixture } from '../support/semantic-readiness-lsp.mjs'

test('readiness refresh preserves unopened call hierarchy targets beyond the raw preload window', {timeout:30000}, async t=>{
 const {session,sdk,workspace,directory,uri,rootUri,events}=createReadinessFixture(t,{ARKTS_BENCHMARK_CONTROL:'0',ARKTS_MEMORY_BUDGET_MB:'4096',ARKTS_REFERENCES_RESIDENT_FAST_PATH:'1',NODE_OPTIONS:`--require=${path.resolve('tests/fixtures/sdk-diagnostic-source-mutation.cjs')}`})
 const text="import { Model } from './ZZModel'\nconst model = new Model()\nexport const current = model.markerOld\n"
 fs.writeFileSync(path.join(workspace,'Main.ets'),text)
 fs.writeFileSync(path.join(workspace,'ZZCaller.ets'),"import { callee } from './ZZCallee'\nexport function caller() { callee() }\n")
 fs.writeFileSync(path.join(workspace,'ZZCallee.ets'),'export function callee() { return 1 }\n')
 fs.writeFileSync(path.join(workspace,'ZZModel.ets'),'export class Model { markerOld: number = 1 }\n')
 for(let i=0;i<400;i++)fs.writeFileSync(path.join(workspace,`Filler${String(i).padStart(4,'0')}.ets`),`export const filler${i} = ${i}\n`)
 await session.initialize({initializationOptions:{sdk:{path:sdk}},timeoutMs:10000})
 const initialized=await session.transport.notification('arkts/semanticPreparation',m=>m.params.rootUri===rootUri&&m.params.phase==='complete',10000)
 assert.equal(initialized.params.report.semanticState,'ready')
 const target=uri('Main.ets');session.openDocument({uri:target,version:1,text})
 const complete=()=>session.request('textDocument/completion',{textDocument:{uri:target},position:{line:2,character:32},context:{triggerKind:1}})
 assert.equal((await complete()).error,undefined)
 fs.writeFileSync(path.join(directory,'arm-sdk-mutation.json'),JSON.stringify({sdkMutation:false}))
 const diagnosed=session.transport.notification('textDocument/publishDiagnostics',m=>m.params.uri===target&&m.params.version===2,10000)
 session.changeDocument({uri:target,version:2,text})
 await diagnosed
 assert.ok(fs.existsSync(path.join(directory,'sdk-mutated.json')),'real diagnostic must discover changed source before next command')
 for(let i=0;i<2;i++){
  const prepared=await session.request('textDocument/prepareCallHierarchy',{textDocument:{uri:uri('ZZCaller.ets')},position:{line:1,character:18}})
  assert.equal(prepared.error,undefined,JSON.stringify(prepared));assert.equal(prepared.result.length,1)
  const outgoing=await session.request('callHierarchy/outgoingCalls',{item:prepared.result[0]})
  assert.equal(outgoing.error,undefined,JSON.stringify(outgoing));assert.equal(outgoing.result.length,1)
  assert.equal(outgoing.result[0].to.uri,uri('ZZCallee.ets'))
 }
 const creates=events().filter(e=>e.event==='semantic.context.create')
 t.diagnostic(JSON.stringify({creates:creates.length}))
 assert.equal(creates.length,2,'initial owner plus one necessary source replacement; no backwards/forwards recreation')
 await session.close()
})
