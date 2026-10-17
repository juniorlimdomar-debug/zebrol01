(function(root){
  function label(row){
    const service=row.kind==='service';
    if(row.actorName){
      const verbs=service
        ? {created:'adicionou informações do serviço',edited:'editou informações do serviço',deleted:'excluiu informações do serviço'}
        : {created:'adicionou cadastro',edited:'editou cadastro',deleted:'excluiu cadastro',alertOn:'adicionou ao Alerta Geral',alertOff:'retirou do Alerta Geral'};
      return row.actorName+' '+(verbs[row.action]||(service?'atualizou informações do serviço':'atualizou cadastro'));
    }
    const labels=service
      ? {created:'Informação do serviço adicionada',edited:'Informação do serviço editada',deleted:'Informação do serviço excluída'}
      : {created:'Cadastro adicionado',edited:'Cadastro editado',alertOn:'Adicionado ao alerta geral',alertOff:'Retirado do alerta geral',deleted:'Cadastro excluído'};
    return labels[row.action]||(service?'Informação do serviço atualizada':'Cadastro atualizado');
  }
  function create(db,owner,timestamp,actor=()=>''){
    const collection=()=>db.collection('users').doc(owner()).collection('notifications');
    const state=uid=>db.collection('users').doc(owner()).collection('notificationRead').doc(uid);
    function event(action,targetId,item,capturedName){
      const ref=collection().doc();
      const actorName=String(capturedName===undefined?actor():capturedName).trim().slice(0,60);
      return tx=>tx.set(ref,{action,targetId,...(actorName?{actorName}:{}),name:String(item.name||item.model||'Cadastro').slice(0,300),kind:item.type==='general'?'general':item.type==='service'?'service':item.type==='vehicle'?'vehicle':'person',createdAt:timestamp()});
    }
    return {collection,state,event,actor,label};
  }
  root.ZebrolNotifications={create};
})(typeof window!=='undefined'?window:globalThis);
