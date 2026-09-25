// Filled with the existing data owner's UID before publishing.
const ZEBROL_ADMIN_UID = '1Cmku6frFfWYhMfOUhGUTNffkGu1';
const accessAuth = firebase.auth();
const accessDb = firebase.firestore();
let currentAccess = null;
function dataOwner() { return ZEBROL_ADMIN_UID; }
function accessCacheKey(account) {
  return account.uid === ZEBROL_ADMIN_UID ? account.uid : ZEBROL_ADMIN_UID + '~' + account.uid;
}
function maySync(scope) {
  return !!currentAccess && currentAccess.uid === scope && currentAccess.authUid === accessAuth.currentUser?.uid;
}
const deviceRequests = () => accessDb.collection('accessRequests');
function watchAccess(onState) {
  let stopDevice = () => {}, generation = 0, stopped = false;
  let lastAccount = null;
  const emit = state => {
    currentAccess = state.user || null;
    if (!stopped) onState(state);
  };
  const update = account => {
    const version = ++generation;
    stopDevice(); stopDevice = () => {};
    lastAccount = account;
    emit({ status: 'checking', user: null });
    if (!account) { emit({ status: 'login', user: null }); return; }
    if (ZEBROL_ADMIN_UID === 'PENDENTE_UID_ADMIN') {
      emit({ status: 'configuration', user: null }); return;
    }
    const approvedKey = 'zebrol-approved:' + ZEBROL_ADMIN_UID + ':' + account.uid;
    const effective = { uid: accessCacheKey(account), authUid: account.uid, isAdmin: account.uid === ZEBROL_ADMIN_UID };
    if (effective.isAdmin) { emit({ status: 'approved', user: effective }); return; }
    const nameKey = approvedKey + ':name';
    const apply = (status, name) => {
      if (version !== generation || stopped) return;
      try {
        if (status === 'approved') {
          effective.name = String(name || ('Acesso ' + account.uid.slice(-8))).trim().slice(0,60);
          localStorage.setItem(nameKey, effective.name);
          localStorage.setItem(approvedKey, 'yes');
        }
        else { localStorage.removeItem(approvedKey); localStorage.removeItem(nameKey); }
      } catch (_) {}
      emit({ status, user: status === 'approved' ? effective : null });
    };
    if (!navigator.onLine) {
      let remembered = false;
      try { remembered = localStorage.getItem(approvedKey) === 'yes'; effective.name = localStorage.getItem(nameKey) || ('Acesso ' + account.uid.slice(-8)); } catch (_) {}
      emit({ status: remembered ? 'approved' : 'offline', user: remembered ? effective : null });
    }
    stopDevice = deviceRequests().doc(account.uid).onSnapshot({ includeMetadataChanges: true }, snap => {
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
      const status = snap.exists ? snap.data().status : 'request';
      apply(['approved','pending','blocked','rejected','request'].includes(status) ? status : 'blocked', snap.exists ? snap.data().name : '');
    }, error => {
      if (version !== generation || stopped) return;
      // A permission denial revokes local admission too. Transient failures keep
      // already admitted offline use; a fresh online launch stays locked.
      if (error.code === 'permission-denied' || error.code === 'unauthenticated') apply('blocked');
      else if (!currentAccess) emit({ status: 'error', user: null });
    });
  };
  const stopAuth = accessAuth.onAuthStateChanged(update);
  const reconnect = () => update(accessAuth.currentUser);
  window.addEventListener('online', reconnect);
  const disconnected = () => update(lastAccount);
  window.addEventListener('offline', disconnected);
  return () => { stopped = true; generation++; currentAccess = null; stopAuth(); stopDevice(); window.removeEventListener('online',reconnect); window.removeEventListener('offline',disconnected); };
}
async function requestDeviceAccess(name) {
  name = name.trim();
  if (!name || name.length > 60) throw new Error('Informe um nome de até 60 caracteres.');
  if (!navigator.onLine) throw new Error('Conecte à internet para solicitar acesso.');
  if (ZEBROL_ADMIN_UID === 'PENDENTE_UID_ADMIN') throw new Error('A configuração do administrador ainda não foi concluída.');
  await accessAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  const account = accessAuth.currentUser || (await accessAuth.signInAnonymously()).user;
  const ref = deviceRequests().doc(account.uid);
  await accessDb.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) return;
    tx.set(ref, { name, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  });
}
async function changeDeviceAccess(id, status) {
  if (accessAuth.currentUser?.uid !== ZEBROL_ADMIN_UID || !navigator.onLine) throw new Error('Entre como administrador e conecte à internet.');
  if (!['approved','blocked','rejected'].includes(status)) throw new Error('Ação inválida.');
  await deviceRequests().doc(id).update({ status });
}
