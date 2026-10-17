const SHELL_VERSION=32;
const CACHE='zebrol-shell-offline-v'+SHELL_VERSION;
const pageVersions=new Map();
let cleaning=false;
const FILES=["second-photo.js","index.html","notifications.js","service-information.js","general-vehicles.js","location.js","record-guard.js","access-control.js","offline-store.js","offline-register.js","manifest.webmanifest","icon-192.png","icon-512.png","app-styles.css","vendor/react.js","vendor/react-dom.js","app-main.js","vendor/firebase-app.js","vendor/firebase-auth.js","vendor/firebase-firestore.js"];
const HASHES={"app-styles.css":"468ded8320a5b463f70af627002fea1b4f53c5a36e910f5a1a4e78abe51a822f","record-guard.js":"2ea50a47f9e9ea80078086054bacb440717f0ffc23d8d6a7c86d9ce2694e1d5b","offline-store.js":"8f9b42da795e466c68abe46bcd0b1667c2d874aa1b8fc6a690691167f930f7cc","notifications.js":"7c6e11e202eed9d74823d3a1f0722eb6fda0466d0b57ed9741e6451407c1995c","second-photo.js":"d7a4ddaff98ffd174434ba06d6ee4a0ba4b2b1f966dd07e8308631abf998b86b","offline-register.js":"e8262669be771fbd8fb95959ce87227dabc7273f9638d187f831d7d74dfef7c3","index.html":"66f3b7f4165479dca81bd82aded2a35ab47ee7ac58e79007502b643d8d98c9cc","general-vehicles.js":"b980937e8f391d57b8150df4cc14ab9ab1f90b83d1d0abc77d75202dc5dede0f","location.js":"648a9e9cfbde32052a039f0d1742ddb08f11756c68f224d2e09ef33383f3d2cf","service-information.js":"466c4e5a0f8d3d1768a11ad75b2ab938bd1f6a6067cfad75aedd3eadf6122047","access-control.js":"b25f2754dd87f0f7201f849e496e6154deb4dc6a193b76a12f847552954f6a6c","app-main.js":"15f8381eed22be33633676ff637230228df40dbacb0fc7f3ca077eb786566fdc"};
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

