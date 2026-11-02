import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createReadinessFixture } from '../support/semantic-readiness-lsp.mjs'

for(const targetKind of ['open','disk']) test(`a diagnostic-discovered source edit never rolls the readiness owner back (${targetKind} target)`, {timeout:30000}, async t=>{
 const {session,sdk,workspace,directory,uri,rootUri,events}=createReadinessFixture(t,{ARKTS_BENCHMARK_CONTROL:'0',ARKTS_MEMORY_BUDGET_MB:'4096',ARKTS_REFERENCES_RESIDENT_FAST_PATH:'1',NODE_OPTIONS:`--require=${path.resolve('tests/fixtures/sdk-diagnostic-source-mutation.cjs')}`})
 const text="import { Model } from './ZZModel'\nconst model = new Model()\nexport const current = model.markerOld\n"
 fs.writeFileSync(path.join(workspace,'Main.ets'),text)
 if(targetKind==='disk')fs.writeFileSync(path.join(workspace,'ZZTarget.ets'),text)
 fs.writeFileSync(path.join(workspace,'ZZModel.ets'),'export class Model { markerOld: number = 1 }\n')
 for(let i=0;i<400;i++)fs.writeFileSync(path.join(workspace,`Filler${String(i).padStart(4,'0')}.ets`),`export const filler${i} = ${i}\n`)
 await session.initialize({initializationOptions:{sdk:{path:sdk}},timeoutMs:10000})
 const initialized=await session.transport.notification('arkts/semanticPreparation',m=>m.params.rootUri===rootUri&&m.params.phase==='complete',10000)
 assert.equal(initialized.params.report.semanticState,'ready')
 const target=uri('Main.ets');session.openDocument({uri:target,version:1,text})
 const complete=()=>session.request('textDocument/completion',{textDocument:{uri:targetKind==='disk'?uri('ZZTarget.ets'):target},position:{line:2,character:32},context:{triggerKind:1}})
 assert.equal((await complete()).error,undefined)
 fs.writeFileSync(path.join(directory,'arm-sdk-mutation.json'),JSON.stringify({sdkMutation:false}))
 const diagnosed=session.transport.notification('textDocument/publishDiagnostics',m=>m.params.uri===target&&m.params.version===2,10000)
 session.changeDocument({uri:target,version:2,text})
 await diagnosed
 assert.ok(fs.existsSync(path.join(directory,'sdk-mutated.json')),'real diagnostic must discover changed source before next command')
 for(let i=0;i<2;i++){
  const response=await complete();assert.equal(response.error,undefined,JSON.stringify(response))
  assert.ok(response.result.items.some(x=>x.label==='markerNew'));assert.ok(!response.result.items.some(x=>x.label==='markerOld'))
 }
 const creates=events().filter(e=>e.event==='semantic.context.create')
 t.diagnostic(JSON.stringify({creates:creates.length}))
 assert.equal(creates.length,2,'initial owner plus one necessary source replacement; no backwards/forwards recreation')
 await session.close()
})

for (const fillers of [0, 400]) {
  test(`an existing dependency edit before the query remains immediately available (${fillers} fillers)`,
    { timeout: 30000 }, async t => {
      const { session, sdk, workspace, uri, rootUri } = createReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: '0', ARKTS_MEMORY_BUDGET_MB: '4096', ARKTS_REFERENCES_RESIDENT_FAST_PATH: '1',
      })
      const text = "import { Model } from './Model'\nconst model = new Model()\nmodel.markerOld\n"
      const model = marker => `export class Model { ${marker}: number = 1 }\n`
      fs.writeFileSync(path.join(workspace, 'Main.ets'), text)
      const dependency = path.join(workspace, 'Model.ets')
      fs.writeFileSync(dependency, model('markerOld'))
      for (let index = 0; index < fillers; index++) {
        fs.writeFileSync(path.join(workspace, `Filler${String(index).padStart(4, '0')}.ets`),
          `export const filler${index} = ${index}\n`)
      }
      await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10000 })
      const initialized = await session.transport.notification('arkts/semanticPreparation',
        message => message.params.rootUri === rootUri && message.params.phase === 'complete', 10000)
      assert.equal(initialized.params.report.semanticState, 'ready')
      const target = uri('Main.ets')
      const opened = session.transport.notification('textDocument/publishDiagnostics',
        message => message.params.uri === target && message.params.version === 1, 10000)
      session.openDocument({ uri: target, version: 1, text })
      await opened
      const complete = () => session.request('textDocument/completion', {
        textDocument: { uri: target }, position: { line: 2, character: 9 }, context: { triggerKind: 1 },
      })
      const warm = await complete()
      assert.equal(warm.error, undefined, JSON.stringify(warm))
      assert.ok(warm.result.items.some(item => item.label === 'markerOld'))
      // The edit precedes the new command. No watcher, overlay change or diagnosis is triggered afterward.
      fs.writeFileSync(dependency, model('markerNew'))
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await complete()
        assert.equal(response.error, undefined, JSON.stringify(response))
        assert.ok(response.result.items.some(item => item.label === 'markerNew'))
        assert.ok(!response.result.items.some(item => item.label === 'markerOld'))
      }
      await session.close()
    })
}
