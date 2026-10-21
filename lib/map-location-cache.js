'use strict';
const crypto=require('node:crypto');
// Only the isolated fictional test. No address, name, CPF, image or Google response is stored.
// Coordinates expire after seven days, never extended by reads (Google limit: 30 days).
const TTL=7*86400;
const failure=()=>Object.assign(new Error('Não foi possível consultar o cache seguro. Nenhuma nova consulta ao Google foi feita.'),{status:503});
function create(json,row){
  const url=process.env.KV_REST_API_URL,secret=process.env.KV_REST_API_TOKEN;
  if(!url?.startsWith('https://')||!secret)throw failure();
  const hash=s=>crypto.createHmac('sha256',secret).update(s).digest('hex');
  const legacyKey='zebrol:test-map:location:v1:'+hash(row.id),legacyFingerprint=hash(row.inputKey);
  const fingerprint=hash(JSON.stringify([row.address,row.point]));
  const key='zebrol:test-map:location:v2:'+fingerprint;
  const lockKey=key+':lock',owner=crypto.randomUUID();
  const command=async args=>{
    const {data}=await json(url,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(args)});
    if(data.error||!Object.hasOwn(data,'result'))throw failure();
    return data.result;
  };
  return {
    async read(){
      let raw=await command(['GET',key]),expected=fingerprint;
      if(raw===null){raw=await command(['GET',legacyKey]);expected=legacyFingerprint;}
      if(raw===null)return null;
      let entry;try{entry=JSON.parse(raw);}catch{return null;}
      if(entry.fingerprint!==expected||!Number.isFinite(entry.expiresAt)||entry.expiresAt<=Date.now()||
        entry.expiresAt>Date.now()+TTL*1000||!Number.isFinite(entry.lat)||!Number.isFinite(entry.lng)||
        Math.abs(entry.lat)>90||Math.abs(entry.lng)>180)return null;
      return {id:row.id,inputKey:row.inputKey,point:{lat:entry.lat,lng:entry.lng},source:row.point?'existing':'google',
        approximate:true,expiresAt:entry.expiresAt,note:'Localização reutilizada temporariamente; confira a posição aproximada no mapa.'};
    },
    // Operational retry deadline only: no Google payload or personal data.
    async readRejected(){
      const raw=await command(['GET',key+':retry']);
      if(raw===null)return null;const until=Number(raw);
      return Number.isFinite(until)&&until>Date.now()&&until<=Date.now()+86400000?until:null;
    },
    async writeRejected(){
      const until=Date.now()+86400000;
      if(await command(['SET',key+':retry',String(until),'EX',86400])!=='OK')throw failure();
      return until;
    },
    async lock(){return await command(['SET',lockKey,owner,'NX','EX',45])==='OK';},
    async release(){await command(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lockKey,owner]);},
    async write(result){
      const expiresAt=Date.now()+TTL*1000;
      const entry={fingerprint,lat:result.point.lat,lng:result.point.lng,expiresAt};
      if(await command(['SET',key,JSON.stringify(entry),'EX',TTL])!=='OK')throw failure();
      return {...result,expiresAt};
    }
  };
}
module.exports={create,TTL};
