import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reduce,settle,summary,MINUTE} from '../src/model.mjs';
import {normalizeState} from '../src/model.mjs';
import {LifeStore} from '../src/store.mjs';
import {startController,firedMenuEvents,MENU_EVENTS} from '../src/controller.mjs';
import {mkdtemp,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const now=1000000;

test('陪玩与成功聊天独立加熟悉度，聊天去重和冷却跨存档保留，满值不虚报奖励',()=>{
 let s=reduce(initialState(now),{type:'play'},now);assert.equal(s.affinity,12);assert.equal(s.reward.gain,2);
 s=reduce(s,{type:'chat-complete',chatId:'reply-1'},now);assert.equal(s.affinity,13);assert.equal(s.reward.type,'chat');assert.equal(s.reward.gain,1);
 s=reduce(s,{type:'chat-complete',chatId:'reply-2'},now+1000);assert.equal(s.affinity,13);assert.equal(s.counters.chats,2);
 s=normalizeState(JSON.parse(JSON.stringify(s)),now+30000);s=reduce(s,{type:'chat-complete',chatId:'reply-1'},now+30000);assert.equal(s.affinity,13);assert.equal(s.counters.chats,2);
 s=reduce(s,{type:'chat-complete',chatId:'reply-3'},now+30000);assert.equal(s.affinity,14);s=reduce(s,{type:'play'},now+59000);assert.equal(s.affinity,14);s=reduce(s,{type:'play'},now+60000);assert.equal(s.affinity,16);
 s.affinity=99;s=reduce(s,{type:'chat-complete',chatId:'reply-4'},now+61000);assert.equal(s.affinity,100);const seq=s.rewardSequence;s=reduce(s,{type:'play'},now+120000);assert.equal(s.affinity,100);assert.equal(s.rewardSequence,seq);
 assert.throws(()=>reduce(s,{type:'chat-complete'},now+1),/编号/);
 const old=initialState(now);delete old.lastChatRewardAt;delete old.seenChatIds;delete old.rewardSequence;delete old.counters.chats;assert.equal(normalizeState(old,now).counters.chats,0);assert.equal(normalizeState(old,now).affinity,10);
});
test('菜单全量映射中的null不是点击，只处理耄耋自己的非空事件',()=>{
 const empty=Object.fromEntries(Object.keys(MENU_EVENTS).map(k=>[k,null]));assert.deepEqual(firedMenuEvents(empty),[]);assert.deepEqual(firedMenuEvents({...empty,'喂一份食物':'maodie'}),['feed']);assert.deepEqual(firedMenuEvents({...empty,'喂一份食物':'main'}),[]);
});
test('5秒内三次真实点击事件触发记仇，喂食消除，食物实际消耗',()=>{
 let s=initialState(now);s=reduce(s,{type:'poke'},now+100);s=reduce(s,{type:'poke'},now+1000);s=reduce(s,{type:'poke'},now+2000);
 assert.equal(s.action.animation,'哈气');assert.ok(summary(s,now+2000).angry);assert.equal(s.counters.pets,3);const before=s.food;s=reduce(s,{type:'feed'},now+3000);assert.equal(s.food,before-1);assert.equal(s.irritation,0);assert.equal(summary(s,now+3000).angry,false);assert.equal(s.action.animation,'偷吃被抓住');assert.ok(s.history.some(x=>x.type==='annoyed'));
});
test('超过5秒不误判连续戳，频繁摸头不刷熟悉度',()=>{
 let s=initialState(now);s=reduce(s,{type:'poke'},now+100);s=reduce(s,{type:'poke'},now+200);assert.equal(s.affinity,11);s=reduce(s,{type:'poke'},now+6000);assert.equal(s.irritation,0);assert.equal(s.action.animation,'被摸');
});
test('无食物不产生喂食奖励；烦躁经过离线时间逐步降低',()=>{
 let s=initialState(now);s.food=0;s.irritation=40;const next=reduce(s,{type:'feed'},now+1);assert.equal(next.food,0);assert.equal(next.affinity,s.affinity);assert.equal(next.action.animation,null);assert.equal(settle(s,now+5*MINUTE).irritation,30);
});
test('专注完成及重启恢复只奖励一次，演示不计奖励',()=>{
 let s=reduce(initialState(now),{type:'focus-start'},now);s=JSON.parse(JSON.stringify(s));const done=settle(s,now+25*MINUTE+1);assert.equal(done.food,4);assert.equal(done.counters.focusCompleted,1);assert.equal(settle(done,now+30*MINUTE).food,4);assert.equal(done.focus.rewarded,true);
 let demo=reduce(initialState(now),{type:'focus-demo'},now);demo=settle(demo,now+30001);assert.equal(demo.food,3);assert.equal(demo.counters.focusCompleted,0);assert.equal(demo.focus.status,'completed');
});
test('暂停期间不计时，取消没有奖励，进行中不重复开始',()=>{
 let s=reduce(initialState(now),{type:'focus-start'},now);assert.throws(()=>reduce(s,{type:'focus-start'},now+1),/已经/);s=reduce(s,{type:'focus-toggle'},now+5*MINUTE);assert.equal(s.focus.remainingMs,20*MINUTE);s=settle(s,now+60*MINUTE);assert.equal(s.food,3);s=reduce(s,{type:'focus-toggle'},now+60*MINUTE);assert.equal(s.focus.endAt,now+80*MINUTE);s=reduce(s,{type:'focus-cancel'},now+61*MINUTE);assert.equal(settle(s,now+100*MINUTE).food,3);
});
test('专注时摸头和投喂不消耗物品，成长后解锁动作',()=>{
 let s=reduce(initialState(now),{type:'focus-start'},now);s=reduce(s,{type:'feed'},now+1);assert.equal(s.food,3);assert.equal(s.counters.feeds,0);s=initialState(now);s.affinity=50;assert.ok(summary(s,now).unlocked.includes('蹭头撒娇'));assert.equal(summary(s,now).relationship.name,'认可');assert.equal(summary(s,now).level,3);
});
test('本地存档连续写入后重开保留数值，损坏存档留副本',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.test-data-'));const file=path.join(dir,'state.json');const a=new LifeStore(file);let s=await a.load(now);s=reduce(s,{type:'feed'},now+1);await a.save(s);await a.flush();const b=new LifeStore(file);assert.equal((await b.load(now+2)).food,2);assert.equal(b.state.affinity,15);await writeFile(file,'bad-json');const c=new LifeStore(file);await c.load(now+3);assert.ok(c.warning);assert.ok((await readdir(dir)).some(f=>f.includes('.corrupt-')));
});
test('HTTP服务串行处理事件，重开保留成长；拒绝外部来源和任意事件',async()=>{
 const dataDir=await mkdtemp(path.join(process.cwd(),'.test-data-'));let time=now;let service=await startController({dataDir,hostBase:'http://127.0.0.1:1/dsh-pet-7340',menus:false,clock:()=>time});
 const send=async(type)=>{const response=await fetch(service.endpoint+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type})});return {status:response.status,data:await response.json()};};
 try{await Promise.all([send('poke'),send('poke'),send('poke')]);const response=await fetch(service.endpoint+'/state');assert.equal((await response.json()).state.counters.pets,3);assert.equal((await send('arbitrary-code')).status,400);const denied=await fetch(service.endpoint+'/event',{method:'POST',headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:'{"type":"feed"}'});assert.equal(denied.status,403);await send('feed');await service.close();service=await startController({dataDir,hostBase:'http://127.0.0.1:1/dsh-pet-7340',menus:false,clock:()=>time});assert.equal(service.getState().food,2);assert.equal(service.getState().irritation,0);assert.equal(service.getState().counters.pets,3);}finally{await service.close();}
});
