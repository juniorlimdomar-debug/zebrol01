'use strict';
const crypto=require('node:crypto');
const addresses=require('./map-address');
// Only the isolated fictional test. No address, name, CPF, image or Google response is stored.
// Coordinates expire after seven days, never extended by reads (Google limit: 30 days).
const TTL=7*86400;
const failure=()=>Object.assign(new Error('Não foi possível consultar o cache seguro. Nenhuma nova consulta ao Google foi feita.'),{status:503});
function create(json,row){
  const url=process.env.KV_REST_API_URL,secret=process.env.KV_REST_API_TOKEN;
  if(!url?.startsWith('https://')||!secret)throw failure();
  const hash=s=>crypto.createHmac('sha256',secret).update(s).digest('hex');
  const legacyKey='zebrol:test-map:location:v1:'+hash(row.id),legacyFingerprint=hash(row.inputKey);
  const oldFingerprint=hash(JSON.stringify([row.address,row.point]));
  const oldKey='zebrol:test-map:location:v2:'+oldFingerprint;
  const fingerprint=hash(JSON.stringify([addresses.parse(row.address)?.cacheKey||row.address,row.point]));
  const key='zebrol:test-map:location:v3:'+fingerprint;
  const keys=[key,oldKey,legacyKey,key+':retry',oldKey+':retry'];
  const lockKey=key+':lock',owner=crypto.randomUUID();
  const command=async args=>{
    const {data}=await json(url,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(args)});
    if(data.error||!Object.hasOwn(data,'result'))throw failure();
    return data.result;
  };
  return {
    keys,
    async read(){
      for(const [candidate,expected] of [[key,fingerprint],[oldKey,oldFingerprint],[legacyKey,legacyFingerprint]]){
      const raw=await command(['GET',candidate]);if(raw===null)continue;
      let entry;try{entry=JSON.parse(raw);}catch{continue;}
      if(entry.fingerprint!==expected||!Number.isFinite(entry.expiresAt)||entry.expiresAt<=Date.now()||
        entry.expiresAt>Date.now()+TTL*1000||!Number.isFinite(entry.lat)||!Number.isFinite(entry.lng)||
        Math.abs(entry.lat)>90||Math.abs(entry.lng)>180)continue;
      return {id:row.id,inputKey:row.inputKey,point:{lat:entry.lat,lng:entry.lng},source:row.point?'existing':'google',
        approximate:entry.approximate!==false,expiresAt:entry.expiresAt,note:'Localização reutilizada temporariamente; confira a posição no mapa.'};
      }return null;
    },
    // Operational retry deadline only: no Google payload or personal data.
    async readRejected(){
      for(const candidate of [key+':retry',oldKey+':retry']){const raw=await command(['GET',candidate]);
      if(raw===null)continue;const until=Number(raw);
      if(Number.isFinite(until)&&until>Date.now()&&until<=Date.now()+86400000)return until;}return null;
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
      const entry={fingerprint,lat:result.point.lat,lng:result.point.lng,expiresAt,approximate:result.approximate!==false};
      if(await command(['SET',key,JSON.stringify(entry),'EX',TTL])!=='OK')throw failure();
      return {...result,expiresAt};
    }
  };
}
async function readMany(json,rows){
  if(!rows.length)return [];
  if(rows.length>30)throw failure();
  const contexts=rows.map(row=>create(json,row)),keys=[...new Set(contexts.flatMap(x=>x.keys))];
  const url=process.env.KV_REST_API_URL,secret=process.env.KV_REST_API_TOKEN;
  const {data}=await json(url,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(['MGET',...keys])});
  if(data.error||!Array.isArray(data.result)||data.result.length!==keys.length)throw failure();
  const values=new Map(keys.map((key,i)=>[key,data.result[i]]));
  const local=async(_url,options)=>{const args=JSON.parse(options.body);if(args[0]!=='GET'||!values.has(args[1]))throw failure();return {data:{result:values.get(args[1])}};};
  return Promise.all(rows.map(async row=>{const cache=create(local,row),record=await cache.read();if(record)return {id:row.id,record};const retryAt=await cache.readRejected();return retryAt?{id:row.id,record:null,rejected:true,retryAt}:{id:row.id,record:null,needsLookup:true};}));
}
module.exports={create,readMany,TTL};
