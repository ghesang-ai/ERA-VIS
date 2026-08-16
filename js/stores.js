/* ================================================================
   ERA-VIS AI v2.0 — stores.js
   Halaman Data Toko: load, filter, search, export, reminder table,
   store leader DB, message preview, WA send.
   Depends on: config.js, api.js
   ================================================================ */

'use strict';

// ── LOAD DATA TOKO ─────────────────────────────────────────────────
async function loadStoreData(cid) {
  let c = campaigns.find(x => x.id === cid);
  if (!c) return;

  resiStatusCache = _loadResiCache(cid);

  try {
    if (c.mode === 'excel') {
      if (!c.localStores || !c.localStores.length) {
        // Belum ada di device ini (mis. dibuka di HP) — tarik dari cloud
        toast('Mengambil data toko dari cloud...', 'info');
        const pulled = await ensureLocalStores(cid);
        if (!pulled.ok) { toastLocalStoresError(pulled); return; }
        c = campaigns.find(x => x.id === cid) || c;
      }
      let importRows = [];
      if (c.responseSheetId) {
        try { importRows = await fetchSheet(c.responseSheetId, c.importSheet || DEFAULT_IMPORT_SHEET); }
        catch (e) { /* silent — no import sheet yet */ }
      }
      currentImportData = parseImport(importRows);
      currentMasterData = mergeStatusFromImport(c.localStores, currentImportData);
    } else {
      const rows = await fetchSheet(c.spreadsheetId, c.masterSheet);
      currentMasterData = parseMaster(rows, c.headerRow || DEFAULT_HEADER_ROW);
    }

    // Filter toko tutup
    if (closedStoreCodes.size > 0) {
      currentMasterData = currentMasterData.filter(
        s => !closedStoreCodes.has(normalizeKodeStore(s.plantCode))
      );
    }

    // Populate WR cache agar Weekly Report bisa pakai data yang sudah ter-merge
    window._eravisWrDataCache = window._eravisWrDataCache || {};
    window._eravisWrDataCache[c.id] = currentMasterData.slice();

    allMasterToko = await fetchMasterToko(masterTokoConfig);

    // ── Populate region filter ──────────────────────────────────
    const allStores = [...currentMasterData];
    if (allMasterToko.length > 0) {
      const campaignCodes = new Set(currentMasterData.map(s => s.plantCode));
      allMasterToko.forEach(s => {
        if (!campaignCodes.has(s.plantCode)) allStores.push({ ...s, status: STATUS.NOT_IKUT });
      });
    }

    const regions = [...new Set(allStores.map(s => s.region))].filter(Boolean).sort();
    const rSel = document.getElementById('store-region-filter');
    rSel.innerHTML = '<option value="">Semua Region</option>' +
      regions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');

    updateStoreCityFilter();
    renderParticipationSummary(currentMasterData, allMasterToko);
    renderStoreTable();

  } catch (err) {
    toast('Gagal load: ' + err.message, 'error');
  }
}


// ── CITY FILTER (dynamic based on selected region) ─────────────────
function updateStoreCityFilter() {
  const region   = document.getElementById('store-region-filter').value;
  const allStores = getDisplayStores();
  const source   = region ? allStores.filter(s => s.region === region) : allStores;
  const cities   = [...new Set(source.map(s => s.city).filter(Boolean))].sort();

  const cSel = document.getElementById('store-city-filter');
  const prev = cSel.value;
  cSel.innerHTML = '<option value="">Semua City</option>' +
    cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  if (prev && cities.includes(prev)) cSel.value = prev;
  else cSel.value = '';
}


// ── GET DISPLAY STORES ─────────────────────────────────────────────
function getDisplayStores() {
  return [...currentMasterData];
}


// ── RESI TRACKING ─────────────────────────────────────────────────
let resiStatusCache = {};
let resiCheckInProgress = false;
const RESI_CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam

function _loadResiCache(cid) {
  try {
    const raw = localStorage.getItem('era_resi_cache_' + cid);
    if (!raw) return {};
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > RESI_CACHE_TTL_MS) return {};
    return data || {};
  } catch { return {}; }
}

function _saveResiCache(cid) {
  try {
    localStorage.setItem('era_resi_cache_' + cid, JSON.stringify({ ts: Date.now(), data: resiStatusCache }));
  } catch {}
}

function _resiStatusBadge(resi) {
  if (!resi) return '<span style="color:var(--muted);font-size:11px">—</span>';
  const st = resiStatusCache[resi];
  if (!st) return `<span style="color:var(--muted);font-size:11px">${esc(resi)}</span>`;
  if (st === 'loading') return '<span style="color:var(--muted);font-size:11px">Mengecek...</span>';
  if (st === 'error')   return `<span style="color:var(--red);font-size:11px" title="${esc(resi)}">Gagal</span>`;
  const map = {
    RECEIVED : { label: 'Terkirim',          cls: 'badge-done' },
    DELIVERY : { label: 'Dalam Perjalanan',   cls: 'badge-pending' },
    'PICK UP': { label: 'Diproses',           cls: 'badge-sent' },
  };
  const info = map[st] || { label: st, cls: 'badge-muted' };
  return `<span class="badge ${info.cls}" title="${esc(resi)}">${info.label}</span>`;
}

async function checkResiStatus() {
  if (resiCheckInProgress) return;
  const cid = document.getElementById('store-campaign-select').value;
  // Cuma cek resi toko yang lolos filter Region/Status/City/Search yang
  // lagi aktif (sama seperti renderStoreTable()) — bukan selalu seluruh
  // campaign yang bisa ribuan resi dan lama. Persempit dulu lewat filter
  // kalau mau proses lebih cepat.
  const filteredStores = getFilteredStoreRows();
  const stores = filteredStores.filter(s => s.nomorResi && s.nomorResi.trim());
  if (!stores.length) { toast('Tidak ada No Resi di toko yang lolos filter saat ini', 'warn'); return; }

  resiCheckInProgress = true;
  const btn = document.getElementById('btn-cek-resi');
  if (btn) { btn.disabled = true; btn.textContent = '🚚 Mengecek...'; }

  const resiNums = [...new Set(stores.map(s => s.nomorResi.trim()))];
  toast(`Mengecek ${resiNums.length} resi...`, 'info');

  resiNums.forEach(r => { if (!resiStatusCache[r] || resiStatusCache[r] === 'error') resiStatusCache[r] = 'loading'; });
  renderStoreTable();

  let checked = 0;
  for (const resi of resiNums) {
    // 'error' SENGAJA tidak dianggap "sudah dicek" — kalau tidak, resi yang
    // gagal di percobaan pertama (mis. timeout sesaat) akan macet selamanya
    // di status "Gagal" untuk sisa 1 jam cache TTL, walau user klik ulang
    // tombolnya berkali-kali. Cuma status yang BENERAN berhasil (RECEIVED,
    // DELIVERY, dst) yang di-skip supaya tidak fetch ulang tanpa perlu.
    const cached = resiStatusCache[resi];
    if (cached && cached !== 'loading' && cached !== 'error') { checked++; continue; }
    // Timeout per request — tanpa ini, 1 request yang macet (mis. API
    // 21Express mulai throttle diam-diam setelah ratusan request beruntun
    // tanpa jeda) bikin await fetch() menggantung SELAMANYA dan seluruh
    // sisa batch (bisa ratusan toko lagi) tidak pernah lanjut — macet total
    // tanpa error, cuma tombol "Mengecek..." yang tidak pernah selesai.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const resp = await fetch(`/.netlify/functions/track-resi?resi=${encodeURIComponent(resi)}`, { signal: controller.signal });
      const data = await resp.json();
      const results = data?.express21?.results?.data;
      if (results && results.length > 0) {
        const detail = results[0]?.shipment_detail;
        resiStatusCache[resi] = detail?.status || 'UNKNOWN';
      } else {
        resiStatusCache[resi] = 'error';
      }
    } catch (e) {
      resiStatusCache[resi] = 'error';
    } finally {
      clearTimeout(timeoutId);
    }
    checked++;
    if (checked % 5 === 0) renderStoreTable();
    if (checked % 50 === 0) toast(`Mengecek resi... ${checked}/${resiNums.length}`, 'info');
  }

  _saveResiCache(cid);
  renderStoreTable();
  toast(`Selesai! ${resiNums.length} resi dicek. Cache disimpan 1 jam.`);
  resiCheckInProgress = false;
  if (btn) { btn.disabled = false; btn.textContent = '🚚 Cek Status Resi'; }
}


// ── RENDER STORE TABLE ─────────────────────────────────────────────
// Filter Region/Status/City/Search yang lagi aktif di toolbar — dipakai
// bareng oleh renderStoreTable() (tampilan tabel) dan checkResiStatus()
// (supaya bisa cek resi cuma untuk toko yang lagi ditampilkan, bukan
// selalu seluruh campaign yang bisa ribuan resi dan lama).
function getFilteredStoreRows() {
  const region = document.getElementById('store-region-filter').value;
  const status = document.getElementById('store-status-filter').value;
  const city   = document.getElementById('store-city-filter').value;
  const search = document.getElementById('store-search').value.toLowerCase();

  let stores = getDisplayStores();
  if (region) stores = stores.filter(s => s.region === region);
  if (status) stores = stores.filter(s => s.status === status);
  if (city)   stores = stores.filter(s => s.city === city);
  if (search) stores = stores.filter(s =>
    s.plantCode.toLowerCase().includes(search) ||
    s.plantDesc.toLowerCase().includes(search) ||
    s.city.toLowerCase().includes(search)
  );
  return stores;
}

function renderStoreTable() {
  const stores = getFilteredStoreRows();

  document.getElementById('store-count').textContent = stores.length + ' toko';
  const tbody = document.getElementById('store-tbody');

  // Show/hide Cek Resi button based on whether campaign has resi data
  const hasResi = getDisplayStores().some(s => s.nomorResi && s.nomorResi.trim());
  const resiBtn = document.getElementById('btn-cek-resi');
  if (resiBtn) resiBtn.style.display = hasResi ? '' : 'none';

  if (!stores.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:20px">Tidak ada data</td></tr>';
    return;
  }

  tbody.innerHTML = stores.map((s, i) => {
    const badgeClass = s.status === STATUS.DONE     ? 'badge-done'
                     : s.status === STATUS.NOT_DONE ? 'badge-notdone'
                     :                                'badge-muted';
    const resi = s.nomorResi ? s.nomorResi.trim() : '';
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(s.region)}</td>
      <td><strong>${esc(s.plantCode)}</strong></td>
      <td>${esc(s.plantDesc)}</td>
      <td><span class="badge ${badgeClass}">${s.status}</span></td>
      <td>${esc(s.city)}</td>
      <td style="font-family:var(--mono);font-size:11px">${resi ? esc(resi) : '<span style="color:var(--muted)">—</span>'}</td>
      <td>${_resiStatusBadge(resi)}</td>
      <td>${s.dokumentasi && s.dokumentasi.startsWith('http')
        ? `<a href="${esc(s.dokumentasi)}" target="_blank">Lihat</a>`
        : '—'}</td>
    </tr>`;
  }).join('');
}


// ── PARTICIPATION SUMMARY ──────────────────────────────────────────
function renderParticipationSummary(campaignStores, masterStores) {
  const el = document.getElementById('participation-summary');
  if (!masterStores.length) { el.style.display = 'none'; return; }

  const ikut      = campaignStores.length;
  const total     = masterStores.length;
  const tidakIkut = total - ikut;
  const pct       = total > 0 ? Math.round(ikut / total * 100) : 0;
  const circ      = 2 * Math.PI * 20;
  const off       = circ - (pct / 100) * circ;

  el.style.display = '';
  el.innerHTML = `
    <div class="part-summary">
      <div class="part-ring">
        <svg viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="20" fill="none" stroke="#BFDBFE" stroke-width="5"/>
          <circle cx="28" cy="28" r="20" fill="none" stroke="var(--blue)" stroke-width="5"
            stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}"
            transform="rotate(-90 28 28)"/>
        </svg>
        <div class="pr-text">${pct}%</div>
      </div>
      <div class="part-info">
        <strong>${ikut} toko</strong> ikut campaign ini dari total
        <strong>${total} toko</strong> Erafone.
        <span style="color:var(--red);font-weight:600">${tidakIkut} toko tidak dialokasi.</span>
      </div>
    </div>`;
}


// ── FILTER EVENT LISTENERS ─────────────────────────────────────────
// (dipanggil dari index.html setelah DOM ready via initStoreListeners)
function initStoreListeners() {
  document.getElementById('store-region-filter')
    .addEventListener('change', () => { updateStoreCityFilter(); renderStoreTable(); _updateCopyBtn(); });

  document.getElementById('store-status-filter')
    .addEventListener('change', () => { renderStoreTable(); _updateCopyBtn(); });

  ['store-city-filter'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderStoreTable)
  );

  document.getElementById('store-search')
    .addEventListener('input', renderStoreTable);
}

function _updateCopyBtn() {
  const status = document.getElementById('store-status-filter').value;
  const btn = document.getElementById('btn-copy-text');
  if (btn) btn.style.display = status === 'NOT DONE' ? '' : 'none';
}


// ── COPY TO TEXT ───────────────────────────────────────────────────
function copyStoresToText() {
  const stores = getFilteredStoreRows();
  if (!stores.length) { toast('Tidak ada data NOT DONE', 'error'); return; }

  // Group by city
  const grouped = {};
  stores.forEach(s => {
    const c = (s.city || 'LAINNYA').toUpperCase();
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(s.plantDesc || s.plantCode);
  });

  const lines = [];
  Object.keys(grouped).sort().forEach(cityName => {
    lines.push(`AREA ${cityName} :`);
    lines.push('');
    grouped[cityName].forEach(name => lines.push(`${name}❌`));
    lines.push('');
  });

  const text = lines.join('\n').trim();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast(`${stores.length} toko NOT DONE disalin ke clipboard!`),
      () => _fallbackCopyStoreText(text)
    );
  } else {
    _fallbackCopyStoreText(text);
  }
}

function _fallbackCopyStoreText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('Disalin ke clipboard!');
  } catch (e) {
    toast('Gagal copy: ' + e.message, 'error');
  }
  document.body.removeChild(ta);
}


// ── EXPORT EXCEL ───────────────────────────────────────────────────
function exportExcel() {
  if (!currentMasterData.length) { toast('Tidak ada data', 'error'); return; }

  const cid  = document.getElementById('store-campaign-select').value;
  const c    = campaigns.find(x => x.id === cid);
  const name = c ? c.name : 'ERA-VIS Export';
  const done = currentMasterData.filter(s => s.status === STATUS.DONE).length;
  const nd   = currentMasterData.length - done;

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: MASTER GHS ────────────────────────────────────────
  const masterData = [
    ['', '', `STORE SUDAH UPLOAD DOKUMENTASI: ${done}`, '', '', '', '', '', ''],
    ['', '', `STORE BELUM UPLOAD DOKUMENTASI: ${nd}`,   '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['No', 'Region', 'Plant Code', 'Plant Desc', 'City', 'Nomor Resi', 'Dokumentasi', 'STATUS', 'PENERIMA'],
    ...currentMasterData.map((s, i) => [
      i + 1, s.region, s.plantCode, s.plantDesc,
      s.city, s.nomorResi, s.dokumentasi, s.status, s.penerima,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(masterData);
  ws['!cols'] = [
    { wch:5 },{ wch:12 },{ wch:12 },{ wch:38 },
    { wch:22 },{ wch:16 },{ wch:60 },{ wch:12 },{ wch:12 },
  ];
  ws['!merges'] = [
    { s:{r:0,c:2}, e:{r:0,c:5} },
    { s:{r:1,c:2}, e:{r:1,c:5} },
  ];

  // Colour STATUS cells
  for (let r = 5; r < masterData.length; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 7 });
    if (ws[addr]) {
      ws[addr].s = ws[addr].v === STATUS.DONE
        ? { font:{ bold:true, color:{ rgb:'0B8F6C' } }, fill:{ fgColor:{ rgb:'E6F7F2' } } }
        : { font:{ bold:true, color:{ rgb:'DC2626' } }, fill:{ fgColor:{ rgb:'FEF2F2' } } };
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, 'MASTER GHS');

  // ── Sheet 2: IMPORTING ─────────────────────────────────────────
  if (currentImportData.length) {
    const impData = [
      ['Timestamp', 'Kode Store', 'Nama Store', 'Region', 'Upload Dokumentasi'],
      ...currentImportData.map(s => [s.timestamp, s.kodeStore, s.namaStore, s.region, s.dokumentasi]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(impData);
    ws2['!cols'] = [{ wch:22 },{ wch:12 },{ wch:35 },{ wch:12 },{ wch:60 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'IMPORTING');
  }

  // ── Sheet 3: Tidak Ikut ────────────────────────────────────────
  if (allMasterToko.length > 0) {
    const codes    = new Set(currentMasterData.map(s => s.plantCode));
    const tidakIkut = allMasterToko.filter(s => !codes.has(s.plantCode));
    if (tidakIkut.length) {
      const tiData = [
        ['No', 'Region', 'Plant Code', 'Plant Desc', 'City', 'Keterangan'],
        ...tidakIkut.map((s, i) => [i+1, s.region, s.plantCode, s.plantDesc, s.city, 'TIDAK IKUT CAMPAIGN']),
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(tiData);
      ws3['!cols'] = [{ wch:5 },{ wch:12 },{ wch:12 },{ wch:38 },{ wch:22 },{ wch:22 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'TIDAK IKUT');
    }
  }

  const fileName = `ERAVIS_${name.replace(/[^a-zA-Z0-9]/g,'_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
  toast('Excel berhasil di-download');
  addLog('system', 'Export Excel: ' + fileName);
}


// ── AUTO REMINDER PAGE ─────────────────────────────────────────────
async function loadReminderPage(cid) {
  let c = campaigns.find(x => x.id === cid);
  if (!c) return;

  try {
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
      currentImportData = parseImport(importRows);
      currentMasterData = mergeStatusFromImport(c.localStores, currentImportData);
    } else {
      const rows = await fetchSheet(c.spreadsheetId, c.masterSheet);
      currentMasterData = parseMaster(rows, c.headerRow || DEFAULT_HEADER_ROW);
    }

    // Populate region filter
    const notDoneAll = currentMasterData.filter(s => s.status === STATUS.NOT_DONE);
    const regions    = [...new Set(notDoneAll.map(s => s.region).filter(Boolean))].sort();
    const rSel       = document.getElementById('rem-region-filter');
    const prevReg    = rSel.value;
    rSel.innerHTML   = '<option value="">Semua Region</option>' +
      regions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    if (prevReg && regions.includes(prevReg)) rSel.value = prevReg;

    // Populate city filter
    const cities  = [...new Set(notDoneAll.map(s => s.city).filter(Boolean))].sort();
    const cSel    = document.getElementById('rem-city-filter');
    const prevCity = cSel.value;
    cSel.innerHTML = '<option value="">Semua City</option>' +
      cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (prevCity && cities.includes(prevCity)) cSel.value = prevCity;

    renderReminderTable();
    showMsgPreview(1);

  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
}

function renderReminderTable() {
  const cid     = document.getElementById('rem-campaign-select').value;
  const c       = campaigns.find(x => x.id === cid);
  const regionF = document.getElementById('rem-region-filter').value;
  const cityF   = document.getElementById('rem-city-filter').value;
  const slF     = document.getElementById('rem-sl-filter').value;

  let notDone = currentMasterData.filter(s => s.status === STATUS.NOT_DONE);
  if (regionF) notDone = notDone.filter(s => s.region === regionF);
  if (cityF)   notDone = notDone.filter(s => s.city   === cityF);
  if (slF === 'ada')   notDone = notDone.filter(s =>  getSL(s.plantCode));
  if (slF === 'belum') notDone = notDone.filter(s => !getSL(s.plantCode));

  // Update city filter when region changes
  if (regionF) {
    const filtered = currentMasterData.filter(s => s.status === STATUS.NOT_DONE && s.region === regionF);
    const cities   = [...new Set(filtered.map(s => s.city).filter(Boolean))].sort();
    const cSel     = document.getElementById('rem-city-filter');
    const prev     = cSel.value;
    cSel.innerHTML = '<option value="">Semua City</option>' +
      cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (prev && cities.includes(prev)) cSel.value = prev;
  }

  const totalNd = currentMasterData.filter(s => s.status === STATUS.NOT_DONE).length;
  document.getElementById('rem-count').textContent =
    notDone.length === totalNd
      ? `${totalNd} belum submit`
      : `${notDone.length} dari ${totalNd} belum submit`;

  const tbody = document.getElementById('rem-tbody');
  if (!notDone.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:20px">${
      totalNd ? 'Tidak ada toko yang cocok dengan filter' : 'Semua sudah submit! ✅'
    }</td></tr>`;
    return;
  }

  const hist = reminderHistory[cid] || {};
  tbody.innerHTML = notDone.map(s => {
    const h      = hist[s.plantCode];
    const lv     = h ? Math.min(h.level + 1, 3) : 1;
    const lb     = lv === 1 ? 'badge-sent' : lv === 2 ? 'badge-pending' : 'badge-escalated';
    const lt     = lv === 1 ? 'Gentle' : lv === 2 ? 'Urgent' : 'Escalate';
    const sl      = getSL(s.plantCode);
    const hasPhone = sl && sl.phone;
    const slName  = sl && sl.name
      ? esc(sl.name)
      : '<span style="color:var(--muted)">—</span>';
    const slPhone = hasPhone
      ? `<span style="font-family:var(--mono);font-size:11px;color:var(--teal)">${esc(sl.phone)}</span>`
      : sl
        ? '<span style="color:var(--orange);font-size:11px">No HP kosong</span>'
        : '<span style="color:var(--red);font-size:11px">Tidak di DB</span>';

    return `<tr>
      <td><input type="checkbox" class="rem-check" data-code="${esc(s.plantCode)}"></td>
      <td><strong>${esc(s.plantCode)}</strong></td>
      <td>${esc(s.plantDesc)}</td>
      <td>${esc(s.region)}</td>
      <td>${esc(s.city)}</td>
      <td style="font-size:12px">${slName}</td>
      <td>${slPhone}</td>
      <td><span class="badge ${lb}">Lv.${lv} ${lt}</span></td>
      <td>
        <button class="btn btn-sm btn-green" ${hasPhone ? '' : 'disabled title="No HP belum ada"'}
          onclick="${hasPhone ? `openSendModal('${esc(s.plantCode)}','${esc(s.plantDesc)}','${esc(sl.phone)}',${lv})` : 'void(0)'}">
          Kirim
        </button>
      </td>
    </tr>`;
  }).join('');
}

function toggleAllReminder(el) {
  document.querySelectorAll('.rem-check').forEach(cb => cb.checked = el.checked);
}


// ── SEND MODAL ─────────────────────────────────────────────────────
function openSendModal(code, name, phone, level) {
  const cid = document.getElementById('rem-campaign-select').value;
  currentSendStore = { code, name, phone, level, campaignId: cid };
  document.getElementById('send-store-name').value = `${name} (${code})`;
  document.getElementById('send-phone').value       = phone;
  document.getElementById('send-level').value       = level;
  updateSendPreview();
  openModal('modal-send');
}

function updateSendPreview() {
  if (!currentSendStore) return;
  const lv   = document.getElementById('send-level').value;
  const c    = campaigns.find(x => x.id === currentSendStore.campaignId);
  const s    = currentMasterData.find(x => x.plantCode === currentSendStore.code);
  const msg  = buildMsg(
    parseInt(lv), currentSendStore.name, currentSendStore.code,
    c ? c.name : '', c ? c.formLink || '' : '',
    s ? s.region : '', s ? s.city : ''
  );
  document.getElementById('send-preview').innerHTML =
    `<div class="wa-bubble">${esc(msg).replace(/\n/g, '<br>')}</div>`;
}

async function confirmSendReminder() {
  if (!currentSendStore) return;
  const phone = document.getElementById('send-phone').value.trim();
  if (!phone) { toast('No. WA kosong!', 'error'); return; }

  const lv  = parseInt(document.getElementById('send-level').value);
  const c   = campaigns.find(x => x.id === currentSendStore.campaignId);
  const s   = currentMasterData.find(x => x.plantCode === currentSendStore.code);
  const msg = buildMsg(
    lv, currentSendStore.name, currentSendStore.code,
    c ? c.name : '', c ? c.formLink || '' : '',
    s ? s.region : '', s ? s.city : ''
  );

  toast('Mengirim...', 'info');
  const ok = await sendViaFonnte(phone, msg, settings);
  if (ok) {
    toast('Terkirim ke ' + currentSendStore.name);
    if (!reminderHistory[currentSendStore.campaignId]) reminderHistory[currentSendStore.campaignId] = {};
    reminderHistory[currentSendStore.campaignId][currentSendStore.code] = {
      level: lv, sentAt: new Date().toISOString(), phone,
    };
    save(SK.reminders, reminderHistory);
    addLog('reminder', `Lv.${lv} to ${currentSendStore.name} (${phone})`);
    closeModal('modal-send');
    loadReminderPage(currentSendStore.campaignId);
  }
}

async function scanAndRemind() {
  const cid = document.getElementById('rem-campaign-select').value;
  if (!cid) { toast('Pilih campaign', 'error'); return; }
  const c       = campaigns.find(x => x.id === cid);
  const notDone = currentMasterData.filter(s => s.status === STATUS.NOT_DONE && getSL(s.plantCode));
  if (!notDone.length) { toast('Tidak ada toko dengan no. HP di database SL', 'warn'); return; }
  if (!settings.fonnteToken) { toast('Set Fonnte Token!', 'error'); return; }
  if (!confirm(`Kirim ke ${notDone.length} toko?`)) return;

  let sent = 0;
  for (const s of notDone) {
    const sl = getSL(s.plantCode); if (!sl) continue;
    const h  = (reminderHistory[cid] || {})[s.plantCode];
    const lv = h ? Math.min(h.level + 1, 3) : 1;
    const ok = await sendViaFonnte(sl.phone, buildMsg(lv, s.plantDesc, s.plantCode, c.name, c.formLink||'', s.region, s.city), settings);
    if (ok) {
      sent++;
      if (!reminderHistory[cid]) reminderHistory[cid] = {};
      reminderHistory[cid][s.plantCode] = { level: lv, sentAt: new Date().toISOString(), phone: sl.phone };
    }
    await new Promise(r => setTimeout(r, REMINDER_DELAY_MS));
  }
  save(SK.reminders, reminderHistory);
  addLog('reminder', `Scan: ${sent}/${notDone.length} for ${c.name}`);
  toast(`${sent} terkirim`);
  loadReminderPage(cid);
}

async function sendBulkReminder() {
  const checked = [...document.querySelectorAll('.rem-check:checked')];
  if (!checked.length) { toast('Centang dulu', 'warn'); return; }
  const cid = document.getElementById('rem-campaign-select').value;
  const c   = campaigns.find(x => x.id === cid);
  if (!settings.fonnteToken) { toast('Set Fonnte Token!', 'error'); return; }
  if (!confirm(`Blast ${checked.length} toko?`)) return;

  let sent = 0;
  for (const cb of checked) {
    const code = cb.dataset.code;
    const s    = currentMasterData.find(x => x.plantCode === code); if (!s) continue;
    const sl   = getSL(code);
    if (!sl) { toast('No HP tidak ada untuk ' + code, 'warn'); continue; }
    const h  = (reminderHistory[cid] || {})[code];
    const lv = h ? Math.min(h.level + 1, 3) : 1;
    if (await sendViaFonnte(sl.phone, buildMsg(lv, s.plantDesc, s.plantCode, c.name, c.formLink||'', s.region, s.city), settings)) {
      sent++;
      if (!reminderHistory[cid]) reminderHistory[cid] = {};
      reminderHistory[cid][code] = { level: lv, sentAt: new Date().toISOString(), phone: sl.phone };
    }
    await new Promise(r => setTimeout(r, REMINDER_DELAY_MS));
  }
  save(SK.reminders, reminderHistory);
  addLog('reminder', `Blast: ${sent}/${checked.length} for ${c.name}`);
  toast(`${sent} terkirim`);
  loadReminderPage(cid);
}


// ── MESSAGE BUILDER ────────────────────────────────────────────────
function buildMsg(lv, name, code, camp, form, region, city) {
  const tpl = {
    1 : settings.msg1 || document.getElementById('set-msg-1').value,
    2 : settings.msg2 || document.getElementById('set-msg-2').value,
    3 : settings.msg3 || document.getElementById('set-msg-3').value,
  };
  return (tpl[lv] || tpl[1])
    .replace(/\{nama_store\}/g,  name)
    .replace(/\{kode_store\}/g,  code)
    .replace(/\{campaign\}/g,    camp)
    .replace(/\{link_form\}/g,   form)
    .replace(/\{region\}/g,      region)
    .replace(/\{city\}/g,        city);
}

function showMsgPreview(lv) {
  const cid = document.getElementById('rem-campaign-select').value;
  const c   = campaigns.find(x => x.id === cid);
  const msg = buildMsg(
    lv, '{nama_store}', '{kode_store}',
    c ? c.name : '{campaign}',
    c ? c.formLink || '{link_form}' : '{link_form}',
    '{region}', '{city}'
  );
  document.getElementById('msg-preview').innerHTML =
    `<div class="wa-bubble">${esc(msg).replace(/\n/g, '<br>')}</div>`;
}

function switchMsgTab(el, lv) {
  el.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  showMsgPreview(lv);
}


// ── STORE LEADER DATABASE ──────────────────────────────────────────
function getSL(plantCode) {
  return storeLeaderDB[String(plantCode).toUpperCase()] || null;
}

function handleSLDBDrop(e) {
  e.preventDefault();
  document.getElementById('sldb-dropzone').classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) handleSLDBFile(f);
}

function handleSLDBFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wb    = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const db    = parseStoreLeaderExcel(wb);
      const count = Object.keys(db).length;
      if (!count) { toast('Tidak ada data SL ditemukan', 'error'); return; }

      storeLeaderDB = db;
      save(SK.sldb, storeLeaderDB);

      document.getElementById('sldb-dropzone').className        = 'dropzone loaded';
      document.getElementById('sldb-dropzone').style.padding    = '16px 12px';
      document.getElementById('sldb-dropzone-label').textContent = `✓ ${file.name} (${count} toko)`;
      document.getElementById('sldb-badge').textContent          = count + ' toko';
      document.getElementById('sldb-status').innerHTML =
        `<span style="color:var(--teal)">✓ ${count} Store Leader tersimpan. Diperbarui: ${new Date().toLocaleString('id-ID')}</span>`;
      document.getElementById('sldb-preview-wrap').style.display = '';
      renderSLDBPreview();

      addLog('system', `DB Store Leader diperbarui: ${count} toko dari ${file.name}`);
      toast(count + ' Store Leader tersimpan!');
    } catch (err) {
      toast('Gagal baca Excel: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderSLDBPreview() {
  const q       = (document.getElementById('sldb-search')?.value || '').toLowerCase();
  const entries = Object.entries(storeLeaderDB).filter(([k, v]) =>
    !q || k.toLowerCase().includes(q) || v.name.toLowerCase().includes(q) || v.storeName.toLowerCase().includes(q)
  );
  const tbody = document.getElementById('sldb-tbody');
  if (!tbody) return;
  tbody.innerHTML = entries.slice(0, 50).map(([code, v]) =>
    `<tr>
       <td><strong>${esc(code)}</strong></td>
       <td style="font-size:11px">${esc(v.storeName)}</td>
       <td>${esc(v.name)}</td>
       <td style="font-family:var(--mono);color:var(--teal)">${esc(v.phone)}</td>
     </tr>`
  ).join('');
}

// ── CLOSED STORES ──────────────────────────────────────────────────

function handleClosedStoresDrop(event) {
  event.preventDefault();
  document.getElementById('closed-dropzone').classList.remove('over');
  const f = event.dataTransfer.files[0];
  if (f) handleClosedStoresFile(f);
}

function handleClosedStoresFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wb    = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const codes = parseClosedStoresExcel(wb);
      if (!codes.length) { toast('Tidak ada kode toko ditemukan', 'error'); return; }

      closedStoreCodes = new Set(codes);
      save(SK.closedStores, codes);

      document.getElementById('closed-dropzone').className          = 'dropzone loaded';
      document.getElementById('closed-dropzone-label').textContent  = `✓ ${file.name} (${codes.length} toko tutup)`;
      document.getElementById('closed-badge').textContent           = codes.length + ' toko';
      document.getElementById('closed-status').innerHTML =
        `<span style="color:var(--teal)">✓ ${codes.length} toko tutup tersimpan. Diperbarui: ${new Date().toLocaleString('id-ID')}</span>`;
      document.getElementById('closed-preview-wrap').style.display  = '';
      _renderClosedPreview(codes);

      // Reset WR cache agar Weekly Report ikut ter-update
      window._eravisWrDataCache = {};

      addLog('system', `Closed Stores diperbarui: ${codes.length} toko dari ${file.name}`);
      toast(`${codes.length} toko tutup disimpan — semua campaign ter-update!`);
    } catch (err) {
      toast('Gagal baca Excel: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function _renderClosedPreview(codes) {
  const tbody = document.getElementById('closed-tbody');
  if (!tbody) return;
  tbody.innerHTML = codes.slice(0, 50).map(code =>
    `<tr><td><strong>${esc(code)}</strong></td><td style="font-size:11px;color:var(--muted)">—</td></tr>`
  ).join('');
}

function initClosedStoresSettings() {
  const count = closedStoreCodes.size;
  document.getElementById('closed-badge').textContent = count > 0 ? count + ' toko' : '—';
  if (count > 0) {
    document.getElementById('closed-dropzone').className         = 'dropzone loaded';
    document.getElementById('closed-dropzone-label').textContent = `✓ ${count} toko tutup tersimpan`;
    document.getElementById('closed-status').innerHTML =
      `<span style="color:var(--teal)">Database aktif — ${count} toko tutup disembunyikan dari semua campaign.</span>`;
    document.getElementById('closed-preview-wrap').style.display = '';
    _renderClosedPreview([...closedStoreCodes]);
  }
}


function initSLDBSettings() {
  const count = Object.keys(storeLeaderDB).length;
  document.getElementById('sldb-badge').textContent = count > 0 ? count + ' toko' : '—';
  if (count > 0) {
    document.getElementById('sldb-dropzone').className        = 'dropzone loaded';
    document.getElementById('sldb-dropzone').style.padding    = '16px 12px';
    document.getElementById('sldb-dropzone-label').textContent = `✓ ${count} Store Leader tersimpan di database`;
    document.getElementById('sldb-status').innerHTML =
      `<span style="color:var(--teal)">Database aktif — ${count} toko. Upload ulang untuk update rotasi.</span>`;
    document.getElementById('sldb-preview-wrap').style.display = '';
    renderSLDBPreview();
  }
}
