// ─── SPLIT (orang utang ke gua) ──────────────────────────────────────────────
function toggleSplit(){
  const on = el('split-toggle').checked;
  el('split-section').style.display = on?'block':'none';
  if(on&&splitPeople.length===0) addSplitPerson();
  updateSplitSummary();
}
function addSplitPerson(){
  splitPeople.push({name:'',amount:0});
  renderSplitList(); updateSplitSummary();
}
function removeSplitPerson(i){
  splitPeople.splice(i,1); renderSplitList(); updateSplitSummary();
}
function renderSplitList(){
  el('split-people-list').innerHTML = splitPeople.map((p,i)=>`
    <div class="split-person-row">
      <input type="text" placeholder="Nama teman" value="${escHtml(p.name)}"
        oninput="splitPeople[${i}].name=this.value;updateSplitSummary()"/>
      <input type="text" inputmode="decimal" placeholder="17rb" value="${escHtml(p.rawInput||'')}"
        oninput="splitPeople[${i}].rawInput=this.value;splitPeople[${i}].amount=parseShorthand(this.value);updateSplitSummary()"/>
      <button class="split-remove-btn" onclick="removeSplitPerson(${i})">✕</button>
    </div>`).join('');
}
function updateSplitSummary(){
  const total = parseShorthand(el('f-amount').value);
  const others = splitPeople.reduce((s,p)=>s+(p.amount||0),0);
  const mine = total - others;
  const rows = el('split-summary-rows');
  if(!rows) return;
  let html = `<div class="split-summary-row"><span class="sname">💰 Gua</span><span class="samount" style="color:${mine<0?'var(--red)':'var(--green)'}">${fmt(Math.max(0,mine))}</span></div>`;
  splitPeople.forEach(p=>{ if(p.name||p.amount) html+=`<div class="split-summary-row"><span class="sname">👤 ${escHtml(p.name||'(nama?)')}</span><span class="samount">${fmt(p.amount)}</span></div>`; });
  html+=`<div style="height:1px;background:var(--border);margin:8px 0"></div>`;
  html+=`<div class="split-summary-row"><span class="sname" style="font-weight:700">Total</span><span class="samount" style="color:var(--text)">${fmt(total)}</span></div>`;
  if(total>0&&others!==0){
    const rem=total-others;
    if(Math.abs(rem)>0) html+=`<div style="font-size:11px;color:${rem>0?'var(--amber)':'var(--red)'};margin-top:6px">${rem>0?`Sisa ${fmt(rem)} belum dialokasikan`:`Kelebihan ${fmt(-rem)}`}</div>`;
  }
  rows.innerHTML=html;
}
function resetSplit(){
  el('split-toggle').checked=false;
  el('split-section').style.display='none';
  splitPeople=[];
  renderSplitList();
  // reset mydebt
  el('mydebt-toggle').checked=false;
  el('mydebt-section').style.display='none';
  const mdn=el('md-name'); const mda=el('md-amount'); const mdno=el('md-note');
  if(mdn) mdn.value=''; if(mda) mda.value=''; if(mdno) mdno.value='';
}

function onSrcChange(sel){
  const hint = el('cc-src-hint');
  if(!hint) return;
  if(sel.value==='cc'){
    hint.textContent = '💡 Swipe CC = dicatat sebagai pengeluaran. Bayar tagihan CC → pilih Kategori "CC Payment".';
    hint.style.color = 'var(--amber)';
  } else {
    hint.textContent='';
  }
}

// ─── MY DEBT (gua utang ke orang) ────────────────────────────────────────────
function toggleMyDebt(){
  const on = el('mydebt-toggle').checked;
  el('mydebt-section').style.display = on?'block':'none';
}

// ─── SETTLE MODAL ────────────────────────────────────────────────────────────
function openSettleModal(type, txId, idx, currentSettled){
  const tx = transactions.find(t=>t.id===txId);
  if(!tx) return;

  // If already settled, toggle back (unsettle)
  if(currentSettled){
    if(type==='piutang'){ tx.split[idx].settled=false; tx.split[idx].settleMethod=''; tx.split[idx].settleNote=''; tx.split[idx].settleDate=''; }
    else { tx.myDebt.settled=false; tx.myDebt.settleMethod=''; tx.myDebt.settleNote=''; tx.myDebt.settleDate=''; }
    save(); renderUtang(); renderDashboard(); showToast('↩️ Ditandai belum lunas'); return;
  }

  settleContext={type,txId,idx};
  let personName='', amount=0;
  if(type==='piutang'){ personName=tx.split[idx].name; amount=tx.split[idx].amount; }
  else { personName=tx.myDebt.to; amount=tx.myDebt.amount; }

  el('settle-modal-title').textContent = type==='piutang' ? '✅ Tandai Lunas — Piutang' : '✅ Tandai Lunas — Utang Gua';
  el('settle-modal-desc').textContent = `${personName} · ${fmt(amount)} · "${tx.desc}"`;
  el('settle-method-sel').value='';
  el('settle-note-inp').value='';
  el('settle-modal').classList.add('open');
}
function closeSettleModal(){ el('settle-modal').classList.remove('open'); settleContext=null; }
function confirmSettle(){
  if(!settleContext) return;
  const method = el('settle-method-sel').value;
  const note = el('settle-note-inp').value.trim();
  const tx = transactions.find(t=>t.id===settleContext.txId);
  if(!tx) return;

  const dateNow = todayStr();
  if(settleContext.type==='piutang'){
    tx.split[settleContext.idx].settled=true;
    tx.split[settleContext.idx].settleMethod=method;
    tx.split[settleContext.idx].settleNote=note;
    tx.split[settleContext.idx].settleDate=dateNow;
  } else {
    tx.myDebt.settled=true;
    tx.myDebt.settleMethod=method;
    tx.myDebt.settleNote=note;
    tx.myDebt.settleDate=dateNow;
  }
  save(); closeSettleModal(); renderUtang(); renderDashboard();
  showToast('✅ Lunas! via ' + (method||'—'));
}

// ─── RENDER UTANG (PIUTANG + MY DEBT) ────────────────────────────────────────
function switchDebtTab(tab){
  currentDebtTab=tab;
  el('panel-piutang').classList.toggle('active', tab==='piutang');
  el('panel-mydebt').classList.toggle('active', tab==='mydebt');
  el('tab-piutang').className='debt-tab'+(tab==='piutang'?' active-teal':'');
  el('tab-mydebt').className='debt-tab'+(tab==='mydebt'?' active-orange':'');
}

function renderUtang(){
  renderPiutang();
  renderMyDebt();
}

// ─── INVOICE PIUTANG — selection state ───────────────────────────────────────
let selectedDebtors = new Set(); // lowercase-trimmed debtor keys yang dicentang untuk ditagih

function syncDebtorCheckboxes(){
  document.querySelectorAll('.debtor-select-cb,.debtor-picker-cb').forEach(cb=>{
    cb.checked = selectedDebtors.has(cb.dataset.key);
  });
}

function updateTagihButton(){
  const btn = el('btn-tagih-selected');
  if(!btn) return;
  const count = selectedDebtors.size;
  btn.textContent = count>0 ? `🧾 Tagih Terpilih (${count})` : '🧾 Tagih Terpilih';
  btn.disabled = count===0;
  syncDebtorCheckboxes();
}

function selectAllActiveDebtors(){
  document.querySelectorAll('.debtor-picker-cb').forEach(cb=>{
    if(!cb.disabled) selectedDebtors.add(cb.dataset.key);
  });
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

function renderDebtorPicker(map, names){
  const card = el('debtor-picker-card');
  const list = el('debtor-picker-list');
  if(!card || !list) return;
  const active = names
    .map(n=>({key:n, person:map[n], unpaid:map[n].entries.filter(e=>!e.settled).reduce((s,e)=>s+e.amount,0)}))
    .filter(item=>item.unpaid>0)
    .sort((a,b)=>b.unpaid-a.unpaid || a.person.displayName.localeCompare(b.person.displayName));

  card.style.display = active.length ? 'block' : 'none';
  list.innerHTML = active.map(item=>`
    <label class="debt-picker-item">
      <span class="debt-picker-person">
        <input type="checkbox" class="debtor-picker-cb" data-key="${escHtml(item.key)}" ${selectedDebtors.has(item.key)?'checked':''}/>
        <span class="debt-picker-avatar">👤</span>
        <span class="debt-picker-name">${escHtml(item.person.displayName)}</span>
      </span>
      <span class="debt-picker-amount">${fmt(item.unpaid)}</span>
    </label>
  `).join('');
  attachDebtorCheckboxListeners(list);
}

function renderPiutang(){
  const map={};
  transactions.forEach(tx=>{
    if(!tx.split) return;
    tx.split.forEach((p,idx)=>{
      const key=p.name.toLowerCase().trim();
      if(!map[key]) map[key]={displayName:p.name,entries:[]};
      map[key].entries.push({txId:tx.id,txDesc:tx.desc,txDate:tx.date,personIdx:idx,amount:p.amount,settled:p.settled,settleMethod:p.settleMethod||'',settleNote:p.settleNote||'',settleDate:p.settleDate||''});
    });
  });
  const names=Object.keys(map);
  // Debitur yang seluruh tagihannya sudah lunas tidak boleh tetap terseleksi.
  // Ini juga membersihkan pilihan secara otomatis setelah pembayaran terakhir dicatat.
  const selectableDebtors=new Set(names.filter(n=>map[n].entries.some(e=>!e.settled)));
  Array.from(selectedDebtors).forEach(k=>{ if(!selectableDebtors.has(k)) selectedDebtors.delete(k); });
  let totalOwed=0,totalPaid=0,activePeople=0;
  names.forEach(n=>{
    const u=map[n].entries.filter(e=>!e.settled).reduce((s,e)=>s+e.amount,0);
    const pd=map[n].entries.filter(e=>e.settled).reduce((s,e)=>s+e.amount,0);
    totalOwed+=u; totalPaid+=pd; if(u>0) activePeople++;
  });
  safe('piutang-total',fmt(totalOwed)); safe('piutang-paid',fmt(totalPaid)); safe('piutang-count',activePeople);
  renderDebtorPicker(map, names);

  const wrap=el('piutang-list'); if(!wrap) return;
  if(!names.length){ wrap.innerHTML=`<div class="empty-state"><div class="emoji">🤝</div><p>Belum ada piutang tercatat.<br>Centang "Ada yang utang ke gua?" saat tambah transaksi.</p></div>`; return; }

  wrap.innerHTML=names.sort().map(n=>{
    const person=map[n];
    const unpaid=person.entries.filter(e=>!e.settled).reduce((s,e)=>s+e.amount,0);
    const settled=unpaid===0;
    return `<div class="debt-person-card" style="${settled?'opacity:.65':''}">
      <div class="debt-person-header">
        <div class="debt-person-name">
          <input type="checkbox" class="debtor-select-cb" data-key="${escHtml(n)}" ${selectedDebtors.has(n)?'checked':''} ${settled?'disabled':''} title="Pilih untuk ditagih" style="width:17px;height:17px;accent-color:var(--teal);cursor:${settled?'not-allowed':'pointer'};flex-shrink:0"/>
          <span style="width:34px;height:34px;background:var(--card2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px">👤</span>
          ${escHtml(person.displayName)}
          ${settled?'<span style="font-size:11px;background:var(--green-dim);color:var(--green);padding:2px 8px;border-radius:99px;font-weight:600">LUNAS</span>':''}
        </div>
        <div class="debt-total-badge">${fmt(unpaid||person.entries.reduce((s,e)=>s+e.amount,0))}</div>
      </div>
      <div class="debt-tx-list">
        ${person.entries.map(e=>`
          <div class="debt-tx-item">
            <div style="flex:1;min-width:0">
              <div class="debt-tx-desc">${escHtml(e.txDesc)}</div>
              <div class="debt-tx-date">${e.txDate}${e.settled&&e.settleDate?' · lunas '+e.settleDate:''}</div>
            </div>
            <div class="settle-wrap">
              <span class="debt-tx-amount ${e.settled?'paid':''}">${fmt(e.amount)}</span>
              <button class="settle-btn ${e.settled?'settled':''}" onclick="openSettleModal('piutang',${e.txId},${e.personIdx},${e.settled})">
                ${e.settled?'✓ Lunas':'Tandai Lunas'}
              </button>
              <button class="del-btn" onclick="openEditPiutang(${e.txId},${e.personIdx})" title="Edit" style="color:var(--blue);font-size:12px;padding:2px 5px">✏️ Edit</button>
              ${e.settled&&e.settleMethod?`<span class="settle-method filled">via ${escHtml(e.settleMethod)}</span>`:''}
              ${e.settled&&e.settleNote?`<span class="settle-method filled">${escHtml(e.settleNote)}</span>`:''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  // Pasang listener checkbox debitur (di-render ulang tiap renderPiutang, jadi re-attach tiap kali)
  attachDebtorCheckboxListeners(wrap);
  updateTagihButton();
}

function renderMyDebt(){
  const map={};
  transactions.forEach(tx=>{
    if(!tx.myDebt) return;
    const key=tx.myDebt.to.toLowerCase().trim();
    if(!map[key]) map[key]={displayName:tx.myDebt.to,entries:[]};
    map[key].entries.push({txId:tx.id,txDesc:tx.desc,txDate:tx.date,amount:tx.myDebt.amount,note:tx.myDebt.note||'',settled:tx.myDebt.settled,settleMethod:tx.myDebt.settleMethod||'',settleNote:tx.myDebt.settleNote||'',settleDate:tx.myDebt.settleDate||''});
  });
  const names=Object.keys(map);
  let totalOwed=0,totalPaid=0,activePeople=0;
  names.forEach(n=>{
    const u=map[n].entries.filter(e=>!e.settled).reduce((s,e)=>s+e.amount,0);
    const pd=map[n].entries.filter(e=>e.settled).reduce((s,e)=>s+e.amount,0);
    totalOwed+=u; totalPaid+=pd; if(u>0) activePeople++;
  });
  safe('mydebt-total',fmt(totalOwed)); safe('mydebt-paid',fmt(totalPaid)); safe('mydebt-count',activePeople);

  const wrap=el('mydebt-list'); if(!wrap) return;
  if(!names.length){ wrap.innerHTML=`<div class="empty-state"><div class="emoji">🏧</div><p>Belum ada utang gua tercatat.<br>Centang "Gua yang utang ke orang?" saat tambah transaksi.</p></div>`; return; }

  wrap.innerHTML=names.sort().map(n=>{
    const person=map[n];
    const unpaid=person.entries.filter(e=>!e.settled).reduce((s,e)=>s+e.amount,0);
    const settled=unpaid===0;
    return `<div class="debt-person-card" style="${settled?'opacity:.65':''}">
      <div class="debt-person-header">
        <div class="debt-person-name">
          <span style="width:34px;height:34px;background:var(--card2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px">🏧</span>
          ${escHtml(person.displayName)}
          ${settled?'<span style="font-size:11px;background:var(--green-dim);color:var(--green);padding:2px 8px;border-radius:99px;font-weight:600">LUNAS</span>':''}
        </div>
        <div class="debt-total-badge orange">${fmt(unpaid||person.entries.reduce((s,e)=>s+e.amount,0))}</div>
      </div>
      <div class="debt-tx-list">
        ${person.entries.map((e,ei)=>`
          <div class="debt-tx-item">
            <div style="flex:1;min-width:0">
              <div class="debt-tx-desc">${escHtml(e.txDesc)}${e.note?` <span style="color:var(--text-muted)">· ${escHtml(e.note)}</span>`:''}</div>
              <div class="debt-tx-date">${e.txDate}${e.settled&&e.settleDate?' · lunas '+e.settleDate:''}</div>
            </div>
            <div class="settle-wrap">
              <span class="debt-tx-amount orange ${e.settled?'paid':''}">${fmt(e.amount)}</span>
              <button class="settle-btn orange ${e.settled?'settled':''}" onclick="openSettleModal('mydebt',${e.txId},0,${e.settled})">
                ${e.settled?'✓ Lunas':'Tandai Lunas'}
              </button>
              <button class="del-btn" onclick="openEditMyDebt(${e.txId})" title="Edit" style="color:var(--orange);font-size:12px;padding:2px 5px">✏️ Edit</button>
              ${e.settled&&e.settleMethod?`<span class="settle-method filled">via ${escHtml(e.settleMethod)}</span>`:''}
              ${e.settled&&e.settleNote?`<span class="settle-method filled">${escHtml(e.settleNote)}</span>`:''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// ─── INVOICE PIUTANG — generate, preview, PDF, share ─────────────────────────
let invoiceQueue = [];
let invoiceIndex = 0;

function buildInvoiceNumber(offset){
  const now = jakartaNow();
  const ymd = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  return `DBT-${ymd}${String(offset+1).padStart(3,'0')}`;
}

function receiptOwnerName(){
  return (settings && (settings.receiptName || settings.ownerName)) || 'Krisna';
}

function receiptAmount(n){
  return Math.abs(Math.round(n || 0)).toLocaleString('id-ID');
}

function receiptDate(dateStr){
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString('id-ID', {day:'2-digit', month:'short'}).replace('.', '');
}

function receiptLongDate(dateStr){
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'}).replace('.', '');
}

function receiptTime(){
  const now = jakartaNow();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

function normalizeDebtKey(name){
  return String(name || '').toLowerCase().trim();
}

function buildReceiptPeople(selectedKeys){
  const people = {};
  const ensure = (key, displayName) => {
    if(!people[key]) people[key] = {key, displayName, receivable:[], payable:[]};
    return people[key];
  };

  transactions.forEach(tx=>{
    if(tx.split){
      tx.split.forEach(p=>{
        const key = normalizeDebtKey(p.name);
        if(!selectedKeys.has(key) || p.settled) return;
        ensure(key, p.name).receivable.push({desc:tx.desc, date:tx.date, amount:p.amount});
      });
    }
    if(tx.myDebt){
      const key = normalizeDebtKey(tx.myDebt.to);
      if(!selectedKeys.has(key) || tx.myDebt.settled) return;
      ensure(key, tx.myDebt.to).payable.push({desc:tx.desc, date:tx.date, amount:tx.myDebt.amount});
    }
  });

  return Object.values(people)
    .filter(p=>p.receivable.length || p.payable.length)
    .sort((a,b)=>a.displayName.localeCompare(b.displayName))
    .map(p=>{
      const receivableTotal = p.receivable.reduce((s,e)=>s+e.amount,0);
      const payableTotal = p.payable.reduce((s,e)=>s+e.amount,0);
      const net = receivableTotal - payableTotal;
      return Object.assign(p, {receivableTotal, payableTotal, net});
    });
}

function buildDebtReceiptElement(data){
  const wrap = document.createElement('div');
  wrap.style.width='380px';
  wrap.style.maxWidth='100%';
  wrap.style.padding='22px 18px';
  wrap.style.background='#FFFFFF';
  wrap.style.color='#000000';
  wrap.style.fontFamily="'Courier New', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  wrap.style.boxSizing='border-box';
  wrap.style.fontSize='13px';
  wrap.style.lineHeight='1.35';

  const owner = receiptOwnerName();
  const hr = `<div style="border-top:1px dashed #000;margin:14px 0"></div>`;
  const strongHr = `<div style="border-top:3px double #000;margin:16px 0"></div>`;
  const rowStyle = 'display:grid;grid-template-columns:54px minmax(0,1fr) 74px;gap:8px;align-items:start;margin:7px 0';
  const subtotal = (label, amount) => `
    <div style="border-top:1px dashed #000;margin:8px 0 6px"></div>
    <div style="display:flex;justify-content:space-between;gap:12px;font-weight:700">
      <span>${label}</span><span style="font-variant-numeric:tabular-nums">${receiptAmount(amount)}</span>
    </div>`;
  const entryRows = entries => entries.map(e=>`
    <div style="${rowStyle}">
      <span>${receiptDate(e.date)}</span>
      <span style="word-break:break-word">${escHtml(e.desc)}</span>
      <span style="text-align:right;font-variant-numeric:tabular-nums">${receiptAmount(e.amount)}</span>
    </div>`).join('');
  const emptyRows = `<div style="margin:7px 0">No outstanding transactions</div>`;
  const sectionTitle = text => `
    <div style="display:flex;align-items:center;gap:10px;margin:18px 0 14px">
      <span style="height:0;border-top:3px double #000;flex:1"></span>
      <span style="font-size:21px;font-weight:900;letter-spacing:0;text-transform:uppercase">${escHtml(text)}</span>
      <span style="height:0;border-top:3px double #000;flex:1"></span>
    </div>`;
  const netLine = p => {
    const from = p.net >= 0 ? p.displayName : owner;
    const to = p.net >= 0 ? owner : p.displayName;
    return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 82px;gap:10px;align-items:baseline;font-size:20px;font-weight:900">
      <span style="word-break:break-word">${escHtml(from)} → ${escHtml(to)}</span>
      <span style="text-align:right;font-variant-numeric:tabular-nums">${receiptAmount(p.net)}</span>
    </div>`;
  };
  const peopleHtml = data.people.map(p=>`
    ${sectionTitle(p.displayName)}
    <div style="font-size:16px;font-weight:800;margin-bottom:8px">→ ${escHtml(owner)} (${p.receivable.length})</div>
    ${p.receivable.length ? entryRows(p.receivable) : emptyRows}
    ${subtotal('Subtotal', p.receivableTotal)}
    ${hr}
    <div style="font-size:16px;font-weight:800;margin-bottom:8px">← ${escHtml(p.displayName)} (${p.payable.length})</div>
    ${p.payable.length ? entryRows(p.payable) : emptyRows}
    ${subtotal('Subtotal', p.payableTotal)}
    ${strongHr}
    <div style="text-align:center;font-weight:700;margin-bottom:8px">Net Payment</div>
    ${netLine(p)}
    ${strongHr}
  `).join('');
  const totalRows = data.people.map(netLine).join(`<div style="border-top:1px dashed #000;margin:8px 0"></div>`);

  wrap.innerHTML = `
    <div style="text-align:center;margin-bottom:10px">
      <div style="min-height:48px;display:flex;align-items:center;justify-content:center;margin-bottom:6px">
        <img src="icons/budgetin-thermal-logo.png" alt="Budget.in" style="width:92px;height:auto;display:block;object-fit:contain"/>
      </div>
      <div style="font-family:Inter,Arial,sans-serif;font-size:24px;font-weight:900;letter-spacing:1px;line-height:1;margin-bottom:6px">BUDGET.IN</div>
      <div style="font-size:16px;font-weight:700">Debt Receipt</div>
    </div>
    ${hr}
    <div style="display:grid;grid-template-columns:82px 10px 1fr;gap:4px;font-size:14px">
      <span>Receipt</span><span>:</span><span>${escHtml(data.invoiceNo)}</span>
      <span>Date</span><span>:</span><span>${receiptLongDate(data.date)}</span>
      <span>Time</span><span>:</span><span>${escHtml(data.time || receiptTime())}</span>
    </div>
    ${hr}
    ${peopleHtml}
    <div style="text-align:center;font-weight:900;border:1px solid #000;border-radius:4px;padding:7px 8px;margin:18px 54px 12px">TOTAL NET PAYMENT</div>
    ${hr}
    <div>${totalRows}</div>
    ${hr}
    <div style="text-align:center;margin:18px 0 12px">Generated by Budget.in</div>
    ${hr}
    <div style="height:18px"></div>
  `;
  return wrap;
}

function buildDebtReceiptShareText(data){
  const owner = receiptOwnerName();
  let t = `DEBT RECEIPT ${data.invoiceNo}\nDate: ${receiptLongDate(data.date)}\nTime: ${data.time || receiptTime()}\n\n`;
  data.people.forEach(p=>{
    t += `${p.displayName.toUpperCase()}\n`;
    t += `-> ${owner} (${p.receivable.length})\n`;
    p.receivable.forEach(e=>{ t += `${receiptDate(e.date)}  ${e.desc}  ${receiptAmount(e.amount)}\n`; });
    t += `Subtotal ${receiptAmount(p.receivableTotal)}\n\n`;
    t += `<- ${p.displayName} (${p.payable.length})\n`;
    p.payable.forEach(e=>{ t += `${receiptDate(e.date)}  ${e.desc}  ${receiptAmount(e.amount)}\n`; });
    t += `Subtotal ${receiptAmount(p.payableTotal)}\n\n`;
    const from = p.net >= 0 ? p.displayName : owner;
    const to = p.net >= 0 ? owner : p.displayName;
    t += `Net Payment: ${from} -> ${to} ${receiptAmount(p.net)}\n\n`;
  });
  t += `TOTAL NET PAYMENT\n`;
  data.people.forEach(p=>{
    const from = p.net >= 0 ? p.displayName : owner;
    const to = p.net >= 0 ? owner : p.displayName;
    t += `${from} -> ${to} ${receiptAmount(p.net)}\n`;
  });
  t += `\nGenerated by Budget.in`;
  return t;
}

// Membuat invoice terpisah per debitur atau satu invoice gabungan, sesuai pilihan pengguna.
// Hanya menyertakan transaksi piutang yang BELUM LUNAS. Tidak mengubah status transaksi apapun.
function generateInvoices(){
  if(selectedDebtors.size===0){ showToast('⚠️ Pilih minimal satu debitur dulu!'); return; }

  const groups = buildReceiptPeople(selectedDebtors);
  const mode=el('invoice-mode')?.value || 'separate';
  if(mode==='combined'){
    invoiceQueue=groups.length?[{
      invoiceNo: buildInvoiceNumber(0),
      debtor: groups.map(group=>group.displayName).join(', '),
      people: groups,
      total: groups.reduce((s,p)=>s+Math.abs(p.net),0),
      date: todayStr(),
      time: receiptTime(),
      combined: true
    }]:[];
  } else {
    invoiceQueue=groups.map((v,i)=>({
      invoiceNo: buildInvoiceNumber(i),
      debtor: v.displayName,
      people: [v],
      total: Math.abs(v.net),
      date: todayStr(),
      time: receiptTime(),
      combined: false
    }));
  }

  if(!invoiceQueue.length){ showToast('⚠️ Debitur terpilih tidak punya piutang/utang yang belum lunas.'); return; }

  invoiceIndex = 0;
  el('invoice-modal').classList.add('open');
  renderInvoicePreview();
}

function closeInvoiceModal(){ el('invoice-modal').classList.remove('open'); }

function prevInvoice(){ if(invoiceIndex>0){ invoiceIndex--; renderInvoicePreview(); } }
function nextInvoice(){ if(invoiceIndex<invoiceQueue.length-1){ invoiceIndex++; renderInvoicePreview(); } }

function renderInvoicePreview(){
  const wrap = el('invoice-preview-wrap');
  if(!wrap || !invoiceQueue.length) return;
  const data = invoiceQueue[invoiceIndex];
  wrap.innerHTML = '';
  wrap.appendChild(buildInvoiceElement(data));

  safe('invoice-counter', `Receipt ${invoiceIndex+1} dari ${invoiceQueue.length} — ${data.debtor}`);
  const navBar = el('invoice-nav-bar');
  if(navBar) navBar.style.display = invoiceQueue.length>1 ? 'flex' : 'none';
  const btnAll = el('btn-download-all');
  if(btnAll) btnAll.style.display = invoiceQueue.length>1 ? 'inline-flex' : 'none';
}

function buildInvoiceElement(data){
  return buildDebtReceiptElement(data);
  const wrap = document.createElement('div');
  wrap.style.width='640px';
  wrap.style.padding='32px';
  wrap.style.background='#FFFFFF';
  wrap.style.color='#1E293B';
  wrap.style.fontFamily="'Inter',sans-serif";
  wrap.style.boxSizing='border-box';

  const C = {dim:'#64748B', muted:'#94A3B8', border:'#E2E8F0', teal:'#0D9488', card:'#F8FAFC'};
  const debtorHeader = data.combined
    ? `<th style="text-align:left;padding:8px 6px;font-size:10px;color:${C.muted};text-transform:uppercase;border-bottom:2px solid ${C.border}">Debitur</th>`
    : '';

  const rows = data.entries.map((e,i)=>`
    <tr>
      <td style="padding:8px 6px;border-bottom:1px solid ${C.border};font-size:12px;color:${C.muted};text-align:center">${i+1}</td>
      <td style="padding:8px 6px;border-bottom:1px solid ${C.border};font-size:12px;color:${C.muted}">${e.date}</td>
      ${data.combined?`<td style="padding:8px 6px;border-bottom:1px solid ${C.border};font-size:12px">${escHtml(e.debtor)}</td>`:''}
      <td style="padding:8px 6px;border-bottom:1px solid ${C.border};font-size:13px">${escHtml(e.desc)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums">${fmt(e.amount)}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${C.teal};padding-bottom:16px;margin-bottom:20px">
      <div>
        <div style="font-size:11px;font-weight:700;color:${C.teal};letter-spacing:.1em;text-transform:uppercase">Invoice Tagihan</div>
        <div style="font-size:24px;font-weight:800;letter-spacing:-.5px;margin-top:4px">${escHtml(data.invoiceNo)}</div>
      </div>
    </div>
    <div style="margin-bottom:18px">
      <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.muted};margin-bottom:4px">Ditagihkan Kepada</div>
      <div style="font-size:18px;font-weight:800">${escHtml(data.debtor)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead>
        <tr>
          <th style="text-align:center;padding:8px 6px;font-size:10px;color:${C.muted};text-transform:uppercase;border-bottom:2px solid ${C.border}">No</th>
          <th style="text-align:left;padding:8px 6px;font-size:10px;color:${C.muted};text-transform:uppercase;border-bottom:2px solid ${C.border}">Tanggal</th>
          ${debtorHeader}
          <th style="text-align:left;padding:8px 6px;font-size:10px;color:${C.muted};text-transform:uppercase;border-bottom:2px solid ${C.border}">Keterangan</th>
          <th style="text-align:right;padding:8px 6px;font-size:10px;color:${C.muted};text-transform:uppercase;border-bottom:2px solid ${C.border}">Nominal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:24px">
      <div style="background:${C.card};border:1px solid ${C.border};border-radius:10px;padding:12px 20px;min-width:220px">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700">
          <span>Total Tagihan</span>
          <span style="color:${C.teal}">${fmt(data.total)}</span>
        </div>
      </div>
    </div>
    <div style="font-size:11px;color:${C.muted};line-height:1.7;border-top:1px solid ${C.border};padding-top:14px">
      Invoice ini dibuat otomatis berdasarkan catatan transaksi yang belum lunas. Mohon konfirmasi pembayaran setelah transfer. Terima kasih! 🙏
    </div>
    <div style="font-size:10px;color:${C.muted};text-align:center;margin-top:16px;letter-spacing:.04em">Budget.in by Kresna</div>
  `;
  return wrap;
}

function buildInvoiceShareText(data){
  return buildDebtReceiptShareText(data);
  let t = `🧾 INVOICE ${data.invoiceNo}\nKepada: ${data.debtor}\nTanggal: ${data.date}\n\n`;
  data.entries.forEach(e=>{ t += `- ${data.combined ? `${e.debtor} — ` : ''}${e.desc} (${e.date}): ${fmt(e.amount)}\n`; });
  t += `\nTotal Tagihan: ${fmt(data.total)}`;
  return t;
}

async function renderInvoiceCanvas(data){
  const docEl = buildInvoiceElement(data);
  docEl.style.position='fixed'; docEl.style.left='-9999px'; docEl.style.top='0';
  document.body.appendChild(docEl);
  await Promise.all(Array.from(docEl.querySelectorAll('img')).map(img=>{
    if(img.complete) return Promise.resolve();
    return new Promise(resolve=>{
      img.onload = resolve;
      img.onerror = resolve;
    });
  }));
  await new Promise(r=>setTimeout(r,30));
  try{
    return await html2canvas(docEl, {backgroundColor:'#FFFFFF', scale:2, width:380});
  } finally {
    docEl.remove();
  }
}

async function downloadInvoicePDF(data){
  if(typeof html2canvas==='undefined' || typeof window.jspdf==='undefined'){ showToast('⚠️ Library belum siap, coba lagi'); return false; }
  try{
    const canvas = await renderInvoiceCanvas(data);
    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL('image/png');
    const receiptW=80;
    const pxToMm = receiptW/canvas.width;
    const imgHmm = canvas.height*pxToMm;
    const pageH = Math.max(120, imgHmm);
    const pdf = new jsPDF({orientation:'p', unit:'mm', format:[receiptW, pageH]});
    if(imgHmm<=pageH){
      pdf.addImage(imgData,'PNG',0,0,receiptW,imgHmm);
    } else {
      // invoice panjang (banyak transaksi belum lunas) → split ke beberapa halaman A4
      const pageHeightPx = Math.floor(pageH/pxToMm);
      let rendered=0, first=true;
      while(rendered<canvas.height){
        const sliceH = Math.min(pageHeightPx, canvas.height-rendered);
        const pc = document.createElement('canvas');
        pc.width=canvas.width; pc.height=sliceH;
        const ctx=pc.getContext('2d');
        ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,pc.width,pc.height);
        ctx.drawImage(canvas,0,rendered,canvas.width,sliceH,0,0,canvas.width,sliceH);
        if(!first) pdf.addPage();
        pdf.addImage(pc.toDataURL('image/png'),'PNG',0,0,receiptW,sliceH*pxToMm);
        rendered+=sliceH; first=false;
      }
    }
    pdf.save(`Debt_Receipt_${data.debtor.replace(/\s+/g,'_')}_${data.date}.pdf`);
    return true;
  } catch(err){
    showToast('❌ Gagal membuat receipt: '+err.message);
    return false;
  }
}

async function downloadCurrentInvoicePDF(){
  const data = invoiceQueue[invoiceIndex];
  if(!data) return;
  const ok = await downloadInvoicePDF(data);
  if(ok) showToast('✅ Receipt PDF didownload!');
}

async function downloadAllInvoicesPDF(){
  if(!invoiceQueue.length) return;
  for(const data of invoiceQueue){
    await downloadInvoicePDF(data);
    await new Promise(r=>setTimeout(r,300)); // beri jeda supaya browser tidak block multi-download
  }
  showToast(`✅ ${invoiceQueue.length} receipt PDF didownload!`);
}

async function shareCurrentInvoice(){
  const data = invoiceQueue[invoiceIndex];
  if(!data) return;
  const shareText = buildInvoiceShareText(data);

  if(navigator.share){
    try{
      if(typeof html2canvas!=='undefined' && navigator.canShare){
        const canvas = await renderInvoiceCanvas(data);
        const blob = await new Promise(res=>canvas.toBlob(res,'image/png'));
        if(blob){
          const file = new File([blob], `Debt_Receipt_${data.debtor.replace(/\s+/g,'_')}.png`, {type:'image/png'});
          if(navigator.canShare({files:[file]})){
            await navigator.share({files:[file], title:`Debt Receipt - ${data.debtor}`, text: shareText});
            return;
          }
        }
      }
      await navigator.share({title:`Debt Receipt - ${data.debtor}`, text: shareText});
      return;
    } catch(err){
      if(err && err.name==='AbortError') return; // dibatalkan user, jangan fallback
    }
  }

  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(shareText).then(()=>showToast('📋 Receipt disalin ke clipboard!'));
  } else {
    showToast('⚠️ Fitur share tidak didukung di browser ini');
  }
}

// ─── EDIT PIUTANG ────────────────────────────────────────────────────────────
let editPiutangCtx = null; // {txId, personIdx}
function openEditPiutang(txId, personIdx){
  const tx = transactions.find(t=>t.id===txId);
  if(!tx||!tx.split||!tx.split[personIdx]) return;
  editPiutangCtx = {txId, personIdx};
  const p = tx.split[personIdx];
  el('edit-piutang-desc').textContent = `Transaksi: "${tx.desc}" · ${tx.date}`;
  el('ep-name').value = p.name;
  el('ep-amount').value = p.amount;
  el('ep-amount-preview').textContent = '= ' + fmt(p.amount);
  el('edit-piutang-modal').classList.add('open');
}
function closeEditPiutang(){ el('edit-piutang-modal').classList.remove('open'); editPiutangCtx=null; }
function saveEditPiutang(){
  if(!editPiutangCtx) return;
  const tx = transactions.find(t=>t.id===editPiutangCtx.txId);
  if(!tx) return;
  const newName   = el('ep-name').value.trim();
  const newAmount = parseShorthand(el('ep-amount').value);
  if(!newName||!newAmount){ showToast('⚠️ Nama dan nominal wajib!'); return; }

  tx.split[editPiutangCtx.personIdx].name   = newName;
  tx.split[editPiutangCtx.personIdx].amount = newAmount;
  // Recalc myShare
  const othersTotal = tx.split.reduce((s,p)=>s+p.amount,0);
  tx.myShare = tx.amount - othersTotal;

  save(); closeEditPiutang();
  renderUtang(); renderDashboard();
  showToast('✅ Piutang diupdate!');
}

// ─── EDIT MY DEBT ────────────────────────────────────────────────────────────
let editMyDebtTxId = null;
function openEditMyDebt(txId){
  const tx = transactions.find(t=>t.id===txId);
  if(!tx||!tx.myDebt) return;
  editMyDebtTxId = txId;
  el('edit-mydebt-desc').textContent = `Transaksi: "${tx.desc}" · ${tx.date}`;
  el('emd-name').value   = tx.myDebt.to;
  el('emd-amount').value = tx.myDebt.amount;
  el('emd-amount-preview').textContent = '= ' + fmt(tx.myDebt.amount);
  el('emd-note').value   = tx.myDebt.note || '';
  el('edit-mydebt-modal').classList.add('open');
}
function closeEditMyDebt(){ el('edit-mydebt-modal').classList.remove('open'); editMyDebtTxId=null; }
function saveEditMyDebt(){
  if(!editMyDebtTxId) return;
  const tx = transactions.find(t=>t.id===editMyDebtTxId);
  if(!tx||!tx.myDebt) return;
  const newName   = el('emd-name').value.trim();
  const newAmount = parseShorthand(el('emd-amount').value);
  if(!newName||!newAmount){ showToast('⚠️ Nama dan nominal wajib!'); return; }

  tx.myDebt.to     = newName;
  tx.myDebt.amount = newAmount;
  tx.myDebt.note   = el('emd-note').value.trim();

  save(); closeEditMyDebt();
  renderUtang(); renderDashboard();
  showToast('✅ Utang diupdate!');
}

// ─── TAMBAH UTANG GUA (standalone) ───────────────────────────────────────────
function saveMyDebtStandalone(){
  const date = el('ud-date').value;
  const name = el('ud-name').value.trim();
  const amount = parseShorthand(el('ud-amount').value);
  const note = el('ud-note').value.trim();
  const method = el('ud-method').value;
  const desc = el('ud-desc').value.trim() || ('Utang ke ' + name);

  if(!date||!name||!amount){ showToast('⚠️ Tanggal, nama, dan nominal wajib!'); return; }

  const tx = {
    id: Date.now(),
    date, amount, desc, cat:'other', src:'cash', note,
    myShare: amount,
    split: null,
    myDebt: {to:name, amount, note, settled:false, settleMethod:'', settleNote:'', settleDate:'',
             startMethod: method} // how gua borrowed
  };
  transactions.unshift(tx);
  save();
  showToast('✅ Utang tercatat!');
  // reset
  el('ud-date').value = todayStr();
  ['ud-name','ud-amount','ud-note','ud-desc'].forEach(id=>{ const e=el(id); if(e) e.value=''; });
  el('ud-method').value = '';
  el('ud-amount-preview').textContent = '';
}

