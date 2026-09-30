(function(root) {
  function point(item) {
    const lat=item.latitude, lng=item.longitude;
    if(lat===null || lng===null || lat===undefined || lng===undefined || String(lat).trim()==='' || String(lng).trim()==='')return null;
    const latitude=Number(lat),longitude=Number(lng);
    return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180 ? {latitude,longitude} : null;
  }
  function mapsUrl(item) {
    const coords=point(item);
    let query=coords ? `${coords.latitude},${coords.longitude}` : String(item.address || '').trim();
    if(!coords)for(const part of [item.city||item.cidade,item.state||item.estado||item.uf]) {
      if(part && !query.toLocaleLowerCase('pt-BR').includes(String(part).toLocaleLowerCase('pt-BR')))query+=[query?', ':'',part].join('');
    }
    return query ? 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query) : '';
  }
  function current(navigatorObject = navigator) {
    return new Promise((resolve,reject)=>{
      if(!navigatorObject.geolocation){reject(new Error('Localização indisponível neste navegador. Digite o endereço manualmente.'));return;}
      navigatorObject.geolocation.getCurrentPosition(result=>{
        const coords=point(result.coords);
        if(coords)resolve(coords);else reject(new Error('O GPS não retornou uma localização válida. Digite o endereço manualmente.'));
      },error=>reject(new Error(error.code===1 ? 'Permissão de localização negada. Você pode digitar o endereço manualmente.' : 'Não foi possível obter a localização. Tente novamente ou digite o endereço manualmente.')),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0});
    });
  }
  function editAddress(form,address) {
    return address===form.address ? {...form,address} : {...form,address,latitude:null,longitude:null};
  }
  root.ZebrolLocation={point,mapsUrl,current,editAddress};
})(typeof window!=='undefined'?window:globalThis);
