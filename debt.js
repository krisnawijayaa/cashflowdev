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
  let totalOwed=0,totalPaid=0,activePeople=0;
  names.forEach(n=>{
    const u=map[n].entries.filter(e=>!e.settled).reduce((s,e)=>s+e.amount,0);
    const pd=map[n].entries.filter(e=>e.settled).reduce((s,e)=>s+e.amount,0);
    totalOwed+=u; totalPaid+=pd; if(u>0) activePeople++;
  });
  safe('piutang-total',fmt(totalOwed)); safe('piutang-paid',fmt(totalPaid)); safe('piutang-count',activePeople);

  const wrap=el('piutang-list'); if(!wrap) return;
  if(!names.length){ wrap.innerHTML=`<div class="empty-state"><div class="emoji">🤝</div><p>Belum ada piutang tercatat.<br>Centang "Ada yang utang ke gua?" saat tambah transaksi.</p></div>`; return; }

  wrap.innerHTML=names.sort().map(n=>{
    const person=map[n];
    const unpaid=person.entries.filter(e=>!e.settled).reduce((s,e)=>s+e.amount,0);
    const settled=unpaid===0;
    return `<div class="debt-person-card" style="${settled?'opacity:.65':''}">
      <div class="debt-person-header">
        <div class="debt-person-name">
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

