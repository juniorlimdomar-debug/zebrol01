(function(root){
  'use strict';
  // Google Maps preview: fictional records only; manual public street search, no Firestore or personal-record geocoding.
  const BOUNDS=[[-3.245,-52.245],[-3.175,-52.175]],CENTER=[-3.205,-52.215];
  const REV='map-limits-39';
  let assets,activeSession=null;
  const assetUrl=file=>new URL(file+'?v='+REV,document.baseURI).href;
  function asset(tag,file){
    return new Promise((resolve,reject)=>{
      const el=document.createElement(tag),timer=setTimeout(()=>finish(new Error('Tempo de carregamento esgotado.')),15000);
      function finish(error){clearTimeout(timer);el.onload=el.onerror=null;if(error){el.remove();reject(error);}else resolve();}
      el.onload=()=>finish();el.onerror=()=>finish(new Error('Não foi possível carregar o mapa.'));
      if(tag==='link'){el.rel='stylesheet';el.href=assetUrl(file);}else el.src=assetUrl(file);
      document.head.appendChild(el);
    });
  }
  let googleAssets,googleFailure=null,retainedMap=null;
  const authMessage='Google Maps não autorizou o carregamento. Confira a chave de navegador, o domínio deste Preview e as restrições da API na Vercel/Google Cloud.';
  async function loadGoogle(){
    if(googleFailure)throw new Error(googleFailure);
    if(root.google?.maps?.Map&&root.google?.maps?.marker?.AdvancedMarkerElement)return;
    if(!googleAssets)googleAssets=(async()=>{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      let config;
      try{
        const response=await fetch(new URL('api/maps-config',document.baseURI),{cache:'no-store',signal:controller.signal});
        config=await response.json();
        if(!response.ok)throw new Error(config.error||'Configuração do mapa indisponível.');
        if(typeof config.key!=='string'||!config.key.trim())throw new Error('Chave de navegador não configurada na Vercel.');
      }finally{clearTimeout(timeout);}
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');let settled=false;
        const timer=setTimeout(()=>fail('O Google Maps demorou a carregar. Confira a conexão e reabra esta página para tentar novamente.'),20000);
        function fail(message){googleFailure=message;root.dispatchEvent(new Event('zebrol-map-auth-error'));if(settled)return;settled=true;clearTimeout(timer);reject(new Error(message));}
        root.gm_authFailure=()=>fail(authMessage);
        root.__zebrolGoogleReady=()=>{if(settled)return;if(!root.google?.maps?.Map||!root.google?.maps?.marker?.AdvancedMarkerElement){fail('Google Maps não ficou disponível. Reabra a página para tentar novamente.');return;}settled=true;clearTimeout(timer);resolve();};
        script.onerror=()=>fail('Não foi possível carregar o Google Maps. Verifique sua conexão e reabra a página.');
        const url=new URL('https://maps.googleapis.com/maps/api/js');
        url.search=new URLSearchParams({key:config.key,v:'quarterly',loading:'async',libraries:'marker',language:'pt-BR',region:'BR',callback:'__zebrolGoogleReady'}).toString();
        script.src=url.href;script.async=true;document.head.appendChild(script);
      });
    })().catch(error=>{googleAssets=null;throw error;});
    return googleAssets;
  }
  function load(){
    if(navigator.onLine===false)return Promise.reject(new Error('Conecte-se à internet para abrir o Google Maps. Os cadastros offline continuam disponíveis.'));
    if(!assets)assets=Promise.all([asset('link','zebrol-map.css'),
      asset('script','lib/map-address.js').then(()=>asset('script','lib/map-fixtures.js').then(()=>asset('script','map-demo-records.js')))])
      .catch(error=>{assets=null;throw error;});
    return Promise.all([assets,loadGoogle()]);
  }
  function portrait(color,shirt){
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="'+color+'"/><circle cx="150" cy="142" r="64" fill="#d6c3ac"/><path d="M86 136q0-85 66-85t64 85q-32-31-49-41-22 39-81 41" fill="#3a3430"/><path d="M43 400v-77q0-98 107-98t107 98v77" fill="'+shirt+'"/><text x="150" y="380" text-anchor="middle" font-family="sans-serif" font-size="16" fill="white">IMAGEM FICTÍCIA</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }
  function fixtures(){
    return [
      {id:'demo-a',name:'PESSOA EXEMPLO A',vulgo:'Exemplo A',address:'Rua de Demonstração A, 10 — Bairro fictício',latitude:-3.204,longitude:-52.216,precision:'exemplo',image:portrait('#445365','#334155')},
      {id:'demo-b',name:'PESSOA EXEMPLO B',vulgo:'Exemplo B',address:'Rua de Demonstração A, 10 — Bairro fictício',latitude:-3.204,longitude:-52.216,precision:'exemplo',image:portrait('#584e66','#713f63')},
      {id:'demo-c',name:'PESSOA EXEMPLO C',vulgo:'Exemplo C',address:'Rua de Demonstração B — Bairro fictício',latitude:-3.209,longitude:-52.211,precision:'aproximada',image:portrait('#4e6658','#375a4a')},
      {id:'demo-d',name:'PESSOA EXEMPLO D',vulgo:'',address:'Avenida de Demonstração C, 20 — Bairro fictício',latitude:-3.201,longitude:-52.209,precision:'exemplo',image:portrait('#66534e','#765444')},
      {id:'demo-bairro',name:'EXEMPLO SEM COORDENADAS',address:'Somente bairro fictício',precision:'bairro',latitude:null,longitude:null}
    ].map(row=>({...row,synthetic:true}));
  }
  const inside=p=>p&&p.latitude>=BOUNDS[0][0]&&p.latitude<=BOUNDS[1][0]&&p.longitude>=BOUNDS[0][1]&&p.longitude<=BOUNDS[1][1];
  function group(records,point,validated=false){
    const groups=new Map();
    for(const row of records){const p=point(row);if(!p||(!validated&&!inside(p))||row.precision==='bairro')continue;const key=p.latitude.toFixed(6)+','+p.longitude.toFixed(6);if(!groups.has(key))groups.set(key,{point:p,rows:[]});groups.get(key).rows.push(row);}
    return [...groups.values()];
  }
  function gpsTracker({geo,point,onPoint,onStatus,isVisible}){
    let watch=null,epoch=0,enabled=false,disposed=false;
    function stop(){epoch++;if(watch!==null){geo?.clearWatch(watch);watch=null;}}
    function start(){
      if(disposed||!enabled||!isVisible()||watch!==null)return;
      if(!geo){enabled=false;onStatus('GPS indisponível neste navegador.');return;}
      const version=++epoch;onStatus('Aguardando permissão e posição do GPS…');
      try{watch=geo.watchPosition(result=>{if(disposed||version!==epoch||!isVisible())return;const p=point(result.coords);if(p)onPoint({...p,accuracy:Math.max(0,Number(result.coords.accuracy)||0)});else onStatus('O GPS não retornou uma posição válida.');},error=>{
        if(disposed||version!==epoch)return;
        if(error.code===1){enabled=false;stop();}
        onStatus(error.code===1?'GPS não autorizado. Permita a localização no navegador para tentar novamente.':error.code===3?'GPS demorou a responder. Você pode continuar usando o mapa.':'GPS indisponível no momento.');
      },{enableHighAccuracy:true,timeout:15000,maximumAge:10000});}catch(_){enabled=false;stop();onStatus('Não foi possível ativar o GPS. Use a prévia em HTTPS.');}
    }
    return {enable(){enabled=true;start();},visibility(){stop();if(enabled&&isVisible())start();},dispose(){disposed=true;enabled=false;stop();}};
  }
  // Manual public street search is independent of records and GPS.
  const normalizeAddress=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function streetQuery(value){
    return root.ZebrolMapAddress.parse(value)?.query||null;
  }
  function acceptedStreet(row){
    const parts=row.address_components||[],part=type=>parts.find(p=>(p.types||[]).includes(type));
    const city=part('administrative_area_level_2'),state=part('administrative_area_level_1'),country=part('country');
    return normalizeAddress(city?.long_name)==='altamira'&&state?.short_name==='PA'&&country?.short_name==='BR'
      &&part('route')&&!row.partial_match&&(row.types||[]).some(t=>['route','street_address','premise'].includes(t))
      &&!(row.types||[]).some(t=>['establishment','point_of_interest'].includes(t));
  }
  // Browser-side pacing is UX protection, not a substitute for Google project quotas.
  let searchFlight=null,lastSearchAt=0,searchTimes=[];
  async function lookupStreet(G,value){
    const text=streetQuery(value);if(!text)throw new Error('Digite Rua, Travessa ou Avenida e o nome da via. Não pesquise pessoas ou estabelecimentos.');
    if(navigator.onLine===false)throw new Error('Conecte-se à internet para pesquisar ruas.');
    if(searchFlight)throw new Error('Aguarde a pesquisa em andamento.');
    const now=Date.now();searchTimes=searchTimes.filter(t=>now-t<60000);
    if(now-lastSearchAt<5000||searchTimes.length>=10)throw new Error('Aguarde alguns segundos antes de pesquisar novamente.');
    lastSearchAt=now;searchTimes.push(now);
    searchFlight=(async()=>{
      const Geocoder=G.Geocoder||(await G.importLibrary('geocoding')).Geocoder;
      return new Promise((resolve,reject)=>{
        // Do not unlock the shared flight on a UI timeout: the provider call may still be running.
        new Geocoder().geocode({address:text+', Altamira, Pará, Brasil',region:'BR',componentRestrictions:{country:'BR',administrativeArea:'PA',locality:'Altamira'}},(rows,status)=>{
          if(status==='ZERO_RESULTS')return reject(new Error('Endereço não encontrado em Altamira–PA.'));
          if(status!=='OK')return reject(new Error(status==='REQUEST_DENIED'?'Pesquisa não autorizada pelo Google. Confira a Geocoding API e a permissão dessa API na chave de navegador.':status==='OVER_QUERY_LIMIT'?'Limite de consultas atingido. Tente mais tarde.':'Não foi possível pesquisar agora. Tente novamente mais tarde.'));
          const parsed=root.ZebrolMapAddress.parse(text);
          const accepted=(rows||[]).filter(row=>acceptedStreet(row)&&root.ZebrolMapAddress.quality(row,parsed));
          if(accepted.length!==1)return reject(new Error(accepted.length?'Endereço ambíguo. Informe o bairro ou número.':'Não encontrei uma rua correspondente com município Altamira–PA confirmado.'));
          const row=accepted[0],loc=row.geometry?.location,latitude=loc?.lat(),longitude=loc?.lng();
          if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return reject(new Error('O Google não retornou uma posição válida.'));
          resolve({latitude,longitude,label:row.formatted_address,approximate:root.ZebrolMapAddress.quality(row,parsed).approximate});
        });
      });
    })();
    try{return await searchFlight;}finally{searchFlight=null;}
  }
  // Only this adapter knows Google Maps. Cards and GPS lifecycle remain shared.
  function googleProvider(G,host,onManual){
    const ll=p=>({lat:p.latitude,lng:p.longitude});
    if(!retainedMap){
      const surface=document.createElement('div');surface.style.cssText='width:100%;height:100%';host.append(surface);
      retainedMap={surface,map:new G.Map(surface,{center:{lat:CENTER[0],lng:CENTER[1]},zoom:15,minZoom:3,maxZoom:20,mapId:'DEMO_MAP_ID',renderingType:'VECTOR',headingInteractionEnabled:true,tiltInteractionEnabled:true,disableDefaultUI:true,zoomControl:false,gestureHandling:'greedy',clickableIcons:false})};
    }else host.append(retainedMap.surface);
    const {map,surface}=retainedMap,markers=[],listeners=[];let dot,accuracy,searchMarker;
    map.setCenter({lat:CENTER[0],lng:CENTER[1]});map.setZoom(15);
    listeners.push(map.addListener('dragstart',onManual));
    return {
      marker(p,count,click){const content=document.createElement('div');content.className='zmap-marker';content.style.cssText='position:relative;width:44px;height:44px';content.textContent='🥷';if(count>1){const badge=document.createElement('b');badge.textContent=String(count);content.append(badge);}
        const marker=new G.marker.AdvancedMarkerElement({map,position:ll(p),content,title:'Endereço demonstrativo · '+count+' cadastro(s)'});const listener=marker.addListener('click',click);listeners.push(listener);markers.push(marker);return {remove(){listener.remove();marker.map=null;const i=markers.indexOf(marker);if(i>=0)markers.splice(i,1);const j=listeners.indexOf(listener);if(j>=0)listeners.splice(j,1);}};},
      position(p,follow){const center=ll(p);if(!dot){accuracy=new G.Circle({map,center,radius:p.accuracy,strokeColor:'#60a5fa',strokeWeight:1,fillColor:'#60a5fa',fillOpacity:0.12,clickable:false});const content=document.createElement('div');content.style.cssText='width:16px;height:16px;border:2px solid white;border-radius:50%;background:#2563eb;box-sizing:border-box;transform:translateY(50%)';dot=new G.marker.AdvancedMarkerElement({map,position:center,content,title:'Sua localização',zIndex:1000});}else{dot.position=center;accuracy.setCenter(center);accuracy.setRadius(p.accuracy);}if(follow)map.panTo(center);},
      clearPosition(){if(dot){dot.map=null;accuracy.setMap(null);dot=accuracy=null;}},
      zoom(delta){onManual();map.setZoom(Math.max(3,Math.min(20,(map.getZoom()||15)+delta)));},
      center(p){map.panTo(ll(p));map.setZoom(17);},
      search(value){return lookupStreet(G,value);},
      searchResult(p){if(searchMarker)searchMarker.map=null;const content=document.createElement('div');content.textContent='📍';content.style.fontSize='30px';searchMarker=new G.marker.AdvancedMarkerElement({map,position:ll(p),content,title:p.label,zIndex:999});this.center(p);},
      home(){map.setCenter({lat:CENTER[0],lng:CENTER[1]});map.setZoom(15);},
      resize(){G.event.trigger(map,'resize');},
      destroy(){this.clearPosition();if(searchMarker)searchMarker.map=null;for(const listener of listeners)listener.remove();for(const marker of markers)marker.map=null;surface.remove();map.setCenter({lat:CENTER[0],lng:CENTER[1]});}
    };
  }
  function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;}
  function button(text,label,fn,className=''){const b=element('button',className,text);b.type='button';b.setAttribute('aria-label',label);b.onclick=fn;return b;}
  async function open({launcher,point,onClose,signal,watchTestRecord,provider=googleProvider}={}){
    if(activeSession){activeSession.focus();return activeSession;}
    await load();
    if(signal?.aborted)throw new DOMException('Abertura cancelada.','AbortError');
    if(activeSession){activeSession.focus();return activeSession;}
    const overlay=element('section','zmap-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Mapa demonstrativo');
    const controls=element('div','zmap-controls');
    const caption=element('p','zmap-caption','3 marcadores ilustrativos + cadastros fictícios');
    const stage=element('div','zmap-stage'),canvas=element('div','zmap-canvas'),tools=element('div','zmap-tools'),status=element('details','zmap-status'),statusTitle=element('summary','','Diagnóstico dos cadastros'),statusBody=element('p','','Toque em 🥷 para testar os cards. GPS somente se você ativar.');status.append(statusTitle,statusBody);status.style.pointerEvents='auto';statusBody.style.maxHeight='30vh';statusBody.style.overflowY='auto';
    const shade=element('div','zmap-shade');shade.hidden=true;stage.append(canvas,shade);
    let disposed=false,following=true,lastPoint=null,selected=null,index=0,tracker,map,observer,stopTest;
    const testRows=new Map(),testMarkers=[];
    const fixtureProcessor=root.ZebrolMapFixtures.processor();
    const oldOverflow=document.body.style.overflow;
    function closeCard(){shade.hidden=true;shade.replaceChildren();selected=null;}
    function close(){if(disposed)return;disposed=true;stopTest?.();fixtureProcessor.dispose();tracker?.dispose();observer?.disconnect();document.removeEventListener('visibilitychange',visibility);root.removeEventListener('pagehide',pagehide);root.removeEventListener('pageshow',pageshow);document.removeEventListener('keydown',keys,true);signal?.removeEventListener('abort',close);root.removeEventListener('zebrol-map-auth-error',authError);map?.destroy();overlay.remove();document.body.style.overflow=oldOverflow;activeSession=null;lastPoint=null;launcher?.focus({preventScroll:true});onClose?.();root.dispatchEvent(new Event('zebrol-update-state'));}
    const exit=button('×','Fechar mapa',close,'zmap-close');controls.append(exit,button('+','Aproximar mapa',()=>map.zoom(1)),button('−','Afastar mapa',()=>map.zoom(-1)));
    function drawCard(){
      shade.replaceChildren();shade.hidden=false;const row=selected.rows[index],area=element('div','zmap-card-area');
      const size=document.querySelector('.desktop-catalog-grid > .bg-gray-900')?.getBoundingClientRect().width||140;
      area.style.setProperty('--zmap-card-width',size+'px');
      area.append(button('×','Fechar card demonstrativo',closeCard,'zmap-card-close'));
      const card=element('div','zmap-card bg-gray-900 p-1 rounded cursor-pointer min-w-0 relative');card.tabIndex=0;card.setAttribute('role','group');card.setAttribute('aria-label','Resumo de '+row.name);card.style.cursor='default';
      const photo=element('div','zmap-photo aspect-[3/4] bg-gray-700 rounded mb-2 overflow-hidden'),img=element('img');if(row.image)img.src=row.image;img.alt=row.testRecord?'Foto do cadastro fictício':'Retrato fictício de demonstração';img.decoding='async';photo.append(img);card.append(photo,element('p','text-center font-semibold text-xs leading-tight break-words',row.name),element('p','text-center text-xs text-gray-400 leading-tight break-words',row.vulgo));area.append(card);
      if(row.loadImage&&!row.image)Promise.resolve().then(row.loadImage).then(image=>{if(!disposed&&img.isConnected&&image){img.src=image;row.image=image;}}).catch(()=>{if(img.isConnected)img.alt='Foto indisponível';});
      area.append(element('p','zmap-card-note',row.note||(row.precision==='aproximada'?'Exemplo de endereço aproximado':'Endereço fictício de demonstração')));
      if(selected.rows.length>1){const nav=element('div','zmap-card-nav');nav.append(button('‹','Cadastro anterior',()=>{index=(index+selected.rows.length-1)%selected.rows.length;drawCard();}),element('span','',(index+1)+' / '+selected.rows.length),button('›','Próximo cadastro',()=>{index=(index+1)%selected.rows.length;drawCard();}));area.append(nav);}
      shade.append(area);card.focus({preventScroll:true});
    }
    shade.onclick=e=>{if(e.target===shade)closeCard();};
    function follow(){following=true;gps.setAttribute('aria-pressed','true');if(lastPoint)map.position(lastPoint,true);tracker.enable();}
    const gps=button('📍','Ativar ou recentralizar GPS',follow);gps.setAttribute('aria-pressed','false');
    tools.append(gps,button('🥷','Voltar aos marcadores demonstrativos',()=>{following=false;gps.setAttribute('aria-pressed','false');map.home();}));
    const search=element('form','zmap-search');search.hidden=true;
    const input=element('input');input.type='search';input.placeholder='Rua ou endereço de Altamira';input.setAttribute('aria-label','Pesquisar rua em Altamira');input.maxLength=160;
    const hint=element('p','','Use Rua, Travessa ou Avenida. A consulta digitada será enviada ao Google somente ao tocar em Buscar.');
    const result=element('p');result.setAttribute('role','status');
    const submit=button('Buscar','Buscar rua em Altamira',()=>{});submit.type='submit';
    const searchToggle=button('🔍','Pesquisar ruas de Altamira',()=>{search.hidden=!search.hidden;searchToggle.setAttribute('aria-expanded',String(!search.hidden));if(!search.hidden)input.focus();},'zmap-search-toggle');searchToggle.setAttribute('aria-expanded','false');
    search.append(input,submit,button('×','Fechar pesquisa',()=>{search.hidden=true;searchToggle.setAttribute('aria-expanded','false');searchToggle.focus();}),hint,result);
    let searching=false,lastQuery='',lastFound=null;
    search.onsubmit=async event=>{
      event.preventDefault();if(searching)return;
      const text=streetQuery(input.value);if(!text){result.textContent='Digite Rua, Travessa ou Avenida e o nome da via.';return;}
      if(lastFound&&lastQuery===normalizeAddress(text)){following=false;gps.setAttribute('aria-pressed','false');map.searchResult(lastFound);result.textContent=lastFound.label+(lastFound.approximate?' · localização aproximada':'');return;}
      searching=true;submit.disabled=true;result.textContent='Buscando rua…';
      const slow=setTimeout(()=>{if(!disposed&&searching)result.textContent='O Google está demorando. Você pode fechar a pesquisa ou o mapa.';},15000);
      try{const found=await map.search(text);if(disposed)return;lastQuery=normalizeAddress(text);lastFound=found;following=false;gps.setAttribute('aria-pressed','false');map.searchResult(found);result.textContent=found.label+(found.approximate?' · localização aproximada':'');input.blur();}
      catch(error){if(!disposed)result.textContent=error.message;}
      finally{clearTimeout(slow);searching=false;submit.disabled=false;}
    };
    overlay.append(stage,caption,controls,searchToggle,search,tools,status);document.body.append(overlay);document.body.style.overflow='hidden';
    activeSession={close,focus:()=>exit.focus({preventScroll:true})};
    function authError(){tracker?.dispose();map?.clearPosition();statusBody.textContent=googleFailure||authMessage;}
    function visibility(){tracker.visibility();if(document.visibilityState!=='visible'){lastPoint=null;map.clearPosition();statusBody.textContent='GPS pausado enquanto o aplicativo está em segundo plano.';}else map.resize();}
    function pagehide(){tracker.dispose();lastPoint=null;map.clearPosition();}
    function pageshow(event){if(event.persisted)close();}
    function keys(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(!shade.hidden)closeCard();else if(!search.hidden){search.hidden=true;searchToggle.setAttribute('aria-expanded','false');searchToggle.focus();}else close();}if(e.key==='Tab'){const scope=shade.hidden?overlay:shade;const list=[...scope.querySelectorAll('button,input,a,[tabindex="0"]')].filter(el=>!el.disabled&&!el.closest('[hidden]'));if(!list.length)return;const first=list[0],last=list.at(-1);if(e.shiftKey&&(document.activeElement===first||!scope.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!scope.contains(document.activeElement))){e.preventDefault();first.focus();}}}
    try{
      root.addEventListener('zebrol-map-auth-error',authError);
      if(googleFailure)throw new Error(googleFailure);
      map=provider(root.google.maps,canvas,()=>{following=false;gps.setAttribute('aria-pressed','false');});
      const examples=fixtures(),prepared=await fixtureProcessor.update(examples),ready=new Set(prepared.filter(row=>row.status==='ready').map(row=>row.id));
      if(disposed||signal?.aborted){close();throw new DOMException('Abertura cancelada.','AbortError');}
      for(const g of group(examples.filter(row=>ready.has(row.id)),point))map.marker(g.point,g.rows.length,()=>{selected=g;index=0;drawCard();});
      if(watchTestRecord)stopTest=watchTestRecord({signal,onChange:(row,id)=>{
        if(disposed)return;
        id=id||row?.id;
        if(id)testRows.delete(id);else testRows.clear();
        if(selected?.rows.some(item=>item.id===id))closeCard();
        if(row?.testRecord&&point(row))testRows.set(row.id,row);
        for(const marker of testMarkers)marker.remove();testMarkers.length=0;
        for(const g of group([...testRows.values()],point,true))testMarkers.push(map.marker(g.point,g.rows.length,()=>{selected=g;index=0;drawCard();}));
      },onStatus:(text,counts)=>{if(!disposed){statusBody.textContent=text;if(counts)statusTitle.textContent=counts.located+' localizados · '+counts.pending+' aguardando · Diagnóstico';}},onError:error=>{if(!disposed&&error.name!=='AbortError')statusBody.textContent=error.message;}});
      tracker=gpsTracker({geo:navigator.geolocation,point,isVisible:()=>!disposed&&document.visibilityState==='visible',onStatus:text=>{statusBody.textContent=text;gps.setAttribute('aria-pressed','false');},onPoint:p=>{lastPoint=p;map.position(p,following);gps.setAttribute('aria-pressed',String(following));statusBody.textContent='Sua posição · precisão aproximada de '+Math.round(p.accuracy)+' m';}});
      document.addEventListener('visibilitychange',visibility);root.addEventListener('pagehide',pagehide);root.addEventListener('pageshow',pageshow);document.addEventListener('keydown',keys,true);
      signal?.addEventListener('abort',close,{once:true});
      if(root.ResizeObserver){observer=new ResizeObserver(()=>map.resize());observer.observe(stage);}
      map.resize();exit.focus({preventScroll:true});
      activeSession={close,focus:()=>exit.focus({preventScroll:true})};return activeSession;
    }catch(error){close();throw error;}
  }
  root.ZebrolMapPhase1={open,fixtures,group,gpsTracker,googleProvider,streetQuery,acceptedStreet,lookupStreet,BOUNDS};
})(window);
