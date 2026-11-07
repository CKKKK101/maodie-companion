import {readFile,writeFile,mkdir,rename,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const HERE=path.dirname(fileURLToPath(import.meta.url));
export async function installHooks({hostRoot,endpoint,backupDir}){
  const runtime=path.join(hostRoot,'runtime/electron-helper');
  const specs=[
    ['index.html','    <script src="./renderer.js"></script>','    <!-- maodie-life:begin -->\n    <link rel="stylesheet" href="./maodie-readable.css">\n    <script src="./maodie-life-client.js"></script>\n    <!-- maodie-life:end -->\n'],
    ['preload.js',"contextBridge.exposeInMainWorld('petBridge', {", "  /* maodie-life:begin */\n  lifeCursor() { return ipcRenderer.invoke('maodie-life:cursor'); },\n  lifePanel(endpoint, view) { return ipcRenderer.invoke('maodie-life:panel', endpoint, view); },\n  /* maodie-life:end */\n"],
    ['main/ipc.js','function registerIpc({ ipcMain, petWindows, shell, openTarget, petRoute }) {',`  /* maodie-life:begin */
  ipcMain.removeHandler('maodie-life:cursor');
  ipcMain.handle('maodie-life:cursor', () => screen.getCursorScreenPoint());
  const lifePanelWindows = new Map();
  ipcMain.removeAllListeners('maodie-life:panel');
  ipcMain.removeHandler('maodie-life:panel');
  ipcMain.handle('maodie-life:panel', async (event, endpoint, view = 'panel') => {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/') throw new Error('养成面板地址无效');
    if (!['panel','memories'].includes(view)) throw new Error('没有这个档案页面');
    let lifePanelWindow = lifePanelWindows.get(view);
    if (lifePanelWindow && !lifePanelWindow.isDestroyed()) { lifePanelWindow.show(); lifePanelWindow.focus(); return {ok:true}; }
    lifePanelWindow = new BrowserWindow({ title: view === 'memories' ? '耄耋记忆与成长' : '耄耋成长档案', width: view === 'memories' ? 560 : 480, height: 770, minWidth: 440, minHeight: 700, autoHideMenuBar: true, backgroundColor: '#faf8f2', webPreferences: { contextIsolation: true, nodeIntegration: false } });
    lifePanelWindows.set(view, lifePanelWindow);
    lifePanelWindow.on('closed', () => { lifePanelWindows.delete(view); });
    await lifePanelWindow.loadURL(url.origin + '/' + view);
    lifePanelWindow.show(); lifePanelWindow.focus(); return {ok:true};
  });
  /* maodie-life:end */
`]
  ];
  const writes=[];
  for(const [relative,anchor,block]of specs){
    const file=path.join(runtime,relative),text=await readFile(file,'utf8');let next;
    if(text.includes('maodie-life:begin')){
      const pattern=relative==='index.html'?/    <!-- maodie-life:begin -->[\s\S]*?    <!-- maodie-life:end -->\r?\n/:/  \/\* maodie-life:begin \*\/[\s\S]*?  \/\* maodie-life:end \*\/\r?\n/;
      if(!pattern.test(text))throw new Error('扩展标记损坏：'+relative);next=text.replace(pattern,block);
    }else{if(!text.includes(anchor))throw new Error('宿主版本不匹配，找不到扩展点：'+relative);next=relative==='index.html'?text.replace(anchor,block+anchor):text.replace(anchor,anchor+'\n'+block);}
    if(next!==text)writes.push({file,relative,text:next});
  }
  await mkdir(backupDir,{recursive:true});
  for(const item of writes){const backup=path.join(backupDir,item.relative);await mkdir(path.dirname(backup),{recursive:true});await copyFile(item.file,backup);const temp=item.file+'.'+randomUUID()+'.tmp';await writeFile(temp,item.text,'utf8');await rename(temp,item.file);}
  const clientFile=path.join(runtime,'maodie-life-client.js');const source=await readFile(path.join(HERE,'life-client.js'),'utf8');const client=source.replace('__LIFE_API__',endpoint);const previous=await readFile(clientFile,'utf8').catch(()=>null);
  if(previous!==client){const temp=clientFile+'.'+randomUUID()+'.tmp';await writeFile(temp,client,'utf8');await rename(temp,clientFile);}
  const styleFile=path.join(runtime,'maodie-readable.css'),style=await readFile(path.join(HERE,'readable.css'),'utf8'),previousStyle=await readFile(styleFile,'utf8').catch(()=>null);
  if(previousStyle!==style){const temp=styleFile+'.'+randomUUID()+'.tmp';await writeFile(temp,style,'utf8');await rename(temp,styleFile);}
  return {files:writes.map(w=>w.relative),clientChanged:previous!==client||previousStyle!==style,runtime,backupDir};
}
