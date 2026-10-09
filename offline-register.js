(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return;
  let registration, checking=false, probing=false, lease=null, releaseTimer, reloaded=false;
  let hadController=!!navigator.serviceWorker.controller;
  const stopInput=event=>{if(window.ZebrolUpdateFrozen){event.preventDefault();event.stopImmediatePropagation();}};
  ['click','pointerdown','keydown','submit','input','change'].forEach(name=>document.addEventListener(name,stopInput,true));
  function release(){clearTimeout(releaseTimer);lease=null;window.ZebrolUpdateFrozen=false;}
  async function safe(){try{return !!window.ZebrolCanUpdate && await window.ZebrolCanUpdate();}catch(_){return false;}}
  async function activate(){
    if(probing||lease||!registration?.waiting||!navigator.onLine||document.visibilityState!=='visible')return;
    probing=true;
    try {if(await safe())registration.waiting?.postMessage({type:'ZEBROL_TRY_ACTIVATE'});}finally{probing=false;}
  }
  async function check(){
    if(checking||!registration||!navigator.onLine||document.visibilityState!=='visible')return;
    checking=true;
    try{await registration.update();}catch(_){}
    finally{checking=false;activate();}
  }
  navigator.serviceWorker.addEventListener('message',async event=>{
    const data=event.data||{};
    if(data.type==='ZEBROL_PREPARE'){
      if(event.source!==registration?.waiting||Date.now()>=data.deadline)return;
      if(lease)return;
      lease=data.token;window.ZebrolUpdateFrozen=true;
      releaseTimer=setTimeout(release,Math.max(0,data.deadline-Date.now())+10000);
      const ready=await safe();
      if(lease!==data.token||Date.now()>=data.deadline){release();return;}
      event.source.postMessage({type:'ZEBROL_READY',token:data.token,ready});
      if(!ready)release();
    }
    if(data.type==='ZEBROL_ABORT'&&lease===data.token)release();
  });
  navigator.serviceWorker.addEventListener('controllerchange',async()=>{
    if(!hadController){hadController=true;release();return;}
    if(reloaded)return;
    if(lease&&await safe()){reloaded=true;location.reload();return;}
    release();
  });
  window.addEventListener('online',check);
  window.addEventListener('pageshow',check);
  window.addEventListener('focus',check);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
  window.addEventListener('zebrol-update-state',activate);
  let changed;
  new MutationObserver(()=>{clearTimeout(changed);changed=setTimeout(activate,300);}).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load',async()=>{
    try{
      registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{if(worker.state==='installed')activate();});
      });
      await check();
    }catch(_){}
  });
})();
