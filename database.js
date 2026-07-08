// ─── STATE ─────────────────────────────────────────────────────────────────
let transactions = [];
let settings = {income:0,name:'BNI Main Account',cclimit:5000000};
let splitPeople = [];
let currentFilter = 'all';
let trendChart = null, pieChart = null;
let settleContext = null; // {type:'piutang'|'mydebt', txId, personIdx or debtIdx}
let currentDebtTab = 'piutang';

// ─── GOOGLE SPREADSHEET DATABASE ─────────────────────────────────────────────
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxM5eOaPwDzqsH8wVF38kd2Mkyyaf9xhaKFSACV7P4PXfRbfuRMDG-R79F60UXGljeFgg/exec';
let dbBusy = false;
let dbReady = false;
let dbConfigWarningShown = false;

function getDatabasePayload(){
  return {
    transactions,
    settings,
    assets: typeof assets !== 'undefined' ? assets : []
  };
}

function applyDatabasePayload(data){
  if(!data) return;
  if(Array.isArray(data.transactions)) transactions = data.transactions;
  if(data.settings) settings = Object.assign({income:0,name:'BNI Main Account',cclimit:5000000}, data.settings);
  if(Array.isArray(data.assets) && typeof assets !== 'undefined') assets = data.assets;
}

async function googleAppsScriptRequest(action, payload){
  if(!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL.includes('PASTE_GOOGLE_APPS_SCRIPT')){
    if(!dbConfigWarningShown){
      dbConfigWarningShown = true;
      console.warn('Isi GOOGLE_APPS_SCRIPT_URL di database.js dengan URL Web App Google Apps Script.');
    }
    return null;
  }

  const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: {'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(Object.assign({action}, payload || {}))
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if(!res.ok || data.ok === false) throw new Error(data.error || 'Google Apps Script request gagal');
  return data.data || data;
}

async function load(){
  try{
    dbBusy = true;
    const data = await googleAppsScriptRequest('load');
    applyDatabasePayload(data);
    dbReady = true;
    if(typeof renderDashboard === 'function') renderDashboard();
    if(typeof renderTransaksi === 'function' && el('page-transaksi')?.classList.contains('active')) renderTransaksi();
    if(typeof renderUtang === 'function' && el('page-utang')?.classList.contains('active')) renderUtang();
    if(typeof renderAset === 'function' && el('page-aset')?.classList.contains('active')) renderAset();
    return data;
  } catch(err){
    console.error(err);
    if(typeof showToast === 'function') showToast('⚠️ Gagal load dari Google Spreadsheet');
    return null;
  } finally {
    dbBusy = false;
  }
}

async function save(){
  return update(getDatabasePayload());
}

async function update(payload){
  try{
    dbBusy = true;
    if(payload) applyDatabasePayload(payload);
    const data = await googleAppsScriptRequest('update', getDatabasePayload());
    applyDatabasePayload(data);
    return data;
  } catch(err){
    console.error(err);
    if(typeof showToast === 'function') showToast('⚠️ Gagal simpan ke Google Spreadsheet');
    return null;
  } finally {
    dbBusy = false;
  }
}

window.delete = async function(id, type){
  try{
    dbBusy = true;
    const data = await googleAppsScriptRequest('delete', {id, type:type || 'transaction'});
    applyDatabasePayload(data);
    return data;
  } catch(err){
    console.error(err);
    if(typeof showToast === 'function') showToast('⚠️ Gagal hapus dari Google Spreadsheet');
    return null;
  } finally {
    dbBusy = false;
  }
};

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportCSV(){
  const rows=[['Tanggal','Deskripsi','Kategori','Sumber','Nominal','BagianGua','Piutang','UtangGua','Catatan']];
  transactions.forEach(t=>{
    const splitStr=t.split?t.split.map(p=>`${p.name}:${p.amount}${p.settled?'(lunas via '+p.settleMethod+')':''}`).join('; '):'';
    const myDebtStr=t.myDebt?`${t.myDebt.to}:${t.myDebt.amount}${t.myDebt.settled?'(lunas via '+t.myDebt.settleMethod+')':''}` :'';
    rows.push([t.date,t.desc,t.cat,t.src,t.amount,t.myShare||t.amount,splitStr,myDebtStr,t.note||'']);
  });
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  downloadBlob('cashflow_'+todayStr()+'.csv','text/csv;charset=utf-8;','\uFEFF'+csv);
  showToast('📄 CSV didownload!');
}

function exportXLSX(){
  if(typeof XLSX==='undefined'){ showToast('⚠️ Library XLSX belum load, coba lagi'); return; }
  const rows=[['Tanggal','Deskripsi','Kategori','Sumber','Nominal','BagianGua','Piutang','UtangGua','Catatan']];
  transactions.forEach(t=>{
    const splitStr=t.split?t.split.map(p=>`${p.name}:${p.amount}${p.settled?'(lunas)':''}`).join('; '):'';
    const myDebtStr=t.myDebt?`${t.myDebt.to}:${t.myDebt.amount}${t.myDebt.settled?'(lunas)':''}` :'';
    rows.push([t.date,t.desc,t.cat,t.src,t.amount,t.myShare||t.amount,splitStr,myDebtStr,t.note||'']);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:12},{wch:28},{wch:12},{wch:10},{wch:14},{wch:14},{wch:30},{wch:20},{wch:20}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Transaksi');

  // Tambah sheet piutang
  const piutangRows=[['Tanggal','Deskripsi','Nama','Nominal','Status','MetodeBayar','TanggalLunas']];
  transactions.forEach(t=>{ if(t.split) t.split.forEach(p=>piutangRows.push([t.date,t.desc,p.name,p.amount,p.settled?'LUNAS':'BELUM',p.settleMethod||'',p.settleDate||''])); });
  const ws2=XLSX.utils.aoa_to_sheet(piutangRows);
  XLSX.utils.book_append_sheet(wb,ws2,'Piutang');

  // Tambah sheet utang gua
  const myDebtRows=[['Tanggal','Deskripsi','KePada','Nominal','Status','MetodeBayar','TanggalLunas']];
  transactions.forEach(t=>{ if(t.myDebt) myDebtRows.push([t.date,t.desc,t.myDebt.to,t.myDebt.amount,t.myDebt.settled?'LUNAS':'BELUM',t.myDebt.settleMethod||'',t.myDebt.settleDate||'']); });
  const ws3=XLSX.utils.aoa_to_sheet(myDebtRows);
  XLSX.utils.book_append_sheet(wb,ws3,'UtangGua');

  // Tambah sheet Aset & Kekayaan
  const assetRows=[['Nama','Kategori','Tipe','NilaiBeli','TahunBeli','NilaiSekarang(manual)','NilaiSekarangEstimasi','Catatan']];
  assets.forEach(a=>{
    assetRows.push([a.name, ASSET_CAT_LABEL[a.cat]||a.cat, ASSET_TYPE[a.cat]||'', a.buyPrice, a.year||'', a.currentPrice||'', Math.round(getCurrentValue(a)), a.note||'']);
  });
  const wsAsset=XLSX.utils.aoa_to_sheet(assetRows);
  wsAsset['!cols']=[{wch:24},{wch:18},{wch:14},{wch:14},{wch:10},{wch:18},{wch:18},{wch:24}];
  XLSX.utils.book_append_sheet(wb,wsAsset,'Aset');

  XLSX.writeFile(wb,'cashflow_'+todayStr()+'.xlsx');
  showToast('📊 Excel didownload!');
}

function downloadBlob(filename, mimeType, content){
  const blob=new Blob([content],{type:mimeType});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}


// ─── IMPORT ───────────────────────────────────────────────────────────────────
function dragOver(e){ e.preventDefault(); el('import-drop').classList.add('drag'); }
function dragLeave(e){ el('import-drop').classList.remove('drag'); }
function dropFile(e){
  e.preventDefault(); el('import-drop').classList.remove('drag');
  const file=e.dataTransfer.files[0];
  if(file) processImportFile(file);
}
function handleImportFile(inp){ if(inp.files[0]) processImportFile(inp.files[0]); inp.value=''; }

function processImportFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  const statusEl=el('import-status');
  statusEl.style.display='block';
  statusEl.style.color='var(--text-muted)';
  statusEl.textContent='⏳ Membaca file...';

  const reader=new FileReader();
  if(ext==='csv'){
    reader.onload=e=>{ try{ importFromCSV(e.target.result); } catch(err){ showImportError(err.message); } };
    reader.readAsText(file,'UTF-8');
  } else if(ext==='xlsx'||ext==='xls'){
    reader.onload=e=>{ try{ importFromXLSX(e.target.result); } catch(err){ showImportError(err.message); } };
    reader.readAsArrayBuffer(file);
  } else {
    showImportError('Format tidak didukung. Gunakan .csv atau .xlsx');
  }
}

function importFromCSV(text){
  const lines=text.split('\n').filter(l=>l.trim());
  if(lines.length<2){ showImportError('File kosong atau tidak punya header'); return; }
  const headers=parseCSVLine(lines[0]).map(h=>h.trim().toLowerCase());
  const colMap=mapColumns(headers);
  if(colMap.date===-1||colMap.amount===-1||colMap.desc===-1){ showImportError('Kolom Tanggal / Nominal / Deskripsi tidak ditemukan'); return; }
  const rows=lines.slice(1).map(l=>parseCSVLine(l));
  finishImport(rows, colMap);
}

function importFromXLSX(buf){
  if(typeof XLSX==='undefined'){ showImportError('Library XLSX belum load'); return; }
  const wb=XLSX.read(buf,{type:'arraybuffer'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  if(raw.length<2){ showImportError('File kosong'); return; }
  const headers=raw[0].map(h=>String(h).trim().toLowerCase());
  const colMap=mapColumns(headers);
  if(colMap.date===-1||colMap.amount===-1||colMap.desc===-1){ showImportError('Kolom Tanggal / Nominal / Deskripsi tidak ditemukan'); return; }

  // Cek juga sheet "Aset" untuk import/update aset & kekayaan
  let assetMsg='';
  if(wb.SheetNames.includes('Aset')){
    const wsAsset=wb.Sheets['Aset'];
    const rawAsset=XLSX.utils.sheet_to_json(wsAsset,{header:1,defval:''});
    if(rawAsset.length>1){
      const assetHeaders=rawAsset[0].map(h=>String(h).trim().toLowerCase());
      const find=(...keys)=>{ for(const k of keys){ const i=assetHeaders.findIndex(h=>h.includes(k)); if(i>=0) return i; } return -1; };
      const nameIdx    = find('nama');
      const catIdx     = find('kategori');
      const buyIdx     = find('nilaibeli','nilai beli');
      const yearIdx    = find('tahunbeli','tahun beli','tahun');
      const manualIdx  = find('nilaisekarang(manual)','manual');
      const noteIdx    = find('catatan','note');

      // Reverse-lookup kategori dari label (e.g. "🏍️ Motor" -> "motor")
      const catLabelToKey = {};
      Object.entries(ASSET_CAT_LABEL).forEach(([k,v])=>{ catLabelToKey[v.toLowerCase()]=k; catLabelToKey[v.replace(/^[^\\s]+\\s/,'').toLowerCase()]=k; });

      let added=0, updated=0;
      rawAsset.slice(1).forEach(row=>{
        const name=String(row[nameIdx]||'').trim();
        if(!name) return;

        const buyPriceRaw = buyIdx>=0 ? parseFloat(String(row[buyIdx]||'').replace(/[^0-9.-]/g,'')) : NaN;
        const yearRaw     = yearIdx>=0 ? parseInt(String(row[yearIdx]||'').replace(/[^0-9]/g,'')) : NaN;
        const manualRaw   = manualIdx>=0 ? parseFloat(String(row[manualIdx]||'').replace(/[^0-9.-]/g,'')) : NaN;
        const noteRaw     = noteIdx>=0 ? String(row[noteIdx]||'').trim() : '';

        // Resolve category key
        let catKey = null;
        if(catIdx>=0){
          const catRaw = String(row[catIdx]||'').trim().toLowerCase();
          if(ASSET_CAT_LABEL[catRaw]) catKey = catRaw; // already a valid key
          else if(catLabelToKey[catRaw]) catKey = catLabelToKey[catRaw]; // matches label text
        }

        let asset = assets.find(a=>a.name.toLowerCase()===name.toLowerCase());

        if(asset){
          // Update existing asset
          if(!isNaN(buyPriceRaw) && buyPriceRaw>0) asset.buyPrice = buyPriceRaw;
          if(!isNaN(yearRaw) && yearRaw>1900) asset.year = yearRaw;
          if(catKey) asset.cat = catKey;
          if(!isNaN(manualRaw) && manualRaw>0) asset.currentPrice = manualRaw;
          if(noteRaw) asset.note = noteRaw;
          updated++;
        } else {
          // Create new asset — minimal requirement: nama + nilai beli (atau manual)
          const buyPrice = !isNaN(buyPriceRaw)&&buyPriceRaw>0 ? buyPriceRaw : (!isNaN(manualRaw)?manualRaw:0);
          if(buyPrice<=0) return; // skip baris tanpa nilai
          assets.push({
            id: Date.now()+Math.random(),
            name,
            cat: catKey || 'lainnya_aset',
            buyPrice,
            year: !isNaN(yearRaw)&&yearRaw>1900 ? yearRaw : new Date().getFullYear(),
            currentPrice: !isNaN(manualRaw)&&manualRaw>0 ? manualRaw : null,
            note: noteRaw,
            addedDate: todayStr()
          });
          added++;
        }
      });
      if(added>0||updated>0){
        saveAssets();
        assetMsg=` Plus ${added} aset baru ditambahkan, ${updated} aset diupdate dari sheet Aset.`;
      }
    }
  }

  finishImport(raw.slice(1), colMap, assetMsg);
}

function mapColumns(headers){
  const find=(...keys)=>{ for(const k of keys){ const i=headers.findIndex(h=>h.includes(k)); if(i>=0) return i; } return -1; };
  return {
    date:    find('tanggal','date'),
    desc:    find('deskripsi','desc','keterangan'),
    cat:     find('kategori','cat','category'),
    src:     find('sumber','src','source','metode'),
    amount:  find('nominal','amount','jumlah','total'),
    note:    find('catatan','note'),
    piutang: find('piutang','split','hutang teman'),
    mydebt:  find('utanggua','utang gua','mydebt','hutang gua')
  };
}

function finishImport(rows, colMap, assetMsg){
  assetMsg = assetMsg || '';
  let added=0, skipped=0;
  const existing=new Set(transactions.map(t=>`${t.date}|${t.desc}|${t.amount}`));
  rows.forEach(row=>{
    const dateRaw=String(row[colMap.date]||'').trim();
    const descRaw=String(row[colMap.desc]||'').trim();
    const amountRaw=parseFloat(String(row[colMap.amount]||'').replace(/[^0-9.-]/g,''));
    if(!dateRaw||!descRaw||isNaN(amountRaw)||amountRaw<=0){ skipped++; return; }
    // normalize date
    let dateStr=dateRaw;
    if(dateRaw.includes('/')){
      const p=dateRaw.split('/');
      if(p.length===3) dateStr=p[2].length===4?`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`:`20${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    }
    const key=`${dateStr}|${descRaw}|${amountRaw}`;
    if(existing.has(key)){ skipped++; return; }
    const catRaw=colMap.cat>=0?String(row[colMap.cat]||'').trim().toLowerCase():'';
    const srcRaw=colMap.src>=0?String(row[colMap.src]||'').trim().toLowerCase():'';
    const noteRaw=colMap.note>=0?String(row[colMap.note]||'').trim():'';
    const validCats=['food','lifestyle','fixed','cc','income','other'];
    const cat=validCats.includes(catRaw)?catRaw:'other';
    const validSrc=['bni','cash','cc','transfer'];
    const src=validSrc.includes(srcRaw)?srcRaw:'bni';
    existing.add(key);
    // Parse piutang column e.g. "Sobri:15000; Ricky:20000"
    let splitArr=null, myDebtObj=null;
    const piutangRaw=colMap.piutang>=0?String(row[colMap.piutang]||'').trim():'';
    if(piutangRaw){
      splitArr=[];
      piutangRaw.split(';').forEach(chunk=>{
        chunk=chunk.trim().replace(/\(lunas.*?\)/i,'');
        const m=chunk.match(/^(.+):([\d.,]+)/);
        if(m){
          const amt=parseFloat(m[2].replace(/[.,]/g,''))||parseFloat(m[2])||0;
          if(m[1].trim()&&amt>0) splitArr.push({name:m[1].trim(),amount:amt,settled:piutangRaw.toLowerCase().includes('lunas'),settleMethod:'',settleNote:'',settleDate:''});
        }
      });
      if(!splitArr.length) splitArr=null;
    }
    const myDebtRaw=colMap.mydebt>=0?String(row[colMap.mydebt]||'').trim():'';
    if(myDebtRaw){
      const m=myDebtRaw.match(/^(.+):([\d.,]+)/);
      if(m){
        const amt=parseFloat(m[2].replace(/[.,]/g,''))||parseFloat(m[2])||0;
        if(m[1].trim()&&amt>0) myDebtObj={to:m[1].trim(),amount:amt,note:'',settled:myDebtRaw.toLowerCase().includes('lunas'),settleMethod:'',settleNote:'',settleDate:''};
      }
    }
    const splitOthers=splitArr?splitArr.reduce((s,p)=>s+p.amount,0):0;
    transactions.push({id:Date.now()+Math.random(),date:dateStr,amount:amountRaw,desc:descRaw,cat,src,note:noteRaw,myShare:splitArr?amountRaw-splitOthers:amountRaw,split:splitArr,myDebt:myDebtObj});
    added++;
  });
  transactions.sort((a,b)=>b.date.localeCompare(a.date));
  save();
  const statusEl=el('import-status');
  statusEl.style.color='var(--green)';
  statusEl.textContent=`✅ Berhasil import ${added} transaksi. ${skipped} baris dilewati (duplikat/tidak valid).${assetMsg}`;
  showToast(`✅ Import ${added} transaksi!`);
  renderDashboard();
  if(el('page-aset') && el('page-aset').classList.contains('active')) renderAset();
}

function showImportError(msg){
  const statusEl=el('import-status');
  statusEl.style.display='block'; statusEl.style.color='var(--red)';
  statusEl.textContent='❌ Error: '+msg;
  showToast('❌ Import gagal');
}

function parseCSVLine(line){
  const result=[]; let cur=''; let inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;} else inQ=!inQ; }
    else if(c===','&&!inQ){ result.push(cur); cur=''; }
    else cur+=c;
  }
  result.push(cur);
  return result.map(s=>s.trim());
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function openSettings(){
  el('set-income').value=settings.income||'';
  el('set-name').value=settings.name||'';
  el('set-cclimit').value=settings.cclimit||'';
  el('settings-modal').classList.add('open');
}
function closeSettings(){ el('settings-modal').classList.remove('open'); }
function saveSettings(){
  settings.income=parseFloat(el('set-income').value)||0;
  settings.name=el('set-name').value||'BNI Main Account';
  settings.cclimit=parseFloat(el('set-cclimit').value)||5000000;
  save();
  closeSettings(); renderDashboard();
  showToast('✅ Pengaturan disimpan!');
}

function confirmReset(){
  if(confirm('Reset semua data (transaksi & aset)? Tidak bisa di-undo.')){ transactions=[]; assets=[]; save(); renderDashboard(); showToast('🗑️ Data direset'); }
}

window.addEventListener('DOMContentLoaded', ()=>{
  if(typeof window.saveAssets === 'function'){
    window.saveAssets = function(){ return save(); };
  }
  load();
});

