/**
 * local-firebase.js
 * 純本地 Python 後端專用 SDK
 * 模擬 Firestore 與 Auth 介面，支援極低延遲（<3ms）的即時輪詢與資料同步
 */

// 產生或取得本機端唯一的 UID
function getOrCreateLocalUid() {
  let uid = localStorage.getItem('local_user_uid');
  if (!uid) {
    uid = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('local_user_uid', uid);
  }
  return uid;
}

const currentUid = getOrCreateLocalUid();

// 1. Firebase App 模擬
export function initializeApp(config = {}) {
  console.log('🚀 [LocalDB] 已成功連接至本地 Python 後台');
  return { name: '[LOCAL_PYTHON]', options: config };
}

// 2. Auth 模擬
export function getAuth(app) {
  return {
    currentUser: {
      uid: currentUid,
      isAnonymous: true,
      displayName: '使用者_' + currentUid.slice(-4)
    }
  };
}

export async function signInAnonymously(auth) {
  return { user: auth.currentUser };
}

export function onAuthStateChanged(auth, callback) {
  setTimeout(() => {
    if (callback) callback(auth.currentUser);
  }, 0);
  return () => {};
}

// 3. Firestore 核心模擬
export function getFirestore(app) {
  return { _isLocalFirestore: true };
}

export function serverTimestamp() {
  return Date.now();
}

export function deleteField() {
  return '__DELETE_FIELD__';
}

// 產生隨機唯一 document ID
function generateDocId() {
  return 'obj_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

export function doc(dbOrCol, ...paths) {
  let basePath = '';
  if (dbOrCol && typeof dbOrCol === 'object' && dbOrCol.path) {
    basePath = dbOrCol.path;
  }
  
  const cleanParts = paths.map(p => String(p).replace(/^\/+|\/+$/g, '')).filter(Boolean);
  
  let fullPath = '';
  if (basePath) {
    if (cleanParts.length === 0) {
      // 關鍵修正：若傳入 collection 但未給予額外路徑，自動產生唯一 doc ID！
      const newId = generateDocId();
      fullPath = basePath + '/' + newId;
    } else {
      fullPath = basePath + '/' + cleanParts.join('/');
    }
  } else {
    if (cleanParts.length === 0) {
      fullPath = generateDocId();
    } else {
      fullPath = cleanParts.join('/');
    }
  }
  
  const segments = fullPath.split('/');
  const id = segments[segments.length - 1];
  return {
    type: 'doc',
    path: fullPath,
    id: id
  };
}

export function collection(dbOrDoc, ...paths) {
  let basePath = '';
  if (dbOrDoc && typeof dbOrDoc === 'object' && dbOrDoc.path) {
    basePath = dbOrDoc.path;
  }
  const cleanParts = paths.map(p => String(p).replace(/^\/+|\/+$/g, '')).filter(Boolean);
  let fullPath = '';
  if (basePath) {
    fullPath = cleanParts.length > 0 ? (basePath + '/' + cleanParts.join('/')) : basePath;
  } else {
    fullPath = cleanParts.join('/');
  }
  return {
    type: 'collection',
    path: fullPath
  };
}

export function where(field, op, val) {
  return { type: 'where', field, op, val };
}

export function query(colRef, ...constraints) {
  return {
    type: 'query',
    path: colRef.path,
    constraints: constraints.filter(c => c && c.type === 'where')
  };
}

// Helper: 建立 DocSnapshot 物件
function createDocSnapshot(id, data, ref) {
  return {
    id: id,
    ref: ref || doc(null, id),
    exists: () => data !== null && data !== undefined,
    data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
  };
}

// Helper: 建立 QuerySnapshot 物件
function createQuerySnapshot(docList, prevDocMap = new Map()) {
  const docs = docList.map(item => {
    const dRef = doc(null, item.path || item.id);
    return createDocSnapshot(item.id, item.data, dRef);
  });

  const currentDocMap = new Map();
  docs.forEach(d => currentDocMap.set(d.id, d));

  const docChangesList = [];
  // 檢查新增與修改
  docs.forEach(d => {
    if (!prevDocMap.has(d.id)) {
      docChangesList.push({
        type: 'added',
        doc: d
      });
    } else {
      const oldDoc = prevDocMap.get(d.id);
      const oldData = oldDoc.data();
      const newData = d.data();
      const oldStr = JSON.stringify(oldData);
      const newStr = JSON.stringify(newData);
      if (oldStr !== newStr) {
        docChangesList.push({
          type: 'modified',
          doc: d
        });
      }
    }
  });

  // 檢查刪除
  prevDocMap.forEach((oldDoc, oldId) => {
    if (!currentDocMap.has(oldId)) {
      docChangesList.push({
        type: 'removed',
        doc: oldDoc
      });
    }
  });

  return {
    empty: docs.length === 0,
    size: docs.length,
    docs: docs,
    forEach: (fn) => docs.forEach(fn),
    docChanges: () => docChangesList,
    _docMap: currentDocMap
  };
}

// 4. CRUD 介面
export async function getDoc(docRef) {
  try {
    const res = await fetch(`/api/db/get?path=${encodeURIComponent(docRef.path)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return createDocSnapshot(json.id || docRef.id, json.exists ? json.data : null, docRef);
  } catch (err) {
    console.error(`[LocalDB] getDoc error (${docRef.path}):`, err);
    return createDocSnapshot(docRef.id, null, docRef);
  }
}

export async function getDocs(queryOrColRef) {
  const path = queryOrColRef.path;
  const whereClauses = queryOrColRef.constraints ? queryOrColRef.constraints.map(c => [c.field, c.op, c.val]) : [];
  try {
    const res = await fetch(`/api/db/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, where: whereClauses })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const docList = (json.docs || []).map(d => ({
      id: d.id,
      path: `${path}/${d.id}`,
      data: d.data
    }));
    return createQuerySnapshot(docList);
  } catch (err) {
    console.error(`[LocalDB] getDocs error (${path}):`, err);
    return createQuerySnapshot([]);
  }
}

export async function setDoc(docRef, data, options = {}) {
  try {
    const merge = !!(options && options.merge);
    const res = await fetch(`/api/db/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: docRef.path, data, merge })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[LocalDB] setDoc error (${docRef.path}):`, err);
    throw err;
  }
}

export async function updateDoc(docRef, data) {
  try {
    const res = await fetch(`/api/db/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: docRef.path, data })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[LocalDB] updateDoc error (${docRef.path}):`, err);
    throw err;
  }
}

export async function deleteDoc(docRef) {
  try {
    const res = await fetch(`/api/db/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: docRef.path })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[LocalDB] deleteDoc error (${docRef.path}):`, err);
    throw err;
  }
}

export async function addDoc(colRef, data) {
  try {
    const res = await fetch(`/api/db/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: colRef.path, data })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return doc(null, json.path || `${colRef.path}/${json.id}`);
  } catch (err) {
    console.error(`[LocalDB] addDoc error (${colRef.path}):`, err);
    throw err;
  }
}

// 5. Batch & Transaction
export function writeBatch(db) {
  const operations = [];
  return {
    set(docRef, data, options = {}) {
      operations.push({ action: 'set', path: docRef.path, data, merge: !!(options && options.merge) });
      return this;
    },
    update(docRef, data) {
      operations.push({ action: 'update', path: docRef.path, data });
      return this;
    },
    delete(docRef) {
      operations.push({ action: 'delete', path: docRef.path });
      return this;
    },
    async commit() {
      if (operations.length === 0) return;
      try {
        const res = await fetch(`/api/db/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operations })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        console.error('[LocalDB] Batch commit error:', err);
        throw err;
      }
    }
  };
}

export async function runTransaction(db, updateFunction) {
  const transaction = {
    async get(docRef) {
      return await getDoc(docRef);
    },
    set(docRef, data, options = {}) {
      return setDoc(docRef, data, options);
    },
    update(docRef, data) {
      return updateDoc(docRef, data);
    },
    delete(docRef) {
      return deleteDoc(docRef);
    }
  };
  return await updateFunction(transaction);
}

// 6. 即時監聽 onSnapshot 實作 (極低開銷的本機 200ms 輪詢 + 變更比對)
export function onSnapshot(refOrQuery, onNext, onError) {
  let isStopped = false;
  let prevDocMap = new Map();
  let prevDocString = null;
  let isFirstRun = true;
  const isDoc = (refOrQuery.type === 'doc');
  const path = refOrQuery.path;
  const whereClauses = refOrQuery.constraints ? refOrQuery.constraints.map(c => [c.field, c.op, c.val]) : [];

  const pollData = async () => {
    if (isStopped) return;
    try {
      if (isDoc) {
        const snap = await getDoc(refOrQuery);
        if (isStopped) return;
        const currentStr = JSON.stringify(snap.data());
        if (isFirstRun || currentStr !== prevDocString) {
          isFirstRun = false;
          prevDocString = currentStr;
          onNext(snap);
        }
      } else {
        const res = await fetch(`/api/db/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, where: whereClauses })
        });
        if (isStopped) return;
        if (res.ok) {
          const json = await res.json();
          const docList = (json.docs || []).map(d => ({
            id: d.id,
            path: `${path}/${d.id}`,
            data: d.data
          }));
          const snap = createQuerySnapshot(docList, prevDocMap);
          const changes = snap.docChanges();
          if (isFirstRun || changes.length > 0) {
            isFirstRun = false;
            prevDocMap = snap._docMap;
            prevDocString = JSON.stringify(docList);
            onNext(snap);
          }
        }
      }
    } catch (err) {
      if (onError && !isStopped) onError(err);
    }
  };

  // 立即執行第一次拉取
  pollData();

  // 建立極低開銷的定時輪詢 (區網環境 200ms)
  const timer = setInterval(pollData, 200);

  // 回傳取消監聽函式 (unsubscribe)
  return () => {
    isStopped = true;
    clearInterval(timer);
  };
}
