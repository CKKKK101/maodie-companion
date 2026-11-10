import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';import path from 'node:path';
import {startController} from '../src/controller.mjs';
import {prepareDesktopExit,validateDesktopParent,shutdownScript} from '../src/desktop-exit.mjs';
const executable='C:\\Users\\测试用户\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe';
const parent={pid:4321,path:executable,started:'638900000000000000'};
test('退出仅识别当前宿主父进程；执行前检查创建时间，工作进程隐藏启动',async()=>{
 assert.deepEqual(validateDesktopParent(parent,{parentPid:4321,executable}),parent);
 for(const changed of [{...parent,pid:1},{...parent,path:'C:\\Windows\\explorer.exe'},{...parent,started:'invalid'}])assert.throws(()=>validateDesktopParent(changed,{parentPid:4321,executable}),/宿主/);
 const runs=[];const shutdown=await prepareDesktopExit({platform:'win32',parentPid:4321,executable,dataDir:'C:\\Pet Data',petExecutable:'C:\\Pet\\electron.exe',run:async(file,args,options)=>{runs.push({file,args,options});return {stdout:runs.length===1?JSON.stringify(parent):'7654'};}});
 assert.equal(runs.length,1);assert.match(Buffer.from(runs[0].args.at(-1),'base64').toString('utf16le'),/UTF8Encoding/);await shutdown();assert.equal(runs.length,2);assert.ok(runs.every(x=>x.options.windowsHide));
 const launch=Buffer.from(runs[1].args.at(-1),'base64').toString('utf16le');assert.match(launch,/-WindowStyle Hidden/);assert.match(launch,/Start-Process/);
 const script=shutdownScript(parent,{petExecutable:'C:\\Pet\\electron.exe',resultFile:"C:\\Pet's Data\\exit-result.json"});assert.match(script,/CreationDate/);assert.match(script,/HashSet/);assert.match(script,/\$owned.Contains/);assert.ok(script.includes("Pet''s Data"));assert.doesNotMatch(script,/Stop-Process -Name|taskkill/);
 await assert.rejects(()=>prepareDesktopExit({platform:'linux'}),/Windows/);
});
test('退出请求去重，先保存记忆成长待办，再告别并关闭服务；其他页面不能触发退出',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.test-data-exit-'));let prepared=0,stopped=0,resolveStopped;const done=new Promise(r=>resolveStopped=r);
 const service=await startController({dataDir:dir,hostBase:'http://127.0.0.1:1',menus:false,goodbyeMs:80,prepareQuit:async()=>{prepared++;return {shutdown:async()=>{stopped++;const state=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8'));const memory=JSON.parse(await readFile(path.join(dir,'memory.json'),'utf8'));const todos=JSON.parse(await readFile(path.join(dir,'todos.json'),'utf8'));resolveStopped({state,memory,todos});}};}});
 const post=(route,body,headers={})=>fetch(service.endpoint+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/quit',{}, {Origin:'https://unrelated.example'})).status,403);assert.equal(prepared,0);assert.equal((await fetch(service.endpoint+'/quit')).status,404);
  await post('/event',{type:'feed'});await post('/memory',{text:'我叫退出测试用户'});await post('/todos',{text:'退出测试待办',dueAt:Date.now()+60000});
  const responses=await Promise.all([post('/quit',{}),post('/quit',{})]);for(const r of responses){const d=await r.json();assert.equal(d.saved,true);assert.equal(d.state.exit.status,'goodbye');assert.match(d.state.action.text,/拜拜/);}
  assert.equal(prepared,1);assert.equal(stopped,0);assert.equal((await post('/event',{type:'poke'})).status,409);
  const saved=await done;assert.equal(stopped,1);assert.equal(saved.state.affinity,15);assert.equal(saved.state.food,2);assert.equal(saved.memory.facts[0].value,'退出测试用户');assert.match(JSON.stringify(saved.todos),/退出测试待办/);
 }finally{await service.close();}
 await assert.rejects(()=>fetch(service.endpoint+'/health'));
});
test('退出准备失败会提示并允许重试；普通关闭取消待执行退出',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.test-data-exit-'));let allowed=false,stopped=0;
 const service=await startController({dataDir:dir,hostBase:'http://127.0.0.1:1',menus:false,goodbyeMs:5000,prepareQuit:async()=>{if(!allowed)throw Error('退出准备失败');return {shutdown:async()=>stopped++};}});
 const quit=()=>fetch(service.endpoint+'/quit',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 try{const failed=await quit();assert.equal(failed.status,400);assert.equal(service.getState().exit.status,'error');assert.equal(service.getState().action,null);allowed=true;assert.equal((await quit()).status,200);assert.equal(stopped,0);assert.match(await (await fetch(service.endpoint+'/goodbye')).text(),/拜拜/);assert.match((await fetch(service.endpoint+'/exit-ui.js')).headers.get('content-type'),/javascript/);}finally{await service.close();}assert.equal(stopped,0);
});
