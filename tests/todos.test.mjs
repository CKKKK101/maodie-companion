import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir} from 'node:fs/promises';import path from 'node:path';
import {TodoStore} from '../src/todos.mjs';import {startController} from '../src/controller.mjs';
test('待办到点出现，确认后重启不重复，改期可再次提醒，完成与删除会撤销提醒',async()=>{
  let now=100000;const dir=await mkdtemp(path.join(process.cwd(),'.test-data-'));const file=path.join(dir,'todos.json');let store=await new TodoStore(file,()=>now).load();
  const a=await store.create({text:'喝水',dueAt:now+10000}),b=await store.create({text:'写教程'});assert.equal((await store.due()).length,0);
  now+=10000;assert.equal((await store.due())[0].id,a.id);assert.equal(await store.acknowledge(a.id,a.dueAt+1),false);assert.equal((await store.due()).length,1);
  await store.acknowledge(a.id,a.dueAt);store=await new TodoStore(file,()=>now).load();assert.equal((await store.list()).length,2);assert.equal((await store.due()).length,0);
  await store.patch(a.id,{dueAt:now+5000});now+=5000;assert.equal((await store.due()).length,1);await store.patch(a.id,{done:true});assert.equal((await store.due()).length,0);
  await store.patch(b.id,{dueAt:now});assert.equal((await store.due()).length,1);await store.remove(b.id);assert.equal((await store.due()).length,0);
  assert.throws(()=>store.create({text:'',dueAt:now}));assert.throws(()=>store.create({text:'a',dueAt:'明天'}));
});
test('待办HTTP与原面板协议兼容，串行保存，错误来源拒绝，损坏文件留副本',async()=>{
  let now=1000;const dir=await mkdtemp(path.join(process.cwd(),'.test-data-'));const service=await startController({dataDir:dir,hostBase:'http://127.0.0.1:1',menus:false,clock:()=>now});
  const call=async(route,method='GET',body)=>{const r=await fetch(service.endpoint+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};};
  try{
    const {todo}=await call('/todos','POST',{text:'演示提醒',dueAt:2000});assert.equal((await call('/todos')).todos.length,1);now=2000;assert.equal((await call('/reminders')).todos.length,1);
    assert.equal((await call('/reminders/'+todo.id+'/ack','POST',{dueAt:2000})).acknowledged,true);assert.equal((await call('/reminders')).todos.length,0);
    assert.equal((await call('/todos/'+todo.id,'PATCH',{done:true})).todo.done,true);assert.equal((await call('/todos/'+todo.id,'DELETE')).removed,1);
    const denied=await fetch(service.endpoint+'/todos',{headers:{Origin:'https://example.com'}});assert.equal(denied.status,403);
    const added=await Promise.all(Array.from({length:6},(_,i)=>call('/todos','POST',{text:'事项'+i})));assert.equal(new Set(added.map(r=>r.todo.id)).size,6);assert.equal((await call('/todos')).todos.length,6);
  }finally{await service.close();}
  await writeFile(path.join(dir,'todos.json'),'bad');const fresh=await new TodoStore(path.join(dir,'todos.json')).load();assert.ok(fresh.warning);assert.ok((await readdir(dir)).some(x=>x.includes('.corrupt-')));
});
