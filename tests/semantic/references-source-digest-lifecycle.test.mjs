import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {createSdkPartialScopeFixture} from '../support/sdk-partial-scope-lsp.mjs'
import {initializeReadinessFixture} from '../support/semantic-readiness-lsp.mjs'
import {positionAt} from '../support/resident-interactive-lsp.mjs'

test('the first query rereads a silently changed source while retaining unchanged initialization digests',
 {timeout:30_000},async t=>{
 const {f,folder,sourceRoot}=createSdkPartialScopeFixture(t,undefined,{
  NODE_OPTIONS:`--require=${JSON.stringify(path.resolve('tests/fixtures/reference-source-digest-work.cjs'))}`})
 for(const name of fs.readdirSync(sourceRoot))fs.unlinkSync(path.join(sourceRoot,name))
 const text='export function run() { let local = 1; return local + local }\n'
 fs.writeFileSync(path.join(sourceRoot,'Main.ets'),text)
 for(let i=0;i<16;i++)fs.writeFileSync(path.join(sourceRoot,`DigestNoise${i}.ts`),`export const noise${i}=1\n`)
 await initializeReadinessFixture(f,17)
 const file=path.join(sourceRoot,'DigestNoise0.ts'),stat=fs.statSync(file)
 fs.writeFileSync(file,'export const noise0=2\n');fs.utimesSync(file,stat.atime,stat.mtime)
 const work=()=>fs.readFileSync(path.join(f.directory,'digest-work.ndjson'),'utf8').trim().split('\n').map(JSON.parse)
 const before=work().length,uri=f.uri(`${folder}/Main.ets`)
 const result=await f.session.request('textDocument/references',{textDocument:{uri},
  position:positionAt(text,text.indexOf('local')+1),context:{includeDeclaration:true}})
 assert.equal(result.error,undefined,JSON.stringify(result))
 assert.deepEqual(result.result,[...text.matchAll(/\blocal\b/g)].map(m=>({uri,range:{
  start:positionAt(text,m.index),end:positionAt(text,m.index+5)}})))
 const opened=work().slice(before).filter(e=>e.event==='openSync').map(e=>e.file)
 assert.deepEqual([...new Set(opened)],[file],'current proof must reject only the changed original token')
 assert.deepEqual((await f.session.close()).exit,{code:0,signal:null})
})

test('a silent same-size restored-mtime edit rereads only changed source content and invalidates the old answer',
 {timeout:30_000},async t=>{
 const {f,folder,sourceRoot}=createSdkPartialScopeFixture(t,undefined,{
  NODE_OPTIONS:`--require=${JSON.stringify(path.resolve('tests/fixtures/reference-source-digest-work.cjs'))}`})
 for(const name of fs.readdirSync(sourceRoot))fs.unlinkSync(path.join(sourceRoot,name))
 const text='export function run() { let local = 1; return local + local }\n'
 fs.writeFileSync(path.join(sourceRoot,'Main.ets'),text)
 for(let i=0;i<32;i++)fs.writeFileSync(path.join(sourceRoot,`DigestNoise${i}.ts`),`export const noise${i}=1\n`)
 await initializeReadinessFixture(f,33)
 const uri=f.uri(`${folder}/Main.ets`),params={textDocument:{uri},position:positionAt(text,text.indexOf('local')+1),context:{includeDeclaration:true}}
 const request=async()=>{const r=await f.session.request('textDocument/references',params);assert.equal(r.error,undefined,JSON.stringify(r));assert.equal(r.result.length,3);return r}
 await request();await request()
 const hits=()=>f.events().filter(e=>e.event==='references.cache.hit').length
 const work=()=>fs.readFileSync(path.join(f.directory,'digest-work.ndjson'),'utf8').trim().split('\n').map(JSON.parse)
 const before=work().length,hitBefore=hits(),file=path.join(sourceRoot,'DigestNoise0.ts'),stat=fs.statSync(file)
 fs.writeFileSync(file,'export const noise0=2\n');fs.utimesSync(file,stat.atime,stat.mtime)
 await request()
 assert.equal(hits(),hitBefore,'silent disk content replacement must not reuse the former root proof')
 const opened=work().slice(before).filter(e=>e.event==='openSync')
 assert.ok(opened.some(e=>e.file===file),'changed content must be read under new guards')
 assert.deepEqual([...new Set(opened.map(e=>e.file))],[file],'unmodified siblings keep their original derived digests')
 const again=work().length;await request();assert.equal(hits(),hitBefore+1)
 assert.equal(work().slice(again).filter(e=>e.event==='openSync').length,0)
 assert.deepEqual((await f.session.close()).exit,{code:0,signal:null})
})

test('an edit inside retained-digest reuse still fails the original final physical fence',
 {timeout:30_000},async t=>{
 const {f,folder,sourceRoot}=createSdkPartialScopeFixture(t,undefined,{
  NODE_OPTIONS:`--require=${JSON.stringify(path.resolve('tests/fixtures/reference-source-digest-work.cjs'))}`})
 for(const name of fs.readdirSync(sourceRoot))fs.unlinkSync(path.join(sourceRoot,name))
 const text='export function run() { let local = 1; return local + local }\n'
 const file=path.join(sourceRoot,'Main.ets');fs.writeFileSync(file,text)
 fs.writeFileSync(path.join(sourceRoot,'DigestNoise0.ts'),'export const noise=1\n')
 await initializeReadinessFixture(f,2)
 const uri=f.uri(`${folder}/Main.ets`),params={textDocument:{uri},position:positionAt(text,text.indexOf('local')+1),context:{includeDeclaration:true}}
 const first=await f.session.request('textDocument/references',params);assert.equal(first.error,undefined);assert.equal(first.result.length,3)
 const changed=text.replace('local + local','local + local + local')
 fs.writeFileSync(path.join(f.directory,'digest-race-arm.json'),JSON.stringify({file,text:changed}))
 const stale=await f.session.request('textDocument/references',params)
 assert.equal(stale.error?.code,-32803,JSON.stringify(stale))
 assert.equal(fs.existsSync(path.join(f.directory,'digest-race-arm.json')),false,'controlled race must actually execute')
 assert.equal(f.events().filter(e=>e.event==='references.cache.hit').length,0)
 const next=await f.session.request('textDocument/references',params)
 assert.equal(next.error,undefined,JSON.stringify(next));assert.equal(next.result.length,4)
 assert.deepEqual((await f.session.close()).exit,{code:0,signal:null})
})
