import {randomUUID} from 'node:crypto';
// Only the upstream pet caller is adjusted. Other Harness conversations keep
// their own request options and session identity.
export function installPetChatCompat(llm,{sessionId=randomUUID(),maxTokens=1024}={}){
  if(!llm||typeof llm.stream!=='function')throw new Error('DeepSeek 模型服务尚未就绪');
  const original=llm.stream;
  function stream(options){
    return original.call(this,options?.sessionId==='dsh-pet'?{...options,sessionId,maxTokens:Math.min(options.maxTokens??maxTokens,maxTokens)}:options);
  }
  llm.stream=stream;
  return ()=>{if(llm.stream===stream)llm.stream=original;};
}
