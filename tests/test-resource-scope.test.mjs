import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

test("owned cleanup closes every resource before removal even when the body and an earlier close fail", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resource-cleanup-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const evidence = path.join(directory, "events.jsonl"), file = path.join(directory, "failure.test.mjs")
  const helper = pathToFileURL(path.resolve("tests/support/test-resource-scope.mjs")).href
  fs.writeFileSync(file, `import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {createTestResourceScope} from ${JSON.stringify(helper)};
const record=x=>fs.appendFileSync(${JSON.stringify(evidence)},JSON.stringify(x)+String.fromCharCode(10));
test('controlled failed body',t=>{
 const track=createTestResourceScope(t,()=>{record('remove');throw Error('controlled removal failure')});
 track(()=>{record('close-one');throw Error('controlled close failure')});
 track(()=>record('close-two'));
 record('body');assert.fail('controlled primary failure');
});`)
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, ["--test", file], { encoding: "utf8", timeout: 5000, env })
  assert.equal(result.status, 1, result.stderr)
  assert.deepEqual(fs.readFileSync(evidence, "utf8").trim().split("\n").map(JSON.parse),
    ["body", "close-two", "close-one", "remove"])
  assert.match(result.stdout, /controlled close failure/)
  assert.match(result.stdout, /controlled removal failure/)
})
