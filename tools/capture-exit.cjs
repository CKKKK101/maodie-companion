// Isolated UI verification and screenshot; never closes the user's host.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');const {pathToFileURL}=require('node:url');
app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});app.commandLine.appendSwitch('force-device-scale-factor','1');
const root=path.resolve(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));let service;
app.whenReady().then(async()=>{
 const work=await fs.mkdtemp(path.join(root,'.test-data-exit-gallery-')),dataDir=path.join(work,'maodie-life'),art=path.join(work,'dsh-pet','pet','maodie-animation');await fs.mkdir(art,{recursive:true});
 for(const name of ['被摸','待机'])await fs.copyFile(path.join(root,'vendor/maodie-pet/pets/maodie/maodie-animation',name+'.webm'),path.join(art,name+'.webm'));
 const {startController}=await import(pathToFileURL(path.join(root,'src/controller.mjs')).href);
 service=await startController({dataDir,hostBase:'http://127.0.0.1:1',menus:false,goodbyeMs:60000,prepareQuit:async()=>({shutdown:async()=>{}})});
 for(const view of ['panel','memories']){
  const win=new BrowserWindow({width:520,height:900,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadURL(service.endpoint+'/'+view);await wait(500);
  await win.webContents.executeJavaScript("document.querySelector('[data-quit]').click()");await wait(700);
  const text=await win.webContents.executeJavaScript("document.querySelector('[data-exit-status]').textContent");
  if(!text.includes('已保存'))throw Error('Exit UI failed: '+view+': '+text);
  console.log('界面按钮通过：'+view+' → '+text);win.destroy();
 }
 const win=new BrowserWindow({width:480,height:640,useContentSize:true,show:false,backgroundColor:'#faf8f2',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 await win.loadURL(service.endpoint+'/goodbye');await wait(900);
 await wait(400);
 await fs.writeFile(path.join(root,'docs/images/拜拜退出.png'),(await win.webContents.capturePage()).toPNG());
 await service.close();win.destroy();console.log('退出界面预览已生成');app.quit();
}).catch(async e=>{console.error(e.stack);if(service)await service.close();app.exit(1);});
