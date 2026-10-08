(function(root){
  function values(input){
    const date=String(input.date||'').trim(),text=String(input.text||'').trim();
    if(!text)throw new Error('Preencha as informações.');
    if(date.length>40||text.length>20000)throw new Error('Use até 40 caracteres na data e 20.000 nas informações.');
    return {date,text};
  }
  function create(db,owner,authorize,isAdmin,online,timestamp,notify){
    const collection=()=>db.collection('users').doc(owner()).collection('serviceInformation');
    function check(uid){if(!authorize(uid))throw new Error('Acesso não autorizado.');if(!online())throw new Error('Conecte à internet para salvar alterações.');}
    async function save(uid,id,input,version=null){
      check(uid);const data=values(input),ref=collection().doc(id);
      const writeNotice=notify?notify(version===null?'created':'edited',id,{type:'service',name:data.text.slice(0,120)}):null;
      await db.runTransaction(async tx=>{
        check(uid);const snap=await tx.get(ref);
        if(version===null&&snap.exists){if(snap.data()._creationToken===id)return;throw new Error('Registro já existente.');}
        if(version!==null&&(!snap.exists||snap.data().version!==version))throw new Error('O registro mudou. Feche a edição e abra novamente.');
        if(version===null)tx.set(ref,{...data,createdAt:timestamp(),updatedAt:timestamp(),version:1,_creationToken:id});
        else tx.update(ref,{...data,updatedAt:timestamp(),version:version+1});
        if(writeNotice)writeNotice(tx);
      });
    }
    async function remove(uid,id,version){
      check(uid);if(!isAdmin())throw new Error('Somente o administrador pode apagar.');
      const ref=collection().doc(id);
      await db.runTransaction(async tx=>{check(uid);if(!isAdmin())throw new Error('Acesso não autorizado.');const snap=await tx.get(ref);if(!snap.exists)return;if(snap.data().version!==version)throw new Error('O registro mudou. Confira antes de apagar.');tx.delete(ref);if(notify)notify('deleted',id,{type:'service',name:snap.data().text.slice(0,120)})(tx);});
    }
    return {collection,save,remove};
  }
  root.ZebrolServiceInformation={values,create};
})(typeof window!=='undefined'?window:globalThis);
