/* Local data is partitioned by the authenticated Firebase UID. */
(function (root) {
  'use strict';
  const THUMB_LIMIT = 20 * 1024 * 1024;
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('zebrol-offline-v1', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('lists', { keyPath: 'uid' });
        db.createObjectStore('pending', { keyPath: 'key' }).createIndex('uid', 'uid');
        db.createObjectStore('thumbs', { keyPath: 'key' });
      };
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => { database = null; reject(request.error); };
      request.onblocked = () => { database = null; reject(new Error('Feche as outras abas do Zebrol e tente novamente.')); };
    });
    return database;
  }
  async function transact(stores, mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Não foi possível guardar os dados.'));
      try { operation(tx, value => { result = value; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }
  function clean(item) {
    const result = { ...item };
    delete result.image;
    delete result._pending;
    delete result._pendingError;
    delete result._duplicateId;
    delete result._previewOnly;
    delete result._creationToken;
    return result;
  }
  const keyFor = (uid, id) => uid + ':' + id;
  const thumbKey = (uid, id, version) => keyFor(uid, id) + ':' + (version || 'legacy');
  function getList(uid) {
    return transact(['lists'], 'readonly', (tx, done) => {
      tx.objectStore('lists').get(uid).onsuccess = e => done(e.target.result?.items || []);
    });
  }
  function putList(uid, items) {
    return transact(['lists'], 'readwrite', tx => tx.objectStore('lists').put({ uid, items: items.map(clean) }));
  }
  function getPending(uid) {
    return transact(['pending'], 'readonly', (tx, done) => {
      tx.objectStore('pending').index('uid').getAll(uid).onsuccess = e => done(e.target.result.sort((a,b) => a.created - b.created));
    });
  }
  function pendingOne(uid, id) {
    return transact(['pending'], 'readonly', (tx, done) => {
      tx.objectStore('pending').get(keyFor(uid,id)).onsuccess = e => done(e.target.result || null);
    });
  }
  async function enqueue(uid, id, item, image, thumbnail, confirmedNames = [], actorName = '') {
    const entry = { key: keyFor(uid,id), uid, id, item: clean(item), image, thumbnail, confirmedNames, actorName, created: Date.now(), token: crypto.randomUUID(), error: '' };
    await transact(['pending'], 'readwrite', tx => tx.objectStore('pending').add(entry));
    return entry;
  }
  function confirmDifferent(uid,id,existingId) {
    return transact(['pending'],'readwrite',tx=>{const store=tx.objectStore('pending');store.get(keyFor(uid,id)).onsuccess=e=>{const row=e.target.result;if(row)store.put({...row,confirmedNames:[...new Set([...(row.confirmedNames||[]),existingId])],duplicateId:'',error:'',nextAt:0,blocked:false,attempts:0,duplicateId:''});};});
  }
  function setPendingError(uid, id, message, duplicateId = '', code = '') {
    return transact(['pending'], 'readwrite', tx => {
      const store = tx.objectStore('pending');
      store.get(keyFor(uid,id)).onsuccess = e => { if(e.target.result) store.put({ ...e.target.result, error: message, duplicateId, attempts:(e.target.result.attempts||0)+1, nextAt:Date.now()+Math.min(900000,30000*Math.pow(2,Math.min((e.target.result.attempts||0)+1,5))), blocked:['permission-denied','unauthenticated'].includes(code) }); };
    });
  }
  function retryPending(uid,id){return transact(['pending'],'readwrite',tx=>{const store=tx.objectStore('pending');store.get(keyFor(uid,id)).onsuccess=e=>{if(e.target.result)store.put({...e.target.result,nextAt:0,blocked:false,attempts:0});};});}
  // The outbox is removed only after a successful server commit; promote text
  // into the local list in the same local transaction for restart safety.
  function discardPending(uid,id) { return transact(['pending'],'readwrite',tx=>tx.objectStore('pending').delete(keyFor(uid,id))); }
  function confirm(entry) {
    return transact(['pending','lists'], 'readwrite', tx => {
      const lists = tx.objectStore('lists');
      lists.get(entry.uid).onsuccess = e => {
        const rows = e.target.result?.items || [];
        if (!rows.some(row => row.id === entry.id)) rows.push({ ...entry.item, id: entry.id });
        lists.put({ uid: entry.uid, items: rows });
        tx.objectStore('pending').delete(entry.key);
      };
    });
  }
  function merge(items, pending) {
    const rows = new Map(items.map(item => [item.id, item]));
    pending.forEach(entry => rows.set(entry.id, { ...entry.item, id: entry.id, _pending: true, _pendingError: entry.error, _duplicateId: entry.duplicateId }));
    return [...rows.values()];
  }
  function getThumb(uid, id, version) {
    return transact(['thumbs'], 'readwrite', (tx, done) => {
      const store = tx.objectStore('thumbs');
      store.get(thumbKey(uid,id,version)).onsuccess = e => {
        const value = e.target.result;
        if(value) { value.touched = Date.now(); store.put(value); }
        done(value?.image || '');
      };
    });
  }
  function putThumb(uid,id,version,image) {
    if (!image || image.length * 2 > THUMB_LIMIT) return Promise.resolve();
    return transact(['thumbs'], 'readwrite', tx => {
      const store = tx.objectStore('thumbs');
      const entry = { key: thumbKey(uid,id,version), ownerKey: keyFor(uid,id), image, bytes: image.length * 2, touched: Date.now() };
      // Stream one thumbnail at a time and retain metadata only.
      const second=String(id).endsWith('~second-photo');const limit=second?8*1024*1024:THUMB_LIMIT;
      const rows=[];const cursorRequest=store.openCursor();
      cursorRequest.onsuccess=e=>{
        const cursor=e.target.result;
        if(cursor){
          const row=cursor.value;
          if(row.ownerKey===entry.ownerKey)cursor.delete();
          else if(String(row.ownerKey).endsWith('~second-photo')===second)rows.push({key:row.key,bytes:row.bytes,touched:row.touched});
          cursor.continue();return;
        }
        rows.sort((a,b)=>a.touched-b.touched);
        let total=rows.reduce((sum,row)=>sum+row.bytes,entry.bytes);
        for(const row of rows){if(total<=limit)break;store.delete(row.key);total-=row.bytes;}
        store.put(entry);
      };
    });
  }
  root.ZebrolOffline = { open, retryPending, confirmDifferent, discardPending, getList, putList, getPending, pendingOne, enqueue, confirm, setPendingError, merge, getThumb, putThumb, clean, THUMB_LIMIT };
})(typeof window !== 'undefined' ? window : globalThis);
