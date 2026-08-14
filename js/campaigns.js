/* ================================================================
   ERA-VIS AI v2.0 — campaigns.js
   Manajemen campaign: CRUD, modal, Excel upload, sheet select,
   settings, logs, activity log.
   Depends on: config.js, api.js
   ================================================================ */

'use strict';

// ── TEMP WORKBOOK (per modal open) ────────────────────────────────
let _excelWB = null;


// ── CAMPAIGN LIST ──────────────────────────────────────────────────
const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_SHORT_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
let _campActiveMonth = 'all';

// ── BRAND ──────────────────────────────────────────────────────────
let _activeBrand = 'erafone';
const BRAND_META = {
  erafone : { label: 'Erafone', subtitle: 'Kelola campaign visibility Erafone' },
  ibox    : { label: 'IBOX',    subtitle: 'Kelola campaign visibility IBOX (Apple Premium Reseller)' },
  samsung : { label: 'Samsung', subtitle: 'Kelola campaign visibility Samsung' },
};

function _setBrand(brand) {
  _activeBrand = brand;
  _campActiveMonth = 'all';
  document.querySelectorAll('.brand-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.brand === brand);
  });
  const sub = document.getElementById('camp-brand-subtitle');
  if (sub) sub.textContent = BRAND_META[brand]?.subtitle || '';
  renderCampaignList();
}

function _updateBrandCounts() {
  Object.keys(BRAND_META).forEach(b => {
    const el = document.getElementById('brand-cnt-' + b);
    if (el) el.textContent = campaigns.filter(c => (c.brand || 'erafone') === b).length;
  });
}

function _brandedCampaigns() {
  return campaigns.filter(c => (c.brand || 'erafone') === _activeBrand);
}

function _campDeadlineMonth(c) {
  if (!c.deadline) return null;
  return new Date(c.deadline).getMonth() + 1;
}

function _campDeadlineDays(c) {
  if (!c.deadline) return null;
  return Math.ceil((new Date(c.deadline) - Date.now()) / 864e5);
}

function _campDeadlineBadge(c) {
  if (c.status === 'ended') return `<span class="dl-badge dl-ended">✅ Selesai · ${c.deadline}</span>`;
  const d = _campDeadlineDays(c);
  if (d === null) return '';
  if (d < 0)  return `<span class="dl-badge dl-overdue">⚠ Lewat ${Math.abs(d)}h · ${c.deadline}</span>`;
  if (d <= 3) return `<span class="dl-badge dl-urgent">🔴 ${d}h lagi · ${c.deadline}</span>`;
  if (d <= 7) return `<span class="dl-badge dl-soon">🟡 ${d}h lagi · ${c.deadline}</span>`;
  return `<span class="dl-badge dl-normal">📅 ${d}h lagi · ${c.deadline}</span>`;
}

function _campSorted(list) {
  const s = (document.getElementById('campaign-sort') || {}).value || 'deadline-asc';
  return [...list].sort((a, b) => {
    if (s === 'deadline-asc')  return new Date(a.deadline || '9999') - new Date(b.deadline || '9999');
    if (s === 'deadline-desc') return new Date(b.deadline || '0000') - new Date(a.deadline || '0000');
    if (s === 'rate-desc') { const ra = dataCache[a.id]?.rate||0, rb = dataCache[b.id]?.rate||0; return rb - ra; }
    if (s === 'rate-asc')  { const ra = dataCache[a.id]?.rate||0, rb = dataCache[b.id]?.rate||0; return ra - rb; }
    if (s === 'name-asc')  return a.name.localeCompare(b.name);
    return 0;
  });
}

function _campSetMonth(m) {
  _campActiveMonth = m;
  renderCampaignList();
}

function _campRenderTabs() {
  const el = document.getElementById('campaign-month-tabs');
  if (!el) return;
  const now = new Date().getMonth() + 1;
  const branded = _brandedCampaigns();
  const monthSet = new Set(branded.map(c => _campDeadlineMonth(c)).filter(Boolean));
  let html = `<button class="camp-month-tab${_campActiveMonth==='all'?' active':' has-camp'}" onclick="_campSetMonth('all')">Semua</button>`;
  for (let m = 1; m <= 12; m++) {
    const cnt  = branded.filter(c => _campDeadlineMonth(c) === m).length;
    const has  = monthSet.has(m);
    const cls  = _campActiveMonth === m ? ' active' : (has ? ' has-camp' : '');
    const now_ = m === now && has ? '<span class="camp-now-badge">Now</span>' : '';
    html += `<button class="camp-month-tab${cls}" onclick="_campSetMonth(${m})"${has?'':' style="opacity:.3"'}>
      ${MONTH_SHORT_ID[m-1]}${has?`<sup>${cnt}</sup>`:''}${now_}
    </button>`;
  }
  el.innerHTML = html;
}

function _campRenderCard(c) {
  const d         = dataCache[c.id];
  const total     = d ? d.totalStores : (c.localStores ? c.localStores.length : '—');
  const done      = d ? d.doneCount   : '—';
  const rate      = d ? d.rate        : null;
  const rateTxt   = rate !== null ? rate + '%' : '—';
  const pct       = rate !== null ? rate : 0;
  const pClass    = pct >= 80 ? 'high' : pct >= 50 ? 'medium' : 'low';
  const modeTag   = c.mode === 'excel'
    ? '<span style="font-size:9px;background:var(--teal-bg);color:var(--teal);padding:1px 6px;border-radius:4px;font-weight:700;margin-left:6px">📎 Excel</span>'
    : '<span style="font-size:9px;background:var(--blue-bg);color:var(--blue);padding:1px 6px;border-radius:4px;font-weight:700;margin-left:6px">🔗 Sheet</span>';
  const storeMeta = c.mode === 'excel'
    ? (c.localStores ? c.localStores.length : '—') + ' toko'
    : `Sheet: ${esc(c.masterSheet || '')}`;
  const days      = _campDeadlineDays(c);
  const urgent    = c.status !== 'ended' && days !== null && days <= 7;

  return `<div class="campaign-card${urgent?' camp-urgent':''}" onclick="selectCampaignAndGo('${c.id}')">
    <div class="campaign-actions" onclick="event.stopPropagation()">
      <button title="Edit" onclick="openEditCampaign('${c.id}')">✎</button>
      <button class="del-btn" title="Hapus" onclick="deleteCampaign('${c.id}')">✕</button>
    </div>
    <div class="campaign-badge ${c.status || 'active'}">${c.status === 'ended' ? 'Ended' : 'Active'}</div>
    <div class="campaign-name">${esc(c.name)}${modeTag}${c.fbeMode ? `<span class="badge badge-purple" style="margin-left:6px">FBE · ${(c.materials||[]).length} materi</span>` : ''}</div>
    <div style="margin-bottom:8px">${_campDeadlineBadge(c)}</div>
    <div class="campaign-meta">
      ${c.formLink ? `<a href="${esc(c.formLink)}" target="_blank">Form</a> · ` : ''}${storeMeta}
    </div>
    <div class="camp-progress">
      <div class="camp-track"><div class="camp-fill ${pClass}" style="width:${pct}%"></div></div>
      <div class="camp-plabels"><span>${done} / ${total} toko</span><span>${rateTxt}</span></div>
    </div>
    <div class="campaign-stats">
      <div class="campaign-stat"><div class="campaign-stat-val" style="color:var(--blue)">${total}</div><div class="campaign-stat-lbl">Toko</div></div>
      <div class="campaign-stat"><div class="campaign-stat-val" style="color:var(--teal)">${done}</div><div class="campaign-stat-lbl">Done</div></div>
      <div class="campaign-stat"><div class="campaign-stat-val" style="color:var(--gold)">${rateTxt}</div><div class="campaign-stat-lbl">Rate</div></div>
    </div>
  </div>`;
}

function renderCampaignList() {
  const wrap = document.getElementById('campaign-list-wrap');
  const em   = document.getElementById('campaigns-empty');
  if (!wrap) return;

  _updateBrandCounts();
  const branded = _brandedCampaigns();

  if (!branded.length) {
    wrap.innerHTML = '';
    em.style.display = '';
    _campRenderTabs();
    return;
  }
  em.style.display = 'none';
  _campRenderTabs();

  const now = new Date().getMonth() + 1;
  const nowYear = new Date().getFullYear();

  // filter by month
  let filtered = _campActiveMonth === 'all'
    ? branded
    : branded.filter(c => _campDeadlineMonth(c) === _campActiveMonth);

  filtered = _campSorted(filtered);

  if (!filtered.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--muted)"><div style="font-size:32px;margin-bottom:10px">📋</div><div style="font-size:13px;font-weight:600">Tidak ada campaign di bulan ini</div></div>`;
    return;
  }

  if (_campActiveMonth !== 'all') {
    const mName = MONTH_NAMES_ID[_campActiveMonth - 1];
    const phase = _campActiveMonth < now ? 'past' : _campActiveMonth === now ? 'current' : 'future';
    const pLbl  = { past:'Selesai', current:'Bulan Ini', future:'Mendatang' }[phase];
    wrap.innerHTML = `
      <div class="camp-group">
        <div class="camp-group-hd">
          <span class="camp-group-title">📅 ${mName} ${nowYear}</span>
          <span class="camp-group-pill ${phase}">${pLbl}</span>
          <span class="camp-group-line"></span>
          <span class="camp-group-cnt">${filtered.length} campaign</span>
        </div>
        <div class="campaign-list">${filtered.map(_campRenderCard).join('')}</div>
      </div>`;
    return;
  }

  // group by month
  const map = {};
  filtered.forEach(c => { const m = _campDeadlineMonth(c); if (m) { if (!map[m]) map[m]=[]; map[m].push(c); } });
  const months = Object.keys(map).map(Number).sort((a,b)=>a-b);

  wrap.innerHTML = months.map(m => {
    const mName = MONTH_NAMES_ID[m-1];
    const phase = m < now ? 'past' : m === now ? 'current' : 'future';
    const pLbl  = { past:'Selesai', current:'Bulan Ini', future:'Mendatang' }[phase];
    return `<div class="camp-group">
      <div class="camp-group-hd">
        <span class="camp-group-title">📅 ${mName} ${nowYear}</span>
        <span class="camp-group-pill ${phase}">${pLbl}</span>
        <span class="camp-group-line"></span>
        <span class="camp-group-cnt">${map[m].length} campaign</span>
      </div>
      <div class="campaign-list">${map[m].map(_campRenderCard).join('')}</div>
    </div>`;
  }).join('');
}


// ── SELECT CAMPAIGN → GO TO DASHBOARD ─────────────────────────────
function selectCampaignAndGo(id) {
  document.getElementById('dash-campaign-select').value = id;
  if (typeof cpSyncTriggerText === 'function') cpSyncTriggerText('dash');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.nav-btn[data-page="dashboard"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-dashboard').classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES.dashboard;
  const lbl = document.getElementById('page-label');
  if (lbl) lbl.textContent = PAGE_SUBLABELS.dashboard;
  loadCampaignData(id);
}


// ── POPULATE ALL CAMPAIGN SELECTS ──────────────────────────────────
function populateAllSelects() {
  ['dash-campaign-select','store-campaign-select','lb-campaign-select',
   'rem-campaign-select','ins-campaign-select'].forEach(sid => {
    const s = document.getElementById(sid);
    if (!s) return;
    const v = s.value;
    s.innerHTML = '<option value="">-- Pilih Campaign --</option>';
    // Campaign FBE pakai array localStores long-format (banyak baris
    // per plantCode) yang bertentangan dengan asumsi "1 baris = 1 toko"
    // di sanitizeStores()/mergeStatusFromImport() yang dipakai semua
    // halaman di bawah ini — FBE dapat halaman sendiri (js/fbe.js).
    // Lihat plan Task 5.
    campaigns.filter(c => !c.fbeMode).forEach(c => {
      s.innerHTML += `<option value="${c.id}">${esc(c.name)}${c.status === 'ended' ? ' (Ended)' : ''}</option>`;
    });
    s.value = v;
  });
}

function populateFbeSelect() {
  const s = document.getElementById('fbe-campaign-select');
  if (!s) return;
  const v = s.value;
  s.innerHTML = '<option value="">-- Pilih Campaign FBE --</option>';
  campaigns.filter(c => c.fbeMode).forEach(c => {
    s.innerHTML += `<option value="${c.id}">${esc(c.name)}${c.status === 'ended' ? ' (Ended)' : ''}</option>`;
  });
  s.value = v;
}


// ── OPEN ADD MODAL ─────────────────────────────────────────────────
function openAddCampaign() {
  const brandLabel = BRAND_META[_activeBrand]?.label || _activeBrand;
  document.getElementById('modal-add-title').textContent = `Tambah Campaign · ${brandLabel}`;
  ['edit-campaign-id','inp-name','inp-form-link','inp-deadline','inp-response-sheet']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('inp-master-sheet').value      = DEFAULT_MASTER_SHEET;
  document.getElementById('inp-import-sheet').value      = DEFAULT_IMPORT_SHEET;
  document.getElementById('inp-import-sheet-excel').value = DEFAULT_IMPORT_SHEET;
  document.getElementById('inp-header-row').value        = DEFAULT_HEADER_ROW;
  document.getElementById('inp-status').value            = 'active';
  document.getElementById('inp-spreadsheet').value       = '';
  _excelWB = null;
  _fbeFiles = {};
  Object.keys(FBE_CONFIRM_GROUPS).forEach(slot => {
    const el = document.getElementById('fbe-status-' + slot);
    if (el) el.innerHTML = '';
    const fi = document.getElementById('fbe-file-' + slot);
    if (fi) fi.value = '';
  });
  Object.keys(FBE_CONFIRM_GROUPS).forEach(group => {
    const el = document.getElementById('inp-confirm-' + group);
    if (el) el.value = '';
  });
  document.getElementById('dropzone').className          = 'dropzone';
  document.getElementById('dropzone-label').textContent  = 'Klik atau drag & drop file Excel di sini';
  document.getElementById('excel-sheet-select').style.display = 'none';
  document.getElementById('sheet-checklist').innerHTML   = '';
  document.getElementById('excel-preview').textContent   = '';
  switchCampaignMode('excel');
  openModal('modal-add');
}


// ── OPEN EDIT MODAL ────────────────────────────────────────────────
function openEditCampaign(id) {
  const c = campaigns.find(x => x.id === id);
  if (!c) return;

  document.getElementById('modal-add-title').textContent = 'Edit Campaign';
  document.getElementById('edit-campaign-id').value      = c.id;
  document.getElementById('inp-name').value              = c.name;
  document.getElementById('inp-form-link').value         = c.formLink  || '';
  document.getElementById('inp-deadline').value          = c.deadline  || '';
  document.getElementById('inp-status').value            = c.status    || 'active';
  _excelWB = null;

  if (c.fbeMode) {
    switchCampaignMode('fbe');
    _fbeFiles = {};
    Object.keys(FBE_CONFIRM_GROUPS).forEach(group => {
      const el = document.getElementById('inp-confirm-' + group);
      if (el) el.value = (c.confirmSheets && c.confirmSheets[group] && c.confirmSheets[group].sheetId) || '';
    });
    // Tampilkan status "sudah tersimpan" per SLOT upload (bukan per key
    // materi) — slot HANGING_MOBILE/STICKER_KACA/FRAME_LFD masing-masing
    // mencakup satu atau lebih key materi, lihat FBE_CONFIRM_GROUPS.
    Object.keys(FBE_CONFIRM_GROUPS).forEach(slot => {
      const slotMaterials = FBE_CONFIRM_GROUPS[slot].materials;
      const rowsForSlot = (c.localStores || []).filter(r => slotMaterials.includes(r.jenisMateri));
      const el = document.getElementById('fbe-status-' + slot);
      if (el && rowsForSlot.length) {
        const uniqueStores = new Set(rowsForSlot.map(r => r.plantCode)).size;
        el.innerHTML = `<span style="color:var(--teal)">&#x2713; ${uniqueStores} toko tersimpan — upload ulang untuk ganti</span>`;
      }
    });
  } else if (c.mode === 'excel') {
    switchCampaignMode('excel');
    document.getElementById('inp-response-sheet').value     = c.responseSheetId || '';
    document.getElementById('inp-import-sheet-excel').value = c.importSheet || DEFAULT_IMPORT_SHEET;
    document.getElementById('dropzone').className           = 'dropzone loaded';
    document.getElementById('dropzone-label').textContent   =
      `✓ ${c.name} (${c.localStores ? c.localStores.length : 0} toko tersimpan — upload ulang Excel untuk ganti)`;
    document.getElementById('excel-sheet-select').style.display = 'none';
    document.getElementById('sheet-checklist').innerHTML    = '';
    document.getElementById('excel-preview').textContent    = '';
  } else {
    switchCampaignMode('sheet');
    document.getElementById('inp-spreadsheet').value   = c.spreadsheetId || '';
    document.getElementById('inp-master-sheet').value  = c.masterSheet   || DEFAULT_MASTER_SHEET;
    document.getElementById('inp-import-sheet').value  = c.importSheet   || DEFAULT_IMPORT_SHEET;
    document.getElementById('inp-header-row').value    = c.headerRow     || DEFAULT_HEADER_ROW;
  }
  openModal('modal-add');
}


// ── MODE TOGGLE ────────────────────────────────────────────────────
function switchCampaignMode(mode) {
  document.getElementById('inp-mode').value = mode;
  document.getElementById('mode-btn-excel').classList.toggle('active', mode === 'excel');
  document.getElementById('mode-btn-sheet').classList.toggle('active', mode === 'sheet');
  document.getElementById('mode-btn-fbe').classList.toggle('active', mode === 'fbe');
  document.getElementById('mode-excel-fields').style.display = mode === 'excel' ? '' : 'none';
  document.getElementById('mode-sheet-fields').style.display = mode === 'sheet' ? '' : 'none';
  document.getElementById('mode-fbe-fields').style.display   = mode === 'fbe'   ? '' : 'none';
}


// ── EXCEL UPLOAD HANDLERS ──────────────────────────────────────────
function handleExcelDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) handleExcelFile(f);
}

function handleExcelFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      _excelWB = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheets = _excelWB.SheetNames;
      const cl = document.getElementById('sheet-checklist');

      cl.innerHTML = sheets.map(s => {
        const rows      = XLSX.utils.sheet_to_json(_excelWB.Sheets[s], { header: 1, defval: '' });
        const stores    = parseExcelStores(rows);
        const hasData   = stores.length > 0;
        const autoCheck = hasData &&
          !s.toLowerCase().includes('tag') &&
          !s.toLowerCase().includes('alamat');

        return `<label class="sheet-check-item${autoCheck ? ' checked' : ''}"
            onclick="this.classList.toggle('checked'); previewExcelSheets()">
          <input type="checkbox" class="sheet-cb" value="${esc(s)}"${autoCheck ? ' checked' : ''}
            onclick="event.stopPropagation(); this.closest('label').classList.toggle('checked'); previewExcelSheets()">
          <span class="sheet-check-label">${esc(s)}</span>
          <span class="sheet-check-count">${hasData ? stores.length + ' toko' : '—'}</span>
        </label>`;
      }).join('');

      document.getElementById('excel-sheet-select').style.display = '';
      document.getElementById('dropzone').className         = 'dropzone loaded';
      document.getElementById('dropzone-label').textContent = '✓ ' + file.name;
      previewExcelSheets();
    } catch (err) {
      toast('Gagal baca Excel: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function previewExcelSheets() {
  if (!_excelWB) return;
  const checked = [...document.querySelectorAll('.sheet-cb:checked')].map(cb => cb.value);
  if (!checked.length) {
    document.getElementById('excel-preview').textContent = '⚠ Pilih minimal 1 sheet';
    return;
  }
  const allStores = getStoresFromSheets(checked);
  const unique    = [...new Map(allStores.map(s => [s.plantCode, s])).values()];
  document.getElementById('excel-preview').textContent = unique.length > 0
    ? `✓ ${unique.length} toko dari ${checked.length} sheet`
    : '⚠ Tidak ada data toko ditemukan';
}

function getStoresFromSheets(sheetNames) {
  if (!_excelWB) return [];
  const all = [];
  sheetNames.forEach(sn => {
    const ws = _excelWB.Sheets[sn]; if (!ws) return;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    all.push(...parseExcelStores(rows));
  });
  return all;
}


// ── HANDLER FILE MATERI FBE ─────────────────────────────────────────
// Dikunci per SLOT UPLOAD (persis sama dengan key FBE_CONFIRM_GROUPS:
// EASEL_POSTER, HANGING_GATE, HANGING_MOBILE, STICKER_KACA, FRAME_LFD)
// — bukan per key FBE_MATERIALS lagi, karena slot HANGING_MOBILE
// menerima 2 file sekaligus (Desain 1 + Desain 2, digabung jadi 1
// materi "HANGING_MOBILE"), dan slot STICKER_KACA/FRAME_LFD masing-
// masing file Excel-nya sendiri (parseFbeStickerKacaFile() otomatis
// cuma ambil kolom yang memang ada di file itu, jadi aman dipakai
// untuk kedua slot ini).
let _fbeFiles = {}; // { [slotKey]: { name, rows: long-format[] } }

function _readXlsxFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Gagal baca file ' + file.name));
    reader.readAsArrayBuffer(file);
  });
}

function _setFbeSlotStatus(slotKey, html) {
  const el = document.getElementById('fbe-status-' + slotKey);
  if (el) el.innerHTML = html;
}

async function handleFbeMaterialFile(slotKey, file) {
  if (!file) return;
  try {
    const rows = await _readXlsxFile(file);
    const parsed = (slotKey === 'STICKER_KACA' || slotKey === 'FRAME_LFD')
      ? parseFbeStickerKacaFile(rows)
      : parseFbeMaterialFile(rows, slotKey);
    if (!parsed.length) {
      _setFbeSlotStatus(slotKey, '<span style="color:var(--red)">&#x26A0; Tidak ada data toko ditemukan di ' + esc(file.name) + '</span>');
      return;
    }
    _fbeFiles[slotKey] = { name: file.name, rows: parsed };
    const uniqueStores = new Set(parsed.map(r => r.plantCode)).size;
    _setFbeSlotStatus(slotKey, `<span style="color:var(--teal)">&#x2713; ${esc(file.name)} — ${uniqueStores} toko</span>`);
  } catch (err) {
    toast('Gagal baca Excel (' + slotKey + '): ' + err.message, 'error');
  }
}

// Slot Hanging Mobile menerima 2 file Excel sekaligus (Desain 1 +
// Desain 2) — keduanya di-tag materi "HANGING_MOBILE" yang sama
// (lihat catatan FBE_MATERIALS di js/config.js) lalu digabung.
async function handleFbeMultiMaterialFile(slotKey, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  try {
    const rowsPerFile = await Promise.all(files.map(f => _readXlsxFile(f)));
    const parsed = rowsPerFile.flatMap(rows => parseFbeMaterialFile(rows, slotKey));
    if (!parsed.length) {
      _setFbeSlotStatus(slotKey, '<span style="color:var(--red)">&#x26A0; Tidak ada data toko ditemukan di file yang dipilih</span>');
      return;
    }
    _fbeFiles[slotKey] = { name: files.map(f => f.name).join(' + '), rows: parsed };
    const uniqueStores = new Set(parsed.map(r => r.plantCode)).size;
    _setFbeSlotStatus(slotKey, `<span style="color:var(--teal)">&#x2713; ${files.map(f => esc(f.name)).join(' + ')} — ${uniqueStores} toko</span>`);
  } catch (err) {
    toast('Gagal baca Excel (' + slotKey + '): ' + err.message, 'error');
  }
}


// ── SAVE CAMPAIGN ──────────────────────────────────────────────────
async function saveCampaign() {
  const mode = document.getElementById('inp-mode').value;
  const name = document.getElementById('inp-name').value.trim();
  const fl   = document.getElementById('inp-form-link').value.trim();
  const dl   = document.getElementById('inp-deadline').value;
  const st   = document.getElementById('inp-status').value;
  const eid  = document.getElementById('edit-campaign-id').value;

  if (!name) { toast('Nama campaign wajib diisi', 'error'); return; }

  let obj = {};

  if (mode === 'fbe') {
    // Realita lapangan: 5 Google Form/sheet konfirmasi terpisah per grup
    // materi (bukan 1 form gabungan) — lihat FBE_CONFIRM_GROUPS.
    const confirmSheets = {};
    Object.keys(FBE_CONFIRM_GROUPS).forEach(group => {
      const raw = (document.getElementById('inp-confirm-' + group).value || '').trim();
      if (raw) confirmSheets[group] = { sheetId: extractSheetId(raw), sheetName: DEFAULT_FBE_CONFIRM_SHEET_NAME };
    });

    let localStores = [];
    const materials = [];
    // Iterasi per SLOT upload (FBE_CONFIRM_GROUPS), bukan per key
    // FBE_MATERIALS — slot HANGING_MOBILE/STICKER_KACA/FRAME_LFD masing-
    // masing bisa menghasilkan lebih dari 1 key materi sekaligus.
    Object.keys(FBE_CONFIRM_GROUPS).forEach(slot => {
      if (_fbeFiles[slot] && _fbeFiles[slot].rows.length) {
        localStores = localStores.concat(_fbeFiles[slot].rows);
        const presentKeys = new Set(_fbeFiles[slot].rows.map(r => r.jenisMateri));
        presentKeys.forEach(k => { if (!materials.includes(k)) materials.push(k); });
      }
    });

    if (!localStores.length && eid) {
      // Edit tanpa upload ulang file apa pun — pertahankan localStores yang sudah ada.
      const existing = campaigns.find(x => x.id === eid);
      if (existing && existing.localStores && existing.localStores.length) {
        localStores = existing.localStores;
        materials.push(...(existing.materials || []));
      }
    }

    if (!localStores.length) { toast('Upload minimal 1 file materi FBE', 'error'); return; }

    obj = { mode:'excel', fbeMode:true, localStores, materials, confirmSheets, masterSheet:'', headerRow: DEFAULT_HEADER_ROW };

  } else if (mode === 'excel') {
    const respRaw = document.getElementById('inp-response-sheet').value.trim();
    const respId  = extractSheetId(respRaw);
    const is      = document.getElementById('inp-import-sheet-excel').value.trim() || DEFAULT_IMPORT_SHEET;

    let localStores = null;
    if (_excelWB) {
      const checked = [...document.querySelectorAll('.sheet-cb:checked')].map(cb => cb.value);
      if (!checked.length) { toast('Pilih minimal 1 sheet', 'error'); return; }
      const all = getStoresFromSheets(checked);
      localStores = sanitizeStores(all);
      if (!localStores.length) { toast('Tidak ada data toko di sheet yang dipilih', 'error'); return; }
    } else if (eid) {
      const existing = campaigns.find(x => x.id === eid);
      localStores    = existing ? sanitizeStores(existing.localStores) : null;

      // localStores belum ada di browser ini — coba pull dari cloud dulu
      if ((!localStores || !localStores.length) && eid) {
        toast('Mengambil data toko dari cloud...', 'info');
        try {
          const res = await fetch(`${STORE_SYNC_PROXY}?id=${encodeURIComponent(eid)}`);
          if (res.ok) {
            const pulled = sanitizeStores(await res.json());
            if (pulled.length) {
              localStores = pulled;
              const idx = campaigns.findIndex(x => x.id === eid);
              if (idx >= 0) campaigns[idx] = { ...campaigns[idx], localStores };
            }
          }
        } catch (e) { /* silent */ }
      }
    }

    if (!localStores || !localStores.length) {
      toast('Upload file Excel terlebih dahulu', 'error'); return;
    }
    obj = { mode:'excel', localStores, responseSheetId:respId, importSheet:is, spreadsheetId:respId, masterSheet:'', headerRow: DEFAULT_HEADER_ROW };

  } else {
    const sid = extractSheetId(document.getElementById('inp-spreadsheet').value);
    const ms  = document.getElementById('inp-master-sheet').value.trim() || DEFAULT_MASTER_SHEET;
    const is  = document.getElementById('inp-import-sheet').value.trim() || DEFAULT_IMPORT_SHEET;
    const hr  = parseInt(document.getElementById('inp-header-row').value) || DEFAULT_HEADER_ROW;
    if (!sid) { toast('Spreadsheet ID wajib diisi', 'error'); return; }
    obj = { mode:'sheet', spreadsheetId:sid, masterSheet:ms, importSheet:is, headerRow:hr };
  }

  if (eid) {
    const i = campaigns.findIndex(x => x.id === eid);
    if (i >= 0) campaigns[i] = { ...campaigns[i], name, formLink:fl, deadline:dl, status:st, ...obj };
    toast('Campaign diupdate');
  } else {
    campaigns.push({
      id: 'c_' + Date.now(), name, formLink:fl, deadline:dl,
      status:st, brand: _activeBrand, createdAt: new Date().toISOString(), ...obj,
    });
    toast('Campaign ditambahkan!');
    addLog('system', 'Campaign baru: ' + name);
  }

  save(SK.campaigns, campaigns);
  pushCampaignsToCloud();
  closeModal('modal-add');
  renderCampaignList();
  populateAllSelects();
  populateFbeSelect();
}


// ── CLOUD SYNC VIA GOOGLE APPS SCRIPT ─────────────────────────────

// Proxy URL — server-side request ke Apps Script, bebas CORS
const SYNC_PROXY = '/.netlify/functions/campaign-sync';

// Ambil campaigns dari cloud (via Netlify Blobs proxy)
async function syncCampaignsFromCloud() {
  try {
    const resp = await fetch(SYNC_PROXY, { cache: 'no-store' });
    if (!resp.ok) return false;
    const data = await resp.json();

    // Cloud kosong → push local campaigns agar cloud terupdate
    if (!Array.isArray(data) || !data.length) {
      if (campaigns.length > 0) pushCampaignsToCloud();
      return 'empty';
    }

    // Filter campaign yang sudah dihapus di device ini agar tidak hidup lagi dari cloud
    const deletedIds = new Set(JSON.parse(localStorage.getItem(SK.deleted) || '[]'));
    const filteredData = data.filter(c => !deletedIds.has(c.id));

    // Merge: pertahankan campaign lokal yang belum ada di cloud.
    // Untuk Excel campaigns: cloud menyimpan versi minified localStores (4 field).
    // Kalau device punya data lokal yang lebih lengkap, gunakan itu.
    const localById = Object.fromEntries(campaigns.map(c => [c.id, c]));
    const cloudIds  = new Set(filteredData.map(c => c.id));
    const merged    = filteredData.map(c => {
      const local = localById[c.id];
      if (c.mode === 'excel' && local?.localStores) {
        // Hanya pakai local jika sudah ada data region — jika belum (upload lama sebelum fix),
        // gunakan data cloud yang lebih baru
        const localHasRegion = local.localStores.some(s => s.region);
        if (localHasRegion) return { ...c, localStores: local.localStores };
      }
      return c;
    });
    // Kampanye lokal yang tidak ada di cloud — tapi abaikan Excel campaign tanpa localStores
    // (artinya campaign lama yang sudah dihapus dan cache-nya belum bersih)
    const localOnly = campaigns.filter(c =>
      !cloudIds.has(c.id) && !(c.mode === 'excel' && (!c.localStores || !c.localStores.length))
    );
    campaigns = [...merged, ...localOnly];
    save(SK.campaigns, campaigns);
    // Hanya push ke cloud jika ada campaign lokal yang belum ada di cloud —
    // hindari overwrite cloud dengan data stale saat sync
    if (localOnly.length > 0) pushCampaignsToCloud();
    // Ambil localStores dari Netlify Blobs untuk campaign yang belum punya
    await pullLocalStoresFromCloud();
    // Buang sisa baris non-toko dari data lama (lokal maupun cloud)
    await cleanupStoredCampaigns();
    populateAllSelects();
    populateFbeSelect();
    renderCampaignList();
    return true;
  } catch (e) {
    console.warn('[ERA-VIS] Cloud sync gagal, pakai localStorage:', e.message);
    return false;
  }
}

// Kirim campaigns ke cloud:
// - Metadata (tanpa localStores) → Apps Script via SYNC_PROXY
// - localStores → Netlify Blobs via /store-sync (terpisah, tidak ada size limit)
const STORE_SYNC_PROXY = '/.netlify/functions/store-sync';

// Proyeksikan localStores jadi bentuk minimal untuk push ke Netlify Blobs.
// Field long-format FBE beda dari field campaign excel biasa (namaToko/kota,
// bukan plantDesc/city) dan wajib menyertakan jenisMateri/subDesain/qty —
// kalau dipetakan pakai bentuk excel biasa, info materinya hilang total.
function _minStoresForSync(c) {
  return c.fbeMode
    ? c.localStores.map(s => ({
        plantCode  : s.plantCode,
        namaToko   : s.namaToko,
        region     : s.region,
        kota       : s.kota,
        jenisMateri: s.jenisMateri,
        subDesain  : s.subDesain || '',
        qty        : s.qty || 1,
        noResi     : s.noResi || '',
        statusResi : s.statusResi || '',
        pic        : s.pic || '',
        kontak     : s.kontak || '',
      }))
    : c.localStores.map(s => ({
        plantCode: s.plantCode,
        plantDesc: s.plantDesc,
        region   : s.region,
        city     : s.city,
        nomorResi: s.nomorResi || '',
      }));
}

async function pushCampaignsToCloud() {
  // Kirim metadata saja ke Apps Script (strip localStores agar tidak melebihi limit)
  const payload = campaigns.map(c => {
    const { localStores: _, ...meta } = c;
    return meta;
  });
  try {
    const resp = await fetch(SYNC_PROXY, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(payload),
    });
    if (!resp.ok) console.warn('[ERA-VIS] Metadata push gagal:', resp.status);
  } catch (e) {
    console.warn('[ERA-VIS] Metadata push gagal:', e.message);
  }

  // Kirim localStores tiap Excel campaign ke Netlify Blobs
  const excelCampaigns = campaigns.filter(c => c.mode === 'excel' && c.localStores?.length);
  await Promise.all(excelCampaigns.map(async c => {
    const minStores = _minStoresForSync(c);
    try {
      await fetch(STORE_SYNC_PROXY, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ id: c.id, localStores: minStores }),
      });
    } catch (e) {
      console.warn('[ERA-VIS] localStores push gagal untuk', c.id, e.message);
    }
  }));

  console.log('[ERA-VIS] Cloud push OK:', campaigns.length, 'campaigns');
  return true;
}

// Ambil localStores dari Netlify Blobs untuk campaigns yang belum punya
async function pullLocalStoresFromCloud() {
  const missing = campaigns.filter(c =>
    c.mode === 'excel' && (!c.localStores || !c.localStores.length)
  );
  if (!missing.length) return;

  await Promise.all(missing.map(async c => {
    try {
      const res = await fetch(`${STORE_SYNC_PROXY}?id=${encodeURIComponent(c.id)}`);
      if (!res.ok) {
        console.warn('[ERA-VIS] localStores pull gagal untuk', c.id, 'HTTP', res.status);
        return;
      }
      // Campaign FBE sengaja punya banyak baris per plantCode (long-format,
      // 1 baris = 1 toko + 1 materi) — sanitizeStores() akan menghapus baris
      // itu sebagai "duplikat", jadi jangan dipakai untuk campaign FBE.
      const raw    = await res.json();
      const stores = c.fbeMode ? raw : sanitizeStores(raw);
      if (stores.length) {
        const idx = campaigns.findIndex(x => x.id === c.id);
        if (idx >= 0) campaigns[idx] = { ...campaigns[idx], localStores: stores };
      }
    } catch (e) {
      console.warn('[ERA-VIS] localStores pull gagal untuk', c.id, e.message);
    }
  }));

  // Di HP, localStorage bisa penuh saat menyimpan semua localStores sekaligus.
  // Kalau gagal, data tetap ada di memori untuk sesi ini — jangan sampai
  // exception-nya membatalkan sisa proses sync.
  try { save(SK.campaigns, campaigns); }
  catch (e) { console.warn('[ERA-VIS] localStorage penuh saat cache localStores:', e.message); }
}

// ── PUSH DATA TOKO YANG BELUM ADA DI CLOUD ─────────────────────────
// Device yang upload Excel menyimpan localStores di localStorage-nya sendiri.
// Kalau push ke Blobs pernah gagal (mis. saat store-sync error), HP/browser
// lain tidak akan pernah dapat datanya. Cek daftar key di cloud, lalu kirim
// campaign yang belum ada — supaya device ini otomatis "menyembuhkan" cloud.
async function pushMissingLocalStores() {
  const owned = campaigns.filter(c => c.mode === 'excel' && c.localStores?.length);
  if (!owned.length) return 0;

  let keys;
  try {
    const res = await fetch(`${STORE_SYNC_PROXY}?keys=1`, { cache: 'no-store' });
    if (!res.ok) return 0;
    keys = new Set(await res.json());
  } catch (e) {
    console.warn('[ERA-VIS] cek isi cloud gagal:', e.message);
    return 0;
  }

  const missing = owned.filter(c => !keys.has(c.id));
  if (!missing.length) return 0;

  await Promise.all(missing.map(async c => {
    const minStores = _minStoresForSync(c);
    try {
      const res = await fetch(STORE_SYNC_PROXY, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ id: c.id, localStores: minStores }),
      });
      if (res.ok) console.log(`[ERA-VIS] data toko "${c.name}" (${minStores.length}) dikirim ke cloud`);
      else        console.warn('[ERA-VIS] push data toko gagal untuk', c.id, 'HTTP', res.status);
    } catch (e) {
      console.warn('[ERA-VIS] push data toko gagal untuk', c.id, e.message);
    }
  }));

  return missing.length;
}


// ── BERSIHKAN DATA TOKO LAMA ───────────────────────────────────────
// Upload Excel versi lama bisa ikut menyimpan baris non-toko (label form
// vertikal dari sheet "TAG ALAMAT" / "FORM": NAMA STORE, ALAMAT, QTY, dst).
// Bersihkan campaign yang sudah tersimpan supaya rapi tanpa upload ulang,
// lalu perbaiki juga salinannya di cloud agar device lain ikut bersih.
async function cleanupStoredCampaigns() {
  const cleanedIds = [];

  campaigns = campaigns.map(c => {
    // Campaign FBE sengaja punya banyak baris per plantCode (long-format) —
    // sanitizeStores() akan menghapus baris "duplikat" itu dan merusak data
    // multi-materi, jadi cleanup ini dilewati untuk campaign FBE.
    if (c.fbeMode || c.mode !== 'excel' || !Array.isArray(c.localStores) || !c.localStores.length) return c;
    const clean = sanitizeStores(c.localStores);
    if (clean.length === c.localStores.length) return c;
    console.log(`[ERA-VIS] ${c.localStores.length - clean.length} baris non-toko dibuang dari "${c.name}"`);
    cleanedIds.push(c.id);
    return { ...c, localStores: clean };
  });

  if (!cleanedIds.length) return 0;

  try { save(SK.campaigns, campaigns); }
  catch (e) { console.warn('[ERA-VIS] localStorage penuh saat simpan hasil cleanup:', e.message); }

  await Promise.all(cleanedIds.map(async id => {
    const c = campaigns.find(x => x.id === id);
    if (!c) return;
    const minStores = _minStoresForSync(c);
    try {
      await fetch(STORE_SYNC_PROXY, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ id, localStores: minStores }),
      });
    } catch (e) {
      console.warn('[ERA-VIS] push hasil cleanup gagal untuk', id, e.message);
    }
  }));

  return cleanedIds.length;
}

// Force push semua campaign lokal ke cloud (untuk recovery / debug)
async function forcePushToCloud() {
  toast('Menyimpan ' + campaigns.length + ' campaign ke cloud...', 'info');
  const ok = await pushCampaignsToCloud();
  if (ok) toast(campaigns.length + ' campaign berhasil disimpan ke cloud!', 'success');
}


// ── SHARE CAMPAIGNS VIA URL ────────────────────────────────────────
// Admin klik "Bagikan Link" → copy URL ke clipboard → kirim ke user via WhatsApp
// User buka link → campaign auto-import tanpa perlu file
function shareCampaignsUrl() {
  try {
    // Minify localStores untuk Excel campaigns agar URL tidak terlalu panjang
    const data = campaigns.map(c => {
      if (c.mode === 'excel' && c.localStores && c.localStores.length) {
        return { ...c, localStores: _minStoresForSync(c) };
      }
      return c;
    });

    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const url     = location.origin + location.pathname + '#import=' + encoded;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => toast('Link disalin! Kirim ke pengguna via WhatsApp/email.'),
        () => _fallbackCopyUrl(url)
      );
    } else {
      _fallbackCopyUrl(url);
    }
    addLog('system', 'Share URL dibuat — ' + campaigns.length + ' campaigns');
  } catch (e) {
    toast('Gagal buat link: ' + e.message, 'error');
  }
}

function _fallbackCopyUrl(url) {
  const ta = document.createElement('textarea');
  ta.value = url;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  toast('Link disalin!');
}


// ── EXPORT CAMPAIGNS ───────────────────────────────────────────────
function exportCampaigns() {
  const data = JSON.stringify(campaigns, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'eravis-campaigns-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Campaign diekspor — kirim file ke HP lalu Import!');
  addLog('system', 'Export ' + campaigns.length + ' campaigns');
}


// ── IMPORT CAMPAIGNS ───────────────────────────────────────────────
function importCampaigns() {
  const input  = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json';
  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error('Format tidak valid');
        let added = 0, updated = 0;
        imported.forEach(c => {
          if (!c.id || !c.name) return;
          const idx = campaigns.findIndex(x => x.id === c.id);
          if (idx >= 0) { campaigns[idx] = c; updated++; }
          else          { campaigns.push(c); added++; }
        });
        save(SK.campaigns, campaigns);
        renderCampaignList();
        populateAllSelects();
        populateFbeSelect();
        toast(added + ' campaign baru, ' + updated + ' diupdate');
        addLog('system', 'Import ' + imported.length + ' campaigns');
      } catch (err) {
        toast('Gagal import: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}


// ── DELETE CAMPAIGN ────────────────────────────────────────────────
function deleteCampaign(id) {
  if (!confirm('Hapus campaign ini?')) return;
  const c = campaigns.find(x => x.id === id);
  campaigns = campaigns.filter(x => x.id !== id);
  // Simpan ID yang dihapus agar tidak "hidup lagi" saat sync cloud
  const deletedIds = JSON.parse(localStorage.getItem(SK.deleted) || '[]');
  if (!deletedIds.includes(id)) deletedIds.push(id);
  localStorage.setItem(SK.deleted, JSON.stringify(deletedIds));
  save(SK.campaigns, campaigns);
  pushCampaignsToCloud();
  // Hapus localStores dari Netlify Blobs juga
  fetch(`${STORE_SYNC_PROXY}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  renderCampaignList();
  populateAllSelects();
  populateFbeSelect();
  toast('Campaign dihapus');
  addLog('system', 'Hapus campaign: ' + (c ? c.name : id));
}


// ── LOAD LEADERBOARD ───────────────────────────────────────────────
async function loadLeaderboard(cid) {
  let c = campaigns.find(x => x.id === cid);
  if (!c) return;
  try {
    let stores;
    if (c.mode === 'excel') {
      if (!c.localStores || !c.localStores.length) {
        const pulled = await ensureLocalStores(cid);
        if (!pulled.ok) { toastLocalStoresError(pulled); return; }
        c = campaigns.find(x => x.id === cid) || c;
      }
      let importRows = [];
      if (c.responseSheetId) {
        try { importRows = await fetchSheet(c.responseSheetId, c.importSheet || DEFAULT_IMPORT_SHEET); }
        catch (e) { /* no import yet */ }
      }
      stores = mergeStatusFromImport(c.localStores, parseImport(importRows));
    } else {
      const rows = await fetchSheet(c.spreadsheetId, c.masterSheet);
      stores = parseMaster(rows, c.headerRow || DEFAULT_HEADER_ROW);
    }
    renderRegionLB(stores);
    renderCityLB(stores);
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
}


// ── AI INSIGHTS ────────────────────────────────────────────────────
function generateInsights() {
  const cid = document.getElementById('ins-campaign-select').value;
  if (!cid) { toast('Pilih campaign', 'error'); return; }
  const c = campaigns.find(x => x.id === cid);

  (async () => {
    try {
      let stores, subs;
      if (c.mode === 'excel') {
        let importRows = [];
        if (c.responseSheetId) {
          try { importRows = await fetchSheet(c.responseSheetId, c.importSheet || DEFAULT_IMPORT_SHEET); }
          catch (e) { /* silent */ }
        }
        subs   = parseImport(importRows);
        stores = mergeStatusFromImport(c.localStores || [], subs);
      } else {
        const [mr, ir] = await Promise.all([
          fetchSheet(c.spreadsheetId, c.masterSheet),
          fetchSheet(c.spreadsheetId, c.importSheet).catch(() => []),
        ]);
        stores = parseMaster(mr, c.headerRow || DEFAULT_HEADER_ROW);
        subs   = parseImport(ir);
      }
      const ins = analyzeData(c, stores, subs);
      renderInsights(ins);
      document.getElementById('insights-empty').style.display = 'none';
      const nb = document.getElementById('nav-badge-insights');
      if (nb) nb.textContent = ins.length;
      addLog('system', 'Insights: ' + ins.length + ' findings');
    } catch (e) {
      toast('Gagal: ' + e.message, 'error');
    }
  })();
}


// ── ACTIVITY LOG ───────────────────────────────────────────────────
function addLog(type, text) {
  activityLogs.unshift({ type, text, time: new Date().toISOString() });
  if (activityLogs.length > MAX_LOG_ENTRIES) activityLogs = activityLogs.slice(0, MAX_LOG_ENTRIES);
  save(SK.logs, activityLogs);
}

function renderLogs() {
  const f    = document.getElementById('log-filter-type').value;
  const logs = f ? activityLogs.filter(l => l.type === f) : activityLogs;
  document.getElementById('log-count').textContent = logs.length + ' entries';
  const body = document.getElementById('log-body');

  if (!logs.length) {
    body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">Kosong</div>';
    return;
  }

  body.innerHTML = logs.slice(0, 100).map(l => {
    const ic  = l.type === 'reminder' ? 'l-send' : l.type === 'escalation' ? 'l-esc' : 'l-sys';
    const ico = l.type === 'reminder' ? '📨'     : l.type === 'escalation' ? '🚨'    : '⚙';
    const t   = new Date(l.time);
    return `<div class="log-item">
      <div class="log-icon ${ic}">${ico}</div>
      <div class="log-body">
        <div class="log-text">${esc(l.text)}</div>
        <div class="log-time">${t.toLocaleDateString('id-ID')} ${t.toLocaleTimeString('id-ID')}</div>
      </div>
    </div>`;
  }).join('');
}

function clearLogs() {
  if (!confirm('Hapus semua log?')) return;
  activityLogs = [];
  save(SK.logs, activityLogs);
  renderLogs();
  toast('Log dibersihkan');
}


// ── SETTINGS ───────────────────────────────────────────────────────
function loadSettings() {
  document.getElementById('set-fonnte-token').value  = settings.fonnteToken  || '';
  document.getElementById('set-country-code').value  = settings.countryCode  || DEFAULT_COUNTRY;
  if (settings.msg1) document.getElementById('set-msg-1').value = settings.msg1;
  if (settings.msg2) document.getElementById('set-msg-2').value = settings.msg2;
  if (settings.msg3) document.getElementById('set-msg-3').value = settings.msg3;
  document.getElementById('set-master-sid').value    = masterTokoConfig.spreadsheetId || '';
  document.getElementById('set-master-sheet').value  = masterTokoConfig.sheetName     || DEFAULT_MASTER_SHEET;
  document.getElementById('set-master-hr').value     = masterTokoConfig.headerRow     || DEFAULT_HEADER_ROW;
}

function saveSettings() {
  settings.fonnteToken  = document.getElementById('set-fonnte-token').value.trim();
  settings.countryCode  = document.getElementById('set-country-code').value.trim() || DEFAULT_COUNTRY;
  settings.msg1         = document.getElementById('set-msg-1').value;
  settings.msg2         = document.getElementById('set-msg-2').value;
  settings.msg3         = document.getElementById('set-msg-3').value;
  save(SK.settings, settings);
  toast('Settings tersimpan');
  addLog('system', 'Settings updated');
}

function saveMasterTokoSettings() {
  masterTokoConfig.spreadsheetId = document.getElementById('set-master-sid').value.trim();
  masterTokoConfig.sheetName     = document.getElementById('set-master-sheet').value.trim() || DEFAULT_MASTER_SHEET;
  masterTokoConfig.headerRow     = parseInt(document.getElementById('set-master-hr').value) || DEFAULT_HEADER_ROW;
  save(SK.master, masterTokoConfig);
  toast('Master Toko tersimpan');
  addLog('system', 'Master Toko config updated');
}

async function testMasterToko() {
  const sid = document.getElementById('set-master-sid').value.trim();
  const sn  = document.getElementById('set-master-sheet').value.trim() || DEFAULT_MASTER_SHEET;
  const hr  = parseInt(document.getElementById('set-master-hr').value) || DEFAULT_HEADER_ROW;
  if (!sid) { toast('Masukkan Spreadsheet ID', 'error'); return; }
  const el = document.getElementById('master-toko-status');
  el.innerHTML = '<span style="color:var(--blue)">Fetching...</span>';
  try {
    const rows   = await fetchSheet(sid, sn);
    const stores = parseMaster(rows, hr);
    const regions = [...new Set(stores.map(s => s.region))];
    const cities  = [...new Set(stores.map(s => s.city))];
    el.innerHTML = `<span style="color:var(--teal)">✓ ${stores.length} toko. ${regions.length} region, ${cities.length} kota.</span>`;
  } catch (e) {
    el.innerHTML = `<span style="color:var(--red)">Error: ${e.message}</span>`;
  }
}

async function testFonnte() {
  const t = document.getElementById('set-fonnte-token').value.trim();
  if (!t) { toast('Masukkan token', 'error'); return; }
  const result = await testFonnteConnection(t);
  toast(result.message, result.ok ? 'success' : 'error');
}


// ── MODAL HELPERS ──────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open');    }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// send-level / send-phone live listeners (attached at init)
function initSendModalListeners() {
  document.getElementById('send-level').addEventListener('change', updateSendPreview);
  document.getElementById('send-phone').addEventListener('input', function () {
    if (currentSendStore) currentSendStore.phone = this.value;
  });
}


// ── TOAST ──────────────────────────────────────────────────────────
function toast(m, t = 'success') {
  const e = document.createElement('div');
  e.className   = 'toast toast-' + t;
  e.textContent = m;
  document.getElementById('toast-container').appendChild(e);
  setTimeout(() => e.remove(), 3500);
}
