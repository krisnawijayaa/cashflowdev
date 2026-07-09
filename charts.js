// ─── WIDGET: SAVINGS RATE ────────────────────────────────────────────────────
function renderSavingsRate(monthTotal, income){
  const inc = income || 0;
  if(inc <= 0){
    safe('sr-pct','—'); safe('sr-label','Set income dulu'); safe('sr-emoji','💡');
    safe('sr-sub','Tambahkan income bulanan di Pengaturan');
    return;
  }
  const savings = inc - monthTotal;
  const rate = Math.round((savings / inc) * 100);
  const clamped = Math.max(0, Math.min(100, rate));
  let emoji, label, color;
  if(rate < 20){     emoji='🔴'; label='Perlu ditingkatkan'; color='var(--red)'; }
  else if(rate < 50){ emoji='🟡'; label='Cukup baik'; color='var(--amber)'; }
  else {             emoji='🟢'; label='Sangat tinggi!'; color='var(--green)'; }

  safe('sr-pct', rate+'%');
  safe('sr-emoji', emoji);
  safe('sr-label', label);
  safe('sr-sub', `Nabung ${fmt(Math.max(0,savings))} dari ${fmt(inc)} income`);
  const pctEl=el('sr-pct'); if(pctEl) pctEl.style.color=color;
  const labelEl=el('sr-label'); if(labelEl) labelEl.style.color=color;
  const bar=el('sr-bar');
  if(bar){ bar.style.width=clamped+'%'; bar.style.background=color; }
}

// ─── WIDGET: CASHFLOW FORECAST ───────────────────────────────────────────────
function renderCashflowForecast(monthTotal, income){
  const now = jakartaNow();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  if(daysElapsed === 0){ safe('cf-projected','—'); return; }

  const avgDaily = monthTotal / daysElapsed;
  const projected = Math.round(avgDaily * daysInMonth);
  const inc = income || 0;

  let statusText, dotColor, barColor;
  if(inc <= 0){
    statusText = '📊 Proyeksi saja'; dotColor='var(--text-muted)'; barColor='var(--blue)';
  } else {
    const ratio = projected / inc;
    if(ratio <= 0.7){      statusText='🟢 On Track';              dotColor='var(--green)'; barColor='var(--green)'; }
    else if(ratio <= 0.9){ statusText='🟡 Mendekati Budget';      dotColor='var(--amber)'; barColor='var(--amber)'; }
    else {                 statusText='🔴 Potensi Overbudget';     dotColor='var(--red)';   barColor='var(--red)'; }
  }

  safe('cf-projected', fmt(projected));
  safe('cf-status-text', statusText);
  safe('cf-projected-sub', `Proyeksi akhir bulan · hari ke-${daysElapsed}/${daysInMonth}`);

  const dot=el('cf-status-dot'); if(dot) dot.style.background=dotColor;
  const bar=el('cf-bar');
  if(bar){
    const pct = inc>0 ? Math.min(100, (projected/inc)*100) : Math.min(100,(projected/(projected||1))*100);
    bar.style.width=pct+'%'; bar.style.background=barColor;
  }
  safe('cf-bar-label', inc>0 ? `${Math.round((projected/inc)*100)}% dari income bulanan (${fmt(inc)})` : 'Set income untuk melihat status');
}

// ─── WIDGET: NET WORTH GROWTH ────────────────────────────────────────────────
let nwgChart = null;
function renderNetWorthGrowth(){
  // Hitung net worth per 6 bulan terakhir
  const now = jakartaNow();
  const labels=[], data=[];
  for(let i=5;i>=0;i--){
    const dt = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const ky=dt.getFullYear(), km=dt.getMonth()+1;
    const ys=String(km).padStart(2,'0');
    labels.push(dt.toLocaleDateString('id-ID',{month:'short'}));

    // Estimasi aset per bulan: pakai getCurrentValue tapi hitung depreciation pada waktu itu
    let aset=0, liab=0;
    assets.forEach(a=>{
      const monthsAgo = i; // how many months ago
      const v = getCurrentValue(a); // current value
      // Approximate past value by reversing compound rate
      const rate = DEPR_RATES[a.cat]||0;
      const pastV = rate!==0 ? v / Math.pow(1+rate, monthsAgo/12) : v;
      if(ASSET_TYPE[a.cat]==='liabilitas') liab+=pastV; else aset+=pastV;
    });
    data.push(Math.round(aset-liab));
  }

  const currentNW = data[data.length-1];
  const prevNW = data[data.length-2] || 0;
  const growthPct = prevNW!==0 ? Math.round(((currentNW-prevNW)/Math.abs(prevNW))*100) : null;

  safe('nwg-value', fmt(currentNW));
  safe('nwg-sub', 'net worth saat ini');
  const badge=el('nwg-badge');
  if(badge && growthPct!==null){
    badge.textContent=(growthPct>=0?'▲ +':'▼ ')+growthPct+'% vs bln lalu';
    badge.style.background = growthPct>=0?'var(--green-dim)':'var(--red-dim)';
    badge.style.color = growthPct>=0?'var(--green)':'var(--red)';
  }

  const canvas=el('nwgChart'); if(!canvas) return;
  if(nwgChart){ nwgChart.destroy(); nwgChart=null; }
  const color = currentNW>=0?'#10B981':'#EF4444';
  nwgChart = new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{labels,datasets:[{data,backgroundColor:data.map(v=>v>=0?'rgba(16,185,129,.25)':'rgba(239,68,68,.25)'),borderColor:data.map(v=>v>=0?'#10B981':'#EF4444'),borderWidth:2,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:600},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.raw)}}},scales:{x:{ticks:{color:'#64748B',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#64748B',font:{size:9},callback:v=>v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?Math.round(v/1000)+'k':v},grid:{color:'rgba(30,45,74,.5)'}}}}
  });
}

// ─── WIDGET: MONTHLY COMPARISON ──────────────────────────────────────────────
function renderMonthlyComparison(){
  const now = jakartaNow();
  const getMonthSpend = (y, m) => {
    const ys = String(m).padStart(2,'0');
    const start=`${y}-${ys}-01`, end=`${y}-${ys}-${new Date(y,m,0).getDate()}`;
    const txs = transactions.filter(t=>t.date>=start&&t.date<=end&&t.cat!=='income'&&t.cat!=='cc');
    const cats={food:0,lifestyle:0,fixed:0,other:0};
    txs.forEach(t=>{ cats[t.cat]=(cats[t.cat]||0)+(t.myShare!=null?t.myShare:t.amount); });
    return cats;
  };

  const curM = now.getMonth()+1, curY = now.getFullYear();
  const prevDt = new Date(curY, curM-2, 1);
  const prevM = prevDt.getMonth()+1, prevY = prevDt.getFullYear();

  const cur = getMonthSpend(curY, curM);
  const prev = getMonthSpend(prevY, prevM);
  const catNames={food:'🍜 Food & Drink',lifestyle:'🛒 Lifestyle',fixed:'📱 Fixed Cost',other:'📦 Lainnya'};
  const catColors={food:'var(--green)',lifestyle:'var(--purple)',fixed:'var(--blue)',other:'var(--text-muted)'};

  const curLabel = now.toLocaleDateString('id-ID',{month:'short'});
  const prevLabel = prevDt.toLocaleDateString('id-ID',{month:'short'});
  safe('mc-label', `${prevLabel} → ${curLabel}`);

  const listEl = el('mc-list'); if(!listEl) return;
  const rows = Object.entries(catNames).map(([k,name])=>{
    const c=cur[k]||0, p=prev[k]||0;
    const diff = p>0 ? Math.round(((c-p)/p)*100) : null;
    const arrow = diff===null?'—':diff>0?`▲ +${diff}%`:`▼ ${diff}%`;
    const color = diff===null?'var(--text-muted)':diff>0?'var(--red)':'var(--green)';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:${catColors[k]};flex-shrink:0"></div>
        <span style="color:var(--text-dim)">${name}</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="color:var(--text-muted);font-size:12px">${fmt(c)}</span>
        <span style="font-weight:700;font-size:12px;color:${color};min-width:60px;text-align:right">${arrow}</span>
      </div>
    </div>`;
  }).join('');
  listEl.innerHTML = rows || '<div style="color:var(--text-muted);font-size:13px">Belum ada data</div>';
}

// ─── WIDGET: SPENDING HEATMAP ────────────────────────────────────────────────
// Linear-interpolated percentile of a SORTED numeric array (0<=q<=1).
// Used instead of "fraction of max" so a single outlier day doesn't flatten
// the color scale for every other day in the month.
function quantile(sortedArr, q){
  if(!sortedArr.length) return 0;
  if(sortedArr.length === 1) return sortedArr[0];
  const idx = (sortedArr.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if(lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function renderSpendingHeatmap(){
  const now = jakartaNow();
  const y=now.getFullYear(), m=now.getMonth();
  const firstDay = new Date(y, m, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const today = now.getDate();

  const monthLabel = now.toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  safe('hm-month-label', monthLabel);

  // Hitung pengeluaran per hari
  const dailySpend = {};
  const ms = String(m+1).padStart(2,'0');
  transactions.filter(t=>t.date.slice(0,7)===`${y}-${ms}`&&t.cat!=='income'&&t.cat!=='cc')
    .forEach(t=>{ const d=parseInt(t.date.slice(8,10)); dailySpend[d]=(dailySpend[d]||0)+(t.myShare!=null?t.myShare:t.amount); });

  // Percentile-based thresholds (instead of "% of max") so one big outlier
  // transaction doesn't wash out the color scale for every other day.
  const vals = Object.values(dailySpend).filter(v=>v>0).sort((a,b)=>a-b);
  const p25 = quantile(vals, 0.25), p60 = quantile(vals, 0.60), p85 = quantile(vals, 0.85);

  const getColor = (spend, day) => {
    if(day > today) return 'var(--card2)'; // future
    if(!spend) return 'rgba(16,185,129,.08)'; // no spend = hemat
    if(spend <= p25) return 'rgba(16,185,129,.30)';
    if(spend <= p60) return 'rgba(16,185,129,.60)';
    if(spend <= p85) return 'rgba(245,158,11,.65)';
    return 'rgba(239,68,68,.75)';
  };

  const grid = el('heatmap-grid'); if(!grid) return;
  let html = '';
  // Empty cells before first day
  for(let i=0;i<firstDay;i++) html+=`<div style="aspect-ratio:1"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const spend=dailySpend[d]||0;
    const bg=getColor(spend,d);
    const isToday=d===today;
    const tipText = spend>0 ? `${d}: ${fmt(spend)}` : d>today ? `${d}: —` : `${d}: hemat 🟢`;
    html+=`<div class="hm-cell" style="background:${bg};${isToday?'outline:2px solid var(--blue);outline-offset:1px':''}">
      <div class="hm-tip">${tipText}</div>
    </div>`;
  }
  grid.innerHTML = html;
}

// ─── CHARTS ──────────────────────────────────────────────────────────────────
function renderTrendChart(){
  const canvas=el('trendChart'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const labels=[], data=[], fullDates=[];

  const today = jakartaNow();
  for(let i=29;i>=0;i--){
    const d=new Date(today); d.setDate(today.getDate()-i);
    const ds=dateToStr(d);
    if(ds>todayStr()) continue;
    fullDates.push(ds);
    labels.push(ds.slice(5));
    data.push(transactions.filter(t=>t.date===ds&&t.cat!=='income'&&t.cat!=='cc').reduce((s,t)=>s+(t.myShare!=null?t.myShare:t.amount),0));
  }

  if(trendChart) trendChart.destroy();
  trendChart=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[{data,borderColor:'#3B82F6',backgroundColor:'rgba(59,130,246,.08)',tension:.35,fill:true,pointRadius:2,pointHoverRadius:6,pointBackgroundColor:'#3B82F6',pointBorderColor:'#0F172A',pointBorderWidth:1,pointHoverBackgroundColor:'#fff',pointHoverBorderColor:'#3B82F6',pointHoverBorderWidth:2}]},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#1A2540',titleColor:'#E2E8F0',bodyColor:'#E2E8F0',borderColor:'#1E2D4A',borderWidth:1,padding:10,displayColors:false,
          callbacks:{
            title:items=>{ const ds=fullDates[items[0].dataIndex]; return new Date(ds+'T00:00:00').toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short'}); },
            label:c=>'Pengeluaran: '+fmt(c.raw)
          }
        }
      },
      scales:{
        x:{ticks:{color:'#64748B',font:{size:10},maxTicksLimit:8},grid:{color:'rgba(30,45,74,.5)'}},
        y:{ticks:{color:'#64748B',font:{size:10},callback:v=>'Rp'+(v>=1000?Math.round(v/1000)+'k':v)},grid:{color:'rgba(30,45,74,.5)'}}
      }
    }
  });
}

function renderPieChart(cats,catNames,catColors){
  const canvas=el('pieChart'); if(!canvas) return;
  if(pieChart){ pieChart.destroy(); pieChart=null; }
  const entries=Object.entries(cats).filter(([k,v])=>v>0);
  if(!entries.length){ canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height); return; }
  const ctx=canvas.getContext('2d');
  pieChart=new Chart(ctx,{
    type:'doughnut',
    data:{
      labels:entries.map(([k])=>catNames[k]),
      datasets:[{data:entries.map(([,v])=>v),backgroundColor:entries.map(([k])=>catColors[k]||'#64748B'),borderWidth:2,borderColor:'#131E35',hoverBorderColor:'#1A2540'}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:600},
      plugins:{
        legend:{position:'bottom',labels:{color:'#94A3B8',font:{size:11},boxWidth:12,padding:12}},
        tooltip:{callbacks:{label:c=>' '+c.label+': '+fmt(c.raw)+' ('+Math.round(c.parsed/entries.reduce((s,[,v])=>s+v,0)*100)+'%)'}}
      },
      cutout:'62%'
    }
  });
}

