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
  function create(db, owner, authorize, notify) {
    const collection = () => db.collection('users').doc(owner()).collection('items');
    const control = () => db.collection('users').doc(owner()).collection('controls').doc('personRevision');
    const revision = snap => snap.exists ? snap.data().revision : 0;
    async function check(candidate,ignoreId) {
      if(candidate.type==='vehicle')return null;
      const snap=await collection().get({source:'server'});
      return findDuplicate(candidate,snap.docs.map(d=>({...d.data(),id:d.id})),ignoreId);
    }
    async function save({uid,id,payload,image,thumbnail,token,editing=false}) {
      const item=collection().doc(id), full=item.collection('photos').doc('full'), thumb=item.collection('photos').doc('thumb');
      const person=payload.type!=='vehicle';
      const writeNotification=notify ? notify(editing?'edited':'created',id,payload) : null;
      for(let attempt=0;attempt<8;attempt++) {
        if(!authorize(uid))throw new Error('Acesso não autorizado.');
        // Read the revision BEFORE the collection. The transaction validates
        // that no other identity-changing write has committed since this scan.
        const baseline=person ? revision(await control().get({source:'server'})) : 0;
        const duplicate=person ? await check(payload,id) : null;
        try {
          return await db.runTransaction(async tx=>{
            if(!authorize(uid))throw new Error('Acesso não autorizado.');
            const current=await tx.get(item);
            if(!editing && current.exists) {
              if(current.data()._creationToken===token)return;
              throw new Error('Conflito de cadastro. O envio permanece pendente.');
            }
            if(editing && !current.exists)throw new Error('Este cadastro não existe mais.');
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
          });
        } catch(error) { if(error.code!=='stale-person-scan')throw error; }
      }
      throw new Error('Há outros cadastros sendo salvos. Tente novamente em alguns segundos.');
    }
    return {check,save};
  }
  root.ZebrolRecordGuard={normalize,cpf,birth,findDuplicate,duplicateError,create};
})(typeof window!=='undefined'?window:globalThis);
