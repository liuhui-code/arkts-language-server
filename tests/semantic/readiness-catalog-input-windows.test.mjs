import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createReadinessFixture } from '../support/semantic-readiness-lsp.mjs'
for(const [stage,kind] of [['root','source'],['root','sdk'],['pre','sdk'],['root','namespace'],['pre','source']]) test(`readiness refresh preserves original catalog authority (${stage}, ${kind})`,{timeout:30000},async t=>{
 const {session,sdk,workspace,directory,uri,rootUri,events}=createReadinessFixture(t,{ARKTS_BENCHMARK_CONTROL:'0',ARKTS_MEMORY_BUDGET_MB:'4096',ARKTS_REFERENCES_RESIDENT_FAST_PATH:'1',NODE_OPTIONS:`--require=${path.resolve('tests/fixtures/sdk-diagnostic-source-mutation.cjs')} --require=${path.resolve('tests/fixtures/readiness-catalog-scan-window.cjs')}`})
 const main="import { Model } from './ZZModel'\nconst model = new Model()\nexport const current = model.markerOld\n"
 fs.writeFileSync(path.join(workspace,'Main.ets'),main);fs.writeFileSync(path.join(workspace,'ZZModel.ets'),'export class Model { markerOld: number = 1 }\n')
 for(let i=0;i<400;i++)fs.writeFileSync(path.join(workspace,`Filler${String(i).padStart(4,'0')}.ets`),`export const filler${i} = ${i}\n`)
 await session.initialize({initializationOptions:{sdk:{path:sdk}},timeoutMs:10000})
 const prepared=await session.transport.notification('arkts/semanticPreparation',m=>m.params.rootUri===rootUri&&m.params.phase==='complete',10000);assert.equal(prepared.params.report.semanticState,'ready')
 const target=uri('Main.ets');session.openDocument({uri:target,version:1,text:main})
 const complete=()=>session.request('textDocument/completion',{textDocument:{uri:target},position:{line:2,character:32},context:{triggerKind:1}})
 assert.equal((await complete()).error,undefined)
 fs.writeFileSync(path.join(directory,'arm-sdk-mutation.json'),JSON.stringify({sdkMutation:false}))
 const diagnosed=session.transport.notification('textDocument/publishDiagnostics',m=>m.params.uri===target&&m.params.version===2,10000)
 session.changeDocument({uri:target,version:2,text:main});await diagnosed
 assert.ok(fs.existsSync(path.join(directory,'sdk-mutated.json')),'real completed diagnostic must have discovered new source')
 fs.writeFileSync(path.join(directory,'arm-catalog-window.json'),JSON.stringify({stage,kind}))
 const response=await complete()
 assert.ok(fs.existsSync(path.join(directory,'catalog-window-observed.json')),'native catalog mutation must execute')
 const observation=JSON.parse(fs.readFileSync(path.join(directory,'catalog-window-observed.json'),'utf8'))
 assert.equal(observation.pid,session.transport.child.pid);assert.ok(observation.threadId>0)
 assert.match(observation.caller,/scanProjectMembership/)
 if(stage==='root')assert.match(observation.caller,/prepareRoot/);else assert.doesNotMatch(observation.caller,/prepareRoot/)
 if(kind==='namespace'){assert.equal(observation.beforeSha,observation.afterSha);assert.notEqual(observation.beforePhysical,observation.afterPhysical)}

 if(process.env.REVIEW_OUT)fs.writeFileSync(process.env.REVIEW_OUT+`-${stage}-${kind}.json`,JSON.stringify({response,observation,events:events()},null,2))
 if(stage==='pre'&&kind==='source'){ assert.equal(response.error,undefined,JSON.stringify(response)); assert.ok(response.result.items.some(x=>x.label==='markerEnd')); assert.ok(!response.result.items.some(x=>x.label==='markerNew')) } else assert.equal(response.error?.code,-32803,JSON.stringify(response))
 await session.close()
})
