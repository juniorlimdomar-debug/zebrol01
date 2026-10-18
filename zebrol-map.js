(function(root){
  'use strict';
  // Phase 1 is isolated: fixtures only, no Firestore, no geocoder, no real records.
  const BOUNDS=[[-3.245,-52.245],[-3.175,-52.175]],CENTER=[-3.205,-52.215];
  const REV='map-demo-1';
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
  function load(){
    if(!assets)assets=Promise.all([asset('link','zebrol-map.css'),asset('link','vendor/leaflet/leaflet.css'),root.L?Promise.resolve():asset('script','vendor/leaflet/leaflet.js')]).catch(error=>{assets=null;throw error;});
    return assets;
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
    ];
  }
  const inside=p=>p&&p.latitude>=BOUNDS[0][0]&&p.latitude<=BOUNDS[1][0]&&p.longitude>=BOUNDS[0][1]&&p.longitude<=BOUNDS[1][1];
  function group(records,point){
    const groups=new Map();
    for(const row of records){const p=point(row);if(!p||!inside(p)||row.precision==='bairro')continue;const key=p.latitude.toFixed(6)+','+p.longitude.toFixed(6);if(!groups.has(key))groups.set(key,{point:p,rows:[]});groups.get(key).rows.push(row);}
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
  // Provider boundary: only the Leaflet adapter knows map APIs. No Google code or keys.
  function demoProvider(L,host,onManual){
    const map=L.map(host,{center:CENTER,zoom:15,minZoom:12,maxZoom:19,maxBounds:BOUNDS,maxBoundsViscosity:1,zoomControl:false});
    L.control.zoom({position:'topright'}).addTo(map);
    map.attributionControl.addAttribution('Base ilustrativa — sem ruas reais');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1000 1000');
    // Schematic artwork, deliberately not a representation of real streets/property boundaries.
    svg.innerHTML='<rect width="1000" height="1000" fill="#283741"/><defs><pattern id="zmap-blocks" width="80" height="80" patternUnits="userSpaceOnUse"><rect x="8" y="8" width="64" height="64" rx="6" fill="#344651"/><path d="M0 0H80M0 0V80" stroke="#6d7880" stroke-width="5"/></pattern></defs><rect width="1000" height="1000" fill="url(#zmap-blocks)"/><path d="M20 790Q320 690 430 800T990 580" fill="none" stroke="#345f78" stroke-width="90"/><path d="M0 410L1000 410M390 0L390 1000" stroke="#b0a487" stroke-width="12"/><text x="440" y="370" fill="#dbe3e9" font-size="26" font-family="sans-serif">ÁREA ILUSTRATIVA</text>';
    L.svgOverlay(svg,BOUNDS,{interactive:false}).addTo(map);
    map.on('dragstart',onManual);map.on('zoomstart',event=>{if(event.originalEvent)onManual();});
    let dot,accuracy;
    return {
      marker(p,count,click){const icon=L.divIcon({className:'zmap-marker',html:'🥷'+(count>1?'<b>'+count+'</b>':''),iconSize:[44,44],iconAnchor:[22,22]});const marker=L.marker([p.latitude,p.longitude],{icon,title:'Endereço demonstrativo · '+count+' cadastro(s)',alt:'Abrir endereço demonstrativo',keyboard:true}).addTo(map);marker.on('click',click);return marker;},
      position(p,follow){const ll=[p.latitude,p.longitude];if(!dot){accuracy=L.circle(ll,{radius:p.accuracy,color:'#60a5fa',fillColor:'#60a5fa',fillOpacity:0.12,weight:1,interactive:false}).addTo(map);dot=L.circleMarker(ll,{radius:7,color:'white',weight:2,fillColor:'#2563eb',fillOpacity:1,interactive:false}).addTo(map);}else{dot.setLatLng(ll);accuracy.setLatLng(ll).setRadius(p.accuracy);}if(follow&&inside(p))map.panTo(ll);},
      clearPosition(){if(dot){map.removeLayer(dot);map.removeLayer(accuracy);dot=accuracy=null;}},
      home(){map.setView(CENTER,15);},resize(){map.invalidateSize();},destroy(){map.remove();}
    };
  }
  function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;}
  function button(text,label,fn,className=''){const b=element('button',className,text);b.type='button';b.setAttribute('aria-label',label);b.onclick=fn;return b;}
  async function open({launcher,point,onClose,signal,provider=demoProvider}={}){
    if(activeSession){activeSession.focus();return activeSession;}
    await load();
    if(signal?.aborted)throw new DOMException('Abertura cancelada.','AbortError');
    if(activeSession){activeSession.focus();return activeSession;}
    const overlay=element('section','zmap-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Mapa demonstrativo');
    const header=element('header','zmap-header'),title=element('h2','','MAPA · DEMONSTRAÇÃO');
    const caption=element('p','zmap-caption','Cadastros e vias fictícios · não indica presença de pessoas');
    const stage=element('div','zmap-stage'),canvas=element('div','zmap-canvas'),tools=element('div','zmap-tools'),status=element('p','zmap-status','Toque em 🥷 para testar os cards. GPS somente se você ativar.');status.setAttribute('role','status');
    const shade=element('div','zmap-shade');shade.hidden=true;stage.append(canvas,shade);
    let disposed=false,following=true,lastPoint=null,selected=null,index=0,detail=false,tracker,map,observer;
    const oldOverflow=document.body.style.overflow;
    function closeCard(){shade.hidden=true;shade.replaceChildren();detail=false;selected=null;}
    function close(){if(disposed)return;disposed=true;tracker?.dispose();observer?.disconnect();document.removeEventListener('visibilitychange',visibility);root.removeEventListener('pagehide',pagehide);root.removeEventListener('pageshow',pageshow);document.removeEventListener('keydown',keys,true);signal?.removeEventListener('abort',close);map?.destroy();overlay.remove();document.body.style.overflow=oldOverflow;activeSession=null;lastPoint=null;launcher?.focus({preventScroll:true});onClose?.();root.dispatchEvent(new Event('zebrol-update-state'));}
    const exit=button('×','Fechar mapa',close,'zmap-close');header.append(title,exit);
    function drawCard(){
      shade.replaceChildren();shade.hidden=false;detail=false;const row=selected.rows[index],area=element('div','zmap-card-area');
      const size=document.querySelector('.desktop-catalog-grid > .bg-gray-900')?.getBoundingClientRect().width||140;
      area.style.setProperty('--zmap-card-width',Math.round(size*.875)+'px');
      area.append(button('×','Fechar card demonstrativo',closeCard,'zmap-card-close'));
      const card=button('', 'Abrir detalhes de '+row.name,drawDetails,'zmap-card bg-gray-900 p-1 rounded cursor-pointer min-w-0 relative');
      const photo=element('div','zmap-photo aspect-[3/4] bg-gray-700 rounded mb-2 overflow-hidden'),img=element('img');img.src=row.image;img.alt='Retrato fictício de demonstração';img.decoding='async';photo.append(img);card.append(photo,element('p','text-center font-semibold text-xs leading-tight break-words',row.name),element('p','text-center text-xs text-gray-400 leading-tight break-words',row.vulgo));area.append(card);
      area.append(element('p','zmap-card-note',row.precision==='aproximada'?'Exemplo de endereço aproximado':'Endereço fictício de demonstração'));
      if(selected.rows.length>1){const nav=element('div','zmap-card-nav');nav.append(button('‹','Cadastro anterior',()=>{index=(index+selected.rows.length-1)%selected.rows.length;drawCard();}),element('span','',(index+1)+' / '+selected.rows.length),button('›','Próximo cadastro',()=>{index=(index+1)%selected.rows.length;drawCard();}));area.append(nav);}
      shade.append(area);card.focus({preventScroll:true});
    }
    function drawDetails(){
      detail=true;shade.replaceChildren();const row=selected.rows[index],panel=element('div','zmap-demo-details mobile-panel bg-gray-900 rounded');
      const back=button('×','Voltar ao card do mapa',drawCard,'zmap-close');panel.append(back);const img=element('img');img.src=row.image;img.alt='Foto fictícia';panel.append(img);
      for(const [label,value]of [['Nome',row.name],['Vulgo',row.vulgo||'—'],['Endereço',row.address],['Descrição','Cadastro fictício, somente para testar a interface. Nenhuma informação foi salva no Zebrol.']]){const p=element('p'),b=element('b','',label+': ');p.append(b,document.createTextNode(value));panel.append(p);}panel.append(element('p','zmap-card-note','Demonstração · somente leitura'));shade.append(panel);back.focus({preventScroll:true});
    }
    shade.onclick=e=>{if(e.target===shade)closeCard();};
    function follow(){following=true;gps.setAttribute('aria-pressed','true');if(lastPoint&&inside(lastPoint))map.position(lastPoint,true);tracker.enable();}
    const gps=button('◎ Ativar / seguir GPS','Ativar ou recentralizar GPS',follow);gps.setAttribute('aria-pressed','false');
    tools.append(gps,button('🥷 Exemplos','Voltar aos marcadores demonstrativos',()=>{following=false;gps.setAttribute('aria-pressed','false');map.home();}));
    overlay.append(header,caption,stage,tools,status);document.body.append(overlay);document.body.style.overflow='hidden';
    function visibility(){tracker.visibility();if(document.visibilityState!=='visible'){lastPoint=null;map.clearPosition();status.textContent='GPS pausado enquanto o aplicativo está em segundo plano.';}else map.resize();}
    function pagehide(){tracker.dispose();lastPoint=null;map.clearPosition();}
    function pageshow(event){if(event.persisted)close();}
    function keys(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(detail)drawCard();else if(!shade.hidden)closeCard();else close();}if(e.key==='Tab'){const scope=shade.hidden?overlay:shade;const list=[...scope.querySelectorAll('button,a,[tabindex="0"]')].filter(el=>!el.disabled);if(!list.length)return;const first=list[0],last=list.at(-1);if(e.shiftKey&&(document.activeElement===first||!scope.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!scope.contains(document.activeElement))){e.preventDefault();first.focus();}}}
    try{
      map=provider(root.L,canvas,()=>{following=false;gps.setAttribute('aria-pressed','false');});
      for(const g of group(fixtures(),point))map.marker(g.point,g.rows.length,()=>{selected=g;index=0;drawCard();});
      tracker=gpsTracker({geo:navigator.geolocation,point,isVisible:()=>!disposed&&document.visibilityState==='visible',onStatus:text=>{status.textContent=text;gps.setAttribute('aria-pressed','false');},onPoint:p=>{lastPoint=p;map.position(p,following);gps.setAttribute('aria-pressed',String(following&&inside(p)));status.textContent=inside(p)?'Sua posição · precisão aproximada de '+Math.round(p.accuracy)+' m':'GPS fora da área ilustrativa. Os exemplos continuam disponíveis.';}});
      document.addEventListener('visibilitychange',visibility);root.addEventListener('pagehide',pagehide);root.addEventListener('pageshow',pageshow);document.addEventListener('keydown',keys,true);
      signal?.addEventListener('abort',close,{once:true});
      if(root.ResizeObserver){observer=new ResizeObserver(()=>map.resize());observer.observe(stage);}
      map.resize();exit.focus({preventScroll:true});
      activeSession={close,focus:()=>exit.focus({preventScroll:true})};return activeSession;
    }catch(error){close();throw error;}
  }
  root.ZebrolMapPhase1={open,fixtures,group,gpsTracker,demoProvider,BOUNDS};
})(window);
