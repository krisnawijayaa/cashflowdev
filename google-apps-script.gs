const SPREADSHEET_ID = '1xXiuoPlz4RrtTeLyIOoIH9f2d4asM5Y56SYXY2diJk0';

const SHEETS = {
  transactions: 'Transaksi',
  receivables: 'Piutang',
  debts: 'UtangGua',
  assets: 'Aset',
  settings: 'Settings'
};

const HEADERS = {
  transactions: ['Tanggal','Deskripsi','Kategori','Sumber','Nominal','BagianGua','Piutang','UtangGua','Catatan','ID'],
  receivables: ['Tanggal','Deskripsi','Nama','Nominal','Status','MetodeBayar','TanggalLunas','ID'],
  debts: ['Tanggal','Deskripsi','KePada','Nominal','Status','MetodeBayar','TanggalLunas','ID'],
  assets: ['Nama','Kategori','Tipe','NilaiBeli','TahunBeli','NilaiSekarang(manual)','NilaiSekarangEstimasi','Catatan','ID'],
  settings: ['Key','Value']
};

const DEFAULT_SETTINGS = {income:0, name:'BNI Main Account', cclimit:5000000};

const ASSET_LABEL = {
  cash:'💵 Cash/Tabungan',
  deposito:'🏦 Deposito',
  saham:'📈 Saham',
  reksa_dana:'📊 Reksa Dana',
  obligasi:'📄 Obligasi',
  kripto:'₿ Kripto',
  emas:'🥇 Emas',
  motor:'🏍️ Motor',
  mobil:'🚗 Mobil',
  rumah:'🏠 Rumah',
  apartemen:'🏢 Apartemen',
  tanah:'🌿 Tanah',
  elektronik:'📱 Elektronik',
  laptop:'💻 Laptop',
  lainnya_aset:'📦 Lainnya',
  kpr:'🏠 KPR',
  kkb:'🚗 KKB',
  hutang_lainnya:'💸 Hutang'
};

const ASSET_TYPE = {
  cash:'lancar',
  deposito:'lancar',
  saham:'investasi',
  reksa_dana:'investasi',
  obligasi:'investasi',
  kripto:'investasi',
  emas:'investasi',
  motor:'tidak_lancar',
  mobil:'tidak_lancar',
  rumah:'tidak_lancar',
  apartemen:'tidak_lancar',
  tanah:'tidak_lancar',
  elektronik:'tidak_lancar',
  laptop:'tidak_lancar',
  lainnya_aset:'tidak_lancar',
  kpr:'liabilitas',
  kkb:'liabilitas',
  hutang_lainnya:'liabilitas'
};

const ASSET_LABEL_TO_KEY = Object.keys(ASSET_LABEL).reduce((map, key) => {
  const label = ASSET_LABEL[key];
  map[normalize(label)] = key;
  map[normalize(label.replace(/^[^\s]+\s*/, ''))] = key;
  map[normalize(key)] = key;
  return map;
}, {});

function doPost(e){
  try{
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action || 'load';
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try{
      ensureStructure();
      let data;
      if(action === 'load') data = loadDatabase();
      else if(action === 'update' || action === 'save'){
        writeDatabase(body);
        data = loadDatabase();
      } else if(action === 'delete'){
        deleteById(body.id, body.type || 'transaction');
        data = loadDatabase();
      } else {
        throw new Error('Action tidak dikenal: ' + action);
      }
      return jsonResponse({ok:true, data});
    } finally {
      lock.releaseLock();
    }
  } catch(err){
    return jsonResponse({ok:false, error:String(err && err.message ? err.message : err)});
  }
}

function doGet(){
  ensureStructure();
  return jsonResponse({ok:true, data:loadDatabase()});
}

function loadDatabase(){
  const debtIndex = readDebtIndex();
  return {
    transactions: readTransactions(debtIndex),
    settings: readSettings(),
    assets: readAssets()
  };
}

function writeDatabase(data){
  if(data.settings) writeSettings(data.settings);
  if(Array.isArray(data.assets)) writeAssets(data.assets);
  if(Array.isArray(data.transactions)){
    writeTransactions(data.transactions);
    writeDebtSheets(data.transactions);
  }
}

function deleteById(id, type){
  if(!id) throw new Error('ID wajib diisi untuk delete');
  const data = loadDatabase();
  if(type === 'asset'){
    data.assets = data.assets.filter(item => String(item.id) !== String(id));
  } else {
    data.transactions = data.transactions.filter(item => String(item.id) !== String(id));
  }
  writeDatabase(data);
}

function ensureStructure(){
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(SHEETS).forEach(key => {
    const name = SHEETS[key];
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    ensureHeaders(sheet, HEADERS[key]);
  });
}

function ensureHeaders(sheet, requiredHeaders){
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);
  if(existing.length === 0){
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }
  requiredHeaders.forEach(header => {
    if(existing.indexOf(header) === -1){
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      existing.push(header);
    }
  });
}

function readTransactions(debtIndex){
  const sheet = getSheet(SHEETS.transactions);
  const rows = readObjects(sheet);
  return rows.map(row => {
    const tx = {
      id: row.ID || makeId(),
      date: toDateString(row.Tanggal),
      amount: toNumber(row.Nominal),
      desc: String(row.Deskripsi || ''),
      cat: String(row.Kategori || 'other').toLowerCase(),
      src: String(row.Sumber || 'bni').toLowerCase(),
      note: String(row.Catatan || ''),
      myShare: toNumber(row.BagianGua) || toNumber(row.Nominal),
      split: parsePiutang(row.Piutang),
      myDebt: parseUtangGua(row.UtangGua)
    };
    enrichDebts(tx, debtIndex);
    return tx;
  }).filter(tx => tx.date && tx.desc && tx.amount > 0);
}

function writeTransactions(transactions){
  const rows = transactions.map(tx => {
    const amount = toNumber(tx.amount);
    const splitTotal = Array.isArray(tx.split) ? tx.split.reduce((sum, item) => sum + toNumber(item.amount), 0) : 0;
    return {
      ID: tx.id || makeId(),
      Tanggal: tx.date || '',
      Deskripsi: tx.desc || '',
      Kategori: tx.cat || 'other',
      Sumber: tx.src || 'bni',
      Nominal: amount,
      BagianGua: tx.myShare != null ? toNumber(tx.myShare) : amount - splitTotal,
      Piutang: formatPiutang(tx.split),
      UtangGua: formatUtangGua(tx.myDebt),
      Catatan: tx.note || ''
    };
  });
  writeObjects(getSheet(SHEETS.transactions), HEADERS.transactions, rows);
}

function readDebtIndex(){
  const piutang = {};
  readObjects(getSheet(SHEETS.receivables)).forEach(row => {
    const key = debtKey(row.Tanggal, row.Deskripsi, row.Nama, row.Nominal);
    piutang[key] = {
      settled: normalize(row.Status) === 'lunas',
      settleMethod: String(row.MetodeBayar || ''),
      settleDate: toDateString(row.TanggalLunas)
    };
  });

  const utang = {};
  readObjects(getSheet(SHEETS.debts)).forEach(row => {
    const key = debtKey(row.Tanggal, row.Deskripsi, row.KePada, row.Nominal);
    utang[key] = {
      settled: normalize(row.Status) === 'lunas',
      settleMethod: String(row.MetodeBayar || ''),
      settleDate: toDateString(row.TanggalLunas)
    };
  });
  return {piutang, utang};
}

function writeDebtSheets(transactions){
  const piutangRows = [];
  const utangRows = [];
  transactions.forEach(tx => {
    if(Array.isArray(tx.split)){
      tx.split.forEach((item, idx) => {
        piutangRows.push({
          ID: item.id || `${tx.id || makeId()}-piutang-${idx + 1}`,
          Tanggal: tx.date || '',
          Deskripsi: tx.desc || '',
          Nama: item.name || '',
          Nominal: toNumber(item.amount),
          Status: item.settled ? 'LUNAS' : '',
          MetodeBayar: item.settleMethod || '',
          TanggalLunas: item.settleDate || ''
        });
      });
    }
    if(tx.myDebt){
      utangRows.push({
        ID: tx.myDebt.id || `${tx.id || makeId()}-utang-1`,
        Tanggal: tx.date || '',
        Deskripsi: tx.desc || '',
        KePada: tx.myDebt.to || '',
        Nominal: toNumber(tx.myDebt.amount),
        Status: tx.myDebt.settled ? 'LUNAS' : '',
        MetodeBayar: tx.myDebt.settleMethod || '',
        TanggalLunas: tx.myDebt.settleDate || ''
      });
    }
  });
  writeObjects(getSheet(SHEETS.receivables), HEADERS.receivables, piutangRows);
  writeObjects(getSheet(SHEETS.debts), HEADERS.debts, utangRows);
}

function readAssets(){
  return readObjects(getSheet(SHEETS.assets)).map(row => {
    const cat = categoryToKey(row.Kategori);
    return {
      id: row.ID || makeId(),
      name: String(row.Nama || ''),
      cat,
      buyPrice: toNumber(row.NilaiBeli),
      year: toNumber(row.TahunBeli) || new Date().getFullYear(),
      currentPrice: row['NilaiSekarang(manual)'] === '' ? null : toNumber(row['NilaiSekarang(manual)']),
      note: String(row.Catatan || ''),
      addedDate: ''
    };
  }).filter(asset => asset.name && asset.buyPrice > 0);
}

function writeAssets(assets){
  const rows = assets.map(asset => {
    const cat = asset.cat || categoryToKey(asset.Kategori);
    const buyPrice = toNumber(asset.buyPrice);
    const currentPrice = asset.currentPrice == null ? '' : toNumber(asset.currentPrice);
    return {
      ID: asset.id || makeId(),
      Nama: asset.name || '',
      Kategori: ASSET_LABEL[cat] || asset.cat || '📦 Lainnya',
      Tipe: ASSET_TYPE[cat] || '',
      NilaiBeli: buyPrice,
      TahunBeli: asset.year || '',
      'NilaiSekarang(manual)': currentPrice,
      NilaiSekarangEstimasi: currentPrice || buyPrice,
      Catatan: asset.note || ''
    };
  });
  writeObjects(getSheet(SHEETS.assets), HEADERS.assets, rows);
}

function readSettings(){
  const settings = Object.assign({}, DEFAULT_SETTINGS);
  readObjects(getSheet(SHEETS.settings)).forEach(row => {
    const key = String(row.Key || '').trim();
    if(!key) return;
    const value = row.Value;
    settings[key] = key === 'income' || key === 'cclimit' ? toNumber(value) : String(value || '');
  });
  return settings;
}

function writeSettings(settings){
  const data = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  writeObjects(getSheet(SHEETS.settings), HEADERS.settings, [
    {Key:'income', Value:toNumber(data.income)},
    {Key:'name', Value:data.name || DEFAULT_SETTINGS.name},
    {Key:'cclimit', Value:toNumber(data.cclimit) || DEFAULT_SETTINGS.cclimit}
  ]);
}

function parsePiutang(raw){
  raw = String(raw || '').trim();
  if(!raw) return null;
  const items = [];
  raw.split(';').forEach(part => {
    const clean = part.trim();
    const match = clean.match(/^(.+?):\s*([\d.,]+)/);
    if(!match) return;
    items.push({
      name: match[1].trim(),
      amount: toNumber(match[2]),
      settled: /\(lunas\)/i.test(clean),
      settleMethod: '',
      settleNote: '',
      settleDate: ''
    });
  });
  return items.length ? items : null;
}

function parseUtangGua(raw){
  raw = String(raw || '').trim();
  if(!raw) return null;
  const match = raw.match(/^(.+?):\s*([\d.,]+)/);
  if(!match) return null;
  return {
    to: match[1].trim(),
    amount: toNumber(match[2]),
    note: '',
    settled: /\(lunas\)/i.test(raw),
    settleMethod: '',
    settleNote: '',
    settleDate: ''
  };
}

function enrichDebts(tx, debtIndex){
  if(Array.isArray(tx.split)){
    tx.split.forEach(item => {
      const detail = debtIndex.piutang[debtKey(tx.date, tx.desc, item.name, item.amount)];
      if(detail) Object.assign(item, detail);
    });
  }
  if(tx.myDebt){
    const detail = debtIndex.utang[debtKey(tx.date, tx.desc, tx.myDebt.to, tx.myDebt.amount)];
    if(detail) Object.assign(tx.myDebt, detail);
  }
}

function formatPiutang(split){
  if(!Array.isArray(split) || split.length === 0) return '';
  return split.map(item => `${item.name}:${toNumber(item.amount)}${item.settled ? '(lunas)' : ''}`).join('; ');
}

function formatUtangGua(myDebt){
  if(!myDebt) return '';
  return `${myDebt.to}:${toNumber(myDebt.amount)}${myDebt.settled ? '(lunas)' : ''}`;
}

function readObjects(sheet){
  const values = sheet.getDataRange().getValues();
  if(values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(value => value !== '')).map(row => {
    const obj = {};
    headers.forEach((header, idx) => obj[header] = row[idx]);
    return obj;
  });
}

function writeObjects(sheet, headers, rows){
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if(rows.length === 0) return;
  const values = rows.map(row => headers.map(header => row[header] == null ? '' : row[header]));
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function getSheet(name){
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if(!sheet) throw new Error('Sheet tidak ditemukan: ' + name);
  return sheet;
}

function debtKey(date, desc, name, amount){
  return [toDateString(date), normalize(desc), normalize(name), toNumber(amount)].join('|');
}

function categoryToKey(value){
  const key = ASSET_LABEL_TO_KEY[normalize(value)];
  return key || 'lainnya_aset';
}

function normalize(value){
  return String(value || '').trim().toLowerCase();
}

function toNumber(value){
  if(typeof value === 'number') return value;
  const n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function toDateString(value){
  if(!value) return '';
  if(Object.prototype.toString.call(value) === '[object Date]'){
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).slice(0, 10);
}

function makeId(){
  return Date.now() + '-' + Math.floor(Math.random() * 1000000);
}

function jsonResponse(payload){
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
