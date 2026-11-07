import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';import path from 'node:path';
import {installHooks} from '../src/compat.mjs';
test('兼容补丁只插入一次，保留原文件备份，端口变化只更新自有客户端',async()=>{
 const root=await mkdtemp(path.join(process.cwd(),'.test-data-'));const runtime=path.join(root,'runtime/electron-helper');await mkdir(path.join(runtime,'main'),{recursive:true});
 const originals={'index.html':'<body>\n    <script src="./renderer.js"></script>\n</body>','preload.js':"contextBridge.exposeInMainWorld('petBridge', {\n});",'main/ipc.js':'function registerIpc({ ipcMain, petWindows, shell, openTarget, petRoute }) {\n}'};
 for(const [name,body]of Object.entries(originals))await writeFile(path.join(runtime,name),body);
 const backup=path.join(root,'backup');const a=await installHooks({hostRoot:root,endpoint:'http://127.0.0.1:1234',backupDir:backup});assert.equal(a.files.length,3);assert.equal(await readFile(path.join(backup,'preload.js'),'utf8'),originals['preload.js']);
 const b=await installHooks({hostRoot:root,endpoint:'http://127.0.0.1:1234',backupDir:backup});assert.equal(b.files.length,0);assert.equal(b.clientChanged,false);await installHooks({hostRoot:root,endpoint:'http://127.0.0.1:5678',backupDir:backup});assert.ok((await readFile(path.join(runtime,'maodie-life-client.js'),'utf8')).includes('127.0.0.1:5678'));assert.equal((await readFile(path.join(runtime,'index.html'),'utf8')).match(/maodie-life:begin/g).length,1);
});
