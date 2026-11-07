/* The installer injects this script into the existing desktop pet renderer. */
(() => {
  'use strict';
  if(typeof document!=='undefined')document.documentElement.classList.add('maodie-readable');
  const ENDPOINT='__LIFE_API__';
  let life=null,busy=false,lastCursor=null,lastMoveAt=0,lastChase=0,nearSince=0,lastApplied=0;
  let reminderBusy=false,reminderUntil=0;const shownReminders=new Set();
  let lastReward=0,lastStageNotice=0,nextIdleHiss=Date.now()+900000+Math.random()*900000;
  const originals={click:PetSprite.prototype.onClick,idle:PetSprite.prototype.playIdle,up:PetSprite.prototype.onPointerUp,ended:PetSprite.prototype.handleEnded,context:PetSprite.prototype.onContextMenu,chat:PetSprite.prototype.showChatFromMenu};
  const isMine=s=>s?.pet?.id==='maodie';
  async function request(route,body){const response=await fetch(ENDPOINT+route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(2500)});const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.message||'养成服务连接失败');return data;}
  function report(kind,s,extra={}){void request('/telemetry',{kind,animation:s?.anim||null,actionId:life?.action?.id||null,...extra}).catch(()=>{});}
  function applyState(next){
    const beforeFocus=life?.focus?.status==='active';life=next;
    for(const s of sprites){if(!isMine(s))continue;
      s.pet.name=`耄耋 · ${life.relationship?.name||'相识中'} · ${life.mood}`;
      if(s.hit){s.hit.setAttribute('role','button');s.hit.setAttribute('aria-label',s.pet.name+'；左键摸头，右键互动');}
      if(!s._lifeReady){s._lifeReady=true;for(const v of [s.videoA,s.videoB]){v.addEventListener('playing',()=>report('playing',s));v.addEventListener('ended',()=>report('ended',s));}report('ready',s);if(typeof document!=='undefined')void event('return',s,'presence');}
      if(life.reward&&life.reward.id>lastReward){lastReward=life.reward.id;if(life.reward.until>Date.now()){
        if(typeof document!=='undefined'&&s.el){const badge=document.createElement('div');badge.className='maodie-affinity-toast';badge.textContent='熟悉度 +'+life.reward.gain;s.el.appendChild(badge);setTimeout(()=>badge.remove(),4500);}
        report('affinity',s,{message:life.reward.type+':+'+life.reward.gain});
      }}
      if(life.relationshipNotice&&life.relationshipNotice.id>lastStageNotice){lastStageNotice=life.relationshipNotice.id;if(life.relationshipNotice.until>Date.now()&&typeof document!=='undefined'&&s.el){const badge=document.createElement('div');badge.className='maodie-affinity-toast maodie-stage-toast';badge.textContent='关系升级：'+life.relationshipNotice.stage;s.el.appendChild(badge);setTimeout(()=>badge.remove(),6500);}}
      const action=life.action;
      if(action&&action.id>lastApplied){lastApplied=action.id;if(action.until>Date.now()){
        if(['panel','memories'].includes(action.command)&&window.petBridge?.lifePanel){void Promise.resolve(window.petBridge.lifePanel(ENDPOINT,action.command)).then(()=>report('panel-opened',s)).catch(error=>{s.showWhisper('面板未能打开，请稍后再试。',undefined,undefined,4000,false);report('error',s,{message:error.message});});continue;}
        s.stopMove();s.stopThrow();if(action.animation)s.playOnce(action.animation);s.showWhisper(action.text,undefined,undefined,Math.max(2500,action.until-Date.now()),false);report('applied',s);
      }}
      if(life.focus?.status==='active'&&!beforeFocus){s.stopMove();s.stopThrow();s.playOnce('睡觉');}
      else if(beforeFocus&&life.focus?.status!=='active'&&!action?.animation)s.playIdle();
    }
  }
  async function event(type,s,source='pointer',details={}){try{const result=await request('/event',{...details,type,source});applyState(result.state);}catch(error){s?.showWhisper('养成服务暂时没连上，请重载桌宠。',undefined,undefined,4000,false);if(s)report('error',s,{message:error.message});}}
  PetSprite.prototype.showChatFromMenu=function(image,encoded){
    if(!isMine(this)||!life)return originals.chat.call(this,image,encoded);
    if(this.chatMount){this.chatMount.close();this.chatMount=null;return;}
    S.setVoiceBase(BASE);let counted=false;
    const chatId=globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2);
    const mount=S.mountChatDialog({petId:this.pet.id,baseUrl:ENDPOINT+'/chat',surface:'desktop',x:Math.max(4,this.hit.getBoundingClientRect().right+6),y:Math.max(4,this.hit.getBoundingClientRect().top+6),clamp:this.visibleClampRect(),
      onSent:()=>{if(!counted){counted=true;void event('chat-complete',this,'chat',{chatId});}},
      onClose:()=>{this.chatMount=null;this.chatOpen=false;window.__dshPetDebug.chatOpen=false;this.syncInputBusy();if(!this.menuOpen)this.setInteractive(false);},
    });
    if(mount.el){for(const button of mount.el.querySelectorAll('button'))button.hidden=true;}
    this.chatMount=mount;this.chatOpen=true;window.__dshPetDebug.chatOpen=true;this.syncInputBusy();this.setInteractive(true);
  };
  PetSprite.prototype.onClick=function(e){
    if(!isMine(this)||!life||isOpenShortcut(e))return originals.click.call(this,e);
    if(this.dragState.active||this.dragState.dragging||this.justDragged)return;
    this.stopMove();this.stopThrow();this.pendingSquash=true;report('click',this);void event('poke',this);
  };
  PetSprite.prototype.onPointerUp=function(e){const wasDragging=this.dragState?.dragging;const result=originals.up.call(this,e);if(isMine(this)&&wasDragging){lastChase=Date.now();report('drag',this);}return result;};
  PetSprite.prototype.onContextMenu=function(e){
    if(!isMine(this)||!life)return originals.context.call(this,e);
    if(this.dragState.active||this.dragState.dragging||this.justDragged||this.menuOpen)return;
    e.preventDefault();this.stopThrow();this.stopMove();this.setTip(false);
    const focusing=life.focus?.status==='active',paused=life.focus?.status==='paused';
    const tree=[
      {label:'和耄耋聊天',action:'chat'},
      {label:'待办与提醒',action:'todo'},
      {label:'记忆与成长',action:'life',event:'book-open'},
      {label:'摸摸头',action:'life',event:'poke'},
      {label:`喂耄耋 · 剩余 ${life.food} 份`,action:'life',event:'feed'},
      {label:'逗猫玩',action:'life',event:'play'},
      ...(focusing||paused?[
        {label:focusing?'暂停专注':'继续专注',action:'life',event:'focus-toggle'},
        {label:'结束本次专注',action:'life',event:'focus-cancel'},
      ]:[{label:'陪我专注 25 分钟',action:'life',event:'focus-start'}]),
      {label:'打开养成面板',action:'life',event:'panel-open'},
      {label:'原版动作与设置',action:'original'},
    ];
    this.menuOpen=true;this.setInteractive(true);this.syncInputBusy();window.__dshPetDebug.menuOpen=true;
    const menu=S.mountContextMenu({tree,x:e.clientX,y:e.clientY,clamp:this.visibleClampRect(),
      onAction:leaf=>{this.closeMenu();if(leaf.action==='chat'){this.showChatFromMenu();report('menu',this,{message:'chat'});}else if(leaf.action==='todo'){this.toggleTodo();report('menu',this,{message:'todo'});}else if(leaf.action==='original')originals.context.call(this,e);else if(leaf.action==='life'){report('menu',this,{message:leaf.event});void event(leaf.event,this,'cat-menu');}},
      onClose:()=>{this.menuOpen=false;window.__dshPetDebug.menuOpen=false;this.syncInputBusy();if(!this.inputBusy())this.setInteractive(false);},
    });
    this.menuClose=menu.close;this.syncInputRegions();report('menu-open',this);
  };
  const originalTodo=PetSprite.prototype.toggleTodo;
  PetSprite.prototype.toggleTodo=function(){
    if(!isMine(this)||!life)return originalTodo.call(this);
    if(this.todoPanel){this.closeTodo();return;}
    const panel=S.createTodoPanel({baseUrl:ENDPOINT+'/todos',onClose:()=>this.closeTodo(),keepOpenOn:target=>typeof target?.closest==='function'&&target.closest('.pet-hit')!==null});
    const hint=panel.el.querySelector('.dsh-pet-todo-hint');if(hint)hint.textContent='设置时间后，到点我会提醒你；关闭桌宠期间不会响，重开会补提醒。';
    this.bubble.replaceChildren(panel.el);this.todoPanel=panel;this.todoOpen=true;window.__dshPetDebug.todoOpen=true;this.renderBubble();this.syncInputBusy();this.setInteractive(true);
  };
  async function remindersTick(){
    if(reminderBusy||!life||Date.now()<reminderUntil)return;
    const s=sprites.find(isMine);if(!s||s.todoOpen||s.menuOpen||s.dragState?.active)return;
    reminderBusy=true;
    try{
      const result=await request('/reminders'),todo=result.todos?.[0];if(!todo)return;
      const key=todo.id+':'+todo.dueAt;
      if(!shownReminders.has(key)){
        s.stopMove();s.stopThrow();if(life.focus?.status!=='active')s.playOnce('东张西望');
        s.showWhisper('喵，到时间啦：'+todo.text+'\n右键我 → 待办与提醒，完成后打个勾。',undefined,undefined,18000,false);
        shownReminders.add(key);reminderUntil=Date.now()+18000;report('reminder',s,{message:todo.id});
      }
      await request('/reminders/'+encodeURIComponent(todo.id)+'/ack',{dueAt:todo.dueAt});
    }catch{}finally{reminderBusy=false;}
  }
  PetSprite.prototype.handleEnded=function(){
    if(!isMine(this)||!life||this.frozen||this.sleeping||this.dragState?.active)return originals.ended.call(this);
    if(this.playback){const finished=this.playback;this.playback=null;this.reportPlayback(finished,'ended');}
    this.playIdle();
  };
  PetSprite.prototype.playIdle=function(){
    if(!isMine(this)||!life)return originals.idle.call(this);
    if(this.frozen||this.sleeping)return originals.idle.call(this);
    if(this.dragState?.active)return;
    this.stopMove();
    if(life.focus?.status==='active'){this.playOnce('睡觉');return;}
    if(life.angry){this.playOnce('飞机耳');return;}
    const available=life.unlocked||[];const pool=['待机','舔毛','揣手手',...(available.includes('蹭头撒娇')?['蹭头撒娇']:[]),...(available.includes('翻肚皮')?['翻肚皮']:[])];this.playOnce(S.pick(pool,this.anim));
  };
  // Existing renderer methods perform all geometry conversion, clipping and
  // window movement. The extension supplies only a bounded target and facing.
  async function cursorTick(){
    if(busy||!life||!window.petBridge?.lifeCursor)return;busy=true;
    try{
      const point=await window.petBridge.lifeCursor(),now=Date.now();
      const dt=lastCursor?Math.max(1,now-lastCursor.at):1;
      const speed=lastCursor?Math.hypot(point.x-lastCursor.x,point.y-lastCursor.y)*1000/dt:0;
      lastCursor={...point,at:now};if(speed>12)lastMoveAt=now;
      for(const s of sprites){if(!isMine(s)||s.dragState?.active||s.menuOpen||s.chatOpen||s.todoOpen||s.frozen||s.throwState||life.focus?.status==='active')continue;
        const x=toLocal(point.x)-VIEW.x,y=toLocal(point.y)-VIEW.y;
        const cx=s.pos.x+s.halfW,cy=s.pos.y+s.halfH,dx=x-cx,dy=y-cy,dist=Math.hypot(dx,dy);
        if(dist<480){s.facing=life.angry?(dx>0?'left':'right'):(dx>0?'right':'left');const front=s.front===0?s.videoA:s.videoB;if(front&&s.squashRef===null)front.style.transform=s.facing==='right'?'scaleX(-1)':'';}
        const approach=(life.relationship?.id||0)>=2&&speed<12&&now-lastChase>45000;
        if(life.angry||dist<110||dist>((life.relationship?.id||0)>=2?620:420)||speed>650||now-lastMoveAt>900&&!approach){nearSince=0;continue;}
        if(!nearSince){nearSince=now;continue;}
        const playMode=life.action?.animation==='走路'&&life.action.until>now;
        if(now-nearSince<500||now-lastChase<(playMode?1600:5500)||now<(life.action?.until||0)&&!playMode)continue;
        const step=Math.min(playMode?150:90,dist-100),tx=cx+dx/dist*step,ty=cy+dy/dist*step;
        lastChase=now;s.playOnce('走路');s.moveToCenter(tx/VIEW.w,ty/VIEW.h,'line',750);report('chase',s);
      }
    }catch{}finally{busy=false;}
  }
  setInterval(()=>{void request('/state').then(r=>applyState(r.state)).catch(()=>{});},600);
  setInterval(()=>{void cursorTick();},180);
  setInterval(()=>{void remindersTick();},1000);
  setInterval(()=>{const s=sprites.find(isMine);if(s&&life)void event('heartbeat',s,'presence');},60000);
  setInterval(()=>{const s=sprites.find(isMine);if(!s||!life||Date.now()<nextIdleHiss||s.menuOpen||s.chatOpen||s.todoOpen||s.dragState?.active||life.focus?.status==='active')return;nextIdleHiss=Date.now()+900000+Math.random()*900000;if(life.settings?.randomHiss!==false)void event('idle-hiss',s,'idle');},30000);
  void request('/state').then(r=>applyState(r.state)).catch(()=>{});
})();
