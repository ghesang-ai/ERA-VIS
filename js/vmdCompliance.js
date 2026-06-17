/* ================================================================
   ERA-VIS AI v2.0 — vmdCompliance.js
   Visual Merchandising Compliance — matriks kepatuhan per toko
   per bulan, di-pivot dari semua campaign visibility bulan tsb.

   Konsep:
     - Baris  = toko (SAP / Plant Code + Store Name)
     - Kolom  = setiap campaign visibility yang deadline-nya di bulan ini
     - Sel    = DONE (✓100) / NOT DONE (✕) / — (tidak dialokasi)
     - SCORING = % kepatuhan toko = jumlah DONE ÷ jumlah program × 100
   ================================================================ */
'use strict';

// ── STATE ─────────────────────────────────────────────────────────
const vmdState = {
  monthKey  : 'current',
  monthLabel: 'April 2026',
  regionKey : 'ALL',
  statusKey : 'ALL',          // ALL | PATUH | SEBAGIAN | TIDAK
  search    : '',
  cols      : [],
  rows      : [],             // hasil fetch (sebelum filter status/search)
  loading   : false,
  _init     : false,
};


// ── MONTH MAP (selaras dengan summaryReport / weeklyReport) ───────
const VMD_MONTH_MAP = {
  'jan_2026': { label: 'Januari 2026',   num: 1,  year: 2026 },
  'feb_2026': { label: 'Februari 2026',  num: 2,  year: 2026 },
  'mar_2026': { label: 'Maret 2026',     num: 3,  year: 2026 },
  'current' : { label: 'April 2026',     num: 4,  year: 2026 },
  'apr_2026': { label: 'April 2026',     num: 4,  year: 2026 },
  'may_2026': { label: 'Mei 2026',       num: 5,  year: 2026 },
  'jun_2026': { label: 'Juni 2026',      num: 6,  year: 2026 },
  'jul_2026': { label: 'Juli 2026',      num: 7,  year: 2026 },
  'aug_2026': { label: 'Agustus 2026',   num: 8,  year: 2026 },
  'sep_2026': { label: 'September 2026', num: 9,  year: 2026 },
  'oct_2026': { label: 'Oktober 2026',   num: 10, year: 2026 },
  'nov_2026': { label: 'November 2026',  num: 11, year: 2026 },
  'dec_2026': { label: 'Desember 2026',  num: 12, year: 2026 },
};

function _vmdMonthInfo(key) {
  return VMD_MONTH_MAP[key] || VMD_MONTH_MAP['current'];
}

// Cek apakah deadline campaign jatuh di bulan/tahun tertentu
function _vmdCampaignInMonth(c, num, year) {
  if (!c.deadline) return false;
  const dl = new Date(c.deadline + 'T00:00:00');
  return dl.getMonth() + 1 === num && dl.getFullYear() === year;
}

// Label kolom ringkas — buang suffix "— Bulan Tahun" dari nama campaign
function _vmdColLabel(c) {
  let n = (c.name || '').trim();
  // buang " — April 2026" / " - April 2026" / trailing tahun
  n = n.replace(/\s*[—\-–]\s*[A-Za-z]+\s*\d{4}\s*$/u, '');
  n = n.replace(/\s+\d{4}\s*$/u, '');
  return n.trim() || (c.name || '—');
}


// ── INIT ──────────────────────────────────────────────────────────
function initVmdCompliance() {
  if (!vmdState._init) {
    vmdState._init = true;
    const sEl = document.getElementById('vmd-search');
    if (sEl) sEl.addEventListener('input', function () {
      vmdState.search = this.value.toLowerCase();
      _renderVmdTable();
    });
    const stEl = document.getElementById('vmd-status-filter');
    if (stEl) stEl.addEventListener('change', function () {
      vmdState.statusKey = this.value;
      _renderVmdTable();
    });
  }
  if (vmdState.rows.length === 0) {
    _vmdShowEmpty(true);
  } else {
    _vmdShowResult(true);
  }
}


// ── DATA: ambil store list per campaign (reuse pipeline ERA-VIS) ──
async function _vmdCampaignStores(c) {
  // Prioritas 1: cache sesi (sama dengan Weekly/Summary Report)
  if (window._eravisWrDataCache && window._eravisWrDataCache[c.id]) {
    return window._eravisWrDataCache[c.id];
  }
  let merged = [];
  try {
    if (c.mode === 'excel') {
      const masterStores = Array.isArray(c.localStores) ? c.localStores : [];
      let importRows = [];
      if (c.responseSheetId) {
        try { importRows = await fetchSheet(c.responseSheetId, c.importSheet || DEFAULT_IMPORT_SHEET); }
        catch (e) { console.warn('[VMD] import fetch fail:', c.name, e.message); }
      }
      merged = mergeStatusFromImport(masterStores, parseImport(importRows));
    } else {
      const mRows = await fetchSheet(c.spreadsheetId, c.masterSheet || DEFAULT_MASTER_SHEET);
      merged = parseMaster(mRows, c.headerRow || DEFAULT_HEADER_ROW);
    }
  } catch (err) {
    console.warn('[VMD] fetch error:', c.name, err.message);
  }
  if (merged.length) {
    window._eravisWrDataCache = window._eravisWrDataCache || {};
    window._eravisWrDataCache[c.id] = merged;
  }
  return merged;
}


// ── BUILD MATRIX ──────────────────────────────────────────────────
// PRINSIP: 119 toko master SELALU tampil. Campaign hanya menimpa status
// alokasi + submit di atas master. Toko yang tidak ikut alokasi tetap
// muncul dengan status "TIDAK IKUT".
async function _fetchVmdMatrix(monthKey, regionKey) {
  const info = _vmdMonthInfo(monthKey);
  const all  = (typeof campaigns !== 'undefined' ? campaigns : []);

  // Campaign yang aktif di bulan ini (berdasarkan deadline)
  let monthCampaigns = all.filter(c => _vmdCampaignInMonth(c, info.num, info.year));
  // Fallback: jika tidak ada match & bulan = current, pakai semua campaign aktif
  if (monthCampaigns.length === 0 && monthKey === 'current') {
    monthCampaigns = all.filter(c => c.status !== 'ended');
  }

  const cols = monthCampaigns.map(c => ({ id: c.id, name: c.name, short: _vmdColLabel(c) }));

  // ── 1) SEED dari master 119 toko ─────────────────────────────────
  const masterList = (typeof VMD_MASTER_STORES !== 'undefined') ? VMD_MASTER_STORES : [];
  const storeMap = new Map();
  masterList.forEach(m => {
    storeMap.set(m.code, {
      code   : m.code,
      name   : m.name,
      region : '',          // diisi dari data campaign jika ada
      city   : '',
      cells  : {},          // { campaignId: 'DONE' | 'NOT DONE' }  (alokasi)
    });
  });

  // ── 2) OVERLAY status alokasi + submit dari tiap campaign ─────────
  for (const c of monthCampaigns) {
    const stores = await _vmdCampaignStores(c);
    for (const s of stores) {
      const code = (s.plantCode || '').trim();
      if (!code) continue;

      const row = storeMap.get(code);
      // Scope dikunci ke 119 master. Toko di alokasi campaign yang TIDAK ada
      // di master diabaikan (di luar cakupan compliance bulanan).
      if (!row) continue;
      if (s.region && !row.region) row.region = s.region;
      if (s.city   && !row.city)   row.city   = s.city;
      row.cells[c.id] = (s.status === STATUS.DONE) ? 'DONE' : 'NOT DONE';
    }
  }

  // ── 3) Filter region (toko tanpa region tetap tampil → master selalu lengkap)
  let rowsArr = [...storeMap.values()];
  if (regionKey !== 'ALL') {
    rowsArr = rowsArr.filter(r => !r.region || r.region.toUpperCase() === regionKey.toUpperCase());
  }

  // ── 4) Hitung SCORING per toko (hanya program yang dialokasi) ─────
  const rows = rowsArr.map(r => {
    let applicable = 0, done = 0;
    cols.forEach(col => {
      const v = r.cells[col.id];
      if (v != null) { applicable++; if (v === 'DONE') done++; }
    });
    r.applicable = applicable;
    r.done       = done;
    if (applicable === 0) {
      r.score     = null;            // tidak ikut alokasi apapun
      r.statusCat = 'TIDAK_IKUT';
    } else {
      r.score     = Math.round(done / applicable * 100);
      r.statusCat = r.score === 100 ? 'PATUH' : (r.score === 0 ? 'TIDAK' : 'SEBAGIAN');
    }
    return r;
  });

  // Urut: yang perlu aksi dulu — TIDAK → SEBAGIAN → PATUH → TIDAK IKUT
  const order = { TIDAK: 0, SEBAGIAN: 1, PATUH: 2, TIDAK_IKUT: 3 };
  rows.sort((a, b) =>
    (order[a.statusCat] - order[b.statusCat]) ||
    ((a.score ?? -1) - (b.score ?? -1)) ||
    a.code.localeCompare(b.code));

  return { cols, rows, info };
}


// ── GENERATE ──────────────────────────────────────────────────────
async function generateVmdCompliance() {
  if (vmdState.loading) return;
  vmdState.loading = true;

  const monthKey  = (document.getElementById('vmd-month-select')  || {}).value || 'current';
  const regionKey = (document.getElementById('vmd-region-select') || {}).value || 'ALL';
  const info      = _vmdMonthInfo(monthKey);

  vmdState.monthKey   = monthKey;
  vmdState.monthLabel = info.label;
  vmdState.regionKey  = regionKey;

  _vmdShowEmpty(false);
  _vmdShowLoading(true);
  _vmdShowResult(false);

  const btn = document.getElementById('vmd-generate-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Memuat data...'; }

  try {
    const { cols, rows } = await _fetchVmdMatrix(monthKey, regionKey);
    vmdState.cols = cols;
    vmdState.rows = rows;

    if (rows.length === 0) {
      _vmdShowResult(false);
      _vmdShowEmpty(true);
      const em = document.getElementById('vmd-empty-state');
      if (em) em.querySelector('p').innerHTML =
        `Tidak ada campaign visibility untuk <strong>${info.label}</strong>.<br>` +
        `Pastikan ada campaign dengan deadline di bulan tsb (menu <strong>Campaigns</strong>).`;
      toast('Tidak ada campaign di bulan ini.', 'warn');
      return;
    }

    _vmdShowResult(true);
    _renderVmdKpis();
    _renderVmdTable();
    const exp = document.getElementById('vmd-export-btn');
    if (exp) exp.disabled = false;
    toast(`VMD Compliance ${info.label} berhasil di-generate!`, 'success');

  } catch (err) {
    console.error('[VMD] generate error:', err);
    toast('Gagal generate: ' + err.message, 'error');
    _vmdShowEmpty(true);
  } finally {
    vmdState.loading = false;
    _vmdShowLoading(false);
    if (btn) { btn.disabled = false; btn.innerHTML = '&#x1F4CA; Generate Compliance'; }
  }
}


// ── RENDER: KPI BAR ───────────────────────────────────────────────
function _renderVmdKpis() {
  const rows = vmdState.rows;
  const total    = rows.length;
  const allocated= rows.filter(r => r.statusCat !== 'TIDAK_IKUT');
  const ikut     = allocated.length;
  const patuh    = rows.filter(r => r.statusCat === 'PATUH').length;
  const sebagian = rows.filter(r => r.statusCat === 'SEBAGIAN').length;
  const tidak    = rows.filter(r => r.statusCat === 'TIDAK').length;
  // Avg compliance dihitung hanya dari toko yang ikut alokasi
  const avg      = ikut > 0 ? Math.round(allocated.reduce((s, r) => s + r.score, 0) / ikut) : 0;
  const avgColor = avg >= 80 ? '#16A34A' : avg >= 50 ? '#D97706' : '#DC2626';

  const wrap = document.getElementById('vmd-kpi-bar');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="vmd-kpi vmd-kpi-blue">
      <div class="vmd-kpi-val">${total}</div><div class="vmd-kpi-lbl">Total Toko</div></div>
    <div class="vmd-kpi vmd-kpi-prog">
      <div class="vmd-kpi-val">${ikut}</div><div class="vmd-kpi-lbl">Ikut Alokasi</div></div>
    <div class="vmd-kpi vmd-kpi-green">
      <div class="vmd-kpi-val">${patuh}</div><div class="vmd-kpi-lbl">Patuh Penuh</div></div>
    <div class="vmd-kpi vmd-kpi-amber">
      <div class="vmd-kpi-val">${sebagian}</div><div class="vmd-kpi-lbl">Sebagian</div></div>
    <div class="vmd-kpi vmd-kpi-red">
      <div class="vmd-kpi-val">${tidak}</div><div class="vmd-kpi-lbl">Tidak Patuh</div></div>
    <div class="vmd-kpi vmd-kpi-score">
      <div class="vmd-kpi-val" style="color:${avgColor}">${avg}%</div><div class="vmd-kpi-lbl">Avg Compliance</div></div>`;
}


// ── RENDER: MATRIX TABLE ──────────────────────────────────────────
function _vmdStatusBadge(cat) {
  if (cat === 'PATUH')      return { t: '✅ PATUH',     c: '#16A34A', bg: '#DCFCE7' };
  if (cat === 'SEBAGIAN')   return { t: '🟡 SEBAGIAN',  c: '#B45309', bg: '#FEF3C7' };
  if (cat === 'TIDAK_IKUT') return { t: '⚪ TIDAK IKUT', c: '#64748B', bg: '#F1F5F9' };
  return                           { t: '🔴 TIDAK',     c: '#DC2626', bg: '#FEE2E2' };
}

function _renderVmdTable() {
  const wrap = document.getElementById('vmd-table-wrap');
  if (!wrap) return;

  const cols = vmdState.cols;
  let rows = vmdState.rows;

  // Filter status + search
  if (vmdState.statusKey !== 'ALL') rows = rows.filter(r => r.statusCat === vmdState.statusKey);
  if (vmdState.search) {
    const q = vmdState.search;
    rows = rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q));
  }

  const cnt = document.getElementById('vmd-row-count');
  if (cnt) cnt.textContent = `${rows.length} toko`;

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:30px"><div class="ico">🔍</div>
      <p>Tidak ada toko yang cocok dengan filter.</p></div>`;
    return;
  }

  const colHead = cols.map(col =>
    `<th class="vmd-th vmd-th-prog" title="${col.name}"><span class="vmd-th-prog-txt">${col.short}</span></th>`).join('');

  const bodyHtml = rows.map((r, i) => {
    const cellsHtml = cols.map(col => {
      const v = r.cells[col.id];
      if (v == null)        return `<td class="vmd-td vmd-cell vmd-cell-na">–</td>`;
      if (v === 'DONE')     return `<td class="vmd-td vmd-cell vmd-cell-done">100</td>`;
      return `<td class="vmd-td vmd-cell vmd-cell-miss">✕</td>`;
    }).join('');
    const sc = r.score;
    const scTxt   = sc == null ? '–' : sc;
    const scColor = sc == null ? '#CBD5E1' : (sc === 100 ? '#16A34A' : sc >= 50 ? '#D97706' : '#DC2626');
    const b = _vmdStatusBadge(r.statusCat);
    return `<tr class="vmd-row">
      <td class="vmd-td vmd-td-no">${i + 1}</td>
      <td class="vmd-td vmd-td-code">${r.code}</td>
      <td class="vmd-td vmd-td-name">${r.name}</td>
      ${cellsHtml}
      <td class="vmd-td vmd-td-score" style="color:${scColor}">${scTxt}</td>
      <td class="vmd-td vmd-td-status"><span class="vmd-badge" style="color:${b.c};background:${b.bg}">${b.t}</span></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="vmd-table-scroll">
      <table class="vmd-table">
        <thead>
          <tr class="vmd-thead">
            <th class="vmd-th vmd-th-no">No</th>
            <th class="vmd-th vmd-th-code">SAP CODE</th>
            <th class="vmd-th vmd-th-name">STORE NAME</th>
            ${colHead}
            <th class="vmd-th vmd-th-score">SCORING</th>
            <th class="vmd-th vmd-th-status">STATUS</th>
          </tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>`;
}


// ── EXPORT EXCEL (matriks, mirip file sumber) ─────────────────────
function exportVmdExcel() {
  if (typeof XLSX === 'undefined') { toast('Library Excel belum dimuat.', 'error'); return; }
  if (vmdState.rows.length === 0)  { toast('Generate compliance dulu.', 'warn'); return; }

  const cols = vmdState.cols;
  const header = ['No', 'SAP CODE', 'STORE NAME', ...cols.map(c => c.short), 'SCORING', 'STATUS'];
  const aoa = [header];

  vmdState.rows.forEach((r, i) => {
    const cells = cols.map(col => {
      const v = r.cells[col.id];
      if (v == null) return '';
      return v === 'DONE' ? 100 : 0;
    });
    const scoreCell  = r.score == null ? '' : r.score;
    const statusCell = r.statusCat === 'TIDAK_IKUT' ? 'TIDAK IKUT' : r.statusCat;
    aoa.push([i + 1, r.code, r.name, ...cells, scoreCell, statusCell]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  const sheetName = ('VMD ' + vmdState.monthLabel).slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const fname = `VMD_Compliance_${vmdState.monthLabel.replace(/\s+/g, '_')}_${vmdState.regionKey}.xlsx`;
  XLSX.writeFile(wb, fname);
  toast('Excel VMD Compliance berhasil diunduh!', 'success');
}


// ── UI HELPERS ────────────────────────────────────────────────────
function _vmdShowEmpty(show) {
  const el = document.getElementById('vmd-empty-state');
  if (el) el.style.display = show ? 'flex' : 'none';
}
function _vmdShowLoading(show) {
  const el = document.getElementById('vmd-loading-state');
  if (el) el.style.display = show ? 'block' : 'none';
}
function _vmdShowResult(show) {
  const el = document.getElementById('vmd-result-area');
  if (el) el.style.display = show ? 'block' : 'none';
}
