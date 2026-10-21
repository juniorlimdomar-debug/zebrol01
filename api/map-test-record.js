'use strict';
// Preview-only, read-only endpoint. Never accepts a record ID or an address.
const crypto=require('node:crypto');
const addresses=require('../lib/map-address.js');
const locationCache=require('../lib/map-location-cache.js');
const demoSet=require('../lib/map-demo-set.js');
const OWNER='1Cmku6frFfWYhMfOUhGUTNffkGu1',PROJECT='zebrol',NAME='TESTE ENDEREÇO';
const ROOT=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
let certificates,certificatesUntil=0;
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function json(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw fail(response.status===401||response.status===403?403:503,'Não foi possível validar o teste no servidor.');
  return {data:await response.json(),response};
}
async function authenticate(token){
  if(typeof token!=='string'||token.length>8192)throw fail(401,'Entre novamente para testar o mapa.');
  const parts=token.split('.');if(parts.length!==3)throw fail(401,'Sessão inválida.');
  let header,payload;
  try{header=JSON.parse(Buffer.from(parts[0],'base64url'));payload=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw fail(401,'Sessão inválida.');}
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||payload.aud!==PROJECT||
    payload.iss!==`https://securetoken.google.com/${PROJECT}`||typeof payload.sub!=='string'||
    !payload.sub||payload.sub.length>128||!Number.isFinite(payload.exp)||payload.exp<=now||
    !Number.isFinite(payload.iat)||payload.iat>now||!Number.isFinite(payload.auth_time)||payload.auth_time>now)
    throw fail(401,'Sessão inválida ou expirada.');
  if(!certificates||Date.now()>=certificatesUntil){
    const result=await json('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    certificates=result.data;
    const seconds=Number((result.response.headers.get('cache-control')||'').match(/max-age=(\d+)/)?.[1]||300);
    certificatesUntil=Date.now()+Math.min(seconds,3600)*1000;
  }
  if(!Object.hasOwn(certificates,header.kid)||
    !crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),certificates[header.kid],Buffer.from(parts[2],'base64url')))
    throw fail(401,'Sessão inválida.');
  // Firestore independently enforces the existing rules using this same token.
  if(payload.sub!==OWNER){
    const {data}=await json(`${ROOT}/accessRequests/${encodeURIComponent(payload.sub)}`,{headers:{Authorization:'Bearer '+token}});
    if(data.fields?.status?.stringValue!=='approved')throw fail(403,'Acesso não autorizado.');
  }
  return payload.sub;
}
function street(value){
  return addresses.parse(value)?.query||null;
}
function value(field){return field?.stringValue??field?.doubleValue??field?.integerValue;}
async function record(token,member){
  if(member){
    const response=await fetch(`${ROOT}/users/${OWNER}/items/${encodeURIComponent(member.id)}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
    if(response.status===404)return null;
    if(!response.ok)throw fail(response.status===403?403:503,'Não foi possível conferir o cadastro autorizado.');
    const doc=await response.json();
    if(doc.createTime!==member.createdAt)throw fail(409,'Cadastro recriado depois da seleção; não incluído no teste.');
    return parseRecord(doc,true);
  }
  const {data}=await json(`${ROOT}/users/${OWNER}:runQuery`,{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({structuredQuery:{from:[{collectionId:'items'}],
      where:{fieldFilter:{field:{fieldPath:'name'},op:'EQUAL',value:{stringValue:NAME}}},
      select:{fields:['name','type','cpf','address','latitude','longitude'].map(fieldPath=>({fieldPath}))},limit:2}})
  });
  const rows=data.filter(row=>row.document).map(row=>row.document);
  if(!rows.length)return null;
  if(rows.length!==1)throw fail(409,'Existe mais de um TESTE ENDEREÇO. O mapa não escolheu nenhum.');
  return parseRecord(rows[0],false);
}
function parseRecord(doc,cohort){
  const f=doc.fields||{};
  if((value(f.type)&&value(f.type)!=='person')||(!cohort&&(value(f.name)!==NAME||String(value(f.cpf)||'').trim())))
    throw fail(409,'O teste exige pessoa com nome TESTE ENDEREÇO e CPF vazio.');
  const address=street(value(f.address));
  if(!address)throw fail(422,'Informe uma rua no cadastro TESTE ENDEREÇO; somente bairro não é suficiente.');
  const latitude=Number(value(f.latitude)),longitude=Number(value(f.longitude));
  const point=value(f.latitude)!==undefined&&value(f.longitude)!==undefined&&
    String(value(f.latitude)).trim()&&String(value(f.longitude)).trim()&&
    Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180
      ?{lat:latitude,lng:longitude}:null;
  const id=doc.name.split('/').pop();
  return {id,address,point,inputKey:JSON.stringify([id,address,point])};
}
async function quota(uid){
  const url=process.env.KV_REST_API_URL,token=process.env.KV_REST_API_TOKEN;
  if(!url||!token||!url.startsWith('https://'))throw fail(503,'A consulta do endereço aguarda configuração do limite compartilhado de requisições na prévia.');
  // Atomic global + per-user daily limits, shared across serverless instances.
  const day=new Date().toISOString().slice(0,10);
  const hash=crypto.createHash('sha256').update(uid).digest('hex');
  const script="local a=tonumber(redis.call('GET',KEYS[1]) or '0'); local b=tonumber(redis.call('GET',KEYS[2]) or '0'); if a>=50 or b>=5 then return 0 end; redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],172800); redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],172800); return 1";
  const {data}=await json(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(['EVAL',script,2,'zebrol:test-map:global:'+day,'zebrol:test-map:'+hash+':'+day])});
  if(data.error||![0,1].includes(data.result))throw fail(503,'Não foi possível validar o limite de consultas. Tente novamente mais tarde.');
  if(data.result!==1){
    const next=new Date();next.setUTCHours(24,0,0,0);
    throw Object.assign(fail(429,'Limite diário de novas consultas atingido. Nova tentativa após '+next.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (horário de Brasília).'),{retryAt:next.toISOString()});
  }
}
function accepted(row){
  return addresses.municipal(row);
}
async function handler(req,res){
  let cache,locked=false;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
  try{
    if(process.env.VERCEL_ENV!=='preview')throw fail(403,'Recurso disponível somente na prévia.');
    const bearer=req.headers.authorization||'';
    if(!bearer.startsWith('Bearer '))throw fail(401,'Entre no Zebrol para testar o mapa.');
    const token=bearer.slice(7),uid=await authenticate(token);
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    let member;
    if(body.id!==undefined){
      if(typeof body.id!=='string'||body.id.length>150||body.id.includes('/'))throw fail(400,'Identificador inválido.');
      const set=await demoSet.load({json,root:ROOT,owner:OWNER,uid,token});
      member=set.members.find(x=>x.id===body.id);
      if(!member)throw fail(403,'Cadastro fora do conjunto fictício autorizado.');
    }
    const row=await record(token,member);
    if(!row)return res.status(200).json({record:null});
    // Always validate current authorization and the unique current record BEFORE reuse.
    cache=locationCache.create(json,row);
    const cached=await cache.read();
    if(cached)return res.status(200).json({record:cached});
    if(body.cacheOnly===true)return res.status(200).json({record:null,needsLookup:true});
    locked=await cache.lock();
    if(!locked)throw fail(503,'A localização já está sendo consultada. Aguarde alguns segundos e reabra o mapa.');
    const completed=await cache.read();
    if(completed)return res.status(200).json({record:completed});
    const key=process.env.GOOGLE_GEOCODING_API_KEY;
    if(!key)throw fail(503,'GOOGLE_GEOCODING_API_KEY ainda não está disponível nesta prévia.');
    await quota(uid);
    // Keep existing coordinates, but validate their municipality before displaying.
    const query=new URLSearchParams(row.point?{latlng:row.point.lat+','+row.point.lng,language:'pt-BR',key}:
      {address:row.address+', Altamira, Pará, Brasil',
      components:'country:BR|administrative_area:PA|locality:Altamira',language:'pt-BR',key});
    const {data}=await json('https://maps.googleapis.com/maps/api/geocode/json?'+query);
    if(data.status==='ZERO_RESULTS')throw fail(422,'O Google não encontrou esse endereço. Nenhuma coordenada foi criada.');
    if(data.status!=='OK')throw fail(503,'O Google não autorizou ou não concluiu a consulta do endereço.');
    const parsed=addresses.parse(row.address);
    const matches=(data.results||[]).filter(result=>addresses.quality(result,parsed));
    if(row.point){
      if(!matches.length)throw fail(422,'As coordenadas existentes não foram confirmadas em Altamira–PA.');
      return res.status(200).json({record:await cache.write({id:row.id,inputKey:row.inputKey,point:row.point,source:'existing',approximate:true,
        note:'Coordenadas do cadastro; endereço e município confirmados. Confira a posição no mapa.'})});
    }
    if(matches.length!==1)throw fail(422,'Endereço ambíguo ou fora de Altamira–PA. Confira o cadastro.');
    const result=matches[0],point=result.geometry?.location;
    if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||Math.abs(point.lat)>90||Math.abs(point.lng)>180)throw fail(422,'Localização inválida.');
    const approximate=addresses.quality(result,parsed).approximate;
    return res.status(200).json({record:await cache.write({id:row.id,inputKey:row.inputKey,point,source:'google',
      approximate,note:approximate?'Localização aproximada do endereço':'Endereço localizado pelo Google; confira a posição'})});
  }catch(error){
    if(error.retryAt)res.setHeader('Retry-After',String(Math.max(1,Math.ceil((Date.parse(error.retryAt)-Date.now())/1000))));
    return res.status(error.status||503).json({error:error.status?error.message:'Não foi possível consultar o teste agora.',...(error.retryAt?{retryAt:error.retryAt}:{})});
  }finally{if(locked)await cache.release().catch(()=>{});}
}
module.exports=handler;
module.exports._test={street,accepted,record,quota,authenticate,json,ROOT,OWNER};
