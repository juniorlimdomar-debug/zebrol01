(function(root) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
  const cpf = value => String(value || '').replace(/\D/g,'');
  function birth(value) {
    const text=normalize(value), br=text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    return br ? `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}` : text;
  }
  function findDuplicate(candidate,rows,ignoreId) {
    if(candidate.type === 'vehicle') return null;
    const key=cpf(candidate.cpf);
    const tuple=[normalize(candidate.name),birth(candidate.birth),normalize(candidate.mother)];
    if(!key && tuple.some(v=>!v)) return null;
    return rows.find(row=>row.id!==ignoreId && row.type!=='vehicle' &&
      (key ? cpf(row.cpf)===key : normalize(row.name)===tuple[0] && birth(row.birth)===tuple[1] && normalize(row.mother)===tuple[2])) || null;
  }
  function duplicateError(item) {
    return Object.assign(new Error('POSSÍVEL CADASTRO DUPLICADO\nEsta pessoa já pode estar cadastrada.'),{code:'duplicate-person',duplicate:item});
  }
  function identitySnapshot(row) {
    return JSON.stringify(['type','name','vulgo','faction','cpf','birth','mother','infopem','address','description','latitude','longitude','model','ownerName','ownerId','alert','alertaGeral','hasPhoto','photoVersion'].map(k=>row[k]??null));
  }
  function create(db, owner, authorize, notify) {
    const collection = () => db.collection('users').doc(owner()).collection('items');
    const control = () => db.collection('users').doc(owner()).collection('controls').doc('personRevision');
    const revision = snap => snap.exists ? snap.data().revision : 0;
    const identityRow=(row,id)=>({id,type:row.type,name:row.name,cpf:row.cpf,birth:row.birth,mother:row.mother});
    let scan=null;
    async function check(candidate,ignoreId,baseline=null) {
      if(candidate.type==='vehicle')return null;
      const rev=baseline===null?revision(await control().get({source:'server'})):baseline;
      if(!scan||scan.revision!==rev){
        const snap=await collection().get({source:'server'});
        scan={revision:rev,rows:snap.docs.map(d=>identityRow(d.data(),d.id))};
      }
      let duplicate=findDuplicate(candidate,scan.rows,ignoreId);
      if(duplicate){
        // Deletion does not advance the identity revision; verify cached matches.
        const current=await collection().doc(duplicate.id).get({source:'server'});
        if(!current.exists){scan=null;return check(candidate,ignoreId,rev);}
        duplicate=findDuplicate(candidate,[{...current.data(),id:duplicate.id}],ignoreId);
      }
      return duplicate;
    }
    async function save({uid,id,payload,image,thumbnail,token,editing=false,expected=null}) {
      const item=collection().doc(id), full=item.collection('photos').doc('full'), thumb=item.collection('photos').doc('thumb');
      const person=payload.type!=='vehicle';
      const writeNotification=notify ? notify(editing?'edited':'created',id,payload) : null;
      for(let attempt=0;attempt<8;attempt++) {
        if(!authorize(uid))throw new Error('Acesso não autorizado.');
        // Read the revision BEFORE the collection. The transaction validates
        // that no other identity-changing write has committed since this scan.
        const baseline=person ? revision(await control().get({source:'server'})) : 0;
        const duplicate=person ? await check(payload,id,baseline) : null;
        try {
          let committed=false;
          const result=await db.runTransaction(async tx=>{
            committed=false;
            if(!authorize(uid))throw new Error('Acesso não autorizado.');
            const current=await tx.get(item);
            if(!editing && current.exists) {
              if(current.data()._creationToken===token)return;
              throw new Error('Conflito de cadastro. O envio permanece pendente.');
            }
            if(editing && !current.exists)throw new Error('Este cadastro não existe mais.');
            if(editing && (expected===null || identitySnapshot(current.data())!==expected))throw new Error('Este cadastro foi alterado. Feche a edição, abra novamente e confira os dados antes de salvar.');
            if(person) {
              const guard=await tx.get(control());
              if(revision(guard)!==baseline)throw Object.assign(new Error('Repetir conferência.'),{code:'stale-person-scan'});
              if(duplicate)throw duplicateError(duplicate);
            }
            if(payload.ownerId) {
              const linked=await tx.get(collection().doc(payload.ownerId));
              if(!linked.exists || linked.data().type==='vehicle')throw new Error('O proprietário ainda não está disponível. O veículo permanece pendente.');
            }
            const data={...payload};
            if(person) data._dedupRevision=baseline+1;
            if(!editing)data._creationToken=token;
            if(editing)tx.update(item,data);else tx.set(item,data);
            if(image) {
              tx.set(full,{image,version:payload.photoVersion});
              tx.set(thumb,{image:thumbnail,version:payload.photoVersion});
            }
            if(person)tx.set(control(),{revision:baseline+1,itemId:id});
            if(writeNotification)writeNotification(tx);
            committed=true;
          });
          if(committed&&person&&scan?.revision===baseline){
            scan={revision:baseline+1,rows:[...scan.rows.filter(r=>r.id!==id),identityRow(payload,id)]};
          }
          return result;
        } catch(error) { if(error.code!=='stale-person-scan')throw error; }
      }
      throw new Error('Há outros cadastros sendo salvos. Tente novamente em alguns segundos.');
    }
    return {check,save};
  }
  root.ZebrolRecordGuard={normalize,cpf,birth,findDuplicate,duplicateError,identitySnapshot,create};
})(typeof window!=='undefined'?window:globalThis);
