(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./map-address.js'):root.ZebrolMapAddress);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZebrolMapFixtures=api;
})(typeof window!=='undefined'?window:globalThis,function(addresses){
  'use strict';
  // Synthetic fixtures only. No Firestore, photographs, names, or production resolver.
  function processor({resolve,now=Date.now,yieldTask=()=>new Promise(r=>setTimeout(r,0)),maxRequests=0}={}){
    const cache=new Map(),inputs=new Map();let generation=0;
    const signature=row=>JSON.stringify([row.address,row.latitude,row.longitude]);
    const point=row=>row.latitude!==null&&row.longitude!==null&&row.latitude!==undefined&&row.longitude!==undefined&&
      String(row.latitude).trim()&&String(row.longitude).trim()&&
      Number.isFinite(Number(row.latitude))&&Number.isFinite(Number(row.longitude))&&
      Math.abs(Number(row.latitude))<=90&&Math.abs(Number(row.longitude))<=180?
      {latitude:Number(row.latitude),longitude:Number(row.longitude)}:null;
    return {
      async update(rows){
        const epoch=++generation,seen=new Set(),results=[];let requests=0;
        if(!Array.isArray(rows)||rows.length>300)throw new Error('O teste aceita até 300 registros fictícios.');
        const counts=new Map();for(const row of rows)counts.set(row?.id,(counts.get(row?.id)||0)+1);
        for(let i=0;i<rows.length;i++){
          if(epoch!==generation)return [];
          if(i&&i%20===0){await yieldTask();if(epoch!==generation)return [];}
          const row=rows[i],id=row?.id;
          if(row?.synthetic!==true||typeof id!=='string'||!id.startsWith('demo-')||counts.get(id)!==1){
            results.push({status:'ignored',reason:'Registro fora do conjunto fictício ou duplicado.'});continue;
          }
          seen.add(id);
          const address=addresses.parse(row.address),key=signature(row);
          const coordinates=point(row),previous=inputs.get(id),sameCoordinates=previous&&JSON.stringify(previous.coordinates)===JSON.stringify(coordinates);
          const staleCoordinates=!!(sameCoordinates&&(previous.address!==row.address||previous.staleCoordinates));
          inputs.set(id,{address:row.address,coordinates,staleCoordinates});
          if(!address){cache.delete(id);results.push({id,status:'ignored',reason:'Endereço incompleto ou inválido.'});continue;}
          try{
            let cached=cache.get(id);
            if(cached?.key!==key||cached.until<=now()){cache.delete(id);cached=null;}
            let location=cached?.point||(staleCoordinates?null:coordinates);
            if(!location&&resolve&&requests<maxRequests){
              requests++;location=await resolve(address.query);
              if(epoch!==generation)return [];
              location=point(location||{});
            }
            if(!location){results.push({id,status:'ignored',reason:'Sem localização de teste disponível.'});continue;}
            cache.set(id,{key,point:location,until:cached?.until||now()+600000});
            results.push({id,status:'ready',point:location,approximate:!address.number||row.precision==='aproximada'});
          }catch{results.push({id,status:'error',reason:'Falha individual na localização fictícia.'});}
        }
        for(const id of cache.keys())if(!seen.has(id))cache.delete(id);
        for(const id of inputs.keys())if(!seen.has(id))inputs.delete(id);
        return epoch===generation?results:[];
      },
      dispose(){generation++;cache.clear();inputs.clear();}
    };
  }
  return {processor};
});
