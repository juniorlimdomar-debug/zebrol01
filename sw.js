const SHELL_VERSION=33;
const CACHE='zebrol-shell-offline-v'+SHELL_VERSION;
const pageVersions=new Map();
let cleaning=false;
const FILES=["second-photo.js","index.html","notifications.js","service-information.js","general-vehicles.js","location.js","record-guard.js","access-control.js","offline-store.js","offline-register.js","manifest.webmanifest","icon-192.png","icon-512.png","app-styles.css","vendor/react.js","vendor/react-dom.js","app-main.js","vendor/firebase-app.js","vendor/firebase-auth.js","vendor/firebase-firestore.js"];
const HASHES={"app-styles.css":"468ded8320a5b463f70af627002fea1b4f53c5a36e910f5a1a4e78abe51a822f","record-guard.js":"bca2fc1cff7fe002ddbdb4c879e1bfeedd978fa992f22841dde70342b080ac61","offline-store.js":"2f6f19ca693b99111d69cdd868d166c198b17a430c685352da0498476828b008","notifications.js":"fe6bd3a0323b24dd5c8b17c75f1c44630e370b15a26e4413f5d0dba6e0a3749d","second-photo.js":"f1e9e893f741286cb87bedbe20f35140a7642a4b6bd74252e3949c10043c0c73","offline-register.js":"e983b71b21fa74e8b50ed69f99f7824a453dc8f107c085056154773526242e23","index.html":"4ebd47d660b8082732437eda78e82ae2fb9ee13c42ced6565e032133c0fd043d","general-vehicles.js":"d58f5a51a491c854794a0cbfc7e325c0562a774a4052ce11e8c29c1164185fd3","location.js":"ebd92edb743f800240e028fbfc485644790d09e1eeed80ded5f0215421d314fe","service-information.js":"468728c9098c2b2e2e7660f34367d5f497c604da03830074ec5ba434641bf0a9","access-control.js":"e97722b1c07ad96727970b438fba21d1c0e29eb3bd3f34d1674ed1acd4828ca1","app-main.js":"686f54bcade28c4634df8834a8b091169c919e8f3a15bf7e36142cb25f1cd6ac"};
const urls=FILES.map(file=>new URL(file,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // Fetch and verify the complete shell before making this worker installable.
  const replies=await Promise.all(FILES.map(async file=>{
    const url=new URL(file,self.registration.scope).href;
    const response=await fetch(new Request(url,{cache:'reload'}));
    if(!response.ok||response.redirected)throw new Error('Incomplete app shell: '+file);
    if(HASHES[file]){
      const bytes=await response.clone().arrayBuffer();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==HASHES[file])throw new Error('Mixed deployment: '+file);
    }
    return [url,response];
  }));
  await Promise.all(replies.map(([url,response])=>cache.put(url,response)));
})()));
let preparing=null,launching=false;
async function appClients(){
  const scope=new URL(self.registration.scope);
  return (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>{const url=new URL(client.url);return url.origin===scope.origin&&url.pathname.startsWith(scope.pathname);});
}
self.addEventListener('message',event=>{
  const data=event.data||{};
  if(data.type==='ZEBROL_PAGE_VERSION'&&event.source?.id){
    pageVersions.set(event.source.id,data.version);
    event.waitUntil((async()=>{
      if(cleaning)return;cleaning=true;
      try{
        const clients=await appClients();
        for(const client of clients)if(!pageVersions.has(client.id))client.postMessage({type:'ZEBROL_REPORT_VERSION'});
        if(!clients.length||clients.some(c=>pageVersions.get(c.id)!==String(SHELL_VERSION)))return;
        const keys=(await caches.keys()).filter(k=>/^zebrol-shell-offline-v\d+$/.test(k));
        const previous=keys.filter(k=>Number(k.split('-v')[1])<SHELL_VERSION).sort((a,b)=>Number(b.split('-v')[1])-Number(a.split('-v')[1]))[0];
        const latest=await appClients();if(latest.some(c=>pageVersions.get(c.id)!==String(SHELL_VERSION)))return;
        for(const key of keys)if(key!==CACHE&&key!==previous&&Number(key.split('-v')[1])<SHELL_VERSION)await caches.delete(key);
      }finally{cleaning=false;}
    })());return;
  }
  if(data.type==='ZEBROL_READY'&&preparing&&data.token===preparing.token&&preparing.expected.has(event.source?.id)){
    preparing.replies.set(event.source.id,data.ready===true);
    if(!data.ready||preparing.replies.size===preparing.expected.size)preparing.resolve();
  }
  if(data.type==='ZEBROL_TRY_ACTIVATE'&&!preparing&&!launching){launching=true;event.waitUntil((async()=>{
    const clients=await appClients();
    if(!clients.length){launching=false;return;}
    const token=crypto.randomUUID(),deadline=Date.now()+5000;
    let resolve;const ready=new Promise(done=>{resolve=done;});
    const session={token,deadline,expected:new Set(clients.map(c=>c.id)),replies:new Map(),resolve};preparing=session;
    const timer=setTimeout(resolve,5000);
    try{
      clients.forEach(client=>client.postMessage({type:'ZEBROL_PREPARE',token,deadline}));
      await ready;
      const current=await appClients();
      const safe=Date.now()<deadline&&current.length===clients.length&&current.every(c=>session.expected.has(c.id)&&session.replies.get(c.id)===true);
      if(safe)await self.skipWaiting();
      else clients.forEach(client=>client.postMessage({type:'ZEBROL_ABORT',token}));
    }finally{clearTimeout(timer);preparing=null;launching=false;}
  })().catch(()=>{launching=false;preparing=null;}));}
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Old shell caches are retained across activation: never remove data caches or IndexedDB.
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  const scope=new URL(self.registration.scope),home=new URL('index.html',scope).href;
  const navigation=event.request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===new URL(home).pathname);
  const target=navigation?home:url.href;
  if(!urls.includes(target))return;
  event.respondWith((async()=>{
    const cached=await (await caches.open(CACHE)).match(target);
    // No unversioned network fallback: it could mix a later deployment into this page.
    return cached||new Response('Abra novamente com internet para preparar esta versão.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  })());
});

