import { readZipEntries, xmlFromText } from './zipxml.js';
import { hasArabic, hasLatin, normalizeText } from '../core/normalize.js';

function nodeText(node){
  return Array.from(node.getElementsByTagName('*'))
    .filter(n => n.localName === 't')
    .map(n => n.textContent || '')
    .join('')
    .replace(/\s+/g,' ')
    .trim();
}

function pickPair(texts){
  let ar='', en='';
  for(const t of texts.filter(Boolean)){
    if(hasArabic(t) && (!ar || t.length > ar.length)) ar = t;
    if(hasLatin(t) && (!en || t.length > en.length)) en = t;
  }
  if(ar && en && normalizeText(ar) !== normalizeText(en)) return { source:ar, target:en, sourceLang:'ar', targetLang:'en', origin:'docx-table' };
  return null;
}

async function documentXml(fileOrBuffer){
  const zip = await readZipEntries(fileOrBuffer);
  const xml = await zip.readText('word/document.xml');
  if(!xml) throw new Error('ملف DOCX لا يحتوي على word/document.xml');
  return xmlFromText(xml);
}

export async function parseDocxPairs(fileOrBuffer){
  const doc = await documentXml(fileOrBuffer);
  const out = [];
  const rows = Array.from(doc.getElementsByTagName('*')).filter(n => n.localName === 'tr');
  for(const row of rows){
    const cells = Array.from(row.getElementsByTagName('*')).filter(n => n.localName === 'tc');
    const pair = pickPair(cells.map(nodeText));
    if(pair) out.push(pair);
  }
  if(out.length) return out;
  const ps = Array.from(doc.getElementsByTagName('*')).filter(n => n.localName === 'p').map(nodeText).filter(Boolean);
  for(let i=0;i<ps.length-1;i+=2){
    const a=ps[i], b=ps[i+1];
    if(hasArabic(a) && hasLatin(b)) out.push({source:a,target:b,sourceLang:'ar',targetLang:'en',origin:'docx-paragraphs'});
    else if(hasLatin(a) && hasArabic(b)) out.push({source:b,target:a,sourceLang:'ar',targetLang:'en',origin:'docx-paragraphs'});
  }
  return out;
}

export async function parseDocxSource(fileOrBuffer){
  const doc = await documentXml(fileOrBuffer);
  const out = [];
  let id = 1;
  const rows = Array.from(doc.getElementsByTagName('*')).filter(n => n.localName === 'tr');
  if(rows.length){
    for(const row of rows){
      const cells = Array.from(row.getElementsByTagName('*')).filter(n => n.localName === 'tc');
      for(const c of cells){
        const t = nodeText(c);
        if(t) out.push({ id:id++, source:t, norm:normalizeText(t), origin:'docx-cell' });
      }
    }
    return out;
  }
  const ps = Array.from(doc.getElementsByTagName('*')).filter(n => n.localName === 'p').map(nodeText).filter(Boolean);
  for(const p of ps) out.push({ id:id++, source:p, norm:normalizeText(p), origin:'docx-p' });
  return out;
}
