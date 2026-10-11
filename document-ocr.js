/* Optional, on-demand OCR. Images only exist in memory; no persistence APIs. */
(function(root){
  'use strict';
  const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  function validCPF(value){
    const n=value.replace(/\D/g,'');if(n.length!==11||/^(\d)\1+$/.test(n))return false;
    for(let length=9;length<=10;length++){let sum=0;for(let i=0;i<length;i++)sum+=Number(n[i])*(length+1-i);const digit=(sum*10)%11;if((digit===10?0:digit)!==Number(n[length]))return false;}return true;
  }
  function parse(text){
    const lines=String(text||'').normalize('NFC').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const result={},found={name:[],mother:[],birth:[]};
    const labels={name:/^(?:\d+(?:\s*E\s*\d+)?\s*[-–.]?\s*)?NOME(?:\s+E\s+SOBRENOME|\s+COMPLETO)?\b\s*[:\-–]?\s*/,mother:/^(?:NOME\s+DA\s+)?MAE\b\s*[:\-–]?\s*/,birth:/^(?:\d+\s*[-–.]?\s*)?(?:DATA\s+(?:DE\s+)?NASCIMENTO|NASCIMENTO|DATA,?\s*LOCAL\s+E\s+UF\s+(?:DE\s+)?NASCIMENTO)\b\s*[:\-–]?\s*/};
    const header=/\b(CPF|RG|REGISTRO|VALIDADE|EMISSAO|EXPEDICAO|FILIACAO|NASCIMENTO|NACIONALIDADE|NATURALIDADE|ASSINATURA|IDENTIDADE|CARTEIRA|REPUBLICA|DETRAN|SEXO|PAI|MAE|NOME|SOBRENOME)\b/;
    function name(value){const v=value.replace(/^[\s:|\-–]+|[\s|]+$/g,'').trim();return v.length<=150&&v.split(/\s+/).length>=2&&/^[\p{L} '\-]+$/u.test(v)&&!header.test(normalized(v))?v:'';}
    for(let i=0;i<lines.length;i++)for(const [key,label] of Object.entries(labels)){
      const line=normalized(lines[i]);const match=line.match(label);if(!match)continue;
      // NOME DA MÃE is not the holder's name.
      if(key==='name'&&/^NOME\s+D[AO]\s+(MAE|PAI)/.test(line))continue;
      let value=lines[i].slice(match[0].length).trim();
      if(!value&&lines[i+1]&&!header.test(normalized(lines[i+1])))value=lines[i+1];
      if(key==='birth'){
        const dates=[...value.matchAll(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/g)];
        if(dates.length===1){const [,day,month,year]=dates[0],date=new Date(Date.UTC(+year,+month-1,+day));if(date.getUTCFullYear()===+year&&date.getUTCMonth()===+month-1&&date.getUTCDate()===+day&&+year>=1900&&date.getTime()<=Date.now())found.birth.push(day+'/'+month+'/'+year);}
      }else{const v=name(value);if(v)found[key].push(v);}
    }
    for(const [key,values] of Object.entries(found)){const unique=[...new Set(values)];if(unique.length===1)result[key]=unique[0];}
    const cpfText=lines.filter((line,i)=>/\bCPF\b/.test(normalized(line))||i>0&&/\bCPF\b/.test(normalized(lines[i-1]))||/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(line)).join('\n');
    const cpfs=[...cpfText.matchAll(/(?:^|[^\d])(\d{3}[. \t]*\d{3}[. \t]*\d{3}[- \t]*\d{2})(?!\d)/g)].map(m=>m[1].replace(/\D/g,''));
    const unique=[...new Set(cpfs.filter(validCPF))];if(unique.length===1)result.cpf=unique[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
    return result;
  }
  let library;
  function loadLibrary(){
    if(root.Tesseract)return Promise.resolve(root.Tesseract);
    if(!library)library=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';script.crossOrigin='anonymous';script.referrerPolicy='no-referrer';
      const timer=setTimeout(()=>{script.remove();library=null;reject(new Error('Não foi possível carregar a leitura. Tente novamente com internet.'));},30000);
      script.onload=()=>{clearTimeout(timer);if(root.Tesseract)resolve(root.Tesseract);else{library=null;reject(new Error('Leitor indisponível.'));}};
      script.onerror=()=>{clearTimeout(timer);script.remove();library=null;reject(new Error('Não foi possível carregar a leitura. Confira a internet.'));};document.head.appendChild(script);
    });return library;
  }
  function start(source){
    let cancelled=false,worker=null,canvas=null,image=null,url=null,rejectCancel;
    const abort=new Promise((_,reject)=>{rejectCancel=reject;});
    const cancel=()=>{cancelled=true;rejectCancel(new Error('Leitura cancelada.'));if(worker){worker.terminate();worker=null;}};
    const check=()=>{if(cancelled)throw new Error('Leitura cancelada.');};
    const operation=(async()=>{
      if(!navigator.onLine)throw new Error('Conecte à internet para ler o documento.');
      if(source instanceof Blob){
        if(source.size>20*1024*1024)throw new Error('Escolha uma imagem com até 20 MB.');
        if(!/^image\//.test(source.type))throw new Error('Selecione uma foto de documento.');
        url=URL.createObjectURL(source);image=new Image();
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Não foi possível abrir a foto. Use JPG, PNG ou tire outra foto.'));image.src=url;});check();
      }else image=source;
      const width=image.naturalWidth||image.videoWidth||image.width,height=image.naturalHeight||image.videoHeight||image.height;
      if(!width||!height)throw new Error('Imagem sem conteúdo.');
      const scale=Math.min(1,2200/Math.max(width,height),Math.sqrt(3000000/(width*height)));
      canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível preparar a imagem.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      if(url){URL.revokeObjectURL(url);url=null;image.src='';}image=null;source=null;
      const engine=await loadLibrary();check();
      // No traineddata read/write in IndexedDB; document image is never persisted.
      const created=await engine.createWorker('por',1,{cacheMethod:'none',workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por/4.0.0_best_int',logger:()=>{},errorHandler:()=>{}});
      if(cancelled){await created.terminate();check();}worker=created;
      await worker.setParameters({tessedit_pageseg_mode:'3'});check();
      const response=await worker.recognize(canvas,{}, {text:true});check();
      const fields=parse(response.data.text);response.data.text='';return fields;
    })();
    const timer=setTimeout(cancel,90000);
    const promise=Promise.race([operation,abort]).finally(()=>{
      cancelled=true;clearTimeout(timer);if(worker){worker.terminate();worker=null;}
      if(canvas){canvas.width=1;canvas.height=1;canvas=null;}
      if(url){URL.revokeObjectURL(url);url=null;}if(image&&image instanceof Image){image.onload=null;image.onerror=null;image.src='';}image=null;source=null;
    });
    return {promise,cancel};
  }
  root.ZebrolDocumentOCR={parse,validCPF,start};
})(typeof window!=='undefined'?window:globalThis);
