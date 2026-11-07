import {randomUUID} from 'node:crypto';
export function makeDeepSeekGenerator({llm,types,selectModel,signal}){
 const sessionId=randomUUID();
 return async({system,history,text})=>{
  const selected=await selectModel(),messages=history.map(m=>m.role==='user'?types.createUserMessage({content:[{type:'text',text:m.content}],source:{kind:'user'}}):types.createAssistantMessage({content:[{type:'text',text:m.content}],source:selected}));
  messages.push(types.createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));
  let off=false;try{const info=await llm.resolveModelInfo?.(selected.provider,selected.model);off=info?.reasoning?.efforts?.some(x=>x.id==='off')===true;}catch{}
  const assembler=new types.BlockAssembler();
  for await(const chunk of llm.stream({...selected,sessionId,system,messages,maxTokens:1024,...(off?{reasoningEffort:'off'}:{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(65000)]):AbortSignal.timeout(65000)}))assembler.push(chunk);
  if(assembler.finish?.kind==='error'||assembler.finish?.kind==='aborted')throw new Error(assembler.finish.failure?.message||'DeepSeek 暂时没有响应，请再试一次');
  const output=assembler.blocks().filter(x=>x.type==='text').map(x=>x.text||'').join('').trim();
  if(!output)throw new Error(assembler.finish?.failure?.message||'DeepSeek 未返回正文');return output;
 };
}
