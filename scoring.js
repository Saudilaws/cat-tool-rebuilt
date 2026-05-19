import { normalizeText, compactText, tokenize } from './normalize.js';

function bigrams(s){
  const x = compactText(s);
  const out = [];
  for(let i=0;i<x.length-1;i++) out.push(x.slice(i,i+2));
  return out;
}

function dice(a,b){
  const A = bigrams(a), B = bigrams(b);
  if(!A.length || !B.length) return 0;
  const map = new Map();
  for(const x of A) map.set(x,(map.get(x)||0)+1);
  let hit = 0;
  for(const y of B){
    const c = map.get(y)||0;
    if(c){ hit++; map.set(y,c-1); }
  }
  return (2*hit)/(A.length+B.length);
}

function jaccard(a,b){
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if(!A.size || !B.size) return 0;
  let inter = 0;
  for(const x of A) if(B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function lengthSim(a,b){
  const x = compactText(a).length, y = compactText(b).length;
  if(!x || !y) return 0;
  return Math.min(x,y)/Math.max(x,y);
}

export function scorePair(a,b){
  const na = normalizeText(a), nb = normalizeText(b);
  if(!na || !nb) return 0;
  if(na === nb) return 100;
  if(compactText(na) === compactText(nb)) return 99;
  const s = (dice(a,b)*0.58 + jaccard(a,b)*0.30 + lengthSim(a,b)*0.12) * 100;
  return Math.round(Math.max(0, Math.min(98, s)));
}
