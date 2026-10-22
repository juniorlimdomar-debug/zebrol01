(function(root){
 'use strict';
 const attempts=new Map(); // short-lived in-memory pacing, no IndexedDB changes
 function watch({ids,subscribe,request,requestBatch,parse,point,loadImage,onChange,onStatus,onError,signal}){
  const states=new Map(ids.map(id=>[id,{version:0,loading:true}])),queue=new Map(),pending=new Map(),stops=[],waiting=new Set();let stopped=false,running=false,active,activeId,newLookups=0,blocked=false,lastError='';
  function status(){
   const c={total:ids.length,usable:0,unusable:0,located:0,pending:0,error:0,loading:0,removed:0};const distinct=new Set();let remaining=0;
   for(const s of states.values()){
    if(s.loading){c.loading++;continue;}if(s.removed){c.removed++;continue;}if(!s.usable){c.unusable++;continue;}c.usable++;
    if(s.ready)c.located++;else if(s.error)c.error++;else c.pending++;
    if(!s.ready){distinct.add(s.key);remaining++;}
   }
   c.remainingAddresses=distinct.size;c.repeatedAddresses=remaining-distinct.size;
   onStatus?.('Total '+c.total+' · Com endereço utilizável '+c.usable+' · Sem endereço utilizável '+c.unusable+' · Localizados '+c.located+' · Aguardando localização '+c.pending+' · Com erro '+c.error+
    (c.loading?' · Aguardando dados '+c.loading:'')+(c.removed?' · Excluídos '+c.removed:'')+' · Endereços distintos restantes '+distinct.size+' (estimativa, não confirmação geográfica).'+
    (waiting.size||queue.size?' Verificando cache, sem Google.':blocked?' Novas consultas limitadas; cache preservado.':newLookups>=10?' Até 10 novas tentativas por abertura.':'')+(lastError?' '+lastError:''),c);
  }
  function remove(id,loading=false){const previous=states.get(id);clearTimeout(previous?.expiryTimer);states.set(id,{version:(previous?.version||0)+1,loading,removed:!loading});queue.delete(id);pending.delete(id);if(activeId===id)active?.abort();onChange(null,id);}
  async function pump(){
   if(stopped||running)return;running=true;
   try{while(!stopped){
    const cachePhase=queue.size>0;
    if(!cachePhase&&(waiting.size||!pending.size||blocked||newLookups>=10))break;
    if(cachePhase&&requestBatch&&!Object.hasOwn(queue.values().next().value,'cacheData')){
     const jobs=[...queue.entries()].filter(([,job])=>!Object.hasOwn(job,'cacheData')).slice(0,30);
     activeId=null;active=new AbortController();
     try{
      const response=await requestBatch(jobs.map(([id])=>id),active.signal);if(stopped)break;
      if(!Array.isArray(response.results))throw Error('Resposta do lote inválida.');
      const returned=new Map(response.results.map(result=>[result.id,result]));
      for(const [id,job] of jobs)if(states.get(id)?.version===job.version&&queue.get(id)===job){
       const data=returned.get(id);job.cacheData=data||{error:'Cadastro ausente na resposta do lote.'};
      }
     }catch(e){if(stopped)break;for(const [id,job] of jobs)if(states.get(id)?.version===job.version&&queue.get(id)===job)job.cacheData={error:e.message,status:e.status};}
     continue;
    }
    const tasks=cachePhase?queue:pending,[id,job]=tasks.entries().next().value;tasks.delete(id);activeId=id;active=new AbortController();
    const current=()=>!stopped&&states.get(id)?.version===job.version&&!active.signal.aborted;
    try{
     let data=cachePhase&&Object.hasOwn(job,'cacheData')?job.cacheData:await request({id,cacheOnly:true},active.signal);if(!current())continue;
     delete job.cacheData;
     if(data.error)throw Object.assign(Error(data.error),{status:data.status});
     if(data.removed){remove(id);continue;}
     if(data.unusable){states.get(id).usable=false;continue;}
     if(data.rejected){states.get(id).error=true;lastError='Endereço rejeitado anteriormente; nova tentativa após '+new Date(data.retryAt).toLocaleString('pt-BR')+'. Corrigir o endereço permite nova avaliação.';continue;}
     const attemptKey=job.key;
     if(data.needsLookup&&cachePhase){pending.set(id,job);continue;}
     if(data.needsLookup&&!blocked&&newLookups<10&&!(attempts.get(attemptKey)>Date.now())){
      newLookups++;attempts.set(attemptKey,Date.now()+600000);
      for(const [key,until] of attempts)if(until<=Date.now())attempts.delete(key);
      if(attempts.size>600)attempts.delete(attempts.keys().next().value);
      data=await request({id},active.signal);if(!current())continue;
     }
     if(data.rejected){states.get(id).error=true;status();continue;}
     const result=data.record;if(!result){status();continue;}
     const coordinates=point(job.item),inputKey=JSON.stringify([id,parse(job.item.address).query,coordinates?{lat:coordinates.latitude,lng:coordinates.longitude}:null]);
     if(result.id!==id||result.inputKey!==inputKey)throw Error('Endereço alterado durante a consulta; posição descartada.');
     if(!point({latitude:result.point?.lat,longitude:result.point?.lng}))throw Error('Posição inválida descartada.');
     if(result.expiresAt!==undefined&&(!Number.isFinite(result.expiresAt)||result.expiresAt<=Date.now()))throw Error('Posição expirada descartada.');
     states.get(id).ready=true;
     if(result.expiresAt){states.get(id).expiryTimer=setTimeout(()=>{
      if(stopped||states.get(id)?.version!==job.version)return;
      const signature=states.get(id).signature;remove(id);const state=states.get(id);Object.assign(state,{signature,usable:true,removed:false,key:job.key});
      queue.set(id,{item:job.item,key:job.key,version:state.version});status();void pump();
     },Math.min(2147483647,result.expiresAt-Date.now()));}
     onChange({id,name:job.item.name||'',vulgo:job.item.vulgo||'',latitude:result.point.lat,longitude:result.point.lng,
       note:result.note,precision:result.approximate?'aproximada':'localizada',testRecord:true,loadImage:()=>loadImage(job.item)},id);
     if(!cachePhase)for(const [other,task] of pending)if(task.key===job.key){pending.delete(other);queue.set(other,task);}
    }catch(e){if(current()&&e.name!=='AbortError'){if(e.status===429)blocked=true;if(e.lookupAttempted)states.get(id).error=true;lastError=e.message;onError(e);}}
    finally{activeId=null;status();}
   }}finally{running=false;}
  }
  for(let i=0;i<ids.length;i+=10)waiting.add(i);
  for(let i=0;i<ids.length;i+=10){const chunk=ids.slice(i,i+10);
   stops.push(subscribe(chunk,snapshot=>{
    if(stopped)return;
    if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){waiting.add(i);for(const id of chunk)remove(id,true);status();return;}
    waiting.delete(i);
    const present=new Set();
    for(const doc of snapshot.docs){const item={...doc.data(),id:doc.id};if(!chunk.includes(item.id))continue;present.add(item.id);
     const signature=JSON.stringify([item.name,item.type,item.address,item.latitude,item.longitude,item.vulgo,item.photoVersion,item.hasPhoto]);
     if(states.get(item.id)?.signature===signature)continue;
     remove(item.id);const state=states.get(item.id);state.signature=signature;state.removed=false;
     if((item.type&&item.type!=='person')||item._pending||!parse(item.address))continue;
     state.usable=true;state.key=JSON.stringify([parse(item.address).cacheKey||parse(item.address).query,point(item)||null]);
     queue.set(item.id,{item,key:state.key,version:state.version});
    }
    for(const id of chunk)if(!present.has(id))remove(id);
    status();void Promise.resolve().then(pump);
   },e=>{if(!stopped){waiting.delete(i);for(const id of chunk)remove(id,true);lastError=e.message;onError(e);status();void pump();}}));
  }
  status();
  const stop=()=>{if(stopped)return;stopped=true;active?.abort();queue.clear();pending.clear();for(const fn of stops)fn();for(const s of states.values())clearTimeout(s.expiryTimer);states.clear();signal?.removeEventListener('abort',stop);};
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();return stop;
 }
 root.ZebrolMapDemoRecords={watch};
 if(typeof module==='object'&&module.exports)module.exports={watch};
})(typeof window!=='undefined'?window:globalThis);
