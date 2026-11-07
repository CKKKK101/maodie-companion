import {parseMemoryCommand} from './memory.mjs';import {buildPersona,parseCharacterReply} from './persona.mjs';
export function createCharacterChat({memory,generate,dispatch,getState,clock=()=>Date.now()}){
 let queue=Promise.resolve();
 const send=(text)=>{const work=queue.then(async()=>{
  if(typeof text!=='string'||!text.trim()||text.length>2000)throw new Error('消息请输入1到2000个字');text=text.trim();
  const command=parseMemoryCommand(text);let reply,emotion='neutral',mode='model';
  if(command){mode='memory-command';
   if(command.kind==='remember'){await memory.remember(command.facts);reply=command.facts.some(f=>f.key==='name')?'知道了，以后叫你'+command.facts.find(f=>f.key==='name').value+'。我记住了……才不是特意记的。':'记住了。你说的这件事，已经放进我的记忆里。';}
   else if(command.kind==='forget'){const removed=await memory.forget(command);reply=removed?'好，已经忘掉那条长期记忆，也换了一轮近期上下文。成长记录还留着。':'我没找到对应的记忆卡。可以右键我打开「记忆与成长」看看。';}
   else reply='你想忘掉哪一条？可以说“忘掉我的称呼”，或者在记忆档案里删除指定卡片。';
  }else if(/我(?:现在)?(?:叫|的名字|的昵称|的称呼)|怎么称呼我|叫出.*称呼/.test(text)&&/什么|还记得|叫出|[？?]/.test(text)&&!(await memory.snapshot()).facts.some(f=>f.key==='name')){
   mode='memory-answer';reply='我现在没有你的称呼记录。你想让我叫你什么？';await memory.record(text,reply);
  }else{
   if(typeof generate!=='function')throw new Error('DeepSeek 聊天服务未接入');
   const snapshot=await memory.snapshot(),state=getState(),persona=buildPersona({state,memory:snapshot,userText:text,now:clock()});
   const parsed=parseCharacterReply(await generate({system:persona.system,history:snapshot.recent,text}));reply=parsed.reply;emotion=parsed.emotion==='hiss'&&!persona.hissAllowed?'neutral':parsed.emotion;
   if(!reply)throw new Error('模型未返回文本');await memory.record(text,reply,emotion==='hiss',snapshot.revision);
  }
  await dispatch({type:'chat-reply',text:reply,emotion});return {ok:true,text:reply,mode};
 });queue=work.catch(()=>{});return work;};
 return {send,flush:()=>queue};
}
