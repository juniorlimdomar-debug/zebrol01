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
    const header=/\b(CPF|RG|REGISTRO|VALIDADE|EMISSAO|EXPEDICAO|FILIACAO|NASCIMENTO|NACIONALIDADE|NATURALIDADE|ASSINATURA|IDENTIDADE|CARTEIRA|REPUBLICA|DETRAN|SEXO|PAI|MAE|NOME|SOBRENOME|SITUACAO|PROFISSAO|ESTRANGEIRO|OBSERVACAO|ORGAO|DATA|FATOR)\b/;
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
    // A single parent follows the requested mother convention; two names require confirmation.
    if(!found.mother.length){
      const candidates=[];let ambiguous=false,requiresConfirmation=false;
      for(let i=0;i<lines.length;i++){
        const label=normalized(lines[i]).match(/^(?:\d+\s*[-–.]?\s*)?FILIACAO\b(?!\s*\d)\s*[:\-–]?\s*/);if(!label)continue;
        const parts=[];const inline=lines[i].slice(label[0].length).trim();if(inline)parts.push(inline);
        for(let j=i+1;j<lines.length&&!header.test(normalized(lines[j]));j++)parts.push(lines[j]);
        const names=parts.flatMap(value=>value.split('/')).map(value=>name(value));
        if(names.length===2&&names.every(Boolean)&&normalized(names[0])!==normalized(names[1])){candidates.push(names[1]);requiresConfirmation=true;}
        else ambiguous=true;
      }
      const unique=[...new Set(candidates)];if(!ambiguous&&unique.length===1)result._motherCandidate=unique[0];
    }
    const cpfText=lines.filter((line,i)=>/\bCPF\b/.test(normalized(line))||i>0&&/\bCPF\b/.test(normalized(lines[i-1]))||/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(line)).join('\n');
    const cpfs=[...cpfText.matchAll(/(?:^|[^\d])(\d{3}[. \t]*\d{3}[. \t]*\d{3}[- \t]*\d{2})(?!\d)/g)].map(m=>m[1].replace(/\D/g,''));
    const unique=[...new Set(cpfs.filter(validCPF))];if(unique.length===1)result.cpf=unique[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
    return result;
  }

  function interpret(data){
    const fields=parse(data.text||'');
    const lines=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[])).filter(l=>l.bbox&&l.confidence>=65).map(l=>({...l,text:l.text.trim()}));
    const label=/^(?:(?:NOME DA )?MAE|FILIACAO(?:\s+1)?)\s*[:\-]?\s*$/;
    const stop=/\b(NATURALIDADE|NASCIMENTO|CPF|RG|SITUACAO|PROFISSAO|ESTRANGEIRO|OBSERVACAO|ORGAO|DATA|SEXO|ASSINATURA|FATOR|FILIACAO|MAE)\b/;
    const clean=t=>t.replace(/^[\s:|]+|[\s|]+$/g,'').replace(/\s+/g,' ').trim();
    const isName=t=>t.split(' ').length>=2&&t.length<=150&&/^[\p{L} '\-]+$/u.test(t)&&!stop.test(normalized(t));
    const explicit=[],suggested=[],known=[];
    for(const anchor of lines){
      const tag=normalized(anchor.text);if(!label.test(tag))continue;
      const box=anchor.bbox,h=Math.max(12,box.y1-box.y0);
      const region=lines.filter(l=>l!==anchor&&
        // Keep only values in the same column, not adjacent fields.
        l.bbox.x0>=box.x0-h*.5 && l.bbox.x0<box.x0+Math.max(h*5,box.x1-box.x0+h*2)&&
        l.bbox.y0>=box.y1-h*.2&&l.bbox.y0<box.y1+h*6
      ).sort((a,b)=>a.bbox.y0-b.bbox.y0);
      const selected=[];let bottom=box.y1;
      for(const line of region){if(line.bbox.y0-bottom>h*1.8||stop.test(normalized(line.text)))break;selected.push(line);bottom=line.bbox.y1;}
      const names=selected.map(l=>l.text).join(' / ').split('/').map(clean).filter(Boolean);
      if(!names.length||!names.every(isName)||names.length>2)continue;
      if(/MAE/.test(tag)&&names.length===1)explicit.push(names[0]);
      else if(/FILIACAO\s+1/.test(tag)){
        // Validated RENACH query: source marker and the adjacent field structure.
        const renach=/FONTE\s*:\s*RENACH/.test(normalized(data.text));
        const situation=lines.some(l=>/^SITUACAO/.test(normalized(l.text))&&Math.abs(l.bbox.x0-box.x0)<h*1.4&&l.bbox.y0>box.y1);
        const left=lines.some(l=>/^ESTRANGEIRO/.test(normalized(l.text))&&l.bbox.x1<box.x0&&Math.abs(l.bbox.y0-box.y0)<h*1.5);
        // RENACH result cards sometimes omit the source footer and wrap the
        // mother's name across two OCR lines. Never require the footer.
        // Treat this as a candidate for user confirmation, not a fact.
        const combined=selected.map(l=>clean(l.text)).filter(Boolean).join(' ');
        if((renach||situation||left)&&isName(combined)&&names.length<=2)
          suggested.push(combined);
      }else if(names.length===2&&normalized(names[0])!==normalized(names[1]))suggested.push(names[1]);
    }
    // A date can be below its label in a different OCR column.
    // Look for its spatially associated value, never a nearby update date.
    const birthLabels=lines.filter(l=>/^(?:DATA\s+(?:DE\s+)?NASCIMENTO|NASCIMENTO)\s*[:\-]?$/i.test(normalized(l.text)));
    const validDate=value=>{
      const m=String(value).match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})\b/);
      if(!m)return null;
      const d=+m[1],mo=+m[2],y=+m[3],dt=new Date(Date.UTC(y,mo-1,d));
      return y>=1900&&dt.getTime()<=Date.now()&&dt.getUTCDate()===d&&dt.getUTCMonth()===mo-1&&dt.getUTCFullYear()===y?m[1]+'/'+m[2]+'/'+m[3]:null;
    };
    if(!fields.birth){
      const dates=[];
      for(const anchor of birthLabels){
        const b=anchor.bbox,h=Math.max(12,b.y1-b.y0);
        const nearby=lines.filter(l=>l!==anchor&&
          l.bbox.x0>=b.x0-h*.5&&l.bbox.x0<=b.x1+h*2.5&&
          l.bbox.y0>=b.y1-h*.2&&l.bbox.y0<=b.y1+h*4
        ).sort((a,c)=>a.bbox.y0-c.bbox.y0);
        for(const line of nearby){
          if(/\b(?:ATUALIZACAO|EXPEDICAO|EMISSAO|VALIDADE|SITUACAO|FILIACAO)\b/.test(normalized(line.text)))break;
          const date=validDate(line.text);if(date){dates.push(date);break;}
        }
      }
      const uniqueDates=[...new Set(dates)];
      if(uniqueDates.length===1)fields.birth=uniqueDates[0];
    }
    const unique=a=>[...new Set(a)];
    if(explicit.length){delete fields.mother;delete fields._motherCandidate;if(unique(explicit).length===1)fields.mother=explicit[0];}
    else if(!fields.mother){if(unique(known).length===1){fields.mother=known[0];delete fields._motherCandidate;}else if(unique(suggested).length===1)fields._motherCandidate=suggested[0];}
    return fields;
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
      let fields=parse(response.data.text);response.data.text='';
      if(!fields.mother || !fields.birth){
        await worker.setParameters({tessedit_pageseg_mode:'11'});
        for(const angle of [0,90,270,180]){
          check();let rotated=null;
          try{
            if(angle){rotated=document.createElement('canvas');rotated.width=angle%180?canvas.height:canvas.width;rotated.height=angle%180?canvas.width:canvas.height;const ctx=rotated.getContext('2d');ctx.translate(rotated.width/2,rotated.height/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(canvas,-canvas.width/2,-canvas.height/2);}
            const read=await worker.recognize(rotated||canvas,{}, {text:true,blocks:true});check();const interpreted=interpret(read.data);read.data.text='';read.data.blocks=null;
            if(interpreted.birth&&!fields.birth)fields.birth=interpreted.birth;
            if(interpreted.mother){delete fields._motherCandidate;fields.mother=interpreted.mother;}
            else if(interpreted._motherCandidate&&!fields.mother&&!fields._motherCandidate)fields._motherCandidate=interpreted._motherCandidate;
            if(fields.birth&&(fields.mother||fields._motherCandidate))break;
          }finally{if(rotated){rotated.width=1;rotated.height=1;}}
        }
      }
      return fields;
    })();
    const timer=setTimeout(cancel,90000);
    const promise=Promise.race([operation,abort]).finally(()=>{
      cancelled=true;clearTimeout(timer);if(worker){worker.terminate();worker=null;}
      if(canvas){canvas.width=1;canvas.height=1;canvas=null;}
      if(url){URL.revokeObjectURL(url);url=null;}if(image&&image instanceof Image){image.onload=null;image.onerror=null;image.src='';}image=null;source=null;
    });
    return {promise,cancel};
  }
  root.ZebrolDocumentOCR={parse,interpret,validCPF,start};
})(typeof window!=='undefined'?window:globalThis);

