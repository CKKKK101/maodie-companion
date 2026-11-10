(()=>{
 let busy=false,watch=null,overlay=null;
 const standalone=!!document.querySelector('[data-goodbye-page]');
 function show(){
  if(standalone)return;
  if(!overlay){
   const style=document.createElement('style');style.textContent='.maodie-exit-screen{position:fixed;inset:0;z-index:10000;background:#faf8f2f8;display:flex;align-items:center;justify-content:center;text-align:center;font:16px/1.8 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;color:#3b3c31;padding:24px}.maodie-exit-screen video{width:220px;height:220px;object-fit:contain}.maodie-exit-screen h2{font-size:25px;margin:10px 0}.maodie-exit-screen p{color:#747a64}.maodie-exit-screen small{font-size:12px;color:#93957f}.maodie-exit-screen button{font:inherit;padding:9px 22px;background:#657e4b;color:white;border:0;border-radius:10px;cursor:pointer}';document.head.append(style);
   overlay=document.createElement('div');overlay.className='maodie-exit-screen';overlay.setAttribute('role','status');
   const wrap=document.createElement('div'),video=document.createElement('video');video.src='/art/被摸';video.autoplay=true;video.loop=true;video.muted=true;video.playsInline=true;
   const title=document.createElement('h2');title.textContent='拜拜啦，下次再陪你。';const status=document.createElement('p');status.dataset.exitStatus='';
   const note=document.createElement('small');note.textContent='记忆和成长会保存，同时退出 DeepSeek Harness。';const retry=document.createElement('button');retry.textContent='再试一次';retry.hidden=true;retry.dataset.quit='';retry.onclick=quit;
   wrap.append(video,title,status,note,document.createElement('br'),retry);overlay.append(wrap);document.body.append(overlay);
  }
  overlay.hidden=false;
 }
 function message(text,error=false){for(const node of document.querySelectorAll('[data-exit-status]')){node.textContent=text;node.style.color=error?'#a84e35':'';}for(const node of document.querySelectorAll('[data-quit]')){node.disabled=busy;if(standalone||node.closest('.maodie-exit-screen'))node.hidden=!error;}}
 function failed(text){clearInterval(watch);watch=null;busy=false;message(text||'退出没有完成，点击重试。',true);}
 async function poll(){try{const r=await fetch('/state',{cache:'no-store'}),data=await r.json();if(data.state?.exit?.status==='error')failed(data.state.exit.message);else if(data.state?.exit?.status==='goodbye')message('记忆和成长已保存，正在退出。');}catch{clearInterval(watch);watch=null;message('已退出。下次再见！');}}
 async function quit(){
  if(busy)return;busy=true;show();message('等一下，我把回忆收好。');
  try{const r=await fetch('/quit',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.message||'退出没有完成');message('记忆和成长已保存，正在退出。');if(!watch)watch=setInterval(poll,700);}catch(error){failed(error.message);}
 }
 for(const button of document.querySelectorAll('[data-quit]'))button.addEventListener('click',quit);
 // Opening a URL never shuts down applications. The native menu initiates the
 // POST after showing this page; retries require an explicit button click.
 if(standalone){watch=setInterval(poll,400);void poll();}
})();
