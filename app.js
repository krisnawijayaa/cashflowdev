// ─── UTILS ──────────────────────────────────────────────────────────────────
const fmt = n => 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
const el = id => document.getElementById(id);
const safe = (id, val, prop='textContent') => { const e = el(id); if(e) e[prop] = val; };

// ─── DATE HELPERS (single source of truth — always Asia/Jakarta) ────────────
// The whole app must agree on "what day is it" regardless of the device's own
// timezone. Every "today / now" calculation MUST go through jakartaNow()/todayStr()
// below instead of calling `new Date()` or `.toISOString()` directly.
const APP_TIMEZONE = 'Asia/Jakarta';

// Reads the wall-clock date/time in Asia/Jakarta for a given instant (default: now).
function getJakartaParts(date){
  const d = date || new Date();
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(d).forEach(p => { if(p.type !== 'literal') parts[p.type] = p.value; });
  return {
    y: parseInt(parts.year, 10),
    m: parseInt(parts.month, 10),
    d: parseInt(parts.day, 10),
    hh: parseInt(parts.hour, 10) % 24,
    mm: parseInt(parts.minute, 10),
    ss: parseInt(parts.second, 10)
  };
}

// Returns a Date object whose LOCAL getters (getFullYear/getMonth/getDate/getDay/
// getHours/setDate/...) reflect the current Asia/Jakarta wall-clock time — no
// matter what timezone the user's device is actually set to.
// IMPORTANT: only use local getters on this object. Never call toISOString()/
// getUTC*() on it — that would re-interpret it using the device's real offset
// and reintroduce the timezone bug this helper exists to prevent.
function jakartaNow(){
  const p = getJakartaParts();
  return new Date(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
}

// Formats a Date object as "YYYY-MM-DD" using its LOCAL fields (never UTC).
// Safe to use on Date objects produced by jakartaNow() (or derived from it via
// setDate/setMonth/etc.) since those objects' local fields already represent
// Jakarta wall-clock time.
function dateToStr(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// Parses a "YYYY-MM-DD" string into a local Date built from its explicit y/m/d
// numbers. Use this instead of `new Date(dateStr)` — the native constructor
// treats date-only strings as UTC midnight, which shifts the weekday/date by
// one when read back with local getters (getDay/getDate) on devices whose
// timezone differs from UTC.
function parseDateStr(dateStr){
  const [y,m,d] = dateStr.slice(0,10).split('-').map(Number);
  return new Date(y, m-1, d);
}

// "Today" as YYYY-MM-DD in Asia/Jakarta — the one function the rest of the app
// should call whenever it needs "today's date".
function todayStr(){
  const p = getJakartaParts();
  return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
}

function isSameDay(d1,d2){ return d1.slice(0,10)===d2.slice(0,10); }
function isSameMonth(d){
  return d.slice(0,7) === todayStr().slice(0,7);
}
// Pure calendar-day difference between two "YYYY-MM-DD" strings (today - d),
// independent of time-of-day / real elapsed milliseconds / device timezone.
function daysSince(dateStr){
  const [ty,tm,td] = todayStr().split('-').map(Number);
  const [dy,dm,dd] = dateStr.slice(0,10).split('-').map(Number);
  const a = Date.UTC(ty,tm-1,td);
  const b = Date.UTC(dy,dm-1,dd);
  return Math.round((a-b)/864e5);
}
function isThisWeek(d){
  const diff = daysSince(d);
  return diff>=0 && diff<7;
}

function showToast(msg){
  const t=el('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2400);
}

// ─── NAVIGATION ─────────────────────────────────────────────────────────────
function showPage(id, btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg = el('page-'+id);
  if(pg) pg.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.mob-nav-btn').forEach(n=>n.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.querySelectorAll(`.nav-item[onclick*="'${id}'"]`).forEach(n=>n.classList.add('active'));
  document.querySelectorAll(`.mob-nav-btn[data-mob="${id}"]`).forEach(n=>n.classList.add('active'));

  if(id==='dashboard') renderDashboard();
  else if(id==='transaksi') renderTransaksi();
  else if(id==='tabungan') renderTabungan();
  else if(id==='kredit') renderKredit();
  else if(id==='utang') renderUtang();
  else if(id==='aset') renderAset();
  else if(id==='tambahutang'){ const d=el('ud-date'); if(d&&!d.value) d.value=todayStr(); }
  else if(id==='tambah'){ const d=el('f-date'); if(d&&!d.value) d.value=todayStr(); resetSplit(); }
}

// ─── SAVE TRANSACTION ────────────────────────────────────────────────────────
function saveTransaction(){
  const date = el('f-date').value;
  const amount = parseShorthand(el('f-amount').value);
  const desc = el('f-desc').value.trim();
  const cat = el('f-cat').value;
  const src = el('f-src').value;
  const note = el('f-note').value.trim();

  if(!date||!amount||!desc){ showToast('⚠️ Tanggal, nominal, dan deskripsi wajib!'); return; }

  const hasSplit = el('split-toggle').checked && splitPeople.length>0;
  const activeSplit = splitPeople.filter(p=>p.name&&p.amount>0);
  const othersTotal = activeSplit.reduce((s,p)=>s+p.amount,0);
  const myShare = hasSplit && activeSplit.length>0 ? amount-othersTotal : amount;

  const hasMyDebt = el('mydebt-toggle').checked;
  const mdName = el('md-name').value.trim();
  const mdAmount = parseShorthand(el('md-amount').value);
  const mdNote = el('md-note').value.trim();

  const tx = {
    id: Date.now(),
    date, amount, desc, cat, src, note,
    myShare,
    split: hasSplit && activeSplit.length>0 ? activeSplit.map(p=>({name:p.name,amount:p.amount,settled:false,settleMethod:'',settleNote:'',settleDate:''})) : null,
    myDebt: hasMyDebt && mdName && mdAmount>0 ? {to:mdName,amount:mdAmount,note:mdNote,settled:false,settleMethod:'',settleNote:'',settleDate:''} : null
  };

  transactions.unshift(tx);
  save();
  showToast('✅ Transaksi tersimpan!');
  resetForm();
}

function resetForm(){
  el('f-date').value=todayStr();
  ['f-amount','f-desc','f-note'].forEach(id=>{ const e=el(id); if(e) e.value=''; });
  el('f-cat').value='food'; el('f-src').value='bni';
  resetSplit();
}

function deleteTransaction(id){
  if(!confirm('Hapus transaksi ini?')) return;
  transactions=transactions.filter(t=>t.id!==id);
  save(); renderTransaksi(); renderDashboard();
  showToast('🗑️ Transaksi dihapus');
}

// ─── RENDER DASHBOARD ────────────────────────────────────────────────────────
function renderDashboard(){
  const now = jakartaNow();
  safe('today-label', now.toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'}));

  // Exclude income & CC payment (cat=cc) dari spending — CC payment bukan pengeluaran baru,
  // sudah dihitung waktu swipe. Yang dihitung real spending adalah transaksi src=cc (swipe).
  const spending = transactions.filter(t=>t.cat!=='income' && t.cat!=='cc');
  const todayTx  = spending.filter(t=>isSameDay(t.date,todayStr()));
  const weekTx   = spending.filter(t=>isThisWeek(t.date));
  const monthTx  = spending.filter(t=>isSameMonth(t.date));

  // Pakai myShare (bagian gua), bukan amount penuh — biar piutang teman ga ikut keitung pengeluaran gua
  const sum = arr => arr.reduce((s,t)=>s+(t.myShare!=null?t.myShare:t.amount),0);
  safe('dash-today', fmt(sum(todayTx)));
  safe('dash-week',  fmt(sum(weekTx)));
  safe('dash-month', fmt(sum(monthTx)));

  // Piutang
  let piutangAmt=0, piutangPeople=new Set();
  transactions.forEach(tx=>{ if(tx.split) tx.split.forEach(p=>{ if(!p.settled){piutangAmt+=p.amount;piutangPeople.add(p.name.toLowerCase());} }); });
  safe('dash-piutang', fmt(piutangAmt));
  safe('dash-piutang-sub', `${piutangPeople.size} orang belum bayar`);

  // My debt
  let myDebtAmt=0, myDebtPeople=new Set();
  transactions.forEach(tx=>{ if(tx.myDebt&&!tx.myDebt.settled){myDebtAmt+=tx.myDebt.amount;myDebtPeople.add(tx.myDebt.to.toLowerCase());} });
  safe('dash-mydebt', fmt(myDebtAmt));
  safe('dash-mydebt-sub', `ke ${myDebtPeople.size} orang`);

  // CC balance = semua transaksi yang bayar pake CC (src=cc), exclude cat=cc (itu pembayaran tagihan)
  const allMonthTx = transactions.filter(t=>isSameMonth(t.date)&&t.cat!=='income');
  const ccTotal = allMonthTx.filter(t=>t.src==='cc').reduce((s,t)=>s+t.amount,0);
  const monthTotal = sum(monthTx);
  safe('dash-cc', fmt(ccTotal));
  const ccPct = monthTotal>0 ? Math.min(100,(ccTotal/monthTotal)*100) : 0;
  const ccBar = el('dash-cc-bar'); if(ccBar) ccBar.style.width=ccPct+'%';
  safe('dash-cc-pct', Math.round(ccPct)+'% dari total pengeluaran');

  // Income ratio
  const income = settings.income||0;
  safe('dash-income-disp', fmt(income));
  if(income>0){
    const ratio=Math.min(100,(monthTotal/income)*100);
    const rb=el('spend-ratio-bar'); if(rb) rb.style.width=ratio+'%';
    safe('spend-ratio-label', `${Math.round(ratio)}% income terpakai`);
  }

  renderTrendChart();
  renderCatBars(monthTx, monthTotal);
  renderInsights(monthTx, monthTotal, income, piutangAmt, myDebtAmt);
  renderRecent();
  renderSavingsRate(monthTotal, income);
  renderCashflowForecast(monthTotal, income);
  renderNetWorthGrowth();
  renderMonthlyComparison();
  renderSpendingHeatmap();
}

function renderCatBars(monthTx, monthTotal){
  const cats={food:0,lifestyle:0,fixed:0,cc:0,other:0};
  monthTx.forEach(t=>{ cats[t.cat]=(cats[t.cat]||0)+(t.myShare!=null?t.myShare:t.amount); });
  const maxCat=Math.max(...Object.values(cats),1);
  const catNames={food:'🍜 Food',lifestyle:'🛒 Lifestyle',fixed:'📱 Fixed',cc:'💳 CC',other:'📦 Lainnya'};
  const catColors={food:'var(--green)',lifestyle:'var(--purple)',fixed:'var(--blue)',cc:'var(--amber)',other:'var(--text-dim)'};
  const now=jakartaNow();
  safe('cat-month-label',now.toLocaleDateString('id-ID',{month:'long',year:'numeric'}));
  const catBarsEl=el('cat-bars');
  const entries=Object.entries(cats).filter(([k,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if(catBarsEl) catBarsEl.innerHTML=entries.length?entries.map(([k,v])=>`
    <div class="cat-bar-wrap">
      <div class="cat-bar-label">
        <span class="name">${catNames[k]||k}</span>
        <span class="val">${fmt(v)} <span style="color:var(--text-muted);font-weight:400">(${monthTotal>0?Math.round(v/monthTotal*100):0}%)</span></span>
      </div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(v/maxCat)*100}%;background:${catColors[k]||'var(--blue)'}"></div></div>
    </div>`).join(''):'<div style="color:var(--text-muted);font-size:13px">Belum ada data bulan ini</div>';
  // Always re-render pie chart fresh
  renderPieChart(cats,catNames,catColors);
}

function renderInsights(monthTx, monthTotal, income, piutangAmt, myDebtAmt){
  const items=[];
  const now=jakartaNow();
  const daysElapsed=now.getDate();
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const daysLeft=daysInMonth-daysElapsed;

  if(!monthTx.length){ items.push({dot:'dot-blue',text:'Belum ada data transaksi bulan ini. Yuk mulai catat!'}); }
  else {
    const avgDaily=daysElapsed>0?monthTotal/daysElapsed:0;
    const projected=avgDaily*daysInMonth;

    // Income analysis
    if(income>0){
      const remaining=income-monthTotal;
      const pct=Math.round((monthTotal/income)*100);
      if(remaining<0) items.push({dot:'dot-red',text:`⚠️ Pengeluaran sudah <b>melebihi income</b> ${fmt(-remaining)} (${pct}% dari income). Perlu dikurangi!`});
      else if(pct>80) items.push({dot:'dot-amber',text:`🔴 Sudah pakai <b>${pct}%</b> income. Sisa ${fmt(remaining)} untuk ${daysLeft} hari — rata-rata ${fmt(remaining/Math.max(daysLeft,1))}/hari.`});
      else if(pct>50) items.push({dot:'dot-amber',text:`📊 Sudah pakai <b>${pct}%</b> income bulan ini. Masih aman, sisa ${fmt(remaining)}.`});
      else items.push({dot:'dot-green',text:`✅ Bagus! Baru pakai <b>${pct}%</b> income. Sisa ${fmt(remaining)} untuk ${daysLeft} hari lagi.`});
    }

    // Projected spending
    if(income>0 && daysElapsed>3){
      const projSaving=income-projected;
      items.push({dot:projected>income?'dot-red':'dot-green',text:`📈 Proyeksi pengeluaran akhir bulan: <b>${fmt(Math.round(projected))}</b>. Estimasi tabungan: <b>${fmt(Math.max(0,projSaving))}</b>.`});
    }

    // Avg daily vs benchmark
    if(daysElapsed>0){
      const dailyBudget=income>0?income/daysInMonth:0;
      if(dailyBudget>0){
        const over=avgDaily-dailyBudget;
        if(over>0) items.push({dot:'dot-amber',text:`💸 Rata-rata harian <b>${fmt(avgDaily)}</b> — lebih ${fmt(over)} dari budget harian (${fmt(dailyBudget)}).`});
        else items.push({dot:'dot-blue',text:`📅 Rata-rata harian <b>${fmt(avgDaily)}</b> — masih di bawah budget harian (${fmt(dailyBudget)}).`});
      } else {
        items.push({dot:'dot-blue',text:`📅 Rata-rata pengeluaran harian: <b>${fmt(avgDaily)}</b>.`});
      }
    }

    // Top category
    const cats={};
    monthTx.forEach(t=>{ cats[t.cat]=(cats[t.cat]||0)+(t.myShare!=null?t.myShare:t.amount); });
    const topCat=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
    if(topCat){
      const catNames={food:'Food & Drink',lifestyle:'Lifestyle',fixed:'Fixed Cost',cc:'Credit Card',other:'Lainnya'};
      const pct=Math.round((topCat[1]/monthTotal)*100);
      items.push({dot:pct>50?'dot-amber':'dot-blue',text:`🏆 Pengeluaran terbesar: <b>${catNames[topCat[0]]||topCat[0]}</b> ${fmt(topCat[1])} (${pct}% dari total).`});
    }

    // Weekend vs weekday
    const weekendTx=monthTx.filter(t=>{ const d=parseDateStr(t.date); return d.getDay()===0||d.getDay()===6; });
    const weekdayTx=monthTx.filter(t=>{ const d=parseDateStr(t.date); return d.getDay()>0&&d.getDay()<6; });
    if(weekendTx.length>0&&weekdayTx.length>0){
      const wkndAvg=weekendTx.reduce((s,t)=>s+(t.myShare!=null?t.myShare:t.amount),0)/weekendTx.length;
      const wkdayAvg=weekdayTx.reduce((s,t)=>s+(t.myShare!=null?t.myShare:t.amount),0)/weekdayTx.length;
      if(wkndAvg>wkdayAvg*1.5) items.push({dot:'dot-amber',text:`🎉 Pengeluaran weekend rata-rata <b>${fmt(wkndAvg)}</b>/tx — ${Math.round(wkndAvg/wkdayAvg*100-100)}% lebih tinggi dari weekday.`});
    }

    // Piutang & utang gua
    if(piutangAmt>0) items.push({dot:'dot-teal',text:`🤝 Piutang belum dibayar: <b>${fmt(piutangAmt)}</b>. Jangan lupa nagih!`});
    if(myDebtAmt>0) items.push({dot:'dot-orange',text:`🏧 Utang gua yang belum lunas: <b>${fmt(myDebtAmt)}</b>. Jangan lupa bayar!`});
  }
  const il=el('insight-list');
  if(il) il.innerHTML=items.map(i=>`<div class="insight-item"><span class="dot ${i.dot}"></span><span>${i.text}</span></div>`).join('');
}

function renderRecent(){
  const recent=transactions.slice(0,6);
  const rl=el('recent-list');
  if(!rl) return;
  rl.innerHTML=recent.length?recent.map(t=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:600;font-size:13px">${escHtml(t.desc)}${t.split?'<span class="tag-split">🤝</span>':''}${t.myDebt?'<span class="tag-mydebt">🏧</span>':''}</div>
        <div style="font-size:11px;color:var(--text-muted)">${t.date} · ${t.cat}</div>
      </div>
      <div style="font-weight:700;font-variant-numeric:tabular-nums;color:${t.cat==='income'?'var(--green)':'var(--text)'}">${t.cat==='income'?'+':''}${fmt(t.myShare||t.amount)}</div>
    </div>`).join(''):'<div style="color:var(--text-muted);font-size:13px;padding:16px 0">Belum ada transaksi</div>';
}

// ─── RENDER TRANSAKSI ────────────────────────────────────────────────────────
let currentPeriod = 'all';
let transactionSearchQuery = '';

// Pencarian transaksi bersifat real-time dan tetap mengikuti filter periode/kategori.
// Normalisasi angka membuat "20000", "20.000", dan "Rp 20.000" menemukan nominal yang sama.
function normalizeSearchText(value){
  return String(value == null ? '' : value).toLocaleLowerCase('id-ID').replace(/[^a-z0-9]+/g,'');
}
function onTxSearchInput(input){
  transactionSearchQuery = input ? input.value.trim() : '';
  renderTransaksi();
}
function transactionMatchesSearch(tx, query){
  if(!query) return true;
  const categoryNames={food:'food drink makanan',lifestyle:'lifestyle',fixed:'fixed cost tagihan',cc:'cc credit card',income:'income pemasukan',other:'lainnya'};
  const sourceNames={bni:'bni',bca:'bca',cash:'cash tunai',transfer:'transfer',gopay:'gopay',ovo:'ovo',dana:'dana',shopeepay:'shopeepay',qris:'qris',cc:'credit card kartu kredit'};
  const people=[];
  if(tx.split) tx.split.forEach(p=>people.push(p.name));
  if(tx.myDebt) people.push(tx.myDebt.to);
  const searchable=[
    tx.desc, tx.note, tx.cat, categoryNames[tx.cat], tx.src, sourceNames[tx.src],
    tx.amount, fmt(tx.amount), tx.myShare, fmt(tx.myShare != null ? tx.myShare : tx.amount),
    ...people
  ].map(normalizeSearchText).join(' ');
  return searchable.includes(normalizeSearchText(query));
}
function setFilter(f,btn){
  currentFilter=f;
  document.querySelectorAll('#page-transaksi .filter-bar:nth-of-type(2) .filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderTransaksi();
}
function setPeriod(p,btn){
  currentPeriod=p;
  document.querySelectorAll('#period-filter-bar .filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  const customWrap=el('custom-range-wrap');
  if(customWrap) customWrap.style.display = p==='custom' ? 'block' : 'none';
  if(p==='custom'){
    const from=el('range-from'), to=el('range-to');
    if(from && !from.value) from.value = todayStr();
    if(to && !to.value) to.value = todayStr();
  }
  renderTransaksi();
}
function inPeriod(dateStr){
  if(currentPeriod==='all') return true;
  if(currentPeriod==='today') return isSameDay(dateStr, todayStr());
  if(currentPeriod==='week') return isThisWeek(dateStr);
  if(currentPeriod==='month') return isSameMonth(dateStr);
  if(currentPeriod==='custom'){
    const from=el('range-from'), to=el('range-to');
    const fromVal=from?from.value:'', toVal=to?to.value:'';
    if(!fromVal||!toVal) return true;
    return dateStr>=fromVal && dateStr<=toVal;
  }
  return true;
}
function renderTransaksi(){
  let txs=[...transactions].filter(t=>inPeriod(t.date));
  if(currentFilter==='split') txs=txs.filter(t=>t.split&&t.split.length>0);
  else if(currentFilter==='mydebt') txs=txs.filter(t=>t.myDebt);
  else if(currentFilter!=='all') txs=txs.filter(t=>t.cat===currentFilter||t.src===currentFilter);
  txs=txs.filter(t=>transactionMatchesSearch(t, transactionSearchQuery));

  // Summary calculations (based on filtered txs)
  let sumAmount=0, sumMyShare=0, sumIncome=0, sumExpense=0;
  txs.forEach(t=>{
    const myShare = t.myShare!=null ? t.myShare : t.amount;
    sumAmount += t.amount;
    sumMyShare += myShare;
    if(t.cat==='income') sumIncome += t.amount;
    else if(t.cat!=='cc') sumExpense += myShare;
  });
  safe('tx-sum-amount', fmt(sumAmount));
  safe('tx-sum-count', `${txs.length} transaksi`);
  safe('tx-sum-myshare', fmt(sumMyShare));
  safe('tx-sum-income', fmt(sumIncome));
  safe('tx-sum-expense', fmt(sumExpense));

  const catBadge={food:'badge-food',lifestyle:'badge-lifestyle',fixed:'badge-fixed',cc:'badge-cc',income:'badge-income',other:'badge-other'};
  const tbody=el('tx-tbody'); const tfoot=el('tx-tfoot');
  if(!tbody) return;
  if(!txs.length){
    tbody.innerHTML=`<tr class="empty-row"><td colspan="7">${transactionSearchQuery ? 'Transaksi tidak ditemukan' : 'Tidak ada transaksi di periode ini'}</td></tr>`;
    if(tfoot) tfoot.innerHTML='';
    return;
  }
  tbody.innerHTML=txs.map(t=>{
    const myShare=t.myShare!=null?t.myShare:t.amount;
    return `<tr>
      <td data-label="Tanggal" style="color:var(--text-muted)">${t.date}</td>
      <td data-label="Deskripsi"><span style="font-weight:600">${escHtml(t.desc)}</span>${t.split?'<span class="tag-split">🤝</span>':''}${t.myDebt?'<span class="tag-mydebt">🏧</span>':''}${t.note?`<br><span style="font-size:11px;color:var(--text-muted)">${escHtml(t.note)}</span>`:''}</td>
      <td data-label="Kategori"><span class="badge ${catBadge[t.cat]||''}">${t.cat}</span></td>
      <td data-label="Sumber" style="color:var(--text-muted)">${t.src}</td>
      <td data-label="Nominal" style="text-align:right;font-variant-numeric:tabular-nums;font-weight:700">${fmt(t.amount)}</td>
      <td data-label="Bagian Gua" style="text-align:right;font-variant-numeric:tabular-nums;color:var(--teal);font-weight:700">${fmt(myShare)}</td>
      <td style="white-space:nowrap">
        <button class="del-btn" onclick="openEditTx(${t.id})" title="Edit" style="color:var(--blue)">✏️</button>
        <button class="del-btn" onclick="deleteTransaction(${t.id})" title="Hapus">🗑</button>
      </td>
    </tr>`;
  }).join('');

  // Footer total row
  if(tfoot){
    tfoot.innerHTML = `<tr style="background:var(--card2);font-weight:800">
      <td data-label="" style="color:var(--text-dim)">TOTAL (${txs.length} tx)</td>
      <td></td><td></td><td></td>
      <td data-label="Total Nominal" style="text-align:right;font-variant-numeric:tabular-nums">${fmt(sumAmount)}</td>
      <td data-label="Total Bagian Gua" style="text-align:right;font-variant-numeric:tabular-nums;color:var(--teal)">${fmt(sumMyShare)}</td>
      <td></td>
    </tr>`;
  }
}

// ─── RENDER TABUNGAN ─────────────────────────────────────────────────────────
function renderTabungan(){
  const now=jakartaNow();
  // Exclude CC payment dari spending (sama seperti dashboard)
  const monthTx=transactions.filter(t=>isSameMonth(t.date)&&t.cat!=='income'&&t.cat!=='cc');
  const spent=monthTx.reduce((s,t)=>s+(t.myShare!=null?t.myShare:t.amount),0);
  const income=settings.income||0;
  const savings=income-spent;
  const pct=income>0?Math.max(0,Math.min(100,(savings/income)*100)):0;
  const avg=now.getDate()>0?spent/now.getDate():0;
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const projected=avg*daysInMonth;

  safe('sav-spent',fmt(spent)); safe('sav-avg',fmt(avg));
  safe('savings-pct',Math.round(pct)+'%');
  safe('savings-amount',fmt(Math.max(0,savings)));
  safe('savings-sub',income>0?`dari ${fmt(income)} income`:'Set income dulu');
  const ring=el('savings-ring');
  if(ring) ring.style.strokeDashoffset=377-(pct/100)*377;
  const projEl=el('sav-projection');
  if(projEl) projEl.innerHTML=income>0?`Proyeksi pengeluaran akhir bulan: <strong>${fmt(projected)}</strong>. Estimasi tabungan: <strong style="color:${(income-projected)>=0?'var(--green)':'var(--red)'}">${fmt(income-projected)}</strong> (${Math.round(((income-projected)/income)*100)}% income).`:'Set income di Pengaturan untuk melihat proyeksi.';
}

// ─── RENDER KREDIT ────────────────────────────────────────────────────────────
function renderKredit(){
  const ccTx=transactions.filter(t=>isSameMonth(t.date)&&t.src==='cc');
  const total=ccTx.reduce((s,t)=>s+t.amount,0);
  const limit=settings.cclimit||5000000;
  safe('cc-total',fmt(total));
  const ccBar=el('cc-bar'); if(ccBar) ccBar.style.width=Math.min(100,(total/limit)*100)+'%';
  safe('cc-count',ccTx.length);
  safe('cc-avg-val',ccTx.length>0?fmt(total/ccTx.length):fmt(0));
  const tbody=el('cc-tbody'); if(!tbody) return;
  if(!ccTx.length){ tbody.innerHTML='<tr class="empty-row"><td colspan="3">Belum ada transaksi CC bulan ini</td></tr>'; return; }
  tbody.innerHTML=ccTx.map(t=>`<tr>
    <td style="color:var(--text-muted)">${t.date}</td>
    <td>${escHtml(t.desc)}${t.note?`<br><span style="font-size:11px;color:var(--text-muted)">${escHtml(t.note)}</span>`:''}</td>
    <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${fmt(t.amount)}</td>
  </tr>`).join('');
}

// ─── EDIT TRANSAKSI ──────────────────────────────────────────────────────────
let editTxId = null;
let editSplitPeople = []; // for edit modal
function openEditTx(id){
  const tx = transactions.find(t=>t.id===id);
  if(!tx) return;
  editTxId = id;
  el('etx-date').value = tx.date;
  el('etx-amount').value = tx.amount;
  el('etx-amount-preview').textContent = '= ' + fmt(tx.amount);
  el('etx-desc').value = tx.desc;
  el('etx-cat').value = tx.cat;
  el('etx-src').value = tx.src;
  el('etx-note').value = tx.note || '';

  // Populate split section
  const splitWrap = el('etx-split-wrap');
  if(tx.split && tx.split.length>0){
    splitWrap.style.display='block';
    editSplitPeople = tx.split.map(p=>({name:p.name, amount:p.amount, rawInput:String(p.amount), settled:p.settled, settleMethod:p.settleMethod||'', settleNote:p.settleNote||'', settleDate:p.settleDate||''}));
  } else {
    splitWrap.style.display='none';
    editSplitPeople = [];
  }
  renderEditSplitList();
  refreshEditSplitSummary();

  // Populate mydebt section
  const mydebtWrap = el('etx-mydebt-wrap');
  if(tx.myDebt){
    mydebtWrap.style.display='block';
    el('etx-md-name').value = tx.myDebt.to;
    el('etx-md-amount').value = tx.myDebt.amount;
    el('etx-md-preview').textContent = '= ' + fmt(tx.myDebt.amount);
    el('etx-md-note').value = tx.myDebt.note||'';
  } else {
    mydebtWrap.style.display='none';
  }

  el('edit-tx-modal').classList.add('open');
}

function renderEditSplitList(){
  const list = el('etx-split-list'); if(!list) return;
  list.innerHTML = editSplitPeople.map((p,i)=>`
    <div style="display:grid;grid-template-columns:1fr 130px auto;gap:8px;align-items:center">
      <input type="text" placeholder="Nama" value="${escHtml(p.name)}" style="background:var(--card);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:8px 10px;font-size:13px;font-family:inherit;outline:none"
        oninput="editSplitPeople[${i}].name=this.value"/>
      <input type="text" inputmode="decimal" placeholder="nominal" value="${escHtml(p.rawInput||String(p.amount))}" style="background:var(--card);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:8px 10px;font-size:13px;font-family:inherit;outline:none;font-variant-numeric:tabular-nums"
        oninput="editSplitPeople[${i}].rawInput=this.value;editSplitPeople[${i}].amount=parseShorthand(this.value);refreshEditSplitSummary()"/>
      <button style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:15px;padding:4px 6px;border-radius:4px" onclick="editSplitPeople.splice(${i},1);renderEditSplitList();refreshEditSplitSummary()">✕</button>
    </div>`).join('');
}
function addEditSplitPerson(){
  editSplitPeople.push({name:'',amount:0,rawInput:'',settled:false,settleMethod:'',settleNote:'',settleDate:''});
  renderEditSplitList(); refreshEditSplitSummary();
}
function refreshEditSplitSummary(){
  const sumEl = el('etx-split-summary'); if(!sumEl) return;
  const total = parseShorthand(el('etx-amount').value)||0;
  const others = editSplitPeople.reduce((s,p)=>s+(p.amount||0),0);
  const mine = total - others;
  let html = `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text-dim)">💰 Bagian gua</span><span style="font-weight:700;color:${mine<0?'var(--red)':'var(--green)'}">${fmt(Math.max(0,mine))}</span></div>`;
  editSplitPeople.forEach(p=>{ if(p.name||p.amount) html+=`<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text-dim)">👤 ${escHtml(p.name||'?')}</span><span style="font-weight:700">${fmt(p.amount)}</span></div>`; });
  html+=`<div style="height:1px;background:var(--border);margin:6px 0"></div><div style="display:flex;justify-content:space-between"><span style="font-weight:700">Total</span><span style="font-weight:700">${fmt(total)}</span></div>`;
  sumEl.innerHTML=html;
}
function closeEditTx(){ el('edit-tx-modal').classList.remove('open'); editTxId=null; }
function saveEditTx(){
  if(!editTxId) return;
  const tx = transactions.find(t=>t.id===editTxId);
  if(!tx) return;
  const newAmount = parseShorthand(el('etx-amount').value);
  const newDesc   = el('etx-desc').value.trim();
  const newDate   = el('etx-date').value;
  if(!newDate||!newAmount||!newDesc){ showToast('⚠️ Tanggal, nominal, deskripsi wajib!'); return; }

  tx.date  = newDate;
  tx.amount= newAmount;
  tx.desc  = newDesc;
  tx.cat   = el('etx-cat').value;
  tx.src   = el('etx-src').value;
  tx.note  = el('etx-note').value.trim();

  // Save split edits if section visible
  const splitWrap = el('etx-split-wrap');
  if(splitWrap.style.display!=='none' && editSplitPeople.length>0){
    const valid = editSplitPeople.filter(p=>p.name&&p.amount>0);
    tx.split = valid.map(p=>({name:p.name,amount:p.amount,settled:p.settled||false,settleMethod:p.settleMethod||'',settleNote:p.settleNote||'',settleDate:p.settleDate||''}));
    const othersTotal = tx.split.reduce((s,p)=>s+p.amount,0);
    tx.myShare = newAmount - othersTotal;
  } else if(!tx.split) {
    tx.myShare = newAmount;
  }

  // Save mydebt edits if section visible
  const mydebtWrap = el('etx-mydebt-wrap');
  if(mydebtWrap.style.display!=='none'){
    const mdName = el('etx-md-name').value.trim();
    const mdAmt  = parseShorthand(el('etx-md-amount').value);
    if(mdName && mdAmt>0){
      tx.myDebt = Object.assign(tx.myDebt||{settled:false,settleMethod:'',settleNote:'',settleDate:''}, {to:mdName, amount:mdAmt, note:el('etx-md-note').value.trim()});
    }
  }

  save(); closeEditTx();
  renderTransaksi(); renderDashboard();
  showToast('✅ Transaksi diupdate!');
}

// ─── MOBILE MORE SHEET ───────────────────────────────────────────────────────
function toggleMoreSheet(){
  const sheet=el('more-sheet'), overlay=el('more-sheet-overlay');
  const isOpen = sheet.style.display==='block' && sheet.style.transform==='translateY(0%)';
  if(isOpen){ closeMoreSheet(); } else { openMoreSheet(); }
}
function openMoreSheet(){
  const sheet=el('more-sheet'), overlay=el('more-sheet-overlay');
  overlay.style.display='block'; sheet.style.display='block';
  requestAnimationFrame(()=>{ sheet.style.transform='translateY(0%)'; });
  el('mob-more-btn').classList.add('active');
}
function closeMoreSheet(){
  const sheet=el('more-sheet'), overlay=el('more-sheet-overlay');
  sheet.style.transform='translateY(100%)';
  setTimeout(()=>{ sheet.style.display='none'; overlay.style.display='none'; },280);
  el('mob-more-btn').classList.remove('active');
}
function showPageFromSheet(id){
  closeMoreSheet();
  setTimeout(()=>showPage(id, null), 100);
}

// ─── SHORTHAND AMOUNT PARSER ──────────────────────────────────────────────────
// 17 → 17000 | 15.5 → 15500 | 150 → 150000 | 1.5jt → 1500000 | 17500 → 17500
function parseShorthand(raw){
  if(!raw) return 0;
  const s = String(raw).trim().toLowerCase().replace(/[,\s]/g,'');
  // explicit jt/juta/k/rb suffix
  if(/jt|juta/.test(s)) return Math.round(parseFloat(s)*1e6);
  if(/rb|ribu|k/.test(s)) return Math.round(parseFloat(s)*1e3);
  const n = parseFloat(s);
  if(isNaN(n)||n<=0) return 0;
  // if already looks like full rupiah (>= 1000 or has no decimal), keep as-is
  // if < 1000 and has no decimal → assume ribuan (e.g. 17 → 17000)
  // if < 1000 and HAS decimal → assume ribuan with fractional (e.g. 15.5 → 15500)
  if(n < 1000) return Math.round(n * 1000);
  return Math.round(n);
}

function onAmountInput(inp){
  const val = parseShorthand(inp.value);
  const preview = el('f-amount-preview');
  if(preview){
    if(val>0 && inp.value.trim()!=='') preview.textContent = '= ' + fmt(val);
    else preview.textContent = '';
  }
  updateSplitSummary();
}

// ─── LAPORAN BULANAN (PDF/PNG REPORT) ────────────────────────────────────────
function getMonthRange(ym){
  // ym = "2026-06"
  const [y,m] = ym.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2,'0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  return {start, end, y, m, lastDay};
}

function monthNameID(y,m){
  return new Date(y, m-1, 1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
}

// Simulasi: berapa lama (tahun & bulan) sampai net worth + investasi rutin mencapai target financial freedom
// targetFF = 25x pengeluaran tahunan (Rule of 25)
// Pakai compound interest bulanan: FV = PV(1+r)^n + PMT * (((1+r)^n - 1) / r)
function simulateFinancialFreedom(startingCapital, monthlyContribution, annualRate, targetFF){
  if(targetFF<=0) return null;
  if(startingCapital >= targetFF) return {months:0, years:0, remMonths:0};
  if(monthlyContribution<=0 && annualRate<=0) return null; // ga akan pernah nyampe

  const r = annualRate/12; // monthly rate
  let balance = startingCapital;
  let months = 0;
  const maxMonths = 1200; // cap 100 tahun biar ga infinite loop

  while(balance < targetFF && months < maxMonths){
    balance = balance*(1+r) + monthlyContribution;
    months++;
  }
  if(months>=maxMonths) return null;
  return {months, years:Math.floor(months/12), remMonths:months%12};
}

async function generateReport(type){
  const statusEl = el('report-status');
  const ymInput = el('report-month').value;
  if(!ymInput){ showToast('⚠️ Pilih bulan dulu!'); return; }
  if(typeof html2canvas==='undefined'){ showToast('⚠️ Library belum siap, coba lagi sebentar'); return; }

  statusEl.style.display='block'; statusEl.style.color='var(--text-muted)';
  statusEl.textContent='⏳ Membuat laporan...';

  const {start, end, y, m} = getMonthRange(ymInput);
  const monthLabel = monthNameID(y,m);

  // Filter transactions for the month
  const monthTx = transactions.filter(t=>t.date>=start && t.date<=end);
  const spendTx = monthTx.filter(t=>t.cat!=='income' && t.cat!=='cc');
  const incomeTx = monthTx.filter(t=>t.cat==='income');

  const sumMyShare = arr => arr.reduce((s,t)=>s+(t.myShare!=null?t.myShare:t.amount),0);
  const totalSpend = sumMyShare(spendTx);
  const totalIncome = incomeTx.reduce((s,t)=>s+t.amount,0);
  const netSavings = totalIncome - totalSpend;
  const incomeForRatio = totalIncome>0 ? totalIncome : (settings.income||0);
  const savingsPct = incomeForRatio>0 ? Math.round((netSavings/incomeForRatio)*100) : null;

  // ─── Rata-rata tabungan bulanan (3 bulan terakhir, supaya lebih representatif) ─
  let avgMonthlySavings = netSavings;
  let avgMonthsUsed = 1;
  {
    const histMonths = [];
    for(let i=0;i<3;i++){
      const dt = new Date(y, m-1-i, 1);
      const ky = dt.getFullYear(), km = dt.getMonth()+1;
      const {start:hs, end:he} = getMonthRange(`${ky}-${String(km).padStart(2,'0')}`);
      const hTx = transactions.filter(t=>t.date>=hs && t.date<=he);
      const hSpend = sumMyShare(hTx.filter(t=>t.cat!=='income'&&t.cat!=='cc'));
      const hIncome = hTx.filter(t=>t.cat==='income').reduce((s,t)=>s+t.amount,0);
      if(hTx.length>0) histMonths.push(hIncome - hSpend);
    }
    if(histMonths.length>0){
      avgMonthlySavings = histMonths.reduce((s,v)=>s+v,0)/histMonths.length;
      avgMonthsUsed = histMonths.length;
    }
  }

  // Category breakdown
  const cats={food:0,lifestyle:0,fixed:0,cc:0,other:0};
  spendTx.forEach(t=>{ cats[t.cat]=(cats[t.cat]||0)+(t.myShare!=null?t.myShare:t.amount); });
  const catNames={food:'🍜 Food & Drink',lifestyle:'🛒 Lifestyle',fixed:'📱 Fixed Cost',cc:'💳 CC',other:'📦 Lainnya'};
  const catColors={food:'#10B981',lifestyle:'#8B5CF6',fixed:'#3B82F6',cc:'#F59E0B',other:'#64748B'};
  const catEntries = Object.entries(cats).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const topCat = catEntries[0] || null;

  // Piutang & utang gua summary (as of report time)
  let piutangAmt=0, myDebtAmt=0;
  transactions.forEach(tx=>{
    if(tx.split) tx.split.forEach(p=>{ if(!p.settled) piutangAmt+=p.amount; });
    if(tx.myDebt && !tx.myDebt.settled) myDebtAmt+=tx.myDebt.amount;
  });

  // Net worth snapshot
  let totalAset=0, totalLiab=0, totalLancar=0, totalInvestasi=0;
  assets.forEach(a=>{
    const v=getCurrentValue(a);
    const type=ASSET_TYPE[a.cat];
    if(type==='liabilitas') totalLiab+=v;
    else { totalAset+=v; if(type==='lancar') totalLancar+=v; if(type==='investasi') totalInvestasi+=v; }
  });
  const netWorth = totalAset - totalLiab;

  // ─── Simulasi Financial Freedom ───────────────────────────────────────────
  // Target FF = 25x pengeluaran TAHUNAN (Rule of 25), pakai pengeluaran bulan ini sbg basis
  const annualExpense = totalSpend * 12;
  const targetFF = annualExpense * 25;
  const DEPOSITO_RATE = 0.04; // 4%/tahun deposito
  const MONEY_MARKET_RATE = 0.06; // 6%/tahun reksa dana pasar uang
  const contribution = Math.max(0, avgMonthlySavings);

  const simDeposito = annualExpense>0 ? simulateFinancialFreedom(Math.max(0,netWorth), contribution, DEPOSITO_RATE, targetFF) : null;
  const simMoneyMarket = annualExpense>0 ? simulateFinancialFreedom(Math.max(0,netWorth), contribution, MONEY_MARKET_RATE, targetFF) : null;

  // Daily trend for the month — cap at today kalau bulan berjalan
  const dailyLabels=[], dailyData=[];
  const {lastDay} = getMonthRange(ymInput);
  const todayDate = todayStr();
  const isCurrentMonth = todayDate.slice(0,7) === ymInput;
  const maxDay = isCurrentMonth ? parseInt(todayDate.slice(8,10)) : lastDay;

  // Proyeksi pengeluaran sampai akhir bulan (hanya relevan kalau bulan berjalan)
  const projectedSpend = isCurrentMonth && maxDay > 0
    ? Math.round((totalSpend / maxDay) * lastDay)
    : null;
  for(let day=1;day<=maxDay;day++){
    const ds=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    dailyLabels.push(day);
    dailyData.push(spendTx.filter(t=>t.date===ds).reduce((s,t)=>s+(t.myShare!=null?t.myShare:t.amount),0));
  }

  // Top 5 transactions
  const topTx = [...spendTx].sort((a,b)=>(b.myShare||b.amount)-(a.myShare||a.amount)).slice(0,5);

  // Build report HTML off-screen
  const reportEl = buildReportElement({
    monthLabel, totalSpend, totalIncome, netSavings, savingsPct,
    catEntries, catNames, catColors, topCat, piutangAmt, myDebtAmt,
    totalAset, totalLiab, totalLancar, totalInvestasi, netWorth,
    dailyLabels, dailyData, topTx, spendTxCount: spendTx.length,
    avgMonthlySavings, avgMonthsUsed, contribution,
    annualExpense, targetFF, simDeposito, simMoneyMarket,
    income: settings.income||0, projectedSpend, isCurrentMonth, lastDay, maxDay
  });
  document.body.appendChild(reportEl);

  // Render chart inside report
  await new Promise(r=>setTimeout(r, 50)); // let DOM paint
  const chartCanvas = reportEl.querySelector('#report-trend-chart');
  let reportChart = null;
  if(chartCanvas && dailyData.some(v=>v>0)){
    const nonZero = dailyData.map((v,i)=>({v,i})).filter(x=>x.v>0);
    const maxIdx = nonZero.length ? nonZero.reduce((a,b)=>b.v>a.v?b:a).i : -1;
    const minIdx = nonZero.length > 1 ? nonZero.reduce((a,b)=>b.v<a.v?b:a).i : -1;
    const fmtShort = v => v>=1000000?'Rp'+(v/1000000).toFixed(1)+'jt':v>=1000?'Rp'+Math.round(v/1000)+'k':'Rp'+v;

    const peakLabelPlugin = {
      id:'peakLabels',
      afterDatasetsDraw(chart){
        const {ctx:c} = chart;
        const meta = chart.getDatasetMeta(0);
        [maxIdx, minIdx].forEach(idx=>{
          if(idx<0) return;
          const pt = meta.data[idx]; if(!pt) return;
          const val = dailyData[idx];
          const isMax = idx===maxIdx;
          const color = isMax ? '#DC2626' : '#059669';
          const label = fmtShort(val);
          c.save();
          c.font = 'bold 10px Inter,sans-serif';
          c.textAlign = 'center';
          const tw = c.measureText(label).width;
          const pw = tw+10, ph = 16;
          const px = Math.min(Math.max(pt.x - pw/2, 2), chart.width - pw - 2);
          const py = isMax ? pt.y - ph - 6 : pt.y + 6;
          c.fillStyle = color;
          c.beginPath(); c.roundRect(px, py, pw, ph, 4); c.fill();
          c.fillStyle = '#fff'; c.textBaseline = 'middle';
          c.fillText(label, px+pw/2, py+ph/2);
          c.beginPath(); c.arc(pt.x, pt.y, 5, 0, Math.PI*2);
          c.fillStyle = color; c.fill();
          c.restore();
        });
      }
    };

    reportChart = new Chart(chartCanvas.getContext('2d'), {
      type:'line',
      plugins:[peakLabelPlugin],
      data:{labels:dailyLabels,datasets:[{data:dailyData,borderColor:'#2563EB',backgroundColor:'rgba(37,99,235,.10)',tension:.3,fill:true,pointRadius:0}]},
      options:{responsive:false,animation:false,layout:{padding:{top:30,bottom:4}},plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#94A3B8',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#94A3B8',font:{size:9},callback:v=>v>=1000?Math.round(v/1000)+'k':v},grid:{color:'#E2E8F0'}}}}
    });
    await new Promise(r=>setTimeout(r, 200)); // wait for chart render
  }

  try{
    // A4 @ 96dpi ≈ 794 x 1123 px. We render at width 794px, scale x2 for sharpness.
    const canvas = await html2canvas(reportEl, {backgroundColor:'#FFFFFF', scale:2, width:794, windowWidth:794});
    const fname = `Laporan_Cashflow_${ymInput}`;

    if(type==='png'){
      const link=document.createElement('a');
      link.download = fname+'.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      statusEl.style.color='var(--green)';
      statusEl.textContent='✅ Laporan PNG berhasil didownload!';
      showToast('✅ Laporan PNG didownload!');
    } else {
      const { jsPDF } = window.jspdf;
      const imgData = canvas.toDataURL('image/png');
      const a4w = 210, a4h = 297; // mm
      const pxToMm = a4w / canvas.width; // konversi px->mm berdasarkan lebar A4
      const imgHmm = canvas.height * pxToMm;

      const pdf = new jsPDF({orientation:'p', unit:'mm', format:'a4'});

      if(imgHmm <= a4h){
        // Fits on one page
        pdf.addImage(imgData, 'PNG', 0, 0, a4w, imgHmm);
      } else {
        // Split into multiple A4 pages by slicing the canvas
        const pageHeightPx = Math.floor(a4h / pxToMm); // height in px per page
        let renderedHeight = 0;
        let first = true;
        while(renderedHeight < canvas.height){
          const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight);
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceHeight;
          const ctx = pageCanvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0,0,pageCanvas.width,pageCanvas.height);
          ctx.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
          const sliceData = pageCanvas.toDataURL('image/png');
          const sliceHmm = sliceHeight * pxToMm;
          if(!first) pdf.addPage();
          pdf.addImage(sliceData, 'PNG', 0, 0, a4w, sliceHmm);
          renderedHeight += sliceHeight;
          first = false;
        }
      }
      pdf.save(fname+'.pdf');
      statusEl.style.color='var(--green)';
      statusEl.textContent='✅ Laporan PDF berhasil didownload!';
      showToast('✅ Laporan PDF didownload!');
    }
  } catch(err){
    statusEl.style.color='var(--red)';
    statusEl.textContent='❌ Gagal membuat laporan: '+err.message;
    showToast('❌ Gagal membuat laporan');
  } finally {
    if(reportChart) reportChart.destroy();
    reportEl.remove();
  }
}

function buildReportElement(d){
  const wrap = document.createElement('div');
  wrap.style.position='fixed';
  wrap.style.left='-9999px';
  wrap.style.top='0';
  wrap.style.width='794px';
  wrap.style.padding='40px';
  wrap.style.background='#FFFFFF';
  wrap.style.fontFamily="'Inter',sans-serif";
  wrap.style.color='#1E293B';
  wrap.style.boxSizing='border-box';

  // ── Palette (light theme) ──
  const C = {
    text:'#1E293B', textDim:'#64748B', textMuted:'#94A3B8',
    border:'#E2E8F0', cardBg:'#F8FAFC',
    blue:'#2563EB', green:'#059669', red:'#DC2626', amber:'#D97706',
    purple:'#7C3AED', teal:'#0D9488', orange:'#EA580C'
  };

  const maxCat = Math.max(...d.catEntries.map(([,v])=>v), 1);
  const catBarsHtml = d.catEntries.map(([k,v])=>`
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:${C.textDim}">${d.catNames[k]}</span>
        <span style="font-weight:700">${fmt(v)} <span style="color:${C.textMuted};font-weight:400">(${d.totalSpend>0?Math.round(v/d.totalSpend*100):0}%)</span></span>
      </div>
      <div style="height:8px;background:${C.border};border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${(v/maxCat)*100}%;background:${d.catColors[k]};border-radius:99px"></div>
      </div>
    </div>`).join('') || `<div style="color:${C.textMuted};font-size:13px">Tidak ada pengeluaran bulan ini</div>`;

  const topTxHtml = d.topTx.length ? d.topTx.map((t,i)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid ${C.border};font-size:12px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:20px;height:20px;background:${C.border};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${C.textDim}">${i+1}</span>
        <div>
          <div style="font-weight:600">${escHtml(t.desc)}</div>
          <div style="color:${C.textMuted};font-size:10px">${t.date} · ${t.cat}</div>
        </div>
      </div>
      <div style="font-weight:700;font-variant-numeric:tabular-nums">${fmt(t.myShare!=null?t.myShare:t.amount)}</div>
    </div>`).join('') : `<div style="color:${C.textMuted};font-size:13px">Tidak ada transaksi</div>`;

  // ─── NARASI / INSIGHT TULISAN ──────────────────────────────────────────────
  const insights = [];

  // 1. Ringkasan umum
  if(d.totalIncome>0){
    if(d.netSavings>=0){
      insights.push(`Bulan ${d.monthLabel}, pemasukan tercatat <b>${fmt(d.totalIncome)}</b> dengan total pengeluaran <b>${fmt(d.totalSpend)}</b>. Hasilnya, ada sisa tabungan sebesar <b>${fmt(d.netSavings)}</b>${d.savingsPct!==null?` atau setara <b>${d.savingsPct}%</b> dari pemasukan`:''}.`);
    } else {
      insights.push(`Bulan ${d.monthLabel}, pengeluaran <b>${fmt(d.totalSpend)}</b> melebihi pemasukan <b>${fmt(d.totalIncome)}</b> sebesar <b>${fmt(Math.abs(d.netSavings))}</b>. Perlu evaluasi pos pengeluaran agar tidak defisit bulan depan.`);
    }
  } else {
    insights.push(`Bulan ${d.monthLabel} tercatat total pengeluaran <b>${fmt(d.totalSpend)}</b> dari ${d.spendTxCount} transaksi, namun belum ada pemasukan yang tercatat di bulan ini.`);
  }

  // 2. Kategori terbesar
  if(d.topCat){
    const [catKey, catVal] = d.topCat;
    const pct = d.totalSpend>0 ? Math.round(catVal/d.totalSpend*100) : 0;
    insights.push(`Pos pengeluaran terbesar adalah <b>${d.catNames[catKey]}</b> sebesar <b>${fmt(catVal)}</b> (${pct}% dari total pengeluaran bulan ini).`);
  }

  // 3. Rata-rata tabungan & instrumen
  if(d.avgMonthsUsed>0){
    const periodLabel = d.avgMonthsUsed===1 ? 'bulan ini' : `${d.avgMonthsUsed} bulan terakhir`;
    if(d.avgMonthlySavings>0){
      insights.push(`Rata-rata kamu bisa menabung <b>${fmt(d.avgMonthlySavings)}</b> per bulan (berdasarkan ${periodLabel}). Jika rutin disisihkan, dalam setahun potensi tabungan tambahan sekitar <b>${fmt(d.avgMonthlySavings*12)}</b>.`);
    } else if(d.avgMonthlySavings<0){
      insights.push(`Rata-rata ${periodLabel}, pengeluaran lebih besar dari pemasukan sekitar <b>${fmt(Math.abs(d.avgMonthlySavings))}</b> per bulan. Disarankan untuk mulai membuat anggaran (budget) bulanan agar arus kas kembali positif.`);
    }
  }

  // 4. Piutang & utang reminder
  if(d.piutangAmt>0) insights.push(`Masih ada piutang (uang orang lain ke kamu) sebesar <b>${fmt(d.piutangAmt)}</b> yang belum dibayar — jangan lupa untuk menagih.`);
  if(d.myDebtAmt>0) insights.push(`Kamu masih memiliki utang ke pihak lain sebesar <b>${fmt(d.myDebtAmt)}</b> yang belum dilunasi.`);

  const insightsHtml = insights.map(t=>`
    <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid ${C.border};font-size:12.5px;line-height:1.6">
      <span style="color:${C.blue};font-weight:700;flex-shrink:0">●</span>
      <span>${t}</span>
    </div>`).join('');

  // ─── FINANCIAL FREEDOM SECTION ─────────────────────────────────────────────
  const ffRows = [];
  if(d.annualExpense>0){
    const fmtSim = sim => {
      if(!sim) return '<span style="color:'+C.textMuted+'">Belum dapat diproyeksikan (kontribusi bulanan ≤ 0)</span>';
      if(sim.months===0) return '<b style="color:'+C.green+'">Sudah tercapai! 🎉</b>';
      const yLabel = sim.years>0 ? `${sim.years} tahun` : '';
      const mLabel = sim.remMonths>0 ? `${sim.remMonths} bulan` : '';
      const combined = [yLabel,mLabel].filter(Boolean).join(' ');
      const targetDate = jakartaNow(); targetDate.setMonth(targetDate.getMonth()+sim.months);
      return `<b>${combined}</b> <span style="color:${C.textMuted}">(≈ ${targetDate.toLocaleDateString('id-ID',{month:'long',year:'numeric'})})</span>`;
    };

    ffRows.push(`
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid ${C.border};font-size:12.5px">
        <span style="color:${C.textDim}">🏦 Deposito (asumsi +4%/tahun)</span>
        <span>${fmtSim(d.simDeposito)}</span>
      </div>`);
    ffRows.push(`
      <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:12.5px">
        <span style="color:${C.textDim}">📊 Reksa Dana Pasar Uang (asumsi +6%/tahun)</span>
        <span>${fmtSim(d.simMoneyMarket)}</span>
      </div>`);
  }

  const ffSectionHtml = d.annualExpense>0 ? `
    <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:14px;padding:18px;margin-bottom:20px;page-break-inside:avoid">
      <div style="font-size:12px;font-weight:700;color:${C.textDim};letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px">🎯 Proyeksi Financial Freedom</div>
      <div style="font-size:12px;color:${C.textMuted};margin-bottom:14px;line-height:1.6">
        Target dihitung dengan <b>Rule of 25</b>: 25× pengeluaran tahunan (berdasarkan pengeluaran bulan ini ${fmt(d.totalSpend)}/bulan ≈ ${fmt(d.annualExpense)}/tahun).
        Target dana: <b>${fmt(d.targetFF)}</b>. Modal awal (net worth saat ini): <b>${fmt(Math.max(0,d.netWorth))}</b>.
        Kontribusi rutin per bulan: <b>${fmt(d.contribution)}</b> (rata-rata tabungan ${d.avgMonthsUsed} bulan terakhir).
      </div>
      ${ffRows.join('')}
    </div>` : '';

  wrap.innerHTML = `
    <!-- HEADER -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid ${C.blue};padding-bottom:18px">
      <div>
        <div style="font-size:11px;font-weight:700;color:${C.blue};letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">💰 Cashflow — Laporan Keuangan Bulanan</div>
        <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;color:${C.text}">${d.monthLabel}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:${C.textMuted}">
        Dibuat: ${jakartaNow().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}<br>
        ${escHtml(settings.name||'Personal Finance')}
      </div>
    </div>

    <!-- SUMMARY CARDS -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
      <div style="background:${C.cardBg};border:1px solid ${C.border};border-left:3px solid ${C.red};border-radius:10px;padding:14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.textMuted};margin-bottom:6px">Pengeluaran</div>
        <div style="font-size:17px;font-weight:800;color:${C.red}">${fmt(d.totalSpend)}</div>
        <div style="font-size:10px;color:${C.textMuted};margin-top:2px">${d.spendTxCount} transaksi</div>
      </div>
      <div style="background:${C.cardBg};border:1px solid ${C.border};border-left:3px solid ${C.green};border-radius:10px;padding:14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.textMuted};margin-bottom:6px">Income</div>
        <div style="font-size:17px;font-weight:800;color:${C.green}">${fmt(d.totalIncome)}</div>
        <div style="font-size:10px;color:${C.textMuted};margin-top:2px">tercatat bulan ini</div>
      </div>
      <div style="background:${C.cardBg};border:1px solid ${C.border};border-left:3px solid ${C.amber};border-radius:10px;padding:14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.textMuted};margin-bottom:6px">Proyeksi Akhir Bulan</div>
        <div style="font-size:17px;font-weight:800;color:${C.amber}">${d.projectedSpend!=null ? fmt(d.projectedSpend) : fmt(d.totalSpend)}</div>
        <div style="font-size:10px;color:${C.textMuted};margin-top:2px">${d.projectedSpend!=null ? `hari ke-${d.maxDay} dari ${d.lastDay}` : 'pengeluaran final'}</div>
      </div>
      <div style="background:${C.cardBg};border:1px solid ${C.border};border-left:3px solid ${C.blue};border-radius:10px;padding:14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.textMuted};margin-bottom:6px">Net Worth</div>
        <div style="font-size:17px;font-weight:800;color:${C.blue}">${fmt(d.netWorth)}</div>
        <div style="font-size:10px;color:${C.textMuted};margin-top:2px">aset - liabilitas</div>
      </div>
    </div>

    <!-- NARASI / INSIGHTS -->
    <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:14px;padding:16px 18px;margin-bottom:20px;page-break-inside:avoid">
      <div style="font-size:12px;font-weight:700;color:${C.textDim};letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px">📝 Ringkasan & Analisis</div>
      ${insightsHtml}
    </div>

    <!-- TREND CHART -->
    <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:14px;padding:16px;margin-bottom:20px;page-break-inside:avoid">
      <div style="font-size:12px;font-weight:700;color:${C.textDim};letter-spacing:.05em;text-transform:uppercase;margin-bottom:12px">Tren Pengeluaran Harian</div>
      <canvas id="report-trend-chart" width="700" height="200"></canvas>
    </div>

    <!-- 2 COL: CATEGORY + TOP TX -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
      <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:14px;padding:16px;page-break-inside:avoid">
        <div style="font-size:12px;font-weight:700;color:${C.textDim};letter-spacing:.05em;text-transform:uppercase;margin-bottom:12px">Breakdown Kategori</div>
        ${catBarsHtml}
      </div>
      <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:14px;padding:16px;page-break-inside:avoid">
        <div style="font-size:12px;font-weight:700;color:${C.textDim};letter-spacing:.05em;text-transform:uppercase;margin-bottom:12px">Top 5 Pengeluaran Terbesar</div>
        ${topTxHtml}
      </div>
    </div>

    <!-- PIUTANG / UTANG / ASET BREAKDOWN -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
      <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:10px;padding:12px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.textMuted};margin-bottom:6px">🤝 Piutang Aktif</div>
        <div style="font-size:15px;font-weight:800;color:${C.teal}">${fmt(d.piutangAmt)}</div>
      </div>
      <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:10px;padding:12px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.textMuted};margin-bottom:6px">🏧 Utang Gua Aktif</div>
        <div style="font-size:15px;font-weight:800;color:${C.orange}">${fmt(d.myDebtAmt)}</div>
      </div>
      <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:10px;padding:12px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.textMuted};margin-bottom:6px">💎 Total Aset</div>
        <div style="font-size:15px;font-weight:800;color:${C.green}">${fmt(d.totalAset)}</div>
      </div>
    </div>

    <!-- FINANCIAL FREEDOM -->
    ${ffSectionHtml}

    <!-- FOOTER -->
    <div style="text-align:center;font-size:10px;color:${C.textMuted};padding-top:14px;border-top:1px solid ${C.border}">
      Generated by Cashflow — Personal Finance Tracker · ${escHtml(settings.name||'')}
    </div>
  `;
  return wrap;
}

// ─── HELPER ───────────────────────────────────────────────────────────────────
function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', ()=>{
  const fd=el('f-date'); if(fd) fd.value=todayStr();
  const ud=el('ud-date'); if(ud) ud.value=todayStr();
  const rm=el('report-month'); if(rm) rm.value=todayStr().slice(0,7);
  // close modals on overlay click
  ['edit-tx-modal','edit-piutang-modal','edit-mydebt-modal','settings-modal','settle-modal','asset-modal'].forEach(id=>{
    const overlay=el(id);
    if(overlay) overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.classList.remove('open'); });
  });
  renderDashboard();
});

