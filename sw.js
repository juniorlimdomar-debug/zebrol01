const SHELL_VERSION=31;
const CACHE='zebrol-shell-offline-v'+SHELL_VERSION;
const pageVersions=new Map();
let cleaning=false;
const FILES=["second-photo.js","index.html","notifications.js","service-information.js","general-vehicles.js","location.js","record-guard.js","access-control.js","offline-store.js","offline-register.js","manifest.webmanifest","icon-192.png","icon-512.png","app-styles.css","vendor/react.js","vendor/react-dom.js","app-main.js","vendor/firebase-app.js","vendor/firebase-auth.js","vendor/firebase-firestore.js"];
const HASHES={"app-styles.css":"742e37b52c228816aed669991d674ae4e813586e9ae7e63dfec38f9d0e2b6706","record-guard.js":"09815d7df105016300c23515b0c5be8288dd2a7aa9e18bfe4aec3d40a946147c","offline-store.js":"16afeebc577a047690f990caace9656263201c5352da29b5cfc1ce3ebb149b12","notifications.js":"ca2caa9b7f8ef049ea28440dfe46d719b7817b81c43d1abbaade8ee1eebb375e","second-photo.js":"fc7d147ee09223ab0a56100f0d19582057962bca803c38fbbded3df45275769b","offline-register.js":"e8262669be771fbd8fb95959ce87227dabc7273f9638d187f831d7d74dfef7c3","index.html":"4b1f78dee64644cb6c8cc63e0560f464a11c5a1abb86b3e2727121517ab66f07","general-vehicles.js":"b980937e8f391d57b8150df4cc14ab9ab1f90b83d1d0abc77d75202dc5dede0f","location.js":"648a9e9cfbde32052a039f0d1742ddb08f11756c68f224d2e09ef33383f3d2cf","service-information.js":"466c4e5a0f8d3d1768a11ad75b2ab938bd1f6a6067cfad75aedd3eadf6122047","access-control.js":"b25f2754dd87f0f7201f849e496e6154deb4dc6a193b76a12f847552954f6a6c","app-main.js":"897191b7c525e1a01c7823c8d81372fb858a0979a57cf1ed2d1f65dd8c76569c"};
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

