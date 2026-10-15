(function(root){
  'use strict';
  function create(db,owner,offline,allowed,notify){
    const queueKey=uid=>uid+'~second-photo-outbox';
    const cacheId=id=>id+'~second-photo';
    const refs=id=>{const item=db.collection('users').doc(owner()).collection('items').doc(id);return {item,photo:item.collection('photos').doc('second')};};
    async function transaction(uid,change){
      const local=await offline.open();
      return new Promise((resolve,reject)=>{
        const tx=local.transaction(['lists'],'readwrite'),store=tx.objectStore('lists');let result;
        tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Não foi possível guardar a segunda foto.'));
        store.get(queueKey(uid)).onsuccess=e=>{try{const rows=e.target.result?.items||[];result=change(rows);store.put({uid:queueKey(uid),items:rows});}catch(error){tx.abort();reject(error);}};
      });
    }
    const pending=uid=>offline.getList(queueKey(uid));
    async function enqueue(uid,id,image){
      if(!allowed(uid))throw new Error('Acesso não autorizado.');
      const entry={id,image,token:crypto.randomUUID(),error:''};
      await transaction(uid,rows=>{if(rows.some(row=>row.id===id))throw new Error('Esta segunda foto já está aguardando envio.');rows.push(entry);});
      return entry;
    }
    async function sync(uid){
      const entries=await pending(uid);
      let changed=false;
      for(const entry of entries){
        if(entry.blocked || (entry.nextAt||0)>Date.now())continue;
        if(!allowed(uid)||!navigator.onLine||root.ZebrolUpdateFrozen)return;
        try{
          const r=refs(entry.id);
          await db.runTransaction(async tx=>{
            const parent=await tx.get(r.item),photo=await tx.get(r.photo);
            if(!parent.exists)throw Object.assign(new Error('O cadastro ainda não foi sincronizado ou foi excluído. A foto permanece neste aparelho.'),{code:'parent-missing'});
            if(photo.exists){if(photo.data().token===entry.token)return;throw Object.assign(new Error('Outro aparelho já adicionou a segunda foto. Sua imagem pendente foi preservada.'),{code:'photo-conflict'});}
            if(!allowed(uid))throw new Error('Acesso não autorizado.');
            tx.set(r.photo,{image:entry.image,token:entry.token});
            notify?.('edited',entry.id,parent.data())(tx);
          });
          await offline.putThumb(uid,cacheId(entry.id),'second',entry.image).catch(()=>{});
          await transaction(uid,rows=>{const index=rows.findIndex(row=>row.id===entry.id&&row.token===entry.token);if(index>=0)rows.splice(index,1);});
          changed=true;
        }catch(error){
          const parentPending=error.code==='parent-missing'&&await offline.pendingOne(uid,entry.id);
          changed=true;
          await transaction(uid,rows=>{const row=rows.find(row=>row.id===entry.id&&row.token===entry.token);if(row){row.attempts=(row.attempts||0)+1;row.nextAt=Date.now()+Math.min(900000,30000*Math.pow(2,Math.min(row.attempts,5)));row.blocked=['photo-conflict','permission-denied'].includes(error.code)||(error.code==='parent-missing'&&!parentPending);row.reason=error.code||'network';row.error=error.code==='permission-denied'?'Publique a permissão da segunda foto no Firebase. A imagem está preservada para envio.':error.message;}});
        }
      }
      return changed;
    }
    async function load(uid,id){
      const entry=(await pending(uid)).find(row=>row.id===id);
      if(entry)return {image:entry.image,pending:true,error:entry.error};
      const cached=await offline.getThumb(uid,cacheId(id),'second').catch(()=>'');
      if(cached)return {image:cached};
      if(!navigator.onLine)return {image:'',unavailable:true};
      const snap=await refs(id).photo.get({source:'server'});
      if(!snap.exists)return {image:''};
      const image=snap.data().image||'';
      await offline.putThumb(uid,cacheId(id),'second',image).catch(()=>{});
      return {image};
    }
    const retry=(uid,id)=>transaction(uid,rows=>{const row=rows.find(r=>r.id===id);if(row){row.blocked=false;row.nextAt=0;row.attempts=0;}});
    const discard=(uid,id,token)=>transaction(uid,rows=>{const index=rows.findIndex(r=>r.id===id&&r.token===token);if(index>=0)rows.splice(index,1);});
    const serverImage=async id=>{const snap=await refs(id).photo.get({source:'server'});return snap.exists?snap.data().image:'';};
    return {enqueue,pending,sync,load,refs,retry,discard,serverImage};
  }
  root.ZebrolSecondPhoto={create};
})(typeof window!=='undefined'?window:globalThis);
