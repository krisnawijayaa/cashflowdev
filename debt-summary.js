// ─── DEBT SUMMARY (Receivable / Payable overview) ────────────────────────────
// This module ONLY renders the new summary cards + expandable Receivable/Payable
// lists above the existing full history panels. It never touches or removes the
// original histori (panel-piutang / panel-mydebt) rendered in debt.js.

let debtSearchQuery = '';
let debtSummaryFilter = 'all';       // 'all' | 'receivable' | 'payable'
let debtOutstandingOnly = true;      // hide people with 0 outstanding when true
let expandedDebtCards = new Set();   // keys like 'receivable:irham'

// Builds a map of every person who has ever appeared in a split (piutang) or
// myDebt (utang gua) entry, with ONLY their unpaid entries listed (paid ones
// are intentionally excluded here — they still live in the full histori below).
function computeDebtBook(){
  const receivable = {}, payable = {};

  transactions.forEach(tx=>{
    if(tx.split){
      tx.split.forEach((p,idx)=>{
        const key = p.name.toLowerCase().trim();
        if(!key) return;
        if(!receivable[key]) receivable[key] = {key, name:p.name, entries:[], total:0};
        if(!p.settled){
          receivable[key].entries.push({txId:tx.id, personIdx:idx, date:tx.date, desc:tx.desc, amount:p.amount});
          receivable[key].total += p.amount;
        }
      });
    }
    if(tx.myDebt){
      const key = tx.myDebt.to.toLowerCase().trim();
      if(key){
        if(!payable[key]) payable[key] = {key, name:tx.myDebt.to, entries:[], total:0};
        if(!tx.myDebt.settled){
          payable[key].entries.push({txId:tx.id, date:tx.date, desc:tx.desc, amount:tx.myDebt.amount});
          payable[key].total += tx.myDebt.amount;
        }
      }
    }
  });

  return {receivable, payable};
}

function matchesDebtSearch(name){
  if(!debtSearchQuery) return true;
  return name.toLowerCase().includes(debtSearchQuery.toLowerCase());
}

function renderDebtSummary(){
  const {receivable, payable} = computeDebtBook();
  const recList = Object.values(receivable);
  const payList = Object.values(payable);

  const totalPiutang = recList.reduce((s,p)=>s+p.total,0);
  const totalHutang  = payList.reduce((s,p)=>s+p.total,0);
  const totalOutstanding = totalPiutang + totalHutang;
  const jmlDebitur  = recList.filter(p=>p.total>0).length;
  const jmlKreditur = payList.filter(p=>p.total>0).length;
  const jmlTxOutstanding = recList.reduce((s,p)=>s+p.entries.length,0) + payList.reduce((s,p)=>s+p.entries.length,0);

  safe('ds-total-piutang', fmt(totalPiutang));
  safe('ds-total-hutang', fmt(totalHutang));
  safe('ds-total-outstanding', fmt(totalOutstanding));
  safe('ds-count-debitur', jmlDebitur);
  safe('ds-count-kreditur', jmlKreditur);
  safe('ds-count-tx', jmlTxOutstanding);

  renderDebtGroup('receivable', recList, el('ds-receivable-list'));
  renderDebtGroup('payable', payList, el('ds-payable-list'));

  const recWrap = el('ds-receivable-section'), payWrap = el('ds-payable-section');
  if(recWrap) recWrap.style.display = (debtSummaryFilter==='all'||debtSummaryFilter==='receivable') ? 'block':'none';
  if(payWrap) payWrap.style.display = (debtSummaryFilter==='all'||debtSummaryFilter==='payable') ? 'block':'none';

  if(typeof updateTagihButton === 'function') updateTagihButton();
}

function renderDebtGroup(type, list, container){
  if(!container) return;

  let filtered = list.filter(p => matchesDebtSearch(p.name));
  if(debtOutstandingOnly) filtered = filtered.filter(p => p.total > 0);
  filtered = filtered.sort((a,b)=> b.total - a.total || a.name.localeCompare(b.name));

  if(!filtered.length){
    container.innerHTML = `<div class="empty-state" style="padding:24px 12px">
      <div class="emoji">${type==='receivable'?'🤝':'🏧'}</div>
      <p>${debtSearchQuery ? 'Tidak ditemukan.' : 'Tidak ada data outstanding.'}</p>
    </div>`;
    return;
  }

  const accent = type==='receivable' ? 'var(--teal)' : 'var(--orange)';
  const accentDim = type==='receivable' ? 'var(--teal-dim)' : 'var(--orange-dim)';

  container.innerHTML = filtered.map(p=>{
    const cardKey = `${type}:${p.key}`;
    const isOpen = expandedDebtCards.has(cardKey);
    const entriesHtml = p.entries.length ? p.entries.map(e=>`
      <div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
        <div style="min-width:0">
          <div style="color:var(--text-dim)">${escHtml(e.desc)}</div>
          <div style="color:var(--text-muted);font-size:10px;margin-top:1px">${e.date}</div>
        </div>
        <div style="font-weight:700;font-variant-numeric:tabular-nums;color:${accent};white-space:nowrap;flex-shrink:0">${fmt(e.amount)}</div>
      </div>`).join('') : `<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Tidak ada transaksi outstanding.</div>`;

    return `<div class="debt-sum-card">
      <div class="debt-sum-card-head">
        <input type="checkbox" class="debt-sum-checkbox debtor-picker-cb" data-key="${escHtml(p.key)}" onclick="event.stopPropagation()" ${selectedDebtors.has(p.key)?'checked':''} ${p.entries.length?'':'disabled'}/>
        <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;cursor:pointer" onclick="toggleDebtCard('${escHtml(cardKey)}')">
          <span class="debt-sum-avatar" style="color:${accent};background:${accentDim}">${type==='receivable'?'🤝':'🏧'}</span>
          <div style="min-width:0">
            <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${p.entries.length} transaksi outstanding</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <div style="font-weight:800;font-variant-numeric:tabular-nums;color:${accent};font-size:13px">${fmt(p.total)}</div>
          <button class="btn btn-sm ${type==='receivable'?'btn-teal':'btn-orange'}" title="Buat Receipt" onclick="event.stopPropagation();quickReceipt('${type}','${escHtml(p.key)}')" ${p.entries.length?'':'disabled style="opacity:.4;cursor:not-allowed"'}>🧾</button>
          <span class="debt-sum-chevron" onclick="toggleDebtCard('${escHtml(cardKey)}')" style="transform:rotate(${isOpen?'180deg':'0deg'})">▾</span>
        </div>
      </div>
      <div class="debt-sum-card-body" style="display:${isOpen?'block':'none'}">${entriesHtml}</div>
    </div>`;
  }).join('');

  attachDebtorCheckboxListeners(container);
}

function toggleDebtCard(key){
  if(expandedDebtCards.has(key)) expandedDebtCards.delete(key); else expandedDebtCards.add(key);
  renderDebtSummary();
}

function expandAllDebtCards(){
  const {receivable, payable} = computeDebtBook();
  Object.keys(receivable).forEach(k=>expandedDebtCards.add('receivable:'+k));
  Object.keys(payable).forEach(k=>expandedDebtCards.add('payable:'+k));
  renderDebtSummary();
}

function collapseAllDebtCards(){
  expandedDebtCards.clear();
  renderDebtSummary();
}

function onDebtSearchInput(inp){
  debtSearchQuery = inp.value.trim();
  renderDebtSummary();
}

function setDebtSummaryFilter(f, btn){
  debtSummaryFilter = f;
  document.querySelectorAll('#ds-filter-bar .filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderDebtSummary();
}

function toggleDebtOutstandingOnly(cb){
  debtOutstandingOnly = cb.checked;
  renderDebtSummary();
}
