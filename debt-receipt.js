// ─── DEBT RECEIPT ─────────────────────────────────────────────────────────
// Thermal-style debt receipt engine. Text layout is built as literal
// monospace lines (like a real 40-column thermal printer) so preview/export
// are pixel-identical, and so plain-text share-to-WhatsApp looks the same
// too. QRIS/logo/fonts are loaded from /assets — nothing is hardcoded, and a
// missing qris.png simply hides that block instead of breaking export.

const RECEIPT_COLS = 40;
const ASSET_PATHS = {
  qris: 'assets/icons/qris.png',
  logo: 'assets/icons/logo.png',
  favicon: 'assets/icons/favicon.png'
};

// ── selection state (shared by the summary cards + the old per-row checkboxes) ──
let selectedDebtors = new Set();
let invoiceQueue = [];
let invoiceIndex = 0;

function syncDebtorCheckboxes(){
  document.querySelectorAll('.debtor-select-cb,.debtor-picker-cb').forEach(cb=>{
    cb.checked = selectedDebtors.has(cb.dataset.key);
  });
}
function updateTagihButton(){
  const btn = el('btn-tagih-selected');
  if(!btn) return;
  const count = selectedDebtors.size;
  btn.textContent = count>0 ? `🧾 Buat Receipt (${count})` : '🧾 Buat Receipt';
  btn.disabled = count===0;
  syncDebtorCheckboxes();
}
function selectAllActiveDebtors(){
  const {receivable, payable} = computeDebtBook();
  Object.values(receivable).forEach(p=>{ if(p.entries.length) selectedDebtors.add(p.key); });
  Object.values(payable).forEach(p=>{ if(p.entries.length) selectedDebtors.add(p.key); });
  updateTagihButton();
}
function clearSelectedDebtors(){
  selectedDebtors.clear();
  updateTagihButton();
}
function attachDebtorCheckboxListeners(root){
  root.querySelectorAll('.debtor-select-cb,.debtor-picker-cb').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const key = cb.dataset.key;
      if(cb.checked) selectedDebtors.add(key); else selectedDebtors.delete(key);
      updateTagihButton();
    });
  });
}
function quickReceipt(type, key){
  selectedDebtors = new Set([key]);
  updateTagihButton();
  generateInvoices();
}

// ── build combined receivable+payable data per selected person ──
function buildReceiptPeople(selectedKeys){
  const {receivable, payable} = computeDebtBook();
  return Array.from(selectedKeys).map(key=>{
    const r = receivable[key], p = payable[key];
    const displayName = (r && r.name) || (p && p.name) || key;
    const receivableList = r ? r.entries : [];
    const payableList = p ? p.entries : [];
    const receivableTotal = r ? r.total : 0;
    const payableTotal = p ? p.total : 0;
    return {key, displayName, receivable:receivableList, payable:payableList, receivableTotal, payableTotal, net: receivableTotal-payableTotal};
  }).filter(person => person.receivable.length || person.payable.length)
    .sort((a,b)=>a.displayName.localeCompare(b.displayName));
}

function buildInvoiceNumber(offset){
  const now = jakartaNow();
  const ymd = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  return `DBT-${ymd}${String(offset+1).padStart(3,'0')}`;
}

function receiptOwnerName(){
  return (settings && (settings.receiptOwnerName || settings.receiptName || settings.name)) || 'Pemilik Akun';
}
function receiptBankAccountLine(){
  return (settings && settings.receiptBankAccount) ? String(settings.receiptBankAccount).trim() : '';
}
function receiptStoreName(){
  return (settings && settings.receiptStoreName) ? String(settings.receiptStoreName).trim() : '';
}
function receiptNmid(){
  return (settings && settings.receiptNmid) ? String(settings.receiptNmid).trim() : '';
}
function receiptAmount(n){
  return Math.abs(Math.round(n||0)).toLocaleString('id-ID');
}
function receiptShortDate(dateStr){
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString('id-ID', {day:'2-digit', month:'short'}).replace('.', '');
}
function receiptFullDate(dateStr){
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'}).replace('.', '').toUpperCase();
}
function receiptTime(){
  const now = jakartaNow();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

// ── monospace line helpers (fixed 40-col "virtual thermal printer") ──
function padLine(ch, width){ return ch.repeat(width || RECEIPT_COLS); }
function centerText(text, width){
  width = width || RECEIPT_COLS;
  text = String(text);
  if(text.length >= width) return text.slice(0, width);
  const totalPad = width - text.length;
  const left = Math.floor(totalPad/2);
  return ' '.repeat(left) + text + ' '.repeat(totalPad-left);
}
function sectionHeaderLine(name, width){
  width = width || RECEIPT_COLS;
  const label = String(name).toUpperCase();
  const totalEq = width - label.length;
  if(totalEq <= 0) return label.slice(0, width);
  const left = Math.floor(totalEq/2);
  return '='.repeat(left) + label + '='.repeat(totalEq-left);
}
function rightAlignRow(left, right, width){
  width = width || RECEIPT_COLS;
  left = String(left); right = String(right);
  const space = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(space) + right;
}
// wraps a description across multiple lines so the amount always lands
// right-aligned on the final line, matching a real thermal printer.
function buildEntryLines(dateStr, desc, amount, width){
  width = width || RECEIPT_COLS;
  const dateCol = 8;
  const amountStr = receiptAmount(amount);
  const amountCol = Math.max(amountStr.length, 7);
  const descWidth = Math.max(6, width - dateCol - amountCol);
  const words = String(desc||'').toUpperCase().split(/\s+/).filter(Boolean);

  const wrapped = [];
  let cur = '';
  words.forEach(w=>{
    const test = cur ? cur+' '+w : w;
    if(test.length > descWidth){ wrapped.push(cur); cur = w; }
    else cur = test;
  });
  if(cur) wrapped.push(cur);
  if(!wrapped.length) wrapped.push('');

  const dateLabel = receiptShortDate(dateStr).padEnd(dateCol);
  const out = [];
  wrapped.forEach((ln,i)=>{
    const isLast = i === wrapped.length-1;
    const prefix = i===0 ? dateLabel : ' '.repeat(dateCol);
    if(isLast){
      out.push(prefix + ln.padEnd(descWidth) + amountStr.padStart(amountCol));
    } else {
      out.push(prefix + ln);
    }
  });
  return out;
}

// ── build the full receipt as plain monospace lines ──
function buildDebtReceiptLines(data){
  const owner = receiptOwnerName();
  const bankLine = receiptBankAccountLine();
  const L = [];

  L.push(centerText('DEBT RECEIPT'));
  L.push(centerText(owner.toUpperCase()));
  if(bankLine) L.push(centerText(bankLine));
  L.push(padLine('='));
  L.push(`RECEIPT : ${data.invoiceNo}`);
  L.push(`DATE : ${receiptFullDate(data.date)}`);
  L.push(`TIME : ${data.time}`);

  data.people.forEach(p=>{
    L.push('');
    L.push(sectionHeaderLine(p.displayName));
    L.push(`-> ${owner.toUpperCase()} (${p.receivable.length})`);
    if(p.receivable.length) p.receivable.forEach(e=>{ buildEntryLines(e.date,e.desc,e.amount).forEach(l=>L.push(l)); });
    else L.push('No outstanding transactions');
    L.push(padLine('-'));
    L.push(rightAlignRow('Subtotal', receiptAmount(p.receivableTotal)));
    L.push(padLine('-'));
    L.push(`<- ${p.displayName.toUpperCase()} (${p.payable.length})`);
    if(p.payable.length) p.payable.forEach(e=>{ buildEntryLines(e.date,e.desc,e.amount).forEach(l=>L.push(l)); });
    else L.push('No outstanding transactions');
    L.push(padLine('-'));
    L.push(rightAlignRow('Subtotal', receiptAmount(p.payableTotal)));
    L.push(padLine('='));
    L.push(centerText('NET PAYMENT'));
    if(p.net !== 0){
      const from = p.net>=0 ? p.displayName : owner;
      const to   = p.net>=0 ? owner : p.displayName;
      L.push(rightAlignRow(`${from.toUpperCase()} -> ${to.toUpperCase()}`, receiptAmount(Math.abs(p.net))));
    } else {
      L.push(centerText('LUNAS (Rp0)'));
    }
  });

  L.push(padLine('='));
  L.push(centerText('TOTAL NET PAYMENT'));
  const nonZero = data.people.filter(p=>p.net!==0);
  if(nonZero.length){
    nonZero.forEach(p=>{
      const from = p.net>=0 ? p.displayName : owner;
      const to   = p.net>=0 ? owner : p.displayName;
      L.push(rightAlignRow(`${from.toUpperCase()} -> ${to.toUpperCase()}`, receiptAmount(Math.abs(p.net))));
    });
  } else {
    L.push(centerText('Semua sudah lunas'));
  }
  L.push(padLine('-'));
  return L;
}

function buildDebtReceiptShareText(data){
  let t = buildDebtReceiptLines(data).join('\n');
  const store = receiptStoreName(), nmid = receiptNmid();
  if(store) t += `\n\n${centerText(store)}`;
  if(nmid) t += `\n${centerText('NMID: '+nmid)}`;
  t += `\n\nGenerated by Budget.in`;
  return t;
}

// ── DOM element for preview / export ──
function buildDebtReceiptElement(data){
  const wrap = document.createElement('div');
  wrap.className = 'thermal-receipt';

  const pre = document.createElement('pre');
  pre.className = 'thermal-receipt-pre';
  pre.textContent = buildDebtReceiptLines(data).join('\n');
  wrap.appendChild(pre);

  const store = receiptStoreName(), nmid = receiptNmid();
  if(store || nmid){
    const footer = document.createElement('div');
    footer.className = 'thermal-receipt-footer';
    if(store) footer.innerHTML += `<div class="tr-center">${escHtml(store)}</div>`;
    if(nmid) footer.innerHTML += `<div class="tr-center">NMID: ${escHtml(nmid)}</div>`;
    wrap.appendChild(footer);
  }

  const qrisWrap = document.createElement('div');
  qrisWrap.className = 'thermal-receipt-qris';
  const qrisImg = document.createElement('img');
  qrisImg.src = ASSET_PATHS.qris;
  qrisImg.alt = 'QRIS';
  qrisImg.onerror = () => { qrisWrap.remove(); }; // missing asset => hide silently, never break export
  qrisWrap.appendChild(qrisImg);
  wrap.appendChild(qrisWrap);

  return wrap;
}

// ── generate / navigate ──
function generateInvoices(){
  if(selectedDebtors.size===0){ showToast('⚠️ Pilih minimal satu orang dulu!'); return; }
  const groups = buildReceiptPeople(selectedDebtors);
  if(!groups.length){ showToast('⚠️ Orang terpilih tidak punya transaksi outstanding.'); return; }

  const mode = el('invoice-mode')?.value || 'separate';
  if(mode==='combined'){
    invoiceQueue = [{ invoiceNo: buildInvoiceNumber(0), people: groups, date: todayStr(), time: receiptTime() }];
  } else {
    invoiceQueue = groups.map((p,i)=>({ invoiceNo: buildInvoiceNumber(i), people:[p], date: todayStr(), time: receiptTime() }));
  }

  invoiceIndex = 0;
  el('invoice-modal').classList.add('open');
  renderInvoicePreview();
}

function closeInvoiceModal(){ el('invoice-modal').classList.remove('open'); }
function prevInvoice(){ if(invoiceIndex>0){ invoiceIndex--; renderInvoicePreview(); } }
function nextInvoice(){ if(invoiceIndex<invoiceQueue.length-1){ invoiceIndex++; renderInvoicePreview(); } }

function invoiceLabel(data){
  return data.people.length>1 ? `${data.people.length} orang (gabungan)` : data.people[0].displayName;
}

function renderInvoicePreview(){
  const wrap = el('invoice-preview-wrap');
  if(!wrap || !invoiceQueue.length) return;
  const data = invoiceQueue[invoiceIndex];
  wrap.innerHTML = '';
  wrap.appendChild(buildDebtReceiptElement(data));

  safe('invoice-counter', `Receipt ${invoiceIndex+1} dari ${invoiceQueue.length} — ${invoiceLabel(data)}`);
  const navBar = el('invoice-nav-bar');
  if(navBar) navBar.style.display = invoiceQueue.length>1 ? 'flex' : 'none';
  const btnAll = el('btn-download-all');
  if(btnAll) btnAll.style.display = invoiceQueue.length>1 ? 'inline-flex' : 'none';
}

// ── export: PNG / PDF / print / share ──
async function renderReceiptCanvas(data){
  const docEl = buildDebtReceiptElement(data);
  docEl.style.position='fixed'; docEl.style.left='-9999px'; docEl.style.top='0';
  document.body.appendChild(docEl);
  await Promise.all(Array.from(docEl.querySelectorAll('img')).map(img=>{
    if(img.complete) return Promise.resolve();
    return new Promise(resolve=>{ img.onload=resolve; img.onerror=resolve; });
  }));
  await new Promise(r=>setTimeout(r,60)); // let @font-face swap in before rasterizing
  try{
    return await html2canvas(docEl, {backgroundColor:'#FFFFFF', scale:3, width:360});
  } finally {
    docEl.remove();
  }
}

function receiptFileName(data, ext){
  const label = data.people.length>1 ? 'Gabungan' : data.people[0].displayName.replace(/\s+/g,'_');
  return `Debt_Receipt_${label}_${data.date}.${ext}`;
}

async function downloadCurrentReceiptPNG(){
  if(typeof html2canvas==='undefined'){ showToast('⚠️ Library belum siap, coba lagi'); return; }
  const data = invoiceQueue[invoiceIndex]; if(!data) return;
  const canvas = await renderReceiptCanvas(data);
  const link=document.createElement('a');
  link.download = receiptFileName(data,'png');
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('✅ Receipt PNG didownload!');
}

async function downloadReceiptPDF(data){
  if(typeof html2canvas==='undefined' || typeof window.jspdf==='undefined'){ showToast('⚠️ Library belum siap, coba lagi'); return false; }
  try{
    const canvas = await renderReceiptCanvas(data);
    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL('image/png');
    const receiptW = 80; // mm, standard 80mm thermal roll
    const pxToMm = receiptW/canvas.width;
    const imgHmm = canvas.height*pxToMm;
    const pdf = new jsPDF({orientation:'p', unit:'mm', format:[receiptW, Math.max(120, imgHmm)]});
    pdf.addImage(imgData,'PNG',0,0,receiptW,imgHmm);
    pdf.save(receiptFileName(data,'pdf'));
    return true;
  } catch(err){
    showToast('❌ Gagal membuat receipt: '+err.message);
    return false;
  }
}

async function downloadCurrentInvoicePDF(){
  const data = invoiceQueue[invoiceIndex]; if(!data) return;
  const ok = await downloadReceiptPDF(data);
  if(ok) showToast('✅ Receipt PDF didownload!');
}

async function downloadAllInvoicesPDF(){
  if(!invoiceQueue.length) return;
  for(const data of invoiceQueue){
    await downloadReceiptPDF(data);
    await new Promise(r=>setTimeout(r,300));
  }
  showToast(`✅ ${invoiceQueue.length} receipt PDF didownload!`);
}

function printCurrentReceipt(){
  const data = invoiceQueue[invoiceIndex]; if(!data) return;
  const docEl = buildDebtReceiptElement(data);
  const printWin = window.open('', '_blank', 'width=420,height=700');
  if(!printWin){ showToast('⚠️ Popup diblokir browser, izinkan popup untuk print'); return; }
  printWin.document.write(`<!DOCTYPE html><html><head><title>${data.invoiceNo}</title>
    <base href="${document.baseURI}">
    <style>
      body{margin:0;padding:16px;background:#fff;display:flex;justify-content:center}
      @font-face{font-family:'JetBrains Mono';src:url('${ASSET_PATHS.logo ? '' : ''}assets/fonts/JetBrainsMono-Regular.ttf') format('truetype');font-weight:400}
      @font-face{font-family:'JetBrains Mono';src:url('assets/fonts/JetBrainsMono-Bold.ttf') format('truetype');font-weight:700}
      .thermal-receipt{width:360px;max-width:100%;padding:0;font-family:'JetBrains Mono','Courier New',monospace;color:#000;box-sizing:border-box}
      .thermal-receipt-pre{margin:0;font-size:12.5px;line-height:1.5;white-space:pre}
      .thermal-receipt-footer{margin-top:12px;font-size:12.5px;line-height:1.6}
      .tr-center{text-align:center}
      .thermal-receipt-qris{display:flex;justify-content:center;margin-top:10px}
      .thermal-receipt-qris img{width:190px;height:190px;object-fit:contain}
      @media print{ body{padding:0} }
    </style></head><body></body></html>`);
  printWin.document.close();
  printWin.document.body.appendChild(docEl);
  setTimeout(()=>{ printWin.focus(); printWin.print(); }, 300);
}

async function shareCurrentInvoice(){
  const data = invoiceQueue[invoiceIndex]; if(!data) return;
  const shareText = buildDebtReceiptShareText(data);

  if(navigator.share){
    try{
      if(typeof html2canvas!=='undefined' && navigator.canShare){
        const canvas = await renderReceiptCanvas(data);
        const blob = await new Promise(res=>canvas.toBlob(res,'image/png'));
        if(blob){
          const file = new File([blob], receiptFileName(data,'png'), {type:'image/png'});
          if(navigator.canShare({files:[file]})){
            await navigator.share({files:[file], title:`Debt Receipt - ${invoiceLabel(data)}`, text: shareText});
            return;
          }
        }
      }
      await navigator.share({title:`Debt Receipt - ${invoiceLabel(data)}`, text: shareText});
      return;
    } catch(err){
      if(err && err.name==='AbortError') return;
    }
  }

  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(shareText).then(()=>showToast('📋 Receipt disalin ke clipboard!'));
  } else {
    showToast('⚠️ Fitur share tidak didukung di browser ini');
  }
}
