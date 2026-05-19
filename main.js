import { APP } from './state.js';
import { splitPlainText } from './core/segmenter.js';
import { listMemories, createMemory, getMemory, deleteMemory, bulkAddTUs, streamTUs, searchTM } from './storage.js';
import { buildTargetText, buildTargetHtml, buildCsv, downloadFile } from './export/targetDraft.js';

const $ = sel => document.querySelector(sel);
const els = {
  memorySelect: $('#memorySelect'), activeMemoryTitle: $('#activeMemoryTitle'), statusText: $('#statusText'),
  sourceText: $('#sourceText'), filePicker: $('#filePicker'), progressBar: $('#progressBar'), progressText: $('#progressText'), logBox: $('#logBox'),
  results: $('#results'), pageInfo: $('#pageInfo'),
  statSegments: $('#statSegments'), statConfirmed: $('#statConfirmed'), statReview: $('#statReview'), statNeeds: $('#statNeeds'), statAverage: $('#statAverage')
};

function setStatus(text){ els.statusText.textContent = text; }
function log(text){
  const t = new Date().toLocaleTimeString('en-GB');
  els.logBox.textContent = `[${t}] ${text}\n` + els.logBox.textContent;
}
function progress(value, text){
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  els.progressBar.value = v;
  els.progressText.textContent = text || `${v}%`;
}
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function extOf(file){ return (file.name.split('.').pop() || '').toLowerCase(); }

function chooseFile(accept=''){
  return new Promise(resolve => {
    els.filePicker.value = '';
    els.filePicker.accept = accept;
    els.filePicker.onchange = () => resolve(els.filePicker.files && els.filePicker.files[0] ? els.filePicker.files[0] : null);
    els.filePicker.click();
  });
}

async function refreshMemories(){
  const memories = await listMemories();
  els.memorySelect.innerHTML = '';
  for(const m of memories){
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.count || 0})`;
    els.memorySelect.appendChild(opt);
  }
  if(APP.activeMemoryId && memories.some(m=>m.id === APP.activeMemoryId)) els.memorySelect.value = APP.activeMemoryId;
  else if(memories[0]) APP.activeMemoryId = memories[0].id, els.memorySelect.value = memories[0].id;
  const active = memories.find(m => m.id === APP.activeMemoryId);
  APP.activeMemoryName = active ? active.name : '';
  els.activeMemoryTitle.textContent = active ? `الذاكرة المحددة: ${active.name} — ${active.count || 0} وحدة` : 'لا توجد ذاكرة محددة';
}

async function ensureMemory(){
  if(APP.activeMemoryId){
    const m = await getMemory(APP.activeMemoryId);
    if(m) return m;
  }
  const name = prompt('اسم الذاكرة الجديدة:', 'Default TM');
  const m = await createMemory(name || 'Default TM');
  APP.activeMemoryId = m.id;
  localStorage.setItem('az_cat_active_memory_id', m.id);
  await refreshMemories();
  return m;
}

function setSourceSegments(segments, alsoText=true){
  APP.sourceSegments = (segments || []).map((s,i)=>({ id:i+1, source:s.source || s.text || String(s), origin:s.origin || '' }));
  if(alsoText) els.sourceText.value = APP.sourceSegments.map(s=>s.source).join('\n\n');
  APP.results = [];
  APP.page = 1;
  renderResults();
  updateStats();
  setStatus(`تم تجهيز ${APP.sourceSegments.length} مقطع مصدر.`);
}

function clearAll(){
  APP.sourceSegments = [];
  APP.results = [];
  els.sourceText.value = '';
  progress(0);
  renderResults();
  updateStats();
  setStatus('تم مسح المصدر والنتائج.');
}

function updateStats(){
  const rows = APP.results || [];
  const total = rows.length || APP.sourceSegments.length || 0;
  const confirmed = rows.filter(r=>r.status === 'Confirmed').length;
  const review = rows.filter(r=>r.status === 'Review').length;
  const needs = rows.filter(r=>r.status === 'Needs Translation').length;
  const avg = rows.length ? Math.round(rows.reduce((a,b)=>a+(Number(b.score)||0),0)/rows.length) : 0;
  els.statSegments.textContent = String(total);
  els.statConfirmed.textContent = String(confirmed);
  els.statReview.textContent = String(review);
  els.statNeeds.textContent = String(needs);
  els.statAverage.textContent = avg + '%';
}

function renderResults(){
  const rows = APP.results || [];
  const totalPages = Math.max(1, Math.ceil(rows.length / APP.pageSize));
  APP.page = Math.max(1, Math.min(APP.page, totalPages));
  els.pageInfo.textContent = rows.length ? `${APP.page} / ${totalPages}` : '0 / 0';
  const start = (APP.page - 1) * APP.pageSize;
  const pageRows = rows.slice(start, start + APP.pageSize);
  if(!pageRows.length){
    els.results.innerHTML = '<div class="cell muted">لا توجد نتائج بعد.</div>';
    return;
  }
  els.results.innerHTML = pageRows.map((r,i)=>{
    const statusClass = r.status === 'Confirmed' ? 'Confirmed' : r.status === 'Review' ? 'Review' : 'Needs';
    return `<div class="result-row">
      <div class="idx">${start+i+1}</div>
      <div class="cell">${escapeHtml(r.source || '')}</div>
      <div class="cell">${escapeHtml(r.target || r.best || '')}</div>
      <div class="score">${escapeHtml(String(r.score || 0))}%</div>
      <div class="status ${statusClass}">${escapeHtml(r.status || '')}<br><small>${escapeHtml(r.mode || '')}</small></div>
    </div>`;
  }).join('');
}

async function importTM(kind){
  const accept = kind === 'html' ? '.html,.htm' : kind === 'docx' ? '.docx' : kind === 'zipdocx' ? '.zip' : kind === 'xlsx' ? '.xlsx' : '.tmx,.xml';
  const file = await chooseFile(accept);
  if(!file) return;
  const memory = await ensureMemory();
  progress(1,'1%');
  setStatus(`جارٍ استيراد ${file.name}...`);
  log(`Import started: ${file.name}`);
  let pairs = [];
  if(kind === 'html'){
    const mod = await import('./importers/html.js');
    pairs = await mod.parseHtmlPairs(file);
  }else if(kind === 'docx'){
    const mod = await import('./importers/docx.js');
    pairs = await mod.parseDocxPairs(file);
  }else if(kind === 'zipdocx'){
    const mod = await import('./importers/zipDocx.js');
    pairs = await mod.parseZipDocxPairs(file, (d,t)=>progress(t ? d/t*35 : 5, `قراءة DOCX ${d}/${t}`));
  }else if(kind === 'xlsx'){
    const mod = await import('./importers/xlsx.js');
    pairs = await mod.parseXlsxPairs(file);
  }else if(kind === 'tmx'){
    const mod = await import('./importers/tmx.js');
    pairs = await mod.parseTmxPairs(file);
  }
  if(!pairs.length){
    progress(0);
    setStatus('لم يتم استخراج أزواج ترجمة من الملف. تحقق من أن الملف ثنائي اللغة أو بصيغة صحيحة.');
    log('No pairs extracted.');
    return;
  }
  const inserted = await bulkAddTUs(memory.id, pairs, (done,total)=>progress(35 + done/total*65, `حفظ ${done}/${total}`));
  APP.activeMemoryId = memory.id;
  localStorage.setItem('az_cat_active_memory_id', memory.id);
  await refreshMemories();
  progress(100,'100%');
  setStatus(`تم استيراد ${inserted} وحدة ترجمة إلى الذاكرة.`);
  log(`Imported ${inserted} TUs.`);
}

async function importSource(){
  const file = await chooseFile('.html,.htm,.docx,.xlsx,.txt');
  if(!file) return;
  const ext = extOf(file);
  setStatus(`جارٍ قراءة المصدر: ${file.name}`);
  let segments = [];
  if(ext === 'html' || ext === 'htm'){
    const mod = await import('./importers/html.js');
    segments = await mod.parseHtmlSource(file);
  }else if(ext === 'docx'){
    const mod = await import('./importers/docx.js');
    segments = await mod.parseDocxSource(file);
  }else if(ext === 'xlsx'){
    const mod = await import('./importers/xlsx.js');
    segments = await mod.parseXlsxSource(file);
  }else{
    segments = splitPlainText(await file.text());
  }
  setSourceSegments(segments, true);
  log(`Source imported: ${segments.length} segments.`);
}

function pasteSource(){
  const text = prompt('الصق النص المصدر هنا:');
  if(text == null) return;
  setSourceSegments(splitPlainText(text), true);
}

function sourceFromTextarea(){
  const text = els.sourceText.value.trim();
  if(!text) return [];
  return splitPlainText(text);
}

async function analyze(){
  if(APP.analyzing) return;
  const mem = await ensureMemory();
  const currentTextSegments = sourceFromTextarea();
  if(currentTextSegments.length) APP.sourceSegments = currentTextSegments.map((s,i)=>({id:i+1, source:s.source, origin:s.origin}));
  if(!APP.sourceSegments.length){ alert('أدخل أو استورد نصاً مصدراً أولاً.'); return; }
  APP.results = [];
  APP.page = 1;
  renderResults(); updateStats();
  APP.analyzing = true;
  progress(1,'تهيئة');
  setStatus('جارٍ تحميل الذاكرة داخل Worker دون تجميد الواجهة...');
  if(APP.worker) APP.worker.terminate();
  APP.worker = new Worker(new URL('./workers/analyze.worker.js', import.meta.url), {type:'module'});
  let memoryLoaded = 0;
  APP.worker.onmessage = ev => {
    const msg = ev.data || {};
    if(msg.type === 'memoryProgress'){
      memoryLoaded = msg.total || memoryLoaded;
      progress(10, `ذاكرة: ${memoryLoaded}`);
    }
    if(msg.type === 'resultsBatch'){
      APP.results.push(...msg.rows);
      progress(20 + (msg.done / msg.total) * 80, `${msg.done}/${msg.total}`);
      renderResults(); updateStats();
    }
    if(msg.type === 'done'){
      APP.analyzing = false;
      progress(100,'100%');
      setStatus(`اكتمل التحليل. الذاكرة المستخدمة: ${msg.memoryCount || memoryLoaded} وحدة.`);
      log(`Analysis done: ${APP.results.length} rows.`);
    }
    if(msg.type === 'error'){
      APP.analyzing = false;
      setStatus('حدث خطأ أثناء التحليل: ' + msg.message);
      log('Worker error: ' + msg.message);
    }
  };
  APP.worker.postMessage({type:'reset'});
  let total = 0;
  await streamTUs(mem.id, 1200, batch => {
    total += batch.length;
    APP.worker.postMessage({type:'addMemoryBatch', batch});
  });
  log(`Memory streamed to worker: ${total} TUs.`);
  setStatus('بدأ التحليل الذكي: exact + fuzzy + split/merge context.');
  APP.worker.postMessage({type:'analyze', segments: APP.sourceSegments});
}

function acceptBest(){
  APP.results = APP.results.map(r => r.target ? ({...r, status:'Confirmed', score:Math.max(Number(r.score)||0, 100), mode:(r.mode||'') + '+accepted'}) : r);
  renderResults(); updateStats();
  setStatus('تم اعتماد جميع المقترحات التي تحتوي على Target.');
}

async function copyTarget(){
  const text = buildTargetText(APP.results);
  if(!text){ alert('لا يوجد Target للنسخ.'); return; }
  await navigator.clipboard.writeText(text);
  setStatus('تم نسخ مسودة Target إلى الحافظة.');
}

function exportHtml(){
  if(!APP.results.length){ alert('لا توجد نتائج للتصدير.'); return; }
  downloadFile('target-draft.html','text/html;charset=utf-8',buildTargetHtml(APP.results));
}
function exportCsv(){
  if(!APP.results.length){ alert('لا توجد نتائج للتصدير.'); return; }
  downloadFile('cat-results.csv','text/csv;charset=utf-8',buildCsv(APP.results));
}

async function doSearchTM(){
  const q = $('#tmSearch').value.trim();
  if(!q) return;
  const mem = await ensureMemory();
  setStatus('جارٍ البحث داخل الذاكرة...');
  const rows = await searchTM(mem.id, q, 120);
  APP.results = rows.map((r,i)=>({ id:i+1, source:r.source, target:r.target, best:r.target, score:100, status:'Confirmed', mode:'tm-search', sourceFound:r.source }));
  APP.page = 1;
  renderResults(); updateStats();
  setStatus(`نتائج البحث داخل الذاكرة: ${rows.length}`);
}

function bind(){
  $('#btnNewMemory').onclick = async () => {
    const name = prompt('اسم الذاكرة الجديدة:', 'New Translation Memory');
    const m = await createMemory(name || 'New Translation Memory');
    APP.activeMemoryId = m.id;
    localStorage.setItem('az_cat_active_memory_id', m.id);
    await refreshMemories();
    setStatus('تم إنشاء ذاكرة جديدة.');
  };
  $('#btnLibrary').onclick = refreshMemories;
  els.memorySelect.onchange = async () => {
    APP.activeMemoryId = els.memorySelect.value;
    localStorage.setItem('az_cat_active_memory_id', APP.activeMemoryId);
    await refreshMemories();
  };
  $('#btnDeleteMemory').onclick = async () => {
    if(!APP.activeMemoryId) return;
    if(confirm('هل تريد حذف الذاكرة المحددة نهائياً؟')){
      await deleteMemory(APP.activeMemoryId);
      APP.activeMemoryId = '';
      await refreshMemories();
      setStatus('تم حذف الذاكرة.');
    }
  };
  document.querySelectorAll('[data-import-tm]').forEach(btn => btn.onclick = () => importTM(btn.dataset.importTm));
  $('#btnImportSource').onclick = importSource;
  $('#btnPasteSource').onclick = pasteSource;
  $('#btnClearSource').onclick = clearAll;
  $('#sourceClose').onclick = clearAll;
  $('#btnAnalyze').onclick = analyze;
  $('#btnAcceptBest').onclick = acceptBest;
  $('#btnCopyTarget').onclick = copyTarget;
  $('#btnExportHtml').onclick = exportHtml;
  $('#btnExportCsv').onclick = exportCsv;
  $('#btnSearchTM').onclick = doSearchTM;
  $('#prevPage').onclick = () => { APP.page--; renderResults(); };
  $('#nextPage').onclick = () => { APP.page++; renderResults(); };
  els.sourceText.addEventListener('input', () => {
    if(!els.sourceText.value.trim()){
      APP.sourceSegments = []; APP.results = []; renderResults(); updateStats();
    }
  });
}

bind();
refreshMemories().then(()=>{ renderResults(); updateStats(); log('App ready. Lazy modules are not loaded until used.'); });
