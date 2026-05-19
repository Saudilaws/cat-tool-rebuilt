import { APP } from './state.js';
import { normalizeText, compactText } from './core/normalize.js';

let dbPromise = null;

export function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(APP.dbName, APP.dbVersion);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains('memories')){
        db.createObjectStore('memories', { keyPath:'id' });
      }
      if(!db.objectStoreNames.contains('tus')){
        const tus = db.createObjectStore('tus', { keyPath:'id', autoIncrement:true });
        tus.createIndex('memoryId','memoryId',{unique:false});
        tus.createIndex('ns','ns',{unique:false});
        tus.createIndex('cs','cs',{unique:false});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txDone(tx){
  return new Promise((resolve,reject)=>{ tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error); });
}

export async function createMemory(name){
  const db = await openDB();
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  const now = new Date().toISOString();
  const item = { id, name:name || `Memory ${now.slice(0,10)} ${now.slice(11,16)}`, count:0, createdAt:now, updatedAt:now };
  const tx = db.transaction('memories','readwrite');
  tx.objectStore('memories').put(item);
  await txDone(tx);
  localStorage.setItem('az_cat_active_memory_id', id);
  return item;
}

export async function listMemories(){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('memories','readonly');
    const req = tx.objectStore('memories').getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))));
    req.onerror = () => reject(req.error);
  });
}

export async function getMemory(id){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('memories','readonly');
    const req = tx.objectStore('memories').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMemory(id){
  const db = await openDB();
  const tx = db.transaction(['memories','tus'],'readwrite');
  tx.objectStore('memories').delete(id);
  const idx = tx.objectStore('tus').index('memoryId');
  const range = IDBKeyRange.only(id);
  idx.openCursor(range).onsuccess = e => {
    const cur = e.target.result;
    if(cur){ cur.delete(); cur.continue(); }
  };
  await txDone(tx);
  if(localStorage.getItem('az_cat_active_memory_id') === id) localStorage.removeItem('az_cat_active_memory_id');
}

export async function bulkAddTUs(memoryId, tus, onProgress=()=>{}){
  const db = await openDB();
  const clean = [];
  const seen = new Set();
  for(const tu of tus || []){
    const source = String(tu.source || '').trim();
    const target = String(tu.target || '').trim();
    if(!source || !target) continue;
    const ns = normalizeText(source);
    const nt = normalizeText(target);
    const key = ns + '→' + nt;
    if(seen.has(key)) continue;
    seen.add(key);
    clean.push({
      memoryId, source, target,
      sourceLang: tu.sourceLang || '', targetLang: tu.targetLang || '',
      ns, nt, cs:compactText(source), ct:compactText(target),
      origin: tu.origin || '', createdAt:new Date().toISOString()
    });
  }
  const chunk = 700;
  let inserted = 0;
  for(let i=0;i<clean.length;i+=chunk){
    const part = clean.slice(i,i+chunk);
    const tx = db.transaction('tus','readwrite');
    const store = tx.objectStore('tus');
    for(const item of part) store.add(item);
    await txDone(tx);
    inserted += part.length;
    onProgress(inserted, clean.length);
    await new Promise(r=>setTimeout(r,0));
  }
  await refreshMemoryCount(memoryId);
  return inserted;
}

export async function refreshMemoryCount(memoryId){
  const db = await openDB();
  const count = await new Promise((resolve,reject)=>{
    const tx = db.transaction('tus','readonly');
    const req = tx.objectStore('tus').index('memoryId').count(IDBKeyRange.only(memoryId));
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
  const mem = await getMemory(memoryId);
  if(mem){
    mem.count = count;
    mem.updatedAt = new Date().toISOString();
    const tx = db.transaction('memories','readwrite');
    tx.objectStore('memories').put(mem);
    await txDone(tx);
  }
  return count;
}

export async function streamTUs(memoryId, batchSize, onBatch){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('tus','readonly');
    const idx = tx.objectStore('tus').index('memoryId');
    const range = IDBKeyRange.only(memoryId);
    let batch = [], total = 0;
    idx.openCursor(range).onsuccess = async e => {
      const cur = e.target.result;
      if(cur){
        batch.push(cur.value); total++;
        if(batch.length >= batchSize){
          const b = batch; batch = [];
          try{ onBatch(b,total); }catch(err){ reject(err); return; }
        }
        cur.continue();
      }else{
        if(batch.length) onBatch(batch,total);
        resolve(total);
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function searchTM(memoryId, query, limit=120){
  const q = normalizeText(query);
  const out = [];
  if(!q) return out;
  await streamTUs(memoryId, 1000, batch => {
    for(const tu of batch){
      if(out.length >= limit) break;
      if((tu.ns||'').includes(q) || (tu.nt||'').includes(q)) out.push(tu);
    }
  });
  return out;
}
