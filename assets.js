// ─── ASSETS & NET WORTH ──────────────────────────────────────────────────────
let assets = [];
try { assets = JSON.parse(localStorage.getItem('cf_assets') || '[]'); } catch(e) { assets = []; }

function saveAssets(){ localStorage.setItem('cf_assets', JSON.stringify(assets)); }

// Depreciation rates per tahun (negatif = susut, positif = apresiasi)
const DEPR_RATES = {
  cash:0, deposito:0.04,
  saham:0, reksa_dana:0, obligasi:0.06, kripto:0, emas:0.07,
  motor:-0.15, mobil:-0.20, rumah:0.05, apartemen:0.04, tanah:0.08,
  elektronik:-0.30, laptop:-0.35, lainnya_aset:-0.10,
  kpr:0, kkb:0, hutang_lainnya:0
};

const ASSET_TYPE = {
  cash:'lancar', deposito:'lancar',
  saham:'investasi', reksa_dana:'investasi', obligasi:'investasi', kripto:'investasi', emas:'investasi',
  motor:'tidak_lancar', mobil:'tidak_lancar', rumah:'tidak_lancar', apartemen:'tidak_lancar',
  tanah:'tidak_lancar', elektronik:'tidak_lancar', laptop:'tidak_lancar', lainnya_aset:'tidak_lancar',
  kpr:'liabilitas', kkb:'liabilitas', hutang_lainnya:'liabilitas'
};

const ASSET_CAT_LABEL = {
  cash:'💵 Cash/Tabungan', deposito:'🏦 Deposito',
  saham:'📈 Saham', reksa_dana:'📊 Reksa Dana', obligasi:'📄 Obligasi',
  kripto:'₿ Kripto', emas:'🥇 Emas',
  motor:'🏍️ Motor', mobil:'🚗 Mobil', rumah:'🏠 Rumah', apartemen:'🏢 Apartemen',
  tanah:'🌿 Tanah', elektronik:'📱 Elektronik', laptop:'💻 Laptop', lainnya_aset:'📦 Lainnya',
  kpr:'🏠 KPR', kkb:'🚗 KKB', hutang_lainnya:'💸 Hutang'
};

// Kategori yang pakai manual price (investasi volatile)
const MANUAL_PRICE_CATS = new Set(['saham','reksa_dana','kripto','kpr','kkb','hutang_lainnya','cash','deposito','obligasi','emas']);

function getCurrentValue(asset){
  if(MANUAL_PRICE_CATS.has(asset.cat)){
    return asset.currentPrice != null ? asset.currentPrice : asset.buyPrice;
  }
  const rate = DEPR_RATES[asset.cat] || -0.10;
  const years = new Date().getFullYear() - (asset.year || new Date().getFullYear());
  if(years <= 0) return asset.buyPrice;
  // Compound depreciation/appreciation
  const val = asset.buyPrice * Math.pow(1 + rate, years);
  return Math.max(val, asset.buyPrice * 0.05); // floor 5% dari harga beli
}

let editAssetId = null;
let assetFilter = 'all';

function openAddAsset(){
  editAssetId = null;
  el('asset-modal-title').textContent = '➕ Tambah Aset';
  el('am-name').value = '';
  el('am-cat').value = 'cash';
  el('am-buy-price').value = '';
  el('am-buy-preview').textContent = '';
  el('am-year').value = new Date().getFullYear();
  el('am-current-price').value = '';
  el('am-current-preview').textContent = '';
  el('am-note').value = '';
  onAssetCatChange();
  el('am-preview-box').style.display = 'none';
  el('asset-modal').classList.add('open');
}

function openEditAsset(id){
  const a = assets.find(x=>x.id===id); if(!a) return;
  editAssetId = id;
  el('asset-modal-title').textContent = '✏️ Edit Aset';
  el('am-name').value = a.name;
  el('am-cat').value = a.cat;
  el('am-buy-price').value = a.buyPrice;
  el('am-buy-preview').textContent = '= ' + fmt(a.buyPrice);
  el('am-year').value = a.year || '';
  el('am-current-price').value = a.currentPrice != null ? a.currentPrice : '';
  el('am-current-preview').textContent = a.currentPrice ? '= ' + fmt(a.currentPrice) : '';
  el('am-note').value = a.note || '';
  onAssetCatChange();
  calcAssetPreview();
  el('asset-modal').classList.add('open');
}

function closeAssetModal(){ el('asset-modal').classList.remove('open'); editAssetId=null; }

function onAssetCatChange(){
  const cat = el('am-cat').value;
  const manualGroup = el('am-current-group');
  const yearGroup = el('am-year-group');
  // Show manual price for volatile/liab categories
  if(MANUAL_PRICE_CATS.has(cat)){
    manualGroup.style.display = 'block';
    yearGroup.style.display = cat==='cash'||cat==='deposito'||cat==='kpr'||cat==='kkb'||cat==='hutang_lainnya' ? 'none' : 'block';
  } else {
    manualGroup.style.display = 'none';
    yearGroup.style.display = 'block';
  }
  calcAssetPreview();
}

function calcAssetPreview(){
  const cat = el('am-cat').value;
  const buyPrice = parseShorthand(el('am-buy-price').value);
  const year = parseInt(el('am-year').value) || new Date().getFullYear();
  const box = el('am-preview-box');
  const content = el('am-preview-content');
  if(!buyPrice){ box.style.display='none'; return; }
  box.style.display = 'block';

  const rate = DEPR_RATES[cat] || 0;
  const years = new Date().getFullYear() - year;
  const currentVal = MANUAL_PRICE_CATS.has(cat)
    ? (parseShorthand(el('am-current-price').value) || buyPrice)
    : Math.max(buyPrice * Math.pow(1+rate, Math.max(0,years)), buyPrice*0.05);
  const diff = currentVal - buyPrice;
  const diffPct = buyPrice > 0 ? (diff/buyPrice*100).toFixed(1) : 0;
  const isLiab = ASSET_TYPE[cat]==='liabilitas';

  let html = `<div style="display:flex;justify-content:space-between;margin-bottom:6px">
    <span style="color:var(--text-muted)">Harga beli</span>
    <span style="font-weight:700">${fmt(buyPrice)}</span>
  </div>`;
  if(years > 0 && !MANUAL_PRICE_CATS.has(cat)){
    html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <span style="color:var(--text-muted)">Sudah ${years} tahun · rate ${rate>0?'+':''}${(rate*100).toFixed(0)}%/thn</span>
      <span style="font-weight:700;color:${diff>=0?'var(--green)':'var(--red)'}">${diff>=0?'+':''}${fmt(diff)} (${diff>=0?'+':''}${diffPct}%)</span>
    </div>`;
  }
  html += `<div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px solid var(--border)">
    <span style="font-weight:700">Nilai Sekarang</span>
    <span style="font-weight:800;font-size:15px;color:${isLiab?'var(--red)':diff>=0?'var(--green)':'var(--amber)'}">${fmt(currentVal)}</span>
  </div>`;
  content.innerHTML = html;
}

function saveAsset(){
  const name = el('am-name').value.trim();
  const cat = el('am-cat').value;
  const buyPrice = parseShorthand(el('am-buy-price').value);
  const year = parseInt(el('am-year').value) || null;
  const currentPriceRaw = parseShorthand(el('am-current-price').value);
  const currentPrice = currentPriceRaw > 0 ? currentPriceRaw : null;
  const note = el('am-note').value.trim();

  if(!name || !buyPrice){ showToast('⚠️ Nama dan nilai wajib diisi!'); return; }

  if(editAssetId){
    const idx = assets.findIndex(x=>x.id===editAssetId);
    if(idx>=0) assets[idx] = {...assets[idx], name, cat, buyPrice, year, currentPrice, note};
  } else {
    assets.push({id:Date.now(), name, cat, buyPrice, year, currentPrice, note, addedDate: todayStr()});
  }
  saveAssets(); closeAssetModal(); renderAset();
  showToast(editAssetId ? '✅ Aset diupdate!' : '✅ Aset ditambahkan!');
}

function deleteAsset(id){
  if(!confirm('Hapus aset ini?')) return;
  assets = assets.filter(x=>x.id!==id);
  saveAssets(); renderAset();
  showToast('🗑️ Aset dihapus');
}

function filterAssets(f, btn){
  assetFilter = f;
  document.querySelectorAll('.asset-type-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderAset();
}

function renderAset(){
  const now = new Date().getFullYear();
  const income = settings.income || 0;

  // Totals
  let totalLancar=0, totalTdkLancar=0, totalInvestasi=0, totalLiab=0;
  assets.forEach(a=>{
    const v = getCurrentValue(a);
    const type = ASSET_TYPE[a.cat];
    if(type==='lancar') totalLancar+=v;
    else if(type==='tidak_lancar') totalTdkLancar+=v;
    else if(type==='investasi') totalInvestasi+=v;
    else if(type==='liabilitas') totalLiab+=v;
  });

  const totalAset = totalLancar + totalTdkLancar + totalInvestasi;
  const netWorth = totalAset - totalLiab;

  safe('nw-total-aset', fmt(totalAset));
  safe('nw-total-liab', fmt(totalLiab));
  safe('nw-networth', fmt(netWorth));
  safe('nw-networth-sub', netWorth >= 0 ? '✅ Aset > Liabilitas' : '⚠️ Liabilitas > Aset');
  safe('nw-lancar', fmt(totalLancar));
  safe('nw-tdk-lancar', fmt(totalTdkLancar));
  safe('nw-investasi', fmt(totalInvestasi));
  safe('nw-income-disp', fmt(income));
  safe('nw-income-months', income > 0 ? `≈ ${Math.round(netWorth/income)} bulan income` : 'set di Pengaturan');

  // Net worth level assessment
  renderNetWorthLevel(netWorth, totalLancar, totalInvestasi, income);

  // Asset list
  const listEl = el('asset-list'); if(!listEl) return;
  let filtered = assets;
  if(assetFilter !== 'all') filtered = assets.filter(a => ASSET_TYPE[a.cat] === assetFilter);
  if(!filtered.length){
    listEl.innerHTML = `<div class="empty-state"><div class="emoji">💎</div><p>${assets.length===0?'Belum ada aset. Tambahkan aset pertama kamu!':'Tidak ada aset di kategori ini.'}</p></div>`;
    return;
  }

  const typeColor = {lancar:'var(--green)',tidak_lancar:'var(--blue)',investasi:'var(--purple)',liabilitas:'var(--red)'};
  const typeLabel = {lancar:'Aset Lancar',tidak_lancar:'Aset Tidak Lancar',investasi:'Investasi',liabilitas:'Liabilitas'};
  const typeBadge = {lancar:'badge-lancar',tidak_lancar:'badge-tidak-lancar',investasi:'badge-investasi',liabilitas:'badge-liabilitas'};

  listEl.innerHTML = filtered.map(a=>{
    const curVal = getCurrentValue(a);
    const diff = curVal - a.buyPrice;
    const diffPct = a.buyPrice > 0 ? (diff/a.buyPrice*100).toFixed(1) : 0;
    const type = ASSET_TYPE[a.cat];
    const isLiab = type==='liabilitas';
    const years = a.year ? now - a.year : null;
    const rate = DEPR_RATES[a.cat];
    const rateStr = rate!==0 ? `${rate>0?'📈 +':'📉 '}${(rate*100).toFixed(0)}%/thn` : '—';

    return `<div class="asset-card">
      <div class="asset-card-left">
        <div class="asset-card-name">
          ${escHtml(a.name)}
          <span class="asset-cat-badge ${typeBadge[type]||''}">${typeLabel[type]||''}</span>
        </div>
        <div class="asset-card-meta">
          ${ASSET_CAT_LABEL[a.cat]||a.cat}
          ${years!==null ? ` · ${years} tahun` : ''}
          ${!isLiab && !MANUAL_PRICE_CATS.has(a.cat) ? ` · ${rateStr}` : ''}
          ${a.note ? ` · ${escHtml(a.note)}` : ''}
        </div>
        ${!isLiab && diff!==0 ? `<div style="font-size:11px;color:${diff>0?'var(--green)':'var(--red)'};margin-top:2px">${diff>0?'▲':'▼'} ${fmt(Math.abs(diff))} (${diff>0?'+':''}${diffPct}%) dari harga beli ${fmt(a.buyPrice)}</div>` : ''}
      </div>
      <div class="asset-card-right">
        <div class="asset-card-value" style="color:${isLiab?'var(--red)':diff>0?'var(--green)':diff<0?'var(--amber)':'var(--text)'}">${fmt(curVal)}</div>
        <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:6px">
          <button class="del-btn" onclick="openEditAsset(${a.id})" style="color:var(--blue);font-size:12px">✏️</button>
          <button class="del-btn" onclick="deleteAsset(${a.id})" style="font-size:12px">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderNetWorthLevel(nw, liquid, investasi, income){
  // Levels berdasarkan emergency fund + investasi ratio
  const emergencyFund = income * 6; // 6 bulan income
  const retirementTarget = income * 12 * 25; // 25x annual income (rule of 25)

  let level=0, text='', desc='', advice='', color='';
  if(nw <= 0){
    level=0; text='⚠️ Perlu Perhatian'; color='var(--red)';
    desc='Net worth negatif — liabilitas melebihi aset.';
    advice='Fokus lunasi hutang berbunga tinggi dulu, kurangi pengeluaran tidak perlu, dan mulai catat semua pengeluaran secara konsisten.';
  } else if(liquid < income * 1){
    level=10; text='💸 Gaji ke Gaji'; color='var(--red)';
    desc='Tabungan likuid kurang dari 1 bulan income.';
    advice='Target pertama: kumpulkan 1 bulan income sebagai buffer darurat. Sisihkan minimal 10% dari setiap gaji secara otomatis ke rekening terpisah.';
  } else if(liquid < emergencyFund){
    level=30; text='🌱 Membangun Dana Darurat'; color='var(--amber)';
    desc=`Sudah punya buffer, tapi dana darurat ideal 6 bulan income (${fmt(emergencyFund)}).`;
    advice=`Saat ini punya ${fmt(liquid)} dana likuid. Terus isi sampai ${fmt(emergencyFund)}. Sambil jalan bisa mulai investasi kecil-kecilan di reksa dana pasar uang.`;
  } else if(investasi < income * 12){
    level=55; text='📈 Dana Darurat OK, Mulai Investasi'; color='var(--blue)';
    desc='Dana darurat sudah cukup. Saatnya mulai serius investasi.';
    advice='Alokasikan 20-30% income untuk investasi. Diversifikasi: reksa dana indeks, saham blue chip, atau SBN. Pertimbangkan juga asuransi jiwa dan kesehatan.';
  } else if(nw < retirementTarget * 0.25){
    level=72; text='🚀 Aktif Berinvestasi'; color='var(--purple)';
    desc='Portofolio investasi sudah terbentuk. Konsisten dan tingkatkan.';
    advice=`Target pensiun (Rule of 25): ${fmt(retirementTarget)}. Saat ini ${Math.round(nw/retirementTarget*100)}% dari target. Pertahankan konsistensi dan manfaatkan compound interest.`;
  } else if(nw < retirementTarget){
    level=88; text='🏆 Persiapan Pensiun'; color='var(--green)';
    desc='Net worth sudah signifikan. Fokus pada preservation dan growth.';
    advice=`Sudah ${Math.round(nw/retirementTarget*100)}% dari target pensiun (${fmt(retirementTarget)}). Pertimbangkan diversifikasi ke aset defensif dan mulai planning estate.`;
  } else {
    level=100; text='🌟 Financial Freedom'; color='var(--green)';
    desc='Net worth sudah melampaui target pensiun. Luar biasa!';
    advice='Aset sudah cukup untuk menghasilkan passive income melebihi pengeluaran. Fokus pada preservation, filantropi, dan transfer kekayaan.';
  }

  safe('nw-level-text', text);
  const levelEl = el('nw-level-text'); if(levelEl) levelEl.style.color=color;
  safe('nw-level-desc', desc);
  safe('nw-level-advice', advice);
  const bar = el('nw-level-bar');
  if(bar){ bar.style.width=level+'%'; bar.style.background=color; }
}

