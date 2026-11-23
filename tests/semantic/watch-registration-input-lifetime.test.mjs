import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

for (const completeSdk of [false, true])
for (const outcome of ["accepted", "rejected"])
  test(`delayed ${outcome} watch registration cannot authorize stale disk input or block preparation (completeSdk=${completeSdk})`,
    { timeout: 40_000 }, async t => {
      const { f, folder, sourceRoot, main, global } = createSdkPartialScopeFixture(t)
      if (completeSdk) {
        const file = path.join(f.workspace, "build-profile.json5")
        const profile = JSON.parse(fs.readFileSync(file, "utf8"))
        profile.app.products[0].compileSdkVersion = 24
        fs.writeFileSync(file, JSON.stringify(profile))
      }
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } },
        capabilities: { workspace: { didChangeWatchedFiles: { dynamicRegistration: true } } } })
      const registration = await f.session.transport.serverRequest("client/registerCapability", () => true, 10_000)
      assert.ok(registration.params.registrations.some(item => item.method === "workspace/didChangeWatchedFiles"))
      // Keep this real client request outstanding through initialization and a query.
      const terminal = await f.session.transport.notification("arkts/semanticPreparation",
        m => m.params.phase === "complete", 20_000)
      assert.equal(terminal.params.report.semanticState, completeSdk ? "ready" : "partial")
      const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
        position: positionAt(main, main.indexOf("GlobalThing") + 1) }
      const expected = line => [{ uri: f.uri(`${folder}/Global.ets`), range: {
        start: { line, character: 6 }, end: { line, character: 17 } } }]
      const warm = await f.session.request("textDocument/typeDefinition", params)
      assert.equal(warm.error, undefined, JSON.stringify(warm))
      assert.deepEqual(warm.result, expected(0))
      // This edit belongs to the registration gap: deliberately send no watch event.
      fs.writeFileSync(path.join(sourceRoot, "Global.ets"), "\n" + global)
      f.session.transport.send({ jsonrpc: "2.0", id: registration.id,
        ...(outcome === "accepted" ? { result: null } : { error: { code: -32603, message: "test client cannot watch" } }) })
      const first = await f.session.request("textDocument/typeDefinition", params)
      if (first.error) {
        assert.equal(first.error.code, -32803, JSON.stringify(first))
        assert.equal(first.result, undefined)
      } else assert.deepEqual(first.result, expected(1))
      const recovered = await f.session.request("textDocument/typeDefinition", params)
      assert.equal(recovered.error, undefined, JSON.stringify(recovered))
      assert.deepEqual(recovered.result, expected(1))
      t.diagnostic(JSON.stringify({ outcome, completeSdk, registrationId: registration.id, first, recovered,
        workers: f.events().filter(row => row.event === "semantic.worker.started").length }))
      assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
      assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    })

for(const mutation of ['edit','move'])for(const outcome of ['accepted','rejected'])
 test(`actual initial strong scan gap ${mutation}/${outcome}`,{timeout:40000},async t=>{
  const {f,folder,sourceRoot,main,global}=createSdkPartialScopeFixture(t,undefined,{
   NODE_OPTIONS:`--require=${JSON.stringify(path.resolve("tests/fixtures/watch-initial-scan-gap.cjs"))}`})
  const config=path.join(f.workspace,'build-profile.json5'),profile=JSON.parse(fs.readFileSync(config,'utf8'))
  profile.app.products[0].compileSdkVersion=24;fs.writeFileSync(config,JSON.stringify(profile))
  await f.session.initialize({initializationOptions:{sdk:{path:f.sdk}},
   capabilities:{workspace:{didChangeWatchedFiles:{dynamicRegistration:true}}}})
  const registration=await f.session.transport.serverRequest('client/registerCapability',()=>true,10000)
  assert.ok(registration.params.registrations.some(r=>r.method==='workspace/didChangeWatchedFiles'))
  const captured=path.join(f.directory,'scan-gap-captured.json'),release=path.join(f.directory,'scan-gap-release')
  try{
   const start=performance.now()
   while(!fs.existsSync(captured)&&performance.now()-start<8000)await delay(10)
   assert.ok(fs.existsSync(captured),'actual first strong catalog captured before publication')
   const source=path.join(sourceRoot,'Global.ets')
   if(mutation==='move')fs.renameSync(source,path.join(sourceRoot,'MovedGlobal.ets'))
   fs.writeFileSync(path.join(sourceRoot,mutation==='move'?'MovedGlobal.ets':'Global.ets'),'\n'+global)
   // Actual disk mutation, no workspace/didChangeWatchedFiles; registration is still outstanding.
   f.session.transport.send({jsonrpc:'2.0',id:registration.id,...(outcome==='accepted'?{result:null}:
    {error:{code:-32603,message:'controlled client cannot register watch'}})})
  }finally{fs.writeFileSync(release,'released')}
  const terminal=await f.session.transport.notification('arkts/semanticPreparation',m=>m.params.phase==='complete',20000)
  const params={textDocument:{uri:f.uri(`${folder}/Main.ets`)},position:positionAt(main,main.indexOf('GlobalThing')+1)}
  const expected=[{uri:f.uri(`${folder}/${mutation==='move'?'MovedGlobal.ets':'Global.ets'}`),range:{
   start:{line:1,character:6},end:{line:1,character:17}}}]
  const queries=[]
  for(let attempt=0;attempt<2;attempt++){
   const begin=performance.now(),result=await f.session.request('textDocument/typeDefinition',params)
   queries.push({attempt,durationMs:performance.now()-begin,result})
   if(attempt===0&&result.error){assert.equal(result.error.code,-32803);assert.equal(result.result,undefined)}
   else{assert.equal(result.error,undefined,JSON.stringify(result));assert.deepEqual(result.result,expected)}
  }
  const events=fs.readFileSync(path.join(f.directory,'scan-gap-events.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(events.filter(e=>e.event==='original-scan-captured').length,1)
  assert.equal(events.filter(e=>e.event==='original-scan-released').length,1)
  assert.equal(f.events().filter(e=>e.event==='semantic.worker.started').length,1)
  t.diagnostic(JSON.stringify({mutation,outcome,terminal:terminal.params,queries,events}))
  assert.deepEqual((await f.session.close()).exit,{code:0,signal:null})
 })
