'use strict';
// Frozen Preview-only development cohort. No writes to Firestore.
const CUTOFF='2026-10-21T02:23:59.000Z'; // user's declaration: existing development records only
const KEY='zebrol:map-demo:cohort:20261021-v1';
const MAX=300;
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function command(json,args){
 const url=process.env.KV_REST_API_URL,secret=process.env.KV_REST_API_TOKEN;
 if(!url?.startsWith('https://')||!secret)throw fail(503,'Conjunto de demonstração indisponível.');
 const {data}=await json(url,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(args)});
 if(data.error||!Object.hasOwn(data,'result'))throw fail(503,'Não foi possível consultar o conjunto de demonstração.');
 return data.result;
}
function validate(raw){
 let set;try{set=JSON.parse(raw);}catch{throw fail(503,'Lista de demonstração inválida.');}
 if(set.cutoff!==CUTOFF||!Array.isArray(set.members)||set.members.length>MAX||new Set(set.members.map(x=>x.id)).size!==set.members.length||
 set.members.some(x=>typeof x.id!=='string'||!x.id||x.id.includes('/')||!Number.isFinite(Date.parse(x.createdAt))||Date.parse(x.createdAt)>Date.parse(CUTOFF)))throw fail(503,'Lista de demonstração inválida.');
 return set;
}
async function load({json,root,owner,uid,token,initialize=false}){
 if(process.env.VERCEL_ENV!=='preview')throw fail(403,'Somente na prévia.');
 const raw=await command(json,['GET',KEY]);if(raw!==null)return validate(raw);
 if(!initialize||uid!==owner)throw fail(409,'Abra o mapa com a conta administradora para preparar o conjunto fictício.');
 const {data}=await json(`${root}/users/${owner}:runQuery`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
 body:JSON.stringify({structuredQuery:{from:[{collectionId:'items'}],select:{fields:[{fieldPath:'type'}]},limit:MAX+1}})});
 const docs=data.filter(x=>x.document).map(x=>x.document);
 if(docs.length>MAX)throw fail(409,'Mais de 300 registros. O conjunto não foi preparado parcialmente.');
 const members=docs.filter(d=>(!d.fields?.type||d.fields.type.stringValue==='person')&&Number.isFinite(Date.parse(d.createTime))&&Date.parse(d.createTime)<=Date.parse(CUTOFF))
 .map(d=>({id:d.name.split('/').pop(),createdAt:d.createTime})).sort((a,b)=>a.id.localeCompare(b.id));
 if(!members.length)throw fail(409,'Nenhum cadastro de pessoa anterior à data de corte.');
 const value=JSON.stringify({cutoff:CUTOFF,members});validate(value);
 await command(json,['SET',KEY,value,'NX']); // immutable; concurrent initialization cannot replace it
 return validate(await command(json,['GET',KEY]));
}
module.exports={load,CUTOFF,MAX,validate};
