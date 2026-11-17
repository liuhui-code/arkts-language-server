import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectRoot } from './support/lsp-process.mjs';
import { spawnSync } from 'node:child_process';
const observer = path.join(projectRoot, 'tests/fixtures/index/native-child-lifetime-audit.cjs');
const native = process.env.ARKTS_TEST_NATIVE_BINARY
  ?? path.join(projectRoot, 'target/release', process.platform === 'win32' ? 'arkts-index-sidecar.exe' : 'arkts-index-sidecar');
const childCode = `
const cp=require('node:child_process'), realSpawn=cp.spawn;
const raw={write:[],end:[]};
cp.spawn=function(...args){
 const child=Reflect.apply(realSpawn,this,args);
 for(const method of ['write','end']){
  const original=child.stdin[method];
  child.stdin[method]=function(...args){
   const result=Reflect.apply(original,this,args);
   raw[method].push(method==='end'?result===this:result);
   return result;
  };
 }
 return child;
};
require(process.env.ARKTS_TEST_STREAM_OBSERVER);
const {spawn}=cp;
const input=Buffer.from(JSON.stringify({protocol:1,id:1,method:'observer-unsupported',params:{text:'x'.repeat(65536)+'🙂'}})+'\\n');
const split=input.indexOf(Buffer.from('🙂'))+3;
const child=spawn(process.env.ARKTS_DIAGNOSTIC_NATIVE,[],{stdio:['pipe','pipe','pipe'],shell:false});
const chunks=[];let writes=0,ends=0;
child.stdout.on('data',x=>chunks.push(x));child.stderr.resume();
child.on('error',e=>{process.stderr.write(e.stack);process.exitCode=1});
const writeReturn=child.stdin.write(input.subarray(0,split),()=>writes++);
const endReturn=child.stdin.end(input.subarray(split),()=>ends++)===child.stdin;
child.on('close',(code,signal)=>process.stdout.write(JSON.stringify({pid:child.pid,code,signal,wire:Buffer.concat(chunks).toString('utf8'),writeReturn,endReturn,rawWriteReturn:raw.write[0],rawEndReturn:raw.end[0],writes,ends,input:input.toString('utf8')})));
`;
function exercise(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkts-observer-portable-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const owner = path.join(root, 'owner.ndjson'), wire = path.join(root, 'wire.ndjson');
  const run = spawnSync(process.execPath, ['-e', childCode], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: undefined,
      ARKTS_DIAGNOSTIC_NATIVE: native, ARKTS_TEST_NATIVE_BINARY: native, ARKTS_TEST_STREAM_OBSERVER: observer,
      ARKTS_TEST_NATIVE_OWNER_AUDIT: owner, ARKTS_TEST_NATIVE_WIRE_AUDIT: wire,
      ARKTS_INDEX_CACHE_DIR: path.join(root, 'index') } });
  assert.equal(run.status, 0, run.stderr);assert.equal(run.signal, null);
  const response = JSON.parse(run.stdout);
  assert.equal(response.code, 0);assert.equal(response.signal, null);
  assert.equal(response.endReturn, true);assert.equal(response.writes, 1);assert.equal(response.ends, 1);
  assert.equal(typeof response.writeReturn, 'boolean');
  assert.equal(response.writeReturn, response.rawWriteReturn, 'preserve the real underlying backpressure result');
  assert.equal(response.endReturn, response.rawEndReturn, 'preserve the real underlying end receiver');
  return { root, owner, wire, response };
}
test('existing lifetime observer preserves real Native output and close identity', t => {
  const { owner, response } = exercise(t);
  const rows = fs.readFileSync(owner, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.filter(x=>x.kind==='identity').length,1);
  assert.equal(rows.find(x=>x.kind==='identity').pid,response.pid);
  assert.deepEqual(rows.filter(x=>x.kind==='exit').map(x=>[x.code,x.signal]),[[0,null]]);
  assert.equal(fs.readFileSync(owner+'.stdout.raw','utf8'),response.wire);
});
test('portable passive audit captures split UTF8 write/end and unchanged responses', t => {
  const { wire, response } = exercise(t);
  assert.ok(fs.existsSync(wire), 'wire audit must exist for the configured real Native child');
  const rows = fs.readFileSync(wire, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.filter(x=>x.kind==='request').map(x=>x.frame),[JSON.parse(response.input)]);
  assert.deepEqual(rows.filter(x=>x.kind==='response').map(x=>x.frame),response.wire.trim().split('\n').map(JSON.parse));
  assert.equal(rows.filter(x=>x.kind==='identity').length,1);
  assert.deepEqual(rows.filter(x=>x.kind==='exit').map(x=>[x.code,x.signal]),[[0,null]]);
  assert.equal(rows.filter(x=>x.kind==='audit-error').length,0);
});
