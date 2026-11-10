import http from 'node:http';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LifeStore} from './store.mjs';
import {reduce,summary} from './model.mjs';
import {TodoStore} from './todos.mjs';
import {MemoryStore,parseMemoryCommand} from './memory.mjs';
import {createCharacterChat} from './chat.mjs';
export const MENU_OWNER='耄耋养成';
export const MENU_EVENTS={'打开养成面板':'panel-open','查看成长档案':'status','轻轻摸头':'poke','喂一份食物':'feed','陪它玩一会':'play','开始25分钟专注':'focus-start','暂停或继续专注':'focus-toggle','取消这次专注':'focus-cancel','30秒专注演示':'focus-demo'};
export const firedMenuEvents=events=>Object.entries(events||{}).filter(([label,pet])=>MENU_EVENTS[label]&&pet==='maodie').map(([label])=>MENU_EVENTS[label]);
const ascii=value=>JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
export async function startController({dataDir,hostBase,menus=true,clock=()=>Date.now(),logger=console,chatGenerate,prepareQuit,goodbyeMs=2500}={}){
  const host=new URL(hostBase);if(host.hostname!=='127.0.0.1')throw new Error('桌宠宿主必须是本机地址');
  const store=new LifeStore(path.join(dataDir,'state.json'));let state=await store.load(clock()),closed=false;
  const todos=await new TodoStore(path.join(dataDir,'todos.json'),clock).load();
  const memory=await new MemoryStore(path.join(dataDir,'memory.json'),clock).load();
  const telemetry={clicks:0,drags:0,chases:0,renders:0,last:null,recent:[]};let queue=Promise.resolve(),endpoint;
  const dispatch=(event)=>{const work=queue.then(async()=>{const next=reduce(state,event,clock());if(JSON.stringify(next)!==JSON.stringify(state)){await store.save(next);state=next;}return summary(state,clock());});queue=work.catch(()=>{});return work;};
  let quitState=null,quitPromise=null,quitTimer=null;
  const snapshot=()=>({...summary(state,clock()),exit:quitState});
  const chat=createCharacterChat({memory,generate:chatGenerate,dispatch,getState:snapshot,clock});
  const flush=async()=>{await chat.flush();await queue;await Promise.all([store.flush(),todos.flush(),memory.flush()]);};
  const beginQuit=()=>{
    if(quitPromise)return quitPromise;
    quitPromise=(async()=>{
      if(typeof prepareQuit!=='function')throw new Error('请从桌面宿主打开此功能，演示环境不会关闭电脑程序。');
      quitState={status:'preparing',message:'等一下，我把回忆收好。'};
      const plan=await prepareQuit();if(typeof plan?.shutdown!=='function')throw new Error('退出准备失败，请稍后重试。');
      quitState={status:'saving',message:'等一下，我把回忆收好。'};
      plan.cancelChat?.();await flush();await dispatch({type:'goodbye'});await flush();
      quitState={status:'goodbye',message:'拜拜啦，今天就陪你到这里。下次再见！'};
      quitTimer=setTimeout(async()=>{try{await plan.shutdown();await close();}catch(error){quitState={status:'error',message:'退出没有完成：'+error.message};quitPromise=null;logger.error?.(quitState.message);}},goodbyeMs);
      return {ok:true,saved:true,state:snapshot()};
    })().catch(error=>{quitState={status:'error',message:error.message};quitPromise=null;throw error;});
    return quitPromise;
  };
  const response=(res,status,value,origin)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':origin==='null'?'null':endpoint,'Vary':'Origin','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(origin&&origin!=='null'&&origin!==endpoint)return response(res,403,{ok:false,message:'仅供本地桌宠使用'},origin);
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':origin==='null'?'null':endpoint,'Access-Control-Allow-Methods':'GET, POST, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});return res.end();}
    try{
      const url=new URL(req.url,endpoint);
      if(req.method==='GET'&&['/panel','/memories','/goodbye','/exit-ui.js'].includes(url.pathname)){const file={'/panel':'panel.html','/memories':'memories.html','/goodbye':'goodbye.html','/exit-ui.js':'exit-ui.js'}[url.pathname];const bytes=await readFile(new URL('./'+file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(bytes);}
      if(req.method==='GET'&&url.pathname.startsWith('/art/')){
        const name=decodeURIComponent(url.pathname.slice(5));const allowed=new Set(['待机','开心','被摸','哈气','走路','睡觉','偷吃被抓住','飞机耳','蹭头撒娇','翻肚皮','我真的特别爱你']);
        if(!allowed.has(name))return response(res,404,{ok:false,message:'素材不存在'},origin);
        const bytes=await readFile(path.join(dataDir,'..','dsh-pet','pet','maodie-animation',name+'.webm'));res.writeHead(200,{'Content-Type':'video/webm','Content-Length':bytes.length,'Cache-Control':'public, max-age=3600'});return res.end(bytes);
      }
      if(req.method==='GET'&&url.pathname==='/health')return response(res,200,{ok:true,service:'maodie-life',version:'0.4.3'},origin);
      if(req.method==='GET'&&url.pathname==='/memory'){const m=await memory.snapshot();return response(res,200,{ok:true,facts:m.facts,recentMessages:m.recent.length,warning:memory.warning},origin);}
      if(req.method==='GET'&&url.pathname==='/chat'){const m=await memory.snapshot();return response(res,200,{ok:true,messages:m.recent,rounds:12},origin);}
      if(req.method==='GET'&&url.pathname==='/todos')return response(res,200,{ok:true,todos:await todos.list(),warning:todos.warning},origin);
      if(req.method==='GET'&&url.pathname==='/reminders')return response(res,200,{ok:true,todos:await todos.due()},origin);
      if(req.method==='GET'&&url.pathname==='/state'){if(!quitState||quitState.status==='error')await dispatch({type:'tick'});return response(res,200,{ok:true,state:snapshot(),warning:store.warning},origin);}
      if(req.method==='GET'&&url.pathname==='/telemetry')return response(res,200,{ok:true,...telemetry},origin);
      const todoPath=/^\/todos(?:\/([A-Za-z0-9_-]{1,64}))?$/.exec(url.pathname),ackPath=/^\/reminders\/([A-Za-z0-9_-]{1,64})\/ack$/.exec(url.pathname),memoryPath=/^\/memory(?:\/([A-Za-z0-9_-]{1,64}))?$/.exec(url.pathname);
      if(!todoPath&&!ackPath&&!memoryPath&&(req.method!=='POST'||!['/event','/telemetry','/chat','/context/reset','/quit'].includes(url.pathname)))return response(res,404,{ok:false,message:'接口不存在'},origin);
      let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)return response(res,413,{ok:false,message:'请求过大'},origin);raw+=chunk;}
      let body;try{body=JSON.parse(raw||'{}');if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}catch{return response(res,400,{ok:false,message:'无效JSON'},origin);}
      if(url.pathname==='/quit')return response(res,200,await beginQuit(),origin);
      if(quitState&&quitState.status!=='error'&&url.pathname!=='/telemetry')return response(res,409,{ok:false,message:'正在保存并退出，稍后再见。'},origin);
      if(url.pathname==='/chat'){if(body.attachment)throw new Error('这个角色版本先支持文字聊天');return response(res,200,await chat.send(body.text),origin);}
      if(url.pathname==='/context/reset'){await memory.clearRecent();return response(res,200,{ok:true},origin);}
      if(memoryPath){const id=memoryPath[1];
        if(!id&&req.method==='POST'){const command=parseMemoryCommand('记住，'+String(body.text||''));if(command?.kind!=='remember')throw new Error('请输入要记住的内容');await memory.remember(command.facts);return response(res,200,{ok:true},origin);}
        if(id&&req.method==='PATCH')return response(res,200,{ok:true,fact:await memory.edit(id,body.value)},origin);
        if(id&&req.method==='DELETE')return response(res,200,{ok:true,removed:await memory.forget({id})},origin);
        return response(res,405,{ok:false,message:'不支持的记忆操作'},origin);
      }
      if(todoPath){
        const id=todoPath[1];
        if(!id&&req.method==='POST')return response(res,200,{ok:true,todo:await todos.create(body)},origin);
        if(id&&req.method==='PATCH'){const before=(await todos.list()).find(t=>t.id===id),todo=await todos.patch(id,body);if(todo.done&&!before?.done)await dispatch({type:'todo-complete',todoId:id});return response(res,200,{ok:true,todo},origin);}
        if(id&&req.method==='DELETE')return response(res,200,{ok:true,removed:await todos.remove(id)},origin);
        return response(res,405,{ok:false,message:'不支持的待办操作'},origin);
      }
      if(ackPath){if(req.method!=='POST')return response(res,405,{ok:false,message:'不支持的提醒操作'},origin);return response(res,200,{ok:true,acknowledged:await todos.acknowledge(ackPath[1],body.dueAt)},origin);}
      if(url.pathname==='/telemetry'){
        const kinds=['click','drag','chase','playing','ended','applied','ready','error','menu','menu-open','panel-opened','reminder','affinity'];if(!kinds.includes(body.kind))throw new Error('无效反馈类型');
        if(body.kind==='click')telemetry.clicks++;if(body.kind==='drag')telemetry.drags++;if(body.kind==='chase')telemetry.chases++;if(body.kind==='playing')telemetry.renders++;
        telemetry.last={at:clock(),kind:body.kind,animation:typeof body.animation==='string'?body.animation.slice(0,30):null,actionId:Number.isFinite(body.actionId)?body.actionId:null,message:typeof body.message==='string'?body.message.slice(0,150):null};telemetry.recent.push(telemetry.last);telemetry.recent=telemetry.recent.slice(-30);
        return response(res,200,{ok:true},origin);
      }
      return response(res,200,{ok:true,state:await dispatch(body)},origin);
    }catch(error){response(res,400,{ok:false,message:error.message},origin);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  endpoint=`http://127.0.0.1:${server.address().port}`;
  await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'runtime.json'),JSON.stringify({endpoint,hostBase,pid:process.pid,startedAt:clock()},null,2)+'\n');
  const abort=new AbortController();
  const hostCall=async(route,body)=>{const result=await fetch(hostBase+route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:ascii(body),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(7000)])});if(!result.ok)throw new Error(`桌宠接口 HTTP ${result.status}`);const data=await result.json();if(data.ok===false)throw new Error(data.message||data.reason);return data;};
  let registration=false;
  const menuLoop=async()=>{while(!closed){try{
    if(!registration){await hostCall('/menu/item',{owner:MENU_OWNER,labels:Object.keys(MENU_EVENTS),target:'desktop'});registration=true;}
    const result=await hostCall(`/menu/events?owner=${encodeURIComponent(MENU_OWNER)}&wait=1500`);
    for(const type of firedMenuEvents(result.events))await dispatch({type,source:'menu'});
  }catch(error){if(closed)break;registration=false;logger.warn?.('[maodie-life] 菜单重试：'+error.message);await new Promise(r=>setTimeout(r,1500));}}};
  if(menus)void menuLoop();
  const ticker=setInterval(()=>{if(quitState&&quitState.status!=='error')return;void dispatch({type:'tick'}).catch(e=>logger.error?.('[maodie-life] '+e.message));},1000);ticker.unref?.();
  async function close(){if(closed)return;closed=true;clearTimeout(quitTimer);clearInterval(ticker);abort.abort();if(menus)await fetch(`${hostBase}/menu/item?owner=${encodeURIComponent(MENU_OWNER)}`,{method:'DELETE',signal:AbortSignal.timeout(1000)}).catch(()=>{});server.closeAllConnections?.();await new Promise(r=>server.close(r));await flush();}
  return {endpoint,store,memory,dispatch,getState:snapshot,close};
}
