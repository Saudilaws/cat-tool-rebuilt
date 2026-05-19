const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;
const DIR = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ZW = /[\u200B\u200C\u200D\u2060\uFEFF\u034F]/g;
const SPACES = /[\s\u00A0\u202F\u2007-\u200A]+/g;
const AR_NUM = '٠١٢٣٤٥٦٧٨٩';
const FA_NUM = '۰۱۲۳۴۵۶۷۸۹';

function normalizeText(input=''){
  let s = String(input ?? '');
  s = s.replace(DIR,'').replace(ZW,'').replace(TATWEEL,'').replace(AR_DIACRITICS,'');
  s = s.replace(/[أإآٱ]/g,'ا').replace(/[ىی]/g,'ي').replace(/ک/g,'ك').replace(/[ہھۀ]/g,'ه');
  s = s.replace(/[٠-٩۰-۹]/g, ch => {
    const a = AR_NUM.indexOf(ch); if(a >= 0) return String(a);
    const f = FA_NUM.indexOf(ch); if(f >= 0) return String(f);
    return ch;
  });
  s = s.toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[ـ–—]/g,'-');
  return s.replace(SPACES,' ').trim();
}
function compactText(input=''){ return normalizeText(input).replace(/[\s\p{P}\p{S}]+/gu,''); }
function tokenize(input=''){
  return normalizeText(input).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2);
}
function bigrams(s){
  const x = compactText(s); const out = [];
  for(let i=0;i<x.length-1;i++) out.push(x.slice(i,i+2));
  return out;
}
function dice(a,b){
  const A=bigrams(a), B=bigrams(b); if(!A.length || !B.length) return 0;
  const map = new Map(); for(const x of A) map.set(x,(map.get(x)||0)+1);
  let hit=0; for(const y of B){ const c=map.get(y)||0; if(c){hit++; map.set(y,c-1);} }
  return (2*hit)/(A.length+B.length);
}
function jaccard(a,b){
  const A=new Set(tokenize(a)), B=new Set(tokenize(b)); if(!A.size || !B.size) return 0;
  let inter=0; for(const x of A) if(B.has(x)) inter++;
  return inter/(A.size+B.size-inter);
}
function lengthSim(a,b){ const x=compactText(a).length,y=compactText(b).length; return (!x||!y)?0:Math.min(x,y)/Math.max(x,y); }
function scorePair(a,b){
  const na=normalizeText(a), nb=normalizeText(b); if(!na||!nb) return 0;
  if(na===nb) return 100; if(compactText(na)===compactText(nb)) return 99;
  return Math.round(Math.max(0, Math.min(98, (dice(a,b)*.58+jaccard(a,b)*.30+lengthSim(a,b)*.12)*100)));
}
function splitLongText(s){
  return String(s||'')
    .split(/(?<=[.!؟?؛;:،])\s+|\n+|\s+-\s+/u)
    .map(x=>x.trim())
    .filter(x=>compactText(x).length >= 10)
    .slice(0,12);
}
function numberMismatch(a,b){
  const A = normalizeText(a).match(/\d+/g) || [];
  const B = normalizeText(b).match(/\d+/g) || [];
  if(!A.length && !B.length) return false;
  return A.join('|') !== B.join('|');
}

const state = {
  tus: [],
  exact: new Map(),
  compact: new Map(),
  tokenIndex: new Map()
};

function remember(tu){
  const id = state.tus.length;
  const ns = tu.ns || normalizeText(tu.source);
  const cs = tu.cs || compactText(tu.source);
  const item = { id, source:tu.source, target:tu.target, ns, cs };
  state.tus.push(item);
  if(!state.exact.has(ns)) state.exact.set(ns, item);
  if(!state.compact.has(cs)) state.compact.set(cs, item);
  const toks = Array.from(new Set(tokenize(ns))).filter(t => t.length >= 3).slice(0,40);
  for(const tok of toks){
    let arr = state.tokenIndex.get(tok);
    if(!arr){ arr = []; state.tokenIndex.set(tok, arr); }
    if(arr.length < 600) arr.push(id);
  }
}

function candidateIds(text){
  const toks = Array.from(new Set(tokenize(text))).filter(t => t.length >= 3);
  const counts = new Map();
  for(const t of toks){
    const arr = state.tokenIndex.get(t);
    if(!arr) continue;
    for(const id of arr) counts.set(id, (counts.get(id)||0)+1);
  }
  return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,180).map(x=>x[0]);
}

function findBest(source){
  const ns = normalizeText(source), cs = compactText(source);
  const ex = state.exact.get(ns);
  if(ex) return { target:ex.target, sourceFound:ex.source, score:100, mode:'exact-normalized' };
  const cx = state.compact.get(cs);
  if(cx) return { target:cx.target, sourceFound:cx.source, score:99, mode:'exact-compact' };
  let best = null;
  for(const id of candidateIds(source)){
    const tu = state.tus[id];
    const score = scorePair(source, tu.source);
    if(!best || score > best.score) best = { target:tu.target, sourceFound:tu.source, score, mode:'fuzzy' };
    if(best.score >= 98) break;
  }
  return best || { target:'', sourceFound:'', score:0, mode:'none' };
}

function findSplitComposite(source){
  const parts = splitLongText(source);
  if(parts.length < 2) return null;
  const hits = [];
  let covered = 0;
  for(const p of parts){
    const h = findBest(p);
    if(h && h.target && h.score >= 78){
      hits.push({part:p, ...h});
      covered += compactText(p).length;
    }
  }
  const total = compactText(source).length || 1;
  if(hits.length >= 2 && covered / total >= .58){
    const avg = Math.round(hits.reduce((a,b)=>a+b.score,0)/hits.length);
    return {
      target: hits.map(h=>h.target).join('\n'),
      sourceFound: hits.map(h=>h.sourceFound).join('\n---\n'),
      score: Math.min(94, avg),
      mode:'source-split-composite'
    };
  }
  return null;
}

function analyzeOne(seg){
  const source = seg.source || seg.text || '';
  let hit = findBest(source);
  if((!hit.target || hit.score < 82) && compactText(source).length > 80){
    const composite = findSplitComposite(source);
    if(composite) hit = composite;
  }
  let status = 'Needs Translation';
  if(hit.score >= 99) status = 'Confirmed';
  else if(hit.score >= 70 && hit.target) status = 'Review';
  if(hit.target && numberMismatch(source, hit.sourceFound || source) && hit.score < 100){
    status = 'Review';
    hit.mode += '+number-check';
    hit.score = Math.min(hit.score, 89);
  }
  return {
    id: seg.id,
    source,
    target: hit.target || '',
    best: hit.target || '',
    sourceFound: hit.sourceFound || '',
    score: hit.score || 0,
    status,
    mode: hit.mode || 'none',
    origin: seg.origin || ''
  };
}

self.onmessage = async ev => {
  const msg = ev.data || {};
  try{
    if(msg.type === 'reset'){
      state.tus = []; state.exact = new Map(); state.compact = new Map(); state.tokenIndex = new Map();
      self.postMessage({type:'resetDone'});
    }
    if(msg.type === 'addMemoryBatch'){
      for(const tu of msg.batch || []) remember(tu);
      self.postMessage({type:'memoryProgress', total:state.tus.length});
    }
    if(msg.type === 'analyze'){
      const segments = msg.segments || [];
      const chunk = 80;
      let done = 0;
      for(let i=0;i<segments.length;i+=chunk){
        const rows = segments.slice(i,i+chunk).map(analyzeOne);
        done += rows.length;
        self.postMessage({type:'resultsBatch', rows, done, total:segments.length});
        await new Promise(r=>setTimeout(r,0));
      }
      self.postMessage({type:'done', memoryCount:state.tus.length});
    }
  }catch(err){
    self.postMessage({type:'error', message: err && err.message ? err.message : String(err)});
  }
};
