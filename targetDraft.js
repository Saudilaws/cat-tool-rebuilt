function esc(s=''){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function buildTargetText(results){
  return (results || []).map(r => r.target || r.best || '').join('\n\n');
}

export function buildTargetHtml(results){
  const rows = (results || []).map((r,i)=>`
    <tr>
      <td class="n">${i+1}</td>
      <td class="source">${esc(r.source)}</td>
      <td class="target">${esc(r.target || r.best || '')}</td>
      <td class="score">${esc(String(r.score || 0))}</td>
      <td class="status">${esc(r.status || '')}</td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>Target Draft</title>
<style>
body{font-family:system-ui,"Segoe UI",Tahoma,Arial;line-height:1.8;margin:24px;color:#111827}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #e5e7eb;padding:10px;vertical-align:top;white-space:pre-wrap}
th{background:#f8fafc}.n{width:45px;text-align:center}.source{direction:auto}.target{direction:auto}.score{width:70px;text-align:center}.status{width:120px;text-align:center}
</style>
</head><body>
<h1>Target Draft</h1>
<table><thead><tr><th>#</th><th>Source</th><th>Target</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}

export function buildCsv(results){
  const q = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
  const lines = [['No','Source','Target','Score','Status','Mode'].map(q).join(',')];
  (results || []).forEach((r,i)=>lines.push([i+1,r.source,r.target||r.best||'',r.score||0,r.status||'',r.mode||''].map(q).join(',')));
  return lines.join('\n');
}

export function downloadFile(name, mime, content){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
