import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp} from 'node:fs/promises';import path from 'node:path';
import {MemoryStore,parseMemoryCommand} from '../src/memory.mjs';import {createCharacterChat} from '../src/chat.mjs';import {initialState,reduce,summary,normalizeState,MINUTE} from '../src/model.mjs';import {buildPersona} from '../src/persona.mjs';import {startController} from '../src/controller.mjs';
async function memories(){const dir=await mkdtemp(path.join(process.cwd(),'.test-data-'));return new MemoryStore(path.join(dir,'memory.json')).load();}
test('长期记住、改名、忘记：有原话依据，跨重开保留，旧名字退出近期上下文',async()=>{
 let memory=await memories();const command=parseMemoryCommand('记住，我叫阿葵，我喜欢咖啡');assert.equal(command.facts.length,2);await memory.remember(command.facts);await memory.record('我是谁','你叫阿葵');
 memory=await new MemoryStore(memory.file).load();assert.equal((await memory.snapshot()).facts.length,2);await memory.remember(parseMemoryCommand('以后叫我小林').facts);let s=await memory.snapshot();assert.equal(s.facts.find(x=>x.key==='name').value,'小林');assert.equal(s.recent.length,0);assert.equal(s.facts.find(x=>x.key==='name').evidence,'以后叫我小林');
 await memory.record('小林回来了','欢迎小林');await memory.forget(parseMemoryCommand('忘掉我的称呼'));s=await memory.snapshot();assert.ok(!s.facts.some(x=>x.key==='name'));assert.equal(s.recent.length,0);assert.equal(s.facts[0].value,'喜欢咖啡');
 assert.equal(parseMemoryCommand('他说“我叫小明”'),null);assert.equal(parseMemoryCommand('你说我喜欢咖啡'),null);assert.equal(parseMemoryCommand('忘掉全部记忆').kind,'clarify');
});
test('同一偏好改口更新；长对话有限窗口；清空短期仍保留长期；并发修改阻止旧回复回填',async()=>{
 const memory=await memories();await memory.remember(parseMemoryCommand('记住，我喜欢咖啡').facts);await memory.remember(parseMemoryCommand('记住，我现在不喜欢咖啡了').facts);assert.equal((await memory.snapshot()).facts.length,1);assert.equal((await memory.snapshot()).facts[0].value,'不喜欢咖啡');
 for(let i=0;i<15;i++)await memory.record('问'+i,'答'+i);assert.equal((await memory.snapshot()).recent.length,24);const revision=(await memory.snapshot()).revision;await memory.clearRecent();assert.equal((await memory.snapshot()).facts.length,1);await assert.rejects(memory.record('旧问题','旧回复',false,revision),/记忆刚刚更新/);
});
test('真实聊天使用档案和当前关系，模型建议不写记忆，失败不伪造回复；哈气遵守安慰和三轮冷却',async()=>{
 const memory=await memories();let state=initialState();const dispatch=async e=>{state=reduce(state,e);return summary(state);};const prompts=[];let failing=false;
 const chat=createCharacterChat({memory,dispatch,getState:()=>summary(state),generate:async p=>{prompts.push(p);if(failing)throw new Error('服务繁忙');return JSON.stringify({reply:'我记得。',emotion:'hiss',memory_candidates:[{value:'用户喜欢奶茶'}]});}});
 await chat.send('记住，我叫阿葵');assert.equal(prompts.length,0);await memory.clearRecent();await chat.send('还记得我叫什么？');assert.match(prompts.at(-1).system,/阿葵/);assert.equal(state.action.animation,'哈气');
 await chat.send('继续说');assert.equal(state.action.animation,null);await chat.send('我有点累');assert.match(prompts.at(-1).system,/安慰模式/);assert.equal(state.action.animation,null);assert.equal((await memory.snapshot()).facts.length,1);
 failing=true;const before=state.sequence;await assert.rejects(chat.send('再说一句'),/服务繁忙/);assert.equal(state.sequence,before);await chat.flush();
});
test('成长阶段有行为解锁和真实里程碑，临时掉分不收回；旧存档保留数值与已解锁动作',()=>{
 const now=1000000;let s=initialState(now);s.affinity=39;s=reduce(s,{type:'play'},now);assert.equal(summary(s,now).relationship.name,'认可');assert.ok(s.unlockedActions.includes('蹭头撒娇'));assert.ok(s.milestones.some(x=>x.key==='stage-2'));
 s.affinity=70;s=reduce(s,{type:'chat-complete',chatId:'one'},now+1);assert.equal(s.relationshipStage,2);s=reduce(s,{type:'feed'},now+2);assert.equal(s.relationshipStage,3);assert.ok(s.unlockedActions.includes('翻肚皮'));s.affinity=10;s=reduce(s,{type:'tick'},now+3);assert.equal(s.relationshipStage,3);
 const old={...initialState(now),affinity:52};delete old.relationshipVersion;delete old.relationshipStage;old.history=[{at:now-100,type:'fed',detail:'吃过一份'}];const migrated=normalizeState(old,now);assert.equal(migrated.affinity,52);assert.ok(migrated.unlockedActions.includes('翻肚皮'));assert.equal(migrated.milestones[0].at,now-100);
});
test('空闲哈气与欢迎有冷却，专注中不随机打扰，设置可关闭',()=>{
 const now=1000000;let s=initialState(now);s=reduce(s,{type:'idle-hiss'},now+16*MINUTE);assert.equal(s.action.animation,'哈气');const id=s.action.id;s=reduce(s,{type:'idle-hiss'},now+17*MINUTE);assert.equal(s.action.id,id);
 s=reduce(s,{type:'settings',randomHiss:false},now+18*MINUTE);s=reduce(s,{type:'idle-hiss'},now+40*MINUTE);assert.equal(s.action.id,id);
 let focused=reduce(initialState(now),{type:'focus-start'},now);focused=reduce(focused,{type:'idle-hiss'},now+16*MINUTE);assert.equal(focused.action.animation,'睡觉');
 s.relationshipStage=2;s.lastSeenAt=now;s=reduce(s,{type:'return'},now+31*MINUTE);assert.match(s.action.text,/回来了/);
});
test('记忆HTTP闭环、页面、新会话与重开后回忆，完成待办产生真实里程碑',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.test-data-'));let service=await startController({dataDir:dir,hostBase:'http://127.0.0.1:1',menus:false,chatGenerate:async p=>JSON.stringify({reply:p.system.includes('阿葵')?'阿葵，我记住了。':'我没有你的称呼记录。',emotion:'soft'})});
 const api=async(route,method='GET',body)=>{const r=await fetch(service.endpoint+route,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.json();};
 try{await api('/chat','POST',{text:'记住，我叫阿葵'});await api('/context/reset','POST',{});assert.match((await api('/chat','POST',{text:'我叫什么？'})).text,/阿葵/);assert.equal((await fetch(service.endpoint+'/memories')).status,200);
  const todo=(await api('/todos','POST',{text:'做一件事'})).todo;await api('/todos/'+todo.id,'PATCH',{done:true});assert.ok((await api('/state')).state.milestones.some(x=>x.key==='first-todo'));
  await service.close();service=await startController({dataDir:dir,hostBase:'http://127.0.0.1:1',menus:false,chatGenerate:async p=>JSON.stringify({reply:p.system.includes('阿葵')?'阿葵。':'不记得称呼。'})});assert.match((await api('/chat','POST',{text:'还记得吗？'})).text,/阿葵/);const fact=(await api('/memory')).facts[0];await api('/memory/'+fact.id,'DELETE');assert.equal((await api('/memory')).recentMessages,0);const unknown=await api('/chat','POST',{text:'我叫什么？'});assert.match(unknown.text,/现在没有/);assert.equal(unknown.mode,'memory-answer');
 }finally{await service.close();}
});
