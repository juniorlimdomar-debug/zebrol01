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
  async function enqueue(uid, id, item, image, thumbnail) {
    const entry = { key: keyFor(uid,id), uid, id, item: clean(item), image, thumbnail, created: Date.now(), token: crypto.randomUUID(), error: '' };
    await transact(['pending'], 'readwrite', tx => tx.objectStore('pending').add(entry));
    return entry;
  }
  function setPendingError(uid, id, message) {
    return transact(['pending'], 'readwrite', tx => {
      const store = tx.objectStore('pending');
      store.get(keyFor(uid,id)).onsuccess = e => { if(e.target.result) store.put({ ...e.target.result, error: message }); };
    });
  }
  // The outbox is removed only after a successful server commit; promote text
  // into the local list in the same local transaction for restart safety.
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
    pending.forEach(entry => rows.set(entry.id, { ...entry.item, id: entry.id, _pending: true, _pendingError: entry.error }));
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
      store.getAll().onsuccess = e => {
        // Remove obsolete versions first. Never touch the independent outbox.
        const rows = e.target.result.filter(row => {
          if(row.ownerKey === entry.ownerKey) { store.delete(row.key); return false; }
          return true;
        }).sort((a,b) => a.touched - b.touched);
        let total = rows.reduce((sum,row) => sum + row.bytes, entry.bytes);
        for(const row of rows) { if(total <= THUMB_LIMIT) break; store.delete(row.key); total -= row.bytes; }
        store.put(entry);
      };
    });
  }
  root.ZebrolOffline = { open, getList, putList, getPending, pendingOne, enqueue, confirm, setPendingError, merge, getThumb, putThumb, clean, THUMB_LIMIT };
})(typeof window !== 'undefined' ? window : globalThis);
