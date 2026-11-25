import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {createSdkPartialScopeFixture} from '../support/sdk-partial-scope-lsp.mjs'
import {initializeReadinessFixture} from '../support/semantic-readiness-lsp.mjs'
import {positionAt} from '../support/resident-interactive-lsp.mjs'

test('first and hot proven references reuse original guarded source digests while still checking physical membership',
 {timeout:30_000},async t=>{
 const {f,folder,sourceRoot}=createSdkPartialScopeFixture(t,undefined,{
  NODE_OPTIONS:`--require=${JSON.stringify(path.resolve('tests/fixtures/reference-source-digest-work.cjs'))}`})
 for(const name of fs.readdirSync(sourceRoot))fs.unlinkSync(path.join(sourceRoot,name))
 const text='export function run() { let local = 1; return local + local }\n'
 fs.writeFileSync(path.join(sourceRoot,'Main.ets'),text)
 for(let i=0;i<96;i++)fs.writeFileSync(path.join(sourceRoot,`DigestNoise${i}.ts`),`export const noise${i}=1\n`)
 await initializeReadinessFixture(f,97)
 const uri=f.uri(`${folder}/Main.ets`),params={textDocument:{uri},position:positionAt(text,text.indexOf('local')+1),context:{includeDeclaration:true}}
 const work=()=>fs.readFileSync(path.join(f.directory,'digest-work.ndjson'),'utf8').trim().split('\n').map(JSON.parse)
 const prepared=work().length
 const first=await f.session.request('textDocument/references',params)
 assert.equal(first.error,undefined,JSON.stringify(first));assert.equal(first.result.length,3)
 assert.equal(work().slice(prepared).filter(e=>e.event==='openSync').length,0,'first namespace admission must reuse actual initialization reads, not reopen unchanged source contents')
 const before=work().length,hits=f.events().filter(e=>e.event==='references.cache.hit').length
 const repeat=await f.session.request('textDocument/references',params)
 assert.equal(repeat.error,undefined,JSON.stringify(repeat));assert.deepEqual(repeat.result,first.result)
 assert.equal(f.events().filter(e=>e.event==='references.cache.hit').length,hits+1)
 const hot=work().slice(before)
 assert.ok(hot.some(e=>e.event==='lstatSync'),'reuse must retain actual fresh leaf checks')
 assert.equal(hot.filter(e=>e.event==='source-identity-string').length,0,'completed native numeric observations need no duplicate path/string identity records')
 assert.equal(hot.filter(e=>e.event==='openSync').length,0,'unchanged nondependent source contents must not be reopened to recreate the same namespace digest')
 assert.deepEqual((await f.session.close()).exit,{code:0,signal:null})
})
