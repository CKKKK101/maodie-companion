import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {initialState,normalizeState} from './model.mjs';
export class LifeStore{
  constructor(file){this.file=file;this.tail=Promise.resolve();this.state=null;this.warning=null;}
  async load(now=Date.now()){
    try{this.state=normalizeState(JSON.parse(await readFile(this.file,'utf8')),now);}
    catch(e){if(e.code!=='ENOENT'){this.warning='存档异常，已保留副本并建立新档';await rename(this.file,this.file+`.corrupt-${Date.now()}`).catch(()=>{});}this.state=initialState(now);}
    return this.state;
  }
  save(state){const text=JSON.stringify(state,null,2)+'\n';this.state=state;this.tail=this.tail.then(async()=>{await mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';await writeFile(temp,text,'utf8');await rename(temp,this.file);});return this.tail;}
  async flush(){await this.tail;}
}
