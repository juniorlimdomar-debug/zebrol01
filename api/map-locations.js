'use strict';
const {authenticate,json,ROOT,OWNER,parseRecord,quotaStatus}=require('./map-test-record')._test;
const cohort=require('../lib/map-demo-set');
const cache=require('../lib/map-location-cache');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
 try{
  if(process.env.VERCEL_ENV!=='preview')return res.status(403).json({error:'Somente na prévia.'});
  const bearer=req.headers.authorization||'';if(!bearer.startsWith('Bearer '))return res.status(401).json({error:'Entre no Zebrol.'});
  const token=bearer.slice(7),uid=await authenticate(token);
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{},ids=body.ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>30||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>150||id.includes('/')))
   return res.status(400).json({error:'Lote inválido.'});
  const set=await cohort.load({json,root:ROOT,owner:OWNER,uid,token});
  const allowed=new Map(set.members.map(m=>[m.id,m]));
  if(ids.some(id=>!allowed.has(id)))return res.status(403).json({error:'Cadastro fora do conjunto autorizado.'});
  const prefix=ROOT.replace('https://firestore.googleapis.com/v1/','')+'/users/'+OWNER+'/items/';
  const {data}=await json(ROOT+':batchGet',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({documents:ids.map(id=>prefix+id),mask:{fieldPaths:['type','address','latitude','longitude']}})});
  if(!Array.isArray(data))throw Error('Invalid batch');
  const found=new Map(data.filter(x=>x.found).map(x=>[x.found.name,x.found])),missing=new Set(data.filter(x=>x.missing).map(x=>x.missing));
  const rows=[],results=new Map();
  for(const id of ids){
   const doc=found.get(prefix+id);
   if(!doc){results.set(id,missing.has(prefix+id)?{id,record:null,removed:true}:{id,error:'Não foi possível conferir este cadastro.',status:503});continue;}
   if(doc.createTime!==allowed.get(id).createdAt){results.set(id,{id,record:null,removed:true});continue;}
   try{rows.push(parseRecord(doc,true));}catch(e){results.set(id,{id,record:null,unusable:true});}
  }
  for(const row of await cache.readMany(json,rows))results.set(row.id,row);
  return res.status(200).json({results:ids.map(id=>results.get(id)),usage:await quotaStatus(uid).catch(()=>null)});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Não foi possível recuperar as localizações. Nenhuma geocodificação foi iniciada.'});}
};
