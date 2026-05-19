import { normalizeText } from './normalize.js';

export function splitPlainText(text=''){
  const raw = String(text || '').replace(/\r/g,'');
  const paras = raw.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
  const list = [];
  let id = 1;
  for(const p of paras.length ? paras : raw.split(/\n/)){
    const t = String(p || '').trim();
    if(!t) continue;
    list.push({ id:id++, source:t, norm:normalizeText(t), origin:'paste' });
  }
  return list;
}

export function segmentBlocksFromDocument(doc){
  const selectors = 'p,li,td,th,div,section,article,h1,h2,h3,h4,h5,h6';
  const nodes = Array.from(doc.querySelectorAll(selectors));
  const seen = new Set();
  const out = [];
  let id = 1;
  for(const n of nodes){
    const text = (n.innerText || n.textContent || '').replace(/\s+/g,' ').trim();
    if(!text || text.length < 2) continue;
    const norm = normalizeText(text);
    if(!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ id:id++, source:text, norm, origin:n.tagName.toLowerCase() });
  }
  return out;
}
