// 通过已安装的 Electron 渲染本项目界面；演示数据不会接触用户存档。
// 用法：electron tools/capture-gallery.cjs
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.on('window-all-closed',()=>{});
const root=path.resolve(__dirname,'..');
const output=path.join(root,'docs','images');
let service;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function capture(url,name,width,height,prepare){
 const win=new BrowserWindow({width,height,useContentSize:true,show:false,backgroundColor:'#faf8f2',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 await win.loadURL(url);await pause(1300);
 if(prepare)await win.webContents.executeJavaScript(prepare);
 await pause(500);
 await fs.writeFile(path.join(output,name),(await win.webContents.capturePage()).toPNG());
 win.destroy();console.log('已生成 '+name);
}
app.whenReady().then(async()=>{
 await fs.mkdir(output,{recursive:true});
 const work=await fs.mkdtemp(path.join(root,'.test-data-gallery-'));
 const dataDir=path.join(work,'maodie-life');await fs.mkdir(dataDir,{recursive:true});
 const assetDir=path.join(work,'dsh-pet','pet','maodie-animation');await fs.mkdir(assetDir,{recursive:true});
 const originalAssets=path.join(root,'vendor','maodie-pet','pets','maodie','maodie-animation');
 for(const name of ['待机','开心','被摸','哈气','走路','睡觉','偷吃被抓住','飞机耳','蹭头撒娇','翻肚皮','我真的特别爱你'])await fs.copyFile(path.join(originalAssets,name+'.webm'),path.join(assetDir,name+'.webm'));
 const {initialState,reduce}=await import(pathToFileURL(path.join(root,'src','model.mjs')).href);
 let now=Date.now()-20*60000,state=initialState(now);
 for(let i=0;i<3;i++)state=reduce(state,{type:'feed'},now+=60000);
 for(let i=0;i<10;i++)state=reduce(state,{type:'play'},now+=60000);
 state.action=null;
 await fs.writeFile(path.join(dataDir,'state.json'),JSON.stringify(state));
 const {startController}=await import(pathToFileURL(path.join(root,'src','controller.mjs')).href);
 service=await startController({dataDir,hostBase:'http://127.0.0.1:1',menus:false});
 async function post(route,body){const response=await fetch(service.endpoint+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(await response.text());return response.json();}
 await post('/memory',{text:'我叫小林（演示）'});
 await post('/memory',{text:'我喜欢安静的提醒'});
 const badge=`const badge=document.createElement('div');badge.textContent='独立演示存档 · 称呼与成长数值均为示例';badge.style.cssText='padding:9px;text-align:center;background:#e7eddd;color:#52683c;font:12px Microsoft YaHei,sans-serif';document.body.prepend(badge);`;
 await capture(service.endpoint+'/panel','成长档案.png',520,900,badge);
 await capture(service.endpoint+'/memories','长期记忆.png',620,1040,badge+`document.querySelector('details').open=true;`);
 await capture(service.endpoint+'/memories','关系成长.png',620,720,badge+`document.querySelector('[data-tab="relationship"]').click();`);
 await post('/event',{type:'focus-start'});
 await capture(service.endpoint+'/panel','专注陪伴.png',520,900,badge);
 const petUrl=pathToFileURL(path.join(originalAssets,'待机.webm')).href;
 const hero=path.join(work,'cover.html');
 await fs.writeFile(hero,`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f7f5ed;color:#302e26;font-family:'Microsoft YaHei UI','Microsoft YaHei',sans-serif}.wrap{width:1280px;height:760px;padding:72px 78px;position:relative;overflow:hidden}.eyebrow{color:#657b4b;font-size:20px;letter-spacing:4px}.title{font-size:83px;font-weight:800;margin:22px 0 14px;letter-spacing:6px}.line{font-size:34px;line-height:1.65;font-weight:650}.sub{font-size:21px;color:#777467;line-height:1.9;margin-top:22px}.tags{display:flex;gap:12px;margin-top:40px}.tags span{border:1px solid #d5ddc9;border-radius:25px;background:#edf1e5;color:#5a7341;padding:11px 20px;font-size:19px}.scene{position:absolute;right:55px;top:110px;width:420px;height:500px;border-radius:210px;background:radial-gradient(ellipse at 50% 78%,#e5dcc6,transparent 65%)}video{width:440px;height:440px;position:absolute;left:-10px;bottom:-8px}.bubble{position:absolute;top:12px;left:10px;background:white;border:1px solid #e2e1d3;border-radius:24px;padding:22px 26px;font-size:27px;box-shadow:0 8px 28px #473d2510}.bubble small{display:block;font-size:12px;color:#949380;margin-bottom:10px}.foot{position:absolute;bottom:43px;left:78px;color:#969080;font-size:14px}.version{position:absolute;right:78px;bottom:43px;font-size:15px;color:#65784e}</style><div class="wrap"><div class="eyebrow">有脾气 · 有记忆 · 会成长</div><div class="title">桌面耄耋</div><div class="line">这只猫会记仇，<br>也会慢慢记住你。</div><div class="sub">摸摸它、逗它玩、聊聊天。<br>从警惕到偏爱，把陪伴留在桌面上。</div><div class="tags"><span>聊天陪伴</span><span>长期记忆</span><span>关系成长</span></div><div class="scene"><video src="${petUrl}" autoplay muted loop></video><div class="bubble"><small>真实模型回复节选 · 封面排版展示</small>哈——这样满意了？</div></div><div class="foot">猫咪形象沿用原版耄耋动画 · 功能界面截图使用独立演示存档</div><div class="version">0.4.2 版</div></div>`);
 await capture(pathToFileURL(hero).href,'桌面耄耋封面.png',1280,760);
 await service.close();app.quit();
}).catch(async error=>{console.error(error.stack);if(service)await service.close();app.exit(1);});
