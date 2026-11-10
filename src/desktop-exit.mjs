import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const execute=promisify(execFile);
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const encode=script=>Buffer.from(script,'utf16le').toString('base64');
export function validateDesktopParent(parent,{parentPid,executable}){
 if(!parent||parent.pid!==parentPid||!Number.isSafeInteger(parentPid)||parentPid<1||typeof parent.path!=='string'||parent.path.toLowerCase()!==executable.toLowerCase()||path.win32.basename(executable).toLowerCase()!=='deepseek harness.exe'||!/^\d+$/.test(String(parent.started)))throw new Error('无法确认桌面宿主进程，未执行退出。请从 DeepSeek Harness 打开桌宠。');
 return {pid:parent.pid,path:parent.path,started:String(parent.started)};
}
export function shutdownScript(plan,{petExecutable,resultFile}){
 // Recheck executable and creation time: never act on a reused process ID.
 return `Start-Sleep -Milliseconds 900
$ErrorActionPreference='Stop'
$root=Get-CimInstance Win32_Process -Filter 'ProcessId = ${plan.pid}'
if(-not $root -or $root.ExecutablePath -ine ${quote(plan.path)} -or $root.CreationDate.ToUniversalTime().Ticks.ToString() -ne ${quote(plan.started)}){exit 0}
$all=@(Get-CimInstance Win32_Process)
$owned=[System.Collections.Generic.HashSet[uint32]]::new()
[void]$owned.Add([uint32]${plan.pid})
do{$changed=$false;foreach($item in $all){if($owned.Contains([uint32]$item.ParentProcessId) -and $owned.Add([uint32]$item.ProcessId)){$changed=$true}}}while($changed)
$targets=@($all|Where-Object {$owned.Contains([uint32]$_.ProcessId) -and ($_.ExecutablePath -ieq ${quote(plan.path)} -or $_.ExecutablePath -ieq ${quote(petExecutable)})}|Sort-Object @{Expression={if($_.ProcessId -eq ${plan.pid}){0}else{1}}})
$stopped=@()
foreach($item in $targets){$live=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$item.ProcessId);if($live -and $live.ExecutablePath -ieq $item.ExecutablePath -and $live.CreationDate -eq $item.CreationDate){Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue;$stopped+=$item.ProcessId}}
@{status='stopped';stoppedProcessIds=$stopped;at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath ${quote(resultFile)} -Encoding UTF8
`;
}
export async function prepareDesktopExit({dataDir,petExecutable,platform=process.platform,parentPid=process.ppid,executable=process.execPath,run=execute,systemRoot=process.env.SystemRoot||'C:\\Windows'}={}){
 if(platform!=='win32')throw new Error('当前退出方式仅支持 Windows 桌面宿主。');
 const powershell=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 if(!Number.isSafeInteger(parentPid)||parentPid<1)throw new Error('无法确认桌面宿主进程。');
 const probe=`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${parentPid}';if($p){@{pid=[int]$p.ProcessId;path=$p.ExecutablePath;started=$p.CreationDate.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json -Compress}`;
 const {stdout}=await run(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',encode(probe)],{windowsHide:true,timeout:5000,maxBuffer:16384});
 let parent;try{parent=JSON.parse(stdout.replace(/^\uFEFF/,'').trim());}catch{throw new Error('无法读取桌面宿主状态，未执行退出。');}
 const plan=validateDesktopParent(parent,{parentPid,executable});
 const script=shutdownScript(plan,{petExecutable,resultFile:path.join(dataDir,'exit-result.json')});
 return async()=>{
  // The short-lived launcher exits before the worker runs. The worker is then
  // outside the host's live descendant tree and can finish stopping that tree.
  const launch=`$child=Start-Process -FilePath ${quote(powershell)} -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',${quote(encode(script))}) -WindowStyle Hidden -PassThru;$child.Id`;
  await run(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',encode(launch)],{windowsHide:true,timeout:5000,maxBuffer:16384});
 };
}
