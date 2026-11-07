import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../src/life-client.js',import.meta.url),'utf8');

test('原生聊天只有成功回调才上报成长，关窗不加分，重复回调不重复上报',async()=>{
 let dialog;const requests=[],bubbles=[];const state={level:1,mood:'熟悉中',affinity:10,action:null};
 class Sprite{
  constructor(){this.pet={id:'maodie'};this.dragState={};this.videoA=this.videoB={addEventListener(){}};this.hit={setAttribute(){},getBoundingClientRect(){return {right:100,top:100};}};}
  onClick(){} playIdle(){} onPointerUp(){} handleEnded(){} onContextMenu(){} showChatFromMenu(){} syncInputBusy(){} setInteractive(){} visibleClampRect(){return {x:0,y:0,w:800,h:700};} showWhisper(text){bubbles.push(text);}
 }
 const sprite=new Sprite();const context=vm.createContext({PetSprite:Sprite,sprites:[sprite],Date,Math,AbortSignal,BASE:'http://127.0.0.1:1/pet',window:{__dshPetDebug:{}},crypto:{randomUUID:()=> 'chat-test-id'},S:{setVoiceBase(){},mountChatDialog(options){dialog=options;return {close(){options.onClose();}};}},setInterval(){},fetch:async(url,options)=>{if(url.endsWith('/event'))requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,state:structuredClone(state)})};}});
 vm.runInContext(code,context);await new Promise(resolve=>setImmediate(resolve));sprite.showChatFromMenu();assert.equal(requests.length,0);dialog.onClose();assert.equal(requests.length,0);
 sprite.showChatFromMenu();dialog.onClose();dialog.onSent();dialog.onSent();await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,1);assert.equal(requests[0].type,'chat-complete');assert.equal(requests[0].chatId,'chat-test-id');assert.equal(bubbles.length,0);
});
test('桌面动作不被气泡覆盖，专注连续睡觉，成长动作加入待机池',async()=>{
  let state={level:1,mood:'慢慢熟悉中',affinity:10,angry:false,action:{id:1,animation:'被摸',text:'摸头',until:Date.now()+10000}};
  const calls=[],intervals=[],pools=[];
  class Sprite {
    constructor(){this.pet={id:'maodie'};this.dragState={};this.videoA=this.videoB={addEventListener(){}};}
    onClick(){} playIdle(){} onPointerUp(){} handleEnded(){} stopMove(){} stopThrow(){}
    playOnce(name){this.anim=name;calls.push(name);}
    showWhisper(text,image,url,duration,anim){if(anim!==false)this.playOnce('随机错误动作');}
  }
  const sprite=new Sprite();
  const context=vm.createContext({PetSprite:Sprite,sprites:[sprite],Date,Math,AbortSignal,window:{},S:{pick(pool){pools.push(pool);return pool[0];}},setInterval(fn){intervals.push(fn);},fetch:async url=>({ok:true,json:async()=>url.endsWith('/state')?{ok:true,state:structuredClone(state)}:{ok:true}})});
  vm.runInContext(code,context);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sprite.anim,'被摸');assert.ok(!calls.includes('随机错误动作'));
  state={...state,action:{id:2,animation:'睡觉',text:'专注',until:Date.now()+10000},focus:{status:'active'}};
  intervals[0]();await new Promise(resolve=>setImmediate(resolve));sprite.handleEnded();assert.equal(sprite.anim,'睡觉');
  state={...state,focus:null,action:null,affinity:70,relationship:{id:3,name:'偏爱'},unlocked:['蹭头撒娇','翻肚皮','我真的特别爱你']};intervals[0]();await new Promise(resolve=>setImmediate(resolve));sprite.playIdle();
  assert.ok(pools.at(-1).includes('翻肚皮'));assert.ok(pools.at(-1).includes('蹭头撒娇'));
});

test('到点从猫弹提醒，显示后才确认，打开待办时延后显示，不打断专注睡觉',async()=>{
  const timers=[],bubbles=[],acks=[],plays=[];let now=Date.now();const todo={id:'due-test',text:'喝水',dueAt:now-1};
  class Clock extends Date{static now(){return now;}}
  class Sprite{
    constructor(){this.pet={id:'maodie'};this.dragState={};this.videoA=this.videoB={addEventListener(){}};this.todoOpen=true;}
    onClick(){} playIdle(){} onPointerUp(){} handleEnded(){} stopMove(){} stopThrow(){} onContextMenu(){} toggleTodo(){}
    playOnce(name){plays.push(name);}showWhisper(text){bubbles.push(text);}
  }
  const sprite=new Sprite(),state={level:1,mood:'专注陪伴',affinity:10,focus:{status:'active'},action:null};
  const context=vm.createContext({PetSprite:Sprite,sprites:[sprite],Date:Clock,Math,AbortSignal,window:{},S:{},setInterval(fn){timers.push(fn);},fetch:async(url,options)=>{
    if(url.includes('/ack'))acks.push(JSON.parse(options.body));return {ok:true,json:async()=>url.endsWith('/state')?{ok:true,state}:url.endsWith('/reminders')?{ok:true,todos:[todo]}:{ok:true}};
  }});
  vm.runInContext(code,context);await new Promise(resolve=>setImmediate(resolve));timers[2]();await new Promise(resolve=>setImmediate(resolve));assert.equal(acks.length,0);
  sprite.todoOpen=false;const before=plays.length;timers[2]();await new Promise(resolve=>setImmediate(resolve));assert.match(bubbles[0],/喝水/);assert.equal(acks.length,1);assert.equal(plays.length,before);
  timers[2]();await new Promise(resolve=>setImmediate(resolve));assert.equal(bubbles.length,1);
});

test('右键猫直接显示养成入口，菜单派发喂食和打开面板，专注时显示暂停',async()=>{
  let state={level:1,mood:'熟悉中',affinity:15,food:2,action:null};
  let mounted,originalOpened=0;const requests=[],intervals=[];
  class Sprite {
    constructor(){this.pet={id:'maodie'};this.dragState={};this.videoA=this.videoB={addEventListener(){}};}
    onClick(){} playIdle(){} onPointerUp(){} handleEnded(){} stopMove(){} stopThrow(){} setTip(){} setInteractive(){} syncInputBusy(){} syncInputRegions(){}
    inputBusy(){return this.menuOpen;}
    visibleClampRect(){return {left:0,top:0,right:800,bottom:600};}
    closeMenu(){this.menuClose?.();this.menuClose=null;this.menuOpen=false;}
    onContextMenu(){originalOpened++;}
  }
  const sprite=new Sprite();const context=vm.createContext({PetSprite:Sprite,sprites:[sprite],Date,Math,AbortSignal,window:{__dshPetDebug:{}},S:{mountContextMenu(options){mounted=options;return {close(){options.onClose();}};}},setInterval(fn){intervals.push(fn);},fetch:async(url,options)=>{if(url.endsWith('/event'))requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,state:structuredClone(state)})};}});
  vm.runInContext(code,context);await new Promise(resolve=>setImmediate(resolve));
  const click={clientX:300,clientY:250,preventDefault(){}};sprite.onContextMenu(click);
  assert.ok(mounted.tree.some(x=>x.label==='打开养成面板'));assert.ok(mounted.tree.some(x=>x.label.includes('剩余 2 份')));assert.equal(originalOpened,0);
  assert.ok(mounted.tree.some(x=>x.action==='chat'));assert.ok(mounted.tree.some(x=>x.action==='todo'));
  mounted.onAction(mounted.tree.find(x=>x.event==='feed'));await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.at(-1).type,'feed');assert.equal(requests.at(-1).source,'cat-menu');assert.equal(sprite.menuOpen,false);
  sprite.onContextMenu(click);mounted.onAction(mounted.tree.find(x=>x.event==='panel-open'));await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.at(-1).type,'panel-open');
  state={...state,focus:{status:'active'}};intervals[0]();await new Promise(resolve=>setImmediate(resolve));sprite.onContextMenu(click);assert.ok(mounted.tree.some(x=>x.label==='暂停专注'));assert.ok(!mounted.tree.some(x=>x.event==='focus-start'));
});
