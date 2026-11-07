import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';import {randomUUID} from 'node:crypto';
const clean=x=>String(x??'').trim().replace(/[。！!]+$/,'');
const namePattern=/^(?:请)?(?:以后)?(?:叫我|称呼我|我叫|我的名字是|我的名字叫|我的昵称是|我的称呼是|把我的称呼改成|把我的名字改成|改叫)([^，,。！？!?\n]{1,24})$/;
export function parseMemoryCommand(raw){
 const text=clean(raw);
 if(/^(?:请)?(?:忘掉|忘记|删除)(?:你记住的)?(?:全部|所有)(?:记忆)?$/.test(text))return {kind:'clarify'};
 if(/^(?:请)?(?:忘掉|忘记|删除)(?:我[的]?|关于我的)?(?:称呼|名字|昵称)$/.test(text))return {kind:'forget',key:'name'};
 const forget=/^(?:请)?(?:忘掉|忘记|删除)(?:关于)?(.{1,120})$/.exec(text);if(forget)return {kind:'forget',query:forget[1]};
 const explicit=/^(?:请)?记住[，,:：\s]*(.{1,240})$/.exec(text);
 const content=explicit?explicit[1]:text,parts=content.split(/[，,；;]/).map(clean).filter(Boolean),facts=[];
 for(const part of parts){
  const name=namePattern.exec(part);if(name){facts.push({key:'name',value:name[1],label:'希望被称呼为',evidence:raw});continue;}
  const pref=/^我(?:现在)?(不喜欢|讨厌|喜欢)(.{1,60}?)(?:了)?$/.exec(part);
  if(pref){const topic=clean(pref[2]);facts.push({key:'preference:'+topic,value:pref[1]+topic,label:'偏好',evidence:raw});continue;}
  if(explicit)facts.push({key:'note:'+part.toLocaleLowerCase(),value:part,label:'你让我记住的事',evidence:raw});
 }
 if(!explicit&&!namePattern.test(text))return null;
 if(facts.length)return {kind:'remember',facts};
 return null;
}
export class MemoryStore{
 constructor(file,clock=()=>Date.now()){this.file=file;this.clock=clock;this.data={version:1,revision:0,facts:[],recent:[],turn:0,lastHissTurn:-3};this.tail=Promise.resolve();this.warning=null;}
 async load(){
  try{const d=JSON.parse(await readFile(this.file,'utf8'));if(d.version!==1||!Array.isArray(d.facts)||!Array.isArray(d.recent))throw new Error('格式无效');
   this.data={version:1,revision:Number(d.revision)||0,facts:d.facts.filter(f=>f.sourceRole==='user'&&typeof f.id==='string'&&typeof f.value==='string'&&typeof f.key==='string').slice(-50),recent:d.recent.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-24),turn:Number(d.turn)||0,lastHissTurn:Number.isFinite(d.lastHissTurn)?d.lastHissTurn:-3};
  }catch(e){if(e.code!=='ENOENT'){await rename(this.file,this.file+'.corrupt-'+this.clock());this.warning='记忆存档异常，已保留副本';}}
  return this;
 }
 mutate(fn){const work=this.tail.then(async()=>{const next=structuredClone(this.data),result=fn(next);await mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(next,null,2)+'\n','utf8');await rename(temp,this.file);this.data=next;return result;});this.tail=work.catch(()=>{});return work;}
 async snapshot(){await this.tail;return structuredClone(this.data);}
 remember(facts){return this.mutate(d=>{for(const f of facts){if(!f.value?.trim()||f.value.length>240)throw new Error('记忆内容需为1到240个字');const existing=d.facts.find(x=>x.key===f.key),now=this.clock();if(existing)Object.assign(existing,{value:f.value,evidence:f.evidence,updatedAt:now});else{if(d.facts.length>=50)throw new Error('记忆卡已满，请先整理一些');d.facts.push({...f,id:randomUUID(),sourceRole:'user',createdAt:now,updatedAt:now});}}d.recent=[];d.revision++;return facts.length;});}
 forget({id,key,query}){return this.mutate(d=>{const before=d.facts.length;d.facts=d.facts.filter(f=>!(id?f.id===id:key?f.key===key:query&&(f.value.includes(query)||f.label?.includes(query))));const removed=before-d.facts.length;if(removed){d.recent=[];d.revision++;}return removed;});}
 edit(id,value){return this.mutate(d=>{if(typeof value!=='string'||!value.trim()||value.length>240)throw new Error('记忆内容需为1到240个字');const f=d.facts.find(x=>x.id===id);if(!f)throw new Error('没有这条记忆');f.value=value.trim();f.evidence='用户在记忆档案中改为：'+value.trim();f.updatedAt=this.clock();d.recent=[];d.revision++;return structuredClone(f);});}
 clearRecent(){return this.mutate(d=>{d.recent=[];d.revision++;});}
 record(user,assistant,hissed=false,revision){return this.mutate(d=>{if(revision!==undefined&&revision!==d.revision)throw new Error('记忆刚刚更新了，请重新发送这句话');const at=this.clock();d.recent.push({role:'user',content:user,at},{role:'assistant',content:assistant,at});d.recent=d.recent.slice(-24);d.turn++;if(hissed)d.lastHissTurn=d.turn;});}
 async flush(){await this.tail;}
}
