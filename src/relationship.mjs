export const STAGES=[
 {id:0,name:'警惕',min:0,description:'先观察你，碰近了可能哈气。',tone:'保持一点距离，爱面子，称呼可以偏向“人类”，不恶意攻击。'},
 {id:1,name:'试探',min:20,description:'愿意陪你玩，开始慢慢接近。',tone:'开始接你的玩笑，嘴上勉强，愿意继续相处。'},
 {id:2,name:'认可',min:40,description:'愿意蹭你，也记得一起经历的事。',tone:'愿意亲近，会自然关心已知的近况，仍然嘴硬。'},
 {id:3,name:'偏爱',min:70,description:'把你当成自己人，偶尔哈气也是撒娇。',tone:'明显偏爱这位用户，会欢迎回来、愿意靠在身边，保留傲娇，不变成甜腻客服。'},
];
export const BASE_ACTIONS=['待机','走路','被摸','哈气','偷吃被抓住','睡觉'];
export function interactionKinds(s){return ['chats','feeds','plays','focusCompleted','todosCompleted'].filter(k=>(s.counters?.[k]||0)>0);}
export function eligibleStage(s){const a=s.affinity||0;return a>=70&&interactionKinds(s).length>=3?3:a>=40?2:a>=20?1:0;}
export function relationshipOf(s){
 const stage=STAGES[Math.max(0,Math.min(3,s.relationshipStage??eligibleStage(s)))],next=STAGES[stage.id+1]||null;
 return {...stage,next:next?{name:next.name,min:next.min,remaining:Math.max(0,next.min-s.affinity),needsKinds:next.id===3?Math.max(0,3-interactionKinds(s).length):0}:null};
}
export function addMilestone(s,key,at,detail){
 s.milestones??=[];if(s.milestones.some(x=>x.key===key))return;
 s.milestones.push({id:key,key,at,detail,source:'program'});s.milestones=s.milestones.slice(-60);
}
export function advanceRelationship(s,now){
 const next=eligibleStage(s);
 if(next>(s.relationshipStage||0)){
  s.relationshipStage=next;s.relationshipNotice={id:(s.relationshipNotice?.id||0)+1,stage:STAGES[next].name,at:now,until:now+6500};
  addMilestone(s,'stage-'+next,now,'我们的关系变成了「'+STAGES[next].name+'」');
 }
 s.unlockedActions=[...new Set([...(s.unlockedActions||BASE_ACTIONS),...(s.relationshipStage>=2?['蹭头撒娇']:[]),...(s.relationshipStage>=3?['翻肚皮','我真的特别爱你']:[])])];
 return s;
}
