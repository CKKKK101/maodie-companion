import {homedir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startController} from './controller.mjs';
import {installHooks} from './compat.mjs';
import {installPetChatCompat} from './llm-compat.mjs';
import {makeDeepSeekGenerator} from './generate.mjs';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {prepareDesktopExit} from './desktop-exit.mjs';
export const name='maodie-life';
export const inject=['webServer','llm'];
export async function apply(ctx){
  const undoChatCompat=installPetChatCompat(ctx.llm);ctx.effect(()=>undoChatCompat,'maodie-life: pet chat compatibility');
  const home=process.env.DSH_HOME||path.join(homedir(),'.dsh');
  const profile=path.join(home,'profiles','desktop');
  const requireFromProfile=createRequire(path.join(profile,'package.json'));
  const hostRoot=path.dirname(path.dirname(requireFromProfile.resolve('dsh-pet')));
  const hostBase=`http://127.0.0.1:${ctx.webServer.port}/dsh-pet-7340`;
  const dataDir=path.join(home,'maodie-life');
  let types;try{types=await import('@deepseek-ai/dsh-llm');}catch{types=await import(pathToFileURL(path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js')).href);}
  const chatAbort=new AbortController();ctx.effect(()=>()=>chatAbort.abort(),'maodie-life: stop character chat');
  const selectModel=async()=>{const cfg=JSON.parse(await readFile(path.join(home,'dsh-pet/pet/maodie-config.json'),'utf8'));const selected=cfg.chatModel;return selected?.provider&&selected?.model?{provider:selected.provider,model:selected.model}:{provider:'deepseek-account',model:'deepseek-v4-pro'};};
  const chatGenerate=makeDeepSeekGenerator({llm:ctx.llm,types,selectModel,signal:chatAbort.signal});
  const logger={warn:m=>ctx.logger?.warn?.(m),error:m=>ctx.logger?.error?.(m)};
  const prepareQuit=async()=>{
    const shutdown=await prepareDesktopExit({dataDir,petExecutable:path.join(home,'electron','electron.exe')});
    return {cancelChat:()=>chatAbort.abort(),shutdown};
  };
  const service=await startController({dataDir,hostBase,logger,chatGenerate,prepareQuit});
  ctx.effect(()=>()=>service.close(),'maodie-life: controller');
  const patch=await installHooks({hostRoot,endpoint:service.endpoint,backupDir:path.join(dataDir,'host-backups',String(Date.now()))});
  ctx.logger?.info?.(`[maodie-life] 养成服务 ${service.endpoint}，存档 ${path.join(dataDir,'state.json')}`);
  if(patch.files.length||patch.clientChanged){const result=await fetch(hostBase+'/reload',{method:'POST',signal:AbortSignal.timeout(5000)});if(!result.ok)throw new Error('扩展已安装，但桌面重载失败');}
}
