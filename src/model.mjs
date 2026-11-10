import {BASE_ACTIONS,eligibleStage,relationshipOf,advanceRelationship,addMilestone} from './relationship.mjs';
export const MINUTE=60000;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const number=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
export function initialState(now=Date.now()){
  return {version:1,relationshipVersion:1,relationshipStage:0,relationshipNotice:null,unlockedActions:[...BASE_ACTIONS],milestones:[],settings:{randomHiss:true},lastSocialAt:now,lastIdleHissAt:0,lastSeenAt:0,completedTodoIds:[],affinity:10,irritation:0,food:3,lastDecayAt:now,lastPetRewardAt:0,lastPlayAt:0,lastChatRewardAt:0,seenChatIds:[],reward:null,rewardSequence:0,pokeStart:0,pokeCount:0,grudgeUntil:0,lastAnnoyedAt:null,focus:null,counters:{pets:0,feeds:0,plays:0,chats:0,focusCompleted:0,focusMinutes:0,todosCompleted:0},history:[],action:null,sequence:0};
}
export function normalizeState(input,now=Date.now()){
  const base=initialState(now);
  if(!input||input.version!==1||typeof input!=='object')return base;
  const s={...base,...input,counters:{...base.counters,...input.counters}};
  s.affinity=clamp(number(s.affinity,10),0,100);s.irritation=clamp(number(s.irritation),0,100);s.food=clamp(Math.floor(number(s.food,3)),0,99);
  for(const key of ['lastDecayAt','lastPetRewardAt','lastPlayAt','lastChatRewardAt','rewardSequence','lastSocialAt','lastIdleHissAt','lastSeenAt','pokeStart','pokeCount','grudgeUntil','sequence'])s[key]=Math.max(0,number(s[key],base[key]));
  for(const key of Object.keys(base.counters))s.counters[key]=Math.max(0,number(s.counters[key]));
  s.history=Array.isArray(s.history)?s.history.filter(x=>x&&Number.isFinite(x.at)&&typeof x.type==='string').slice(-50):[];
  if(!s.focus||!['active','paused','completed','cancelled'].includes(s.focus.status)||!Number.isFinite(s.focus.endAt)||!Number.isFinite(s.focus.durationMs))s.focus=null;
  if(s.action&&(!Number.isFinite(s.action.id)||typeof s.action.text!=='string'))s.action=null;
  s.seenChatIds=Array.isArray(s.seenChatIds)?s.seenChatIds.filter(x=>typeof x==='string').slice(-100):[];
  if(s.reward&&(!Number.isFinite(s.reward.id)||!Number.isFinite(s.reward.gain)||!Number.isFinite(s.reward.until)))s.reward=null;
  s.milestones=Array.isArray(s.milestones)?s.milestones.filter(x=>x&&typeof x.key==='string'&&typeof x.detail==='string'&&Number.isFinite(x.at)&&x.source==='program').slice(-60):[];
  s.settings={randomHiss:s.settings?.randomHiss!==false};s.completedTodoIds=Array.isArray(s.completedTodoIds)?s.completedTodoIds.filter(x=>typeof x==='string').slice(-100):[];
  if(input.relationshipVersion!==1){
    s.relationshipVersion=1;s.relationshipStage=eligibleStage(s);s.relationshipNotice=null;
    s.unlockedActions=[...BASE_ACTIONS,...(s.affinity>=30?['蹭头撒娇']:[]),...(s.affinity>=50?['翻肚皮']:[]),...(s.affinity>=70?['我真的特别爱你']:[])];
    const mapping={fed:['first-feed','第一次给我喂食'],play:['first-play','第一次陪我玩'],chat:['first-chat','第一次和我聊完一轮'],annoyed:['first-hiss','第一次被连续戳到哈气'],'focus-complete':['first-focus','第一次一起完成正式专注']};
    for(const h of s.history){const m=mapping[h.type];if(m)addMilestone(s,m[0],h.at,m[1]);}
  }else{s.relationshipStage=clamp(Math.floor(number(s.relationshipStage)),0,3);s.unlockedActions=Array.isArray(s.unlockedActions)?s.unlockedActions.filter(x=>typeof x==='string'):[...BASE_ACTIONS];}
  return s;
}
function action(s,now,animation,text,duration=4500){s.sequence++;s.action={id:s.sequence,at:now,animation,text,until:now+duration};}
function remember(s,now,type,detail){s.history.push({at:now,type,detail});s.history=s.history.slice(-50);const map={fed:['first-feed','第一次给我喂食'],play:['first-play','第一次陪我玩'],chat:['first-chat','第一次和我聊完一轮'],annoyed:['first-hiss','第一次被连续戳到哈气'],'focus-complete':['first-focus','第一次一起完成正式专注']};if(map[type])addMilestone(s,map[type][0],now,map[type][1]);}
function reward(s,now,type,amount){const gain=Math.min(amount,100-s.affinity);s.affinity+=gain;if(gain>0){s.rewardSequence++;s.reward={id:s.rewardSequence,type,gain,at:now,until:now+4500};}return gain;}
export function levelOf(s){return Math.min(6,1+Math.floor(s.affinity/20));}
export function unlocked(s){return [...new Set([...(s.unlockedActions||BASE_ACTIONS),...(s.relationshipStage>=2?['蹭头撒娇']:[]),...(s.relationshipStage>=3?['翻肚皮','我真的特别爱你']:[])])];}
export function angry(s,now=Date.now()){return s.irritation>=25&&s.grudgeUntil>now;}
export function settle(input,now=Date.now()){
  const s=normalizeState(structuredClone(input),now);
  const periods=Math.floor(Math.max(0,now-s.lastDecayAt)/30000);
  if(periods){s.irritation=Math.max(0,s.irritation-periods);s.lastDecayAt=now;}
  if(s.focus?.status==='active'&&now>=s.focus.endAt){
    const f=s.focus;f.status='completed';f.completedAt=now;
    if(!f.rewarded){
      f.rewarded=true;
      if(!f.demo){s.food=Math.min(99,s.food+1);s.affinity=Math.min(100,s.affinity+3);s.counters.focusCompleted++;s.counters.focusMinutes+=Math.round(f.durationMs/MINUTE);remember(s,now,'focus-complete','完成专注，获得1份食物');action(s,now,'开心','专注完成！你得到了1份食物。要不要喂我？');}
      else{remember(s,now,'focus-demo','30秒专注演示结束，不计入奖励');action(s,now,'开心','30秒演示结束啦。正式专注才会发食物奖励。');}
    }
  }
  return advanceRelationship(s,now);
}
export function summary(input,now=Date.now()){
  const s=settle(input,now);
  return {...s,relationship:relationshipOf(s),level:levelOf(s),unlocked:unlocked(s),angry:angry(s,now),mood:s.focus?.status==='active'?'专注陪伴':angry(s,now)?'正在记仇':s.relationshipStage>=2?'愿意亲近':'观察你',focusRemainingMs:s.focus?.status==='active'?Math.max(0,s.focus.endAt-now):s.focus?.status==='paused'?s.focus.remainingMs:0};
}
export function reduce(input,event,now=Date.now()){
  if(!event||typeof event.type!=='string')throw new Error('事件类型无效');
  const s=settle(input,now),type=event.type;
  if(type==='tick')return s;
  if(type==='goodbye'){action(s,now,'被摸','拜拜啦，今天就陪你到这里。下次再见！',6000);return s;}
  if(type==='heartbeat'){s.lastSeenAt=now;return s;}
  if(type==='return'){if(s.lastSeenAt&&now-s.lastSeenAt>=30*MINUTE&&s.relationshipStage>=2&&s.focus?.status!=='active')action(s,now,s.relationshipStage>=3?'翻肚皮':'蹭头撒娇',s.relationshipStage>=3?'回来了？旁边给你留着呢……我刚好没占。':'回来了？过来，今天可以摸一下。',7000);s.lastSeenAt=now;return s;}
  if(type==='settings'){if(typeof event.randomHiss!=='boolean')throw new Error('设置值无效');s.settings.randomHiss=event.randomHiss;return s;}
  if(type==='idle-hiss'){if(s.settings.randomHiss&&s.focus?.status!=='active'&&now-s.lastSocialAt>=15*MINUTE&&now-s.lastIdleHissAt>=15*MINUTE){s.lastIdleHissAt=now;action(s,now,'哈气',s.relationshipStage>=2?'哈……看什么。我只是伸个懒腰。':'哈！我在这儿呢，别突然伸手。',4500);}return s;}
  if(type==='chat-reply'){if(typeof event.text!=='string'||!event.text.trim()||event.text.length>600)throw new Error('回复内容无效');s.lastSocialAt=now;action(s,now,event.emotion==='hiss'?'哈气':event.emotion==='soft'&&s.relationshipStage>=2?'蹭头撒娇':null,event.text,Math.min(30000,Math.max(12000,event.text.length*100)));return s;}
  if(type==='todo-complete'){if(typeof event.todoId!=='string'||s.completedTodoIds.includes(event.todoId))return s;s.completedTodoIds.push(event.todoId);s.completedTodoIds=s.completedTodoIds.slice(-100);s.counters.todosCompleted++;addMilestone(s,'first-todo',now,'第一次把待办勾选为完成');return advanceRelationship(s,now);}
  if(type==='chat-complete'){
    if(typeof event.chatId!=='string'||!event.chatId||event.chatId.length>80)throw new Error('聊天回合编号无效');
    if(s.seenChatIds.includes(event.chatId))return s;
    s.seenChatIds.push(event.chatId);s.seenChatIds=s.seenChatIds.slice(-100);s.counters.chats++;s.lastSocialAt=now;
    if(!s.lastChatRewardAt||now-s.lastChatRewardAt>=30000){const gain=reward(s,now,'chat',1);s.lastChatRewardAt=now;remember(s,now,'chat',gain?`聊天一次，熟悉度+${gain}`:'聊天一次，熟悉度已满');}
    return advanceRelationship(s,now);
  }
  if(type==='panel-open'){action(s,now,null,'打开成长档案');s.action.command='panel';return s;}
  if(type==='book-open'){action(s,now,null,'打开记忆与成长');s.action.command='memories';return s;}
  if(type==='status'){
    const f=s.focus?.status==='active'?`\n专注剩余 ${Math.ceil((s.focus.endAt-now)/MINUTE)} 分钟`:'';
    action(s,now,null,`耄耋 Lv.${levelOf(s)}\n熟悉度 ${s.affinity}/100 · 烦躁 ${s.irritation}/100\n食物 ${s.food} 份 · 专注完成 ${s.counters.focusCompleted} 次${f}`,7000);return s;
  }
  if(['poke','feed','play'].includes(type)&&s.focus?.status==='active'){action(s,now,null,'我在陪你专注。想陪我玩，可以先暂停专注。');return s;}
  if(['poke','feed','play'].includes(type))s.lastSocialAt=now;
  if(type==='poke'){
    s.counters.pets++;
    if(!s.pokeStart||now-s.pokeStart>5000){s.pokeStart=now;s.pokeCount=0;}
    s.pokeCount++;
    if(s.pokeCount>=3){s.pokeCount=0;s.pokeStart=0;s.irritation=Math.min(100,s.irritation+40);s.affinity=Math.max(0,s.affinity-2);s.lastAnnoyedAt=now;s.grudgeUntil=now+90000;remember(s,now,'annoyed','5秒内连续摸了三次');action(s,now,'哈气','哈——！别一直戳！我记住你了。');}
    else if(angry(s,now)){action(s,now,'哈气','刚才戳我的事，我可还记得。');}
    else{if(!s.lastPetRewardAt||now-s.lastPetRewardAt>=30000){s.affinity=Math.min(100,s.affinity+1);s.lastPetRewardAt=now;}action(s,now,unlocked(s).includes('蹭头撒娇')?'蹭头撒娇':'被摸',s.relationshipStage>=2?'就让你摸一下。只有一下。':'哈……手先轻一点，我还在看你呢。');}
  }else if(type==='feed'){
    if(s.food<1){action(s,now,null,'没有食物啦。完成一次正式专注可以获得1份。');return s;}
    const wasAngry=angry(s,now);s.food--;s.irritation=Math.max(0,s.irritation-45);s.grudgeUntil=0;s.pokeCount=0;s.pokeStart=0;s.affinity=Math.min(100,s.affinity+5);s.counters.feeds++;remember(s,now,'fed','吃掉1份食物，烦躁降低');if(wasAngry)addMilestone(s,'first-make-up',now,'第一次哈气后，因为一份食物和好了');action(s,now,'偷吃被抓住',wasAngry?'既然你带了吃的……刚才的事就算了。':'放这儿吧。……看什么，我又没说不吃。',11000);
  }else if(type==='play'){
    if(angry(s,now)){action(s,now,'飞机耳','现在不想追。先让我消消气。',7500);return s;}
    if(!s.lastPlayAt||now-s.lastPlayAt>=60000){const gain=reward(s,now,'play',2);s.irritation=Math.max(0,s.irritation-5);s.counters.plays++;s.lastPlayAt=now;remember(s,now,'play',gain?`陪玩一次，熟悉度+${gain}`:'陪玩一次，熟悉度已满');}
    action(s,now,'走路','慢慢移动鼠标，我追给你看。',8000);
  }else if(type==='focus-start'||type==='focus-demo'){
    if(s.focus?.status==='active')throw new Error('已经在专注中了');
    const demo=type==='focus-demo',durationMs=demo?30000:25*MINUTE;
    s.focus={id:`focus-${now}-${s.sequence+1}`,status:'active',startedAt:now,endAt:now+durationMs,durationMs,demo,rewarded:false};
    remember(s,now,demo?'focus-demo-start':'focus-start',demo?'开始30秒演示':'开始25分钟专注');action(s,now,'睡觉',demo?'开始30秒专注演示：不发放成长奖励。':'你忙你的，我在旁边睡会儿。25分钟后见。');
  }else if(type==='focus-toggle'){
    if(s.focus?.status==='active'){s.focus.remainingMs=Math.max(0,s.focus.endAt-now);s.focus.status='paused';remember(s,now,'focus-pause','暂停专注');action(s,now,'待机','先歇一会儿，专注进度替你留着。');}
    else if(s.focus?.status==='paused'){s.focus.endAt=now+s.focus.remainingMs;s.focus.status='active';action(s,now,'睡觉','继续专注吧，我也继续睡。');}
    else throw new Error('还没有可以暂停或继续的专注');
  }else if(type==='focus-cancel'){
    if(!s.focus||!['active','paused'].includes(s.focus.status))throw new Error('没有进行中的专注');
    s.focus.status='cancelled';remember(s,now,'focus-cancel','取消专注，无奖励');action(s,now,'待机','这次先到这里，没完成的专注不会发奖励。');
  }else throw new Error('不支持的事件类型');
  return advanceRelationship(s,now);
}
