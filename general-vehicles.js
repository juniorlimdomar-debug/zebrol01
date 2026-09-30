(function(root) {
  function values(input) {
    const result={plate:String(input.plate||'').trim().toUpperCase().replace(/\s+/g,''),model:String(input.model||'').trim(),color:String(input.color||'').trim(),year:String(input.year||'').trim(),date:String(input.date||'').trim()};
    if(!result.plate || !result.model)throw new Error('Informe a placa e o modelo.');
    if(result.plate.length>20 || result.model.length>120 || result.color.length>60 || result.year.length>20 || result.date.length>30)throw new Error('Confira os campos informados.');
    return result;
  }
  function create(db,owner,authorize,isAdmin,online) {
    const collection=()=>db.collection('users').doc(owner()).collection('generalVehicles');
    function check(uid){if(!authorize(uid))throw new Error('Acesso não autorizado.');if(!online())throw new Error('Conecte à internet para alterar esta lista.');}
    async function save(uid,id,input,expectedVersion=null) {
      check(uid);const data=values(input),ref=collection().doc(id);
      await db.runTransaction(async tx=>{
        check(uid);const snap=await tx.get(ref);
        if(expectedVersion===null && snap.exists) {
          if(snap.data()._creationToken===id)return;
          throw new Error('Este veículo já existe. Abra a edição novamente.');
        }
        if(expectedVersion!==null && (!snap.exists || snap.data().version!==expectedVersion))throw new Error('Este veículo foi alterado ou removido. Abra a edição novamente.');
        if(expectedVersion===null)tx.set(ref,{...data,version:1,_creationToken:id});
        else tx.update(ref,{...data,version:expectedVersion+1});
      });
    }
    async function remove(uid,id,expectedVersion) {
      check(uid);if(!isAdmin())throw new Error('Somente o administrador pode remover veículos.');
      const ref=collection().doc(id);
      await db.runTransaction(async tx=>{
        check(uid);if(!isAdmin())throw new Error('Acesso não autorizado.');
        const snap=await tx.get(ref);if(!snap.exists)return;
        if(snap.data().version!==expectedVersion)throw new Error('O veículo foi alterado. Confira os dados antes de remover.');
        tx.delete(ref);
      });
    }
    return {collection,save,remove};
  }
  root.ZebrolGeneralVehicles={values,create};
})(typeof window!=='undefined'?window:globalThis);
