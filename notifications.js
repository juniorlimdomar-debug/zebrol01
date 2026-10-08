(function(root){
  function create(db,owner,timestamp){
    const collection=()=>db.collection('users').doc(owner()).collection('notifications');
    const state=uid=>db.collection('users').doc(owner()).collection('notificationRead').doc(uid);
    function event(action,targetId,item){
      const ref=collection().doc();
      return tx=>tx.set(ref,{action,targetId,name:String(item.name||item.model||'Cadastro').slice(0,300),kind:item.type==='service'?'service':item.type==='vehicle'?'vehicle':'person',createdAt:timestamp()});
    }
    return {collection,state,event};
  }
  root.ZebrolNotifications={create};
})(typeof window!=='undefined'?window:globalThis);
