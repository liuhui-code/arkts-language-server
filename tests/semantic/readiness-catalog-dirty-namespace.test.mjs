import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createReadinessFixture } from '../support/semantic-readiness-lsp.mjs'
test('dirty explicit session does not bless unnotified namespace', { timeout: 30000 }, async t => {
 const { session, sdk, workspace, uri, rootUri, events } = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL:'0', ARKTS_MEMORY_BUDGET_MB:'4096', ARKTS_REFERENCES_RESIDENT_FAST_PATH:'1' })
 const initial='export const instance = { value: 1 }\ninstance.value\n'
 const missing="export const instance = {} as import('./Created').Created\ninstance.value\n"
 fs.writeFileSync(path.join(workspace,'Main.ets'), initial)
 await session.initialize({ initializationOptions:{sdk:{path:sdk}}, timeoutMs:10000 })
 const ready=await session.transport.notification('arkts/semanticPreparation',m=>m.params.rootUri===rootUri&&m.params.phase==='complete',10000)
 assert.equal(ready.params.report.semanticState,'ready')
 session.openDocument({uri:uri('Main.ets'),version:1,text:initial})
 const complete=()=>session.request('textDocument/completion',{textDocument:{uri:uri('Main.ets')},position:{line:1,character:12},context:{triggerKind:1}})
 assert.equal((await complete()).error,undefined)
 const diagnosed=session.transport.notification('textDocument/publishDiagnostics',m=>m.params.uri===uri('Main.ets')&&m.params.version===2,10000)
 session.changeDocument({uri:uri('Main.ets'),version:2,text:missing})
 const diag=await diagnosed
 fs.writeFileSync(path.join(workspace,'Created.ets'),'export class Created { value: number = 1 }\n')
 const response=await complete()
 if(process.env.REVIEW_OUT)fs.writeFileSync(process.env.REVIEW_OUT,JSON.stringify({response,diag,events:events()},null,2))
 assert.equal(response.error?.code,-32803,'discovering namespace command must reject')
 await session.close()
})
