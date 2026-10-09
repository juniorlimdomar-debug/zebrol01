const CACHE='zebrol-shell-offline-v16';
const FILES=["index.html","notifications.js","service-information.js","general-vehicles.js","location.js","record-guard.js","access-control.js","offline-store.js","offline-register.js","manifest.webmanifest","icon-192.png","icon-512.png","vendor/tailwind.js","vendor/react.js","vendor/react-dom.js","vendor/babel.js","vendor/firebase-app.js","vendor/firebase-auth.js","vendor/firebase-firestore.js"];
const HASHES={"index.html":"edf4627ed47be24d7db838e97f13a23f27343486c1e2afd9e1b6ca056fd1ec5e","notifications.js":"99d5da0caecdfef8857b6ff16360fbbe9cd2f7d5c7f530d046ff783265ecdc02","service-information.js":"466c4e5a0f8d3d1768a11ad75b2ab938bd1f6a6067cfad75aedd3eadf6122047","general-vehicles.js":"a4f260cb57de0ebd60c853f2424dffcaa56158176e95b699dfeb66430ba5c0b4","location.js":"648a9e9cfbde32052a039f0d1742ddb08f11756c68f224d2e09ef33383f3d2cf","record-guard.js":"488b56489f675c5a16884d7d2881f686c73d85459ec27121f6531af585c4efb6","access-control.js":"b25f2754dd87f0f7201f849e496e6154deb4dc6a193b76a12f847552954f6a6c","offline-store.js":"50095810aa71a1cca4e52ce2862116112201089f4f72b39bc6a2d5d521949874","offline-register.js":"da2a6193389c69a16e05e924b81c226ae202ecd67ce498b26a4a588855824945"};
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
