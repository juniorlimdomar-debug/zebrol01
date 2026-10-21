'use strict';
const {authenticate,json,ROOT,OWNER}=require('./map-test-record.js')._test;
const cohort=require('../lib/map-demo-set.js');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
 try{
  if(process.env.VERCEL_ENV!=='preview')return res.status(403).json({error:'Somente na prévia.'});
  const bearer=req.headers.authorization||'';if(!bearer.startsWith('Bearer '))return res.status(401).json({error:'Entre no Zebrol.'});
  const token=bearer.slice(7),uid=await authenticate(token);
  const set=await cohort.load({json,root:ROOT,owner:OWNER,uid,token,initialize:true});
  return res.status(200).json({ids:set.members.map(x=>x.id),cutoff:set.cutoff});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Não foi possível preparar o conjunto de demonstração.'});}
};
