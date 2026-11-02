import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildDocumentStoreDriver } from './support/build-document-store-driver.mjs'

test('workspace capture copies cached catalog identity without scanning or rebasing absence', t => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'arkts-catalog-stamp-'))
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}))
 const workspace=path.join(directory,'workspace');fs.mkdirSync(workspace)
 const main=path.join(workspace,'Main.ets'), other=path.join(workspace,'Other.ets')
 fs.writeFileSync(main,'export const main = 1\n');fs.writeFileSync(other,'export const other = 1\n')
 const {SemanticDocumentStore,WORKSPACE_CATALOG_STAMP}=buildDocumentStoreDriver(directory)
 assert.equal(typeof WORKSPACE_CATALOG_STAMP,'symbol')
 let scans=0
 const store=new SemanticDocumentStore({enumerateWorkspaceSources:function*(){scans++;yield main;yield other}})
 t.after(()=>store.dispose())
 const position={path:main,workspaceRoot:workspace,line:1,column:1}
 const absent=store.prepare(position,false)
 assert.equal(scans,0,'capturing an absent catalog must not enumerate it')
 assert.deepEqual(absent[WORKSPACE_CATALOG_STAMP],{canonicalRootId:fs.realpathSync(workspace),revision:null})
 assert.ok(Object.isFrozen(absent[WORKSPACE_CATALOG_STAMP]))
 const full=store.prepareRoot(workspace), before=scans
 const scoped=store.prepare(position,false), stamp=scoped[WORKSPACE_CATALOG_STAMP]
 assert.equal(scans,before,'scoped capture copies existing catalog only')
 assert.equal(scoped.projectMembership,undefined)
 assert.equal(stamp.revision,full.projectMembership.revision)
 assert.equal(stamp.canonicalRootId,full.canonicalRootId)
 assert.equal({...scoped}[WORKSPACE_CATALOG_STAMP],stamp,'local root projection retains authority')
 assert.equal(absent[WORKSPACE_CATALOG_STAMP].revision,null,'later catalog creation cannot restamp an earlier view')
 fs.writeFileSync(other,'export const other = 12345\n')
 const changed=store.prepareRoot(workspace)
 assert.notEqual(changed[WORKSPACE_CATALOG_STAMP].revision,stamp.revision)
 assert.equal(scoped[WORKSPACE_CATALOG_STAMP],stamp,'subsequent refresh cannot mutate original input')
})

test('evicting a cached catalog leaves an explicit absent stamp without mutating older captures',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'arkts-catalog-eviction-'))
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}))
 const {SemanticDocumentStore,WORKSPACE_CATALOG_STAMP}=buildDocumentStoreDriver(directory)
 const store=new SemanticDocumentStore();t.after(()=>store.dispose())
 const roots=[]
 for(let n=0;n<5;n++){const root=path.join(directory,`root${n}`);fs.mkdirSync(root);fs.writeFileSync(path.join(root,'Main.ets'),'export const value = 1\n');roots.push(root)}
 const first=store.prepareRoot(roots[0]),stamp=first[WORKSPACE_CATALOG_STAMP]
 assert.equal(typeof stamp.revision,'number')
 for(const root of roots.slice(1))store.prepareRoot(root)
 const after=store.prepare({path:path.join(roots[0],'Main.ets'),workspaceRoot:roots[0],line:1,column:1},false)
 assert.equal(after[WORKSPACE_CATALOG_STAMP].revision,null)
 assert.equal(first[WORKSPACE_CATALOG_STAMP],stamp)
})
