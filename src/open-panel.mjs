import {readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
try {
  const {endpoint}=JSON.parse(await readFile(path.join(os.homedir(),'.dsh','maodie-life','runtime.json'),'utf8'));
  const u=new URL(endpoint);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1')throw new Error('本机服务地址无效');
  let ready=false;
  for(let attempt=0;attempt<30;attempt++){
    const response=await fetch(endpoint+'/telemetry',{signal:AbortSignal.timeout(2000)});
    if(!response.ok)throw new Error('养成服务暂时没有响应');
    const data=await response.json();
    if(data.renders>0||data.recent?.some(item=>item.kind==='ready')){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw new Error('桌宠窗口还未准备好，请等待它出现后再试');
  const result=await fetch(endpoint+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'panel-open',source:'launcher'}),signal:AbortSignal.timeout(4000)});
  if(!result.ok)throw new Error('养成服务暂时没有响应');
  console.log('正在打开耄耋成长档案。');
} catch(error) {
  console.error('请先启动 DeepSeek Harness 桌宠，再打开成长面板。\n'+error.message);
  process.exitCode=1;
}
