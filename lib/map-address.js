(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZebrolMapAddress=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const expand=value=>value.replace(/^r\.?(?=\s)/i,'Rua').replace(/^tv\.?(?=\s)/i,'Travessa').replace(/^av\.?(?=\s)/i,'Avenida');
  function parse(value){
    if(typeof value!=='string'||value.length>160||/[\n\r<>@]/.test(value))return null;
    const original=value,text=expand(value.trim().replace(/\s+/g,' ')).replace(/^(rua|travessa|avenida|alameda|estrada|rodovia)\b/i,v=>v[0].toUpperCase()+v.slice(1).toLowerCase());
    const segments=text.split(/\s+[-–—]\s+/);
    if(segments.length>2)return null;
    let street=segments[0],number=null,neighborhood=segments[1]?.trim()||null;
    // An explicit house-number label separates numeric street names from house numbers.
    const labeled=street.match(/^(.*?)\s*,?\s+(?:n[º°.]?|n[úu]mero)\s*[:.]?\s*(\d+[a-z]?)(?:\s+(.+))?$/i);
    const compact=street.match(/^(.*?),\s*(\d+[a-z]?)\s+([^\d].*)$/i);
    if(labeled||compact){const m=labeled||compact;street=m[1].trim();number=m[2];if(m[3]){if(neighborhood)return null;neighborhood=m[3].trim();}}
    const numbered=street.match(/^(.*?),\s*(\d+[a-z]?|s\s*\/?\s*n(?:[úu]mero)?)$/i);
    if(numbered){street=numbered[1].trim();number=/^\d/.test(numbered[2])?numbered[2]:null;}
    else if(street.includes(','))return null;
    if(!/^(Rua|Travessa|Avenida|Alameda|Estrada|Rodovia)\s+[\p{L}\d]/u.test(street)||
      !/[\p{L}\d]/u.test(street.replace(/^\S+\s+/,'')))return null;
    if(!neighborhood&&!number){const suffix=street.match(/^(.*?)\s+(Centro|Bras[ií]lia|Mu[lt]tir[aã]o|Mutir[aã]o)$/i);if(suffix){street=suffix[1];neighborhood=suffix[2];}}
    if(neighborhood&&['multirao','mutirao'].includes(normalize(neighborhood)))neighborhood='Mutirão';
    if(segments.length===2&&!neighborhood)return null;
    return {original,street,number,neighborhood,
      cacheKey:JSON.stringify([normalize(street),number?.toLowerCase()||null,normalize(neighborhood)]),
      query:street+(number?', '+number:'')+(neighborhood?' - '+neighborhood:'')};
  }
  function part(row,type){return (row.address_components||[]).find(p=>p.types?.includes(type));}
  function municipal(row){
    return !row.partial_match&&normalize(part(row,'administrative_area_level_2')?.long_name||part(row,'administrative_area_level_2')?.short_name)==='altamira'&&
      part(row,'administrative_area_level_1')?.short_name==='PA'&&part(row,'country')?.short_name==='BR'&&
      !!part(row,'route')&&row.types?.some(t=>['street_address','route','premise'].includes(t))&&
      !row.types?.some(t=>['establishment','point_of_interest'].includes(t));
  }
  function quality(row,address){
    if(!municipal(row)||!address)return null;
    const route=part(row,'route');
    if(![route.long_name,route.short_name].filter(Boolean).some(v=>normalize(expand(v))===normalize(address.street)))return null;
    const house=part(row,'street_number')?.long_name||part(row,'street_number')?.short_name;
    if(address.number&&house&&normalize(address.number)!==normalize(house))return null;
    const neighborhood=part(row,'sublocality_level_1')||part(row,'sublocality')||part(row,'neighborhood');
    if(address.neighborhood&&neighborhood&&
      ![neighborhood.long_name,neighborhood.short_name].filter(Boolean).some(v=>normalize(v).replace(/^multirao$/,'mutirao')===normalize(address.neighborhood)))return null;
    return {approximate:!address.number||!house||row.geometry?.location_type!=='ROOFTOP'};
  }
  return {normalize,parse,municipal,quality};
});
