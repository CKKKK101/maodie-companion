import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const textOf=value=>{
  if(typeof value!=='string'||!value.trim()||Array.from(value.trim()).length>200)throw new Error('事项请输入1到200个字');
  return value.trim();
};
const dueOf=value=>{
  if(value===null||value===undefined)return null;
  if(!Number.isFinite(value)||Math.abs(value)>8640000000000000)throw new Error('提醒时间无效');
  return value;
};
export class TodoStore {
  constructor(file,clock=()=>Date.now()){this.file=file;this.clock=clock;this.todos=[];this.tail=Promise.resolve();this.warning=null;}
  async load(){
    try{
      const value=JSON.parse(await readFile(this.file,'utf8'));
      if(value.version!==1||!Array.isArray(value.todos))throw new Error('待办文件格式无效');
      const ids=new Set();this.todos=value.todos.map(item=>{
        if(!item||typeof item.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(item.id)||ids.has(item.id))throw new Error('待办编号无效');
        ids.add(item.id);return {...item,text:textOf(item.text),dueAt:dueOf(item.dueAt),done:item.done===true};
      });
    }catch(error){
      if(error.code!=='ENOENT'){await rename(this.file,this.file+'.corrupt-'+this.clock());this.warning='待办存档异常，已保留副本';}
      this.todos=[];
    }
    return this;
  }
  mutate(fn){
    const work=this.tail.then(async()=>{
      const next=structuredClone(this.todos),result=fn(next);
      await mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';
      await writeFile(temp,JSON.stringify({version:1,todos:next},null,2)+'\n','utf8');await rename(temp,this.file);this.todos=next;return structuredClone(result);
    });
    this.tail=work.catch(()=>{});return work;
  }
  async list(){await this.tail;return structuredClone(this.todos).sort((a,b)=>Number(a.done)-Number(b.done)||(a.dueAt??Infinity)-(b.dueAt??Infinity)||a.createdAt-b.createdAt);}
  async due(){return (await this.list()).filter(t=>!t.done&&t.dueAt!==null&&t.dueAt<=this.clock()&&t.notifiedDueAt!==t.dueAt);}
  create(input){const text=textOf(input.text),dueAt=dueOf(input.dueAt);return this.mutate(list=>{
    if(list.length>=500)throw new Error('待办已满，请先清理已完成事项');
    const at=this.clock(),todo={id:randomUUID(),text,dueAt,done:false,createdAt:at,updatedAt:at,completedAt:null,lastRemindedAt:null,notifiedDueAt:null};list.push(todo);return todo;
  });}
  patch(id,input){return this.mutate(list=>{
    const todo=list.find(t=>t.id===id);if(!todo)throw new Error('没有这条待办');
    if('text'in input)todo.text=textOf(input.text);
    if('dueAt'in input){const dueAt=dueOf(input.dueAt);if(dueAt!==todo.dueAt){todo.dueAt=dueAt;todo.notifiedDueAt=null;todo.lastRemindedAt=null;}}
    if('done'in input){if(typeof input.done!=='boolean')throw new Error('完成状态无效');todo.done=input.done;todo.completedAt=input.done?this.clock():null;}
    todo.updatedAt=this.clock();return todo;
  });}
  remove(id){return this.mutate(list=>{const index=list.findIndex(t=>t.id===id);if(index<0)return 0;list.splice(index,1);return 1;});}
  acknowledge(id,dueAt){return this.mutate(list=>{
    const todo=list.find(t=>t.id===id);if(!todo||todo.done||typeof todo.dueAt!=='number'||todo.dueAt!==dueAt||todo.dueAt>this.clock())return false;
    todo.notifiedDueAt=dueAt;todo.lastRemindedAt=this.clock();return true;
  });}
  async flush(){await this.tail;}
}
