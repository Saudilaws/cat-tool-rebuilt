const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;
const DIR = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ZW = /[\u200B\u200C\u200D\u2060\uFEFF\u034F]/g;
const SPACES = /[\s\u00A0\u202F\u2007-\u200A]+/g;
const AR_NUM = '٠١٢٣٤٥٦٧٨٩';
const FA_NUM = '۰۱۲۳۴۵۶۷۸۹';

export function hasArabic(text=''){
  return /[\u0600-\u06FF]/.test(String(text));
}

export function hasLatin(text=''){
  return /[A-Za-z]/.test(String(text));
}

export function normalizeText(input=''){
  let s = String(input ?? '');
  s = s.replace(DIR,'').replace(ZW,'').replace(TATWEEL,'').replace(AR_DIACRITICS,'');
  s = s.replace(/[أإآٱ]/g,'ا').replace(/[ىی]/g,'ي').replace(/ک/g,'ك').replace(/[ہھۀ]/g,'ه');
  s = s.replace(/[٠-٩۰-۹]/g, ch => {
    const a = AR_NUM.indexOf(ch); if(a >= 0) return String(a);
    const f = FA_NUM.indexOf(ch); if(f >= 0) return String(f);
    return ch;
  });
  s = s.toLowerCase();
  s = s.replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
  s = s.replace(/[ـ–—]/g,'-');
  s = s.replace(SPACES,' ').trim();
  return s;
}

export function compactText(input=''){
  return normalizeText(input).replace(/[\s\p{P}\p{S}]+/gu,'');
}

export function tokenize(input=''){
  const n = normalizeText(input);
  return n.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2);
}

export function countWordsLikeWord(input=''){
  const n = normalizeText(input);
  const tokens = n.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return tokens ? tokens.length : 0;
}

export function directionOf(text=''){
  const s = String(text);
  const ar = (s.match(/[\u0600-\u06FF]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  return ar >= en ? 'ar' : 'en';
}
