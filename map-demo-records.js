(function(root){
 'use strict';
 const attempts=new Map(); // short-lived in-memory pacing, no IndexedDB changes
 function watch({ids,subscribe,request,parse,point,loadImage,onChange,onStatus,onError,signal}){
  const states=new Map(),queue=new Map(),stops=[];let stopped=false,running=false,active,activeId,newLookups=0,blocked=false,lastError='';
  const status=()=>onStatus?.([...states.values()].filter(s=>s.ready).length+' de '+ids.length+' cadastros fictícios localizados'+(blocked?' · Novas consultas limitadas; posições disponíveis preservadas.':newLookups>=3?' · Até 3 novas tentativas por abertura.':'')+(lastError?' · '+lastError:''));
  function remove(id){const previous=states.get(id);states.set(id,{version:(previous?.version||0)+1});queue.delete(id);if(activeId===id)active?.abort();onChange(null,id);}
  async function pump(){
   if(stopped||running)return;running=true;
   try{while(queue.size&&!stopped){
    const [id,job]=queue.entries().next().value;queue.delete(id);activeId=id;active=new AbortController();
    const current=()=>!stopped&&states.get(id)?.version===job.version&&!active.signal.aborted;
    try{
     let data=await request({id,cacheOnly:true},active.signal);if(!current())continue;
     const attemptKey=id+'|'+job.item.address+'|'+job.item.latitude+'|'+job.item.longitude;
     if(data.needsLookup&&!blocked&&newLookups<3&&!(attempts.get(attemptKey)>Date.now())){
      newLookups++;attempts.set(attemptKey,Date.now()+600000);
      for(const [key,until] of attempts)if(until<=Date.now())attempts.delete(key);
      if(attempts.size>600)attempts.delete(attempts.keys().next().value);
      data=await request({id},active.signal);if(!current())continue;
     }
     const result=data.record;if(!result){status();continue;}
     const coordinates=point(job.item),inputKey=JSON.stringify([id,parse(job.item.address).query,coordinates?{lat:coordinates.latitude,lng:coordinates.longitude}:null]);
     if(result.id!==id||result.inputKey!==inputKey)throw Error('Endereço alterado durante a consulta; posição descartada.');
     if(!point({latitude:result.point?.lat,longitude:result.point?.lng}))throw Error('Posição inválida descartada.');
     states.get(id).ready=true;
     onChange({id,name:job.item.name||'',vulgo:job.item.vulgo||'',latitude:result.point.lat,longitude:result.point.lng,
       note:result.note,precision:result.approximate?'aproximada':'localizada',testRecord:true,loadImage:()=>loadImage(job.item)},id);
    }catch(e){if(current()&&e.name!=='AbortError'){if(e.status===429)blocked=true;lastError=e.message;onError(e);}}
    finally{activeId=null;status();}
   }}finally{running=false;}
  }
  for(let i=0;i<ids.length;i+=10){const chunk=ids.slice(i,i+10);
   stops.push(subscribe(chunk,snapshot=>{
    if(stopped)return;
    if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){for(const id of chunk)remove(id);status();return;}
    const present=new Set();
    for(const doc of snapshot.docs){const item={...doc.data(),id:doc.id};if(!chunk.includes(item.id))continue;present.add(item.id);
     const signature=JSON.stringify([item.name,item.type,item.address,item.latitude,item.longitude,item.vulgo,item.photoVersion,item.hasPhoto]);
     if(states.get(item.id)?.signature===signature)continue;
     remove(item.id);const state=states.get(item.id);state.signature=signature;
     if((item.type&&item.type!=='person')||item._pending||!parse(item.address))continue;
     queue.set(item.id,{item,version:state.version});
    }
    for(const id of chunk)if(!present.has(id))remove(id);
    status();void pump();
   },e=>{if(!stopped){for(const id of chunk)remove(id);onError(e);status();}}));
  }
  const stop=()=>{if(stopped)return;stopped=true;active?.abort();queue.clear();for(const fn of stops)fn();states.clear();signal?.removeEventListener('abort',stop);};
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();return stop;
 }
 root.ZebrolMapDemoRecords={watch};
 if(typeof module==='object'&&module.exports)module.exports={watch};
})(typeof window!=='undefined'?window:globalThis);
