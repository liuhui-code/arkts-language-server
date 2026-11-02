import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createReadinessFixture } from '../support/semantic-readiness-lsp.mjs'

test('cancelling an entered readiness catalog scan preserves its owner and permits the next command', {timeout:30000}, async t=>{
 const {session,sdk,workspace,directory,uri,rootUri,events}=createReadinessFixture(t,{ARKTS_BENCHMARK_CONTROL:'0',ARKTS_MEMORY_BUDGET_MB:'4096',ARKTS_REFERENCES_RESIDENT_FAST_PATH:'1',NODE_OPTIONS:`--require=${path.resolve('tests/fixtures/sdk-diagnostic-source-mutation.cjs')} --require=${path.resolve('tests/fixtures/readiness-catalog-cancellation.cjs')}`})
 const text="import { Model } from './ZZModel'\nconst model = new Model()\nexport const current = model.markerOld\n"
 fs.writeFileSync(path.join(workspace,'Main.ets'),text)
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
 const before=events().filter(e=>e.event==='semantic.context.create').length
 fs.writeFileSync(path.join(directory,'arm-catalog-cancel'),'armed')
 const id=session.nextRequestId++
 session.transport.send({jsonrpc:'2.0',id,method:'textDocument/completion',params:{textDocument:{uri:target},position:{line:2,character:32},context:{triggerKind:1}}})
 const entered=path.join(directory,'catalog-cancel-entered.json'),deadline=Date.now()+5000
 while(!fs.existsSync(entered)){if(Date.now()>deadline)throw Error('catalog scan was not entered');await new Promise(r=>setTimeout(r,5))}
 const observation=JSON.parse(fs.readFileSync(entered,'utf8'));assert.ok(observation.threadId>0);assert.match(observation.caller,/scanProjectMembership/)
 session.transport.send({jsonrpc:'2.0',method:'$/cancelRequest',params:{id}})
 const cancelled=await session.transport.response(id,5000);assert.equal(cancelled.error?.code,-32800,JSON.stringify(cancelled))
 assert.equal(events().filter(e=>e.event==='semantic.context.create').length,before,'cancelled scan must not replace a compiler')
 const recovered=await complete();assert.equal(recovered.error,undefined,JSON.stringify(recovered));assert.ok(recovered.result.items.some(x=>x.label==='markerNew'))
 assert.equal(events().filter(e=>e.event==='semantic.worker.started').length,1)
 const terminals=session.transport.transcriptEntries.filter(({entry})=>entry.direction==='receive'&&entry.id===id&&entry.method===null)
 assert.equal(terminals.length,1)
 await session.close()
})
