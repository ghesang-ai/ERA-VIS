/* ================================================================
   ERA-VIS AI v2.0 — summaryReport.js
   Summary Weekly Report — tabel semua campaign per bulan / region
   ================================================================ */
'use strict';

// ── STATE ─────────────────────────────────────────────────────────
const srState = {
  monthKey  : 'current',
  monthLabel: 'April 2026',
  regionKey : 'ALL',
  tableData : [],
  generating: false,
  _init     : false,
};


// ── INIT ──────────────────────────────────────────────────────────

function initSummaryReport() {
  if (!srState._init) {
    srState._init = true;
    window.addEventListener('resize', _scaleSrSlide);
  }
  if (srState.tableData.length === 0) {
    _srShowEmpty(true);
  } else {
    _renderSrPage(srState.tableData, srState.monthLabel, srState.regionKey);
    _scaleSrSlide();
  }
}


// ── HELPERS ───────────────────────────────────────────────────────

const SR_MONTH_MAP = {
  'jan_2026': { label: 'Januari 2026',  num: 1, year: 2026 },
  'feb_2026': { label: 'Februari 2026', num: 2, year: 2026 },
  'mar_2026': { label: 'Maret 2026',    num: 3, year: 2026 },
  'current' : { label: 'April 2026',   num: 4, year: 2026 },
  'apr_2026': { label: 'April 2026',   num: 4, year: 2026 },
  'may_2026': { label: 'Mei 2026',     num: 5, year: 2026 },
  'jun_2026': { label: 'Juni 2026',    num: 6, year: 2026 },
};

function _srMonthInfo(key) {
  return SR_MONTH_MAP[key] || SR_MONTH_MAP['current'];
}

function _campaignInMonth(c, num, year) {
  if (!c.deadline) return false;
  const dl = new Date(c.deadline + 'T00:00:00');
  return dl.getMonth() + 1 === num && dl.getFullYear() === year;
}

function _deriveMateri(c) {
  const name  = (c.name || '').toUpperCase();
  const brand = (c.brand || '').toUpperCase();
  const types = ['EASEL','HANGING','WOBBLER','POSTER','BANNER','STANDEE','LIGHTBOX','BACKDROP','SIGNBOARD','VISIBILITY','NBFI','BERALIH'];
  const prefix = types.find(t => name.startsWith(t)) || name.split(' ')[0] || '—';
  const isNasa   = /\bNASA\b/.test(name);
  const brandMap = { ERAFONE: 'ERAFONE', IBOX: 'IBOX', SAMSUNG: 'SAMSUNG' };
  const brandStr = isNasa ? 'NASA' : (brandMap[brand] || brand || '');
  return brandStr ? prefix + ' ' + brandStr : prefix;
}

function _srFmtPeriode(c) {
  if (!c.deadline) return '—';
  const d = new Date(c.deadline + 'T00:00:00');
  const m = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  return `1 - ${d.getDate()} ${m[d.getMonth()]}`;
}

// Priority badge dari % completion
function _srBadge(pct) {
  if (pct === 100) return { label: '✅ SELESAI',    color: '#16A34A', bg: '#DCFCE7' };
  if (pct >= 80)   return { label: '🟢 HAMPIR',     color: '#0B8F6C', bg: '#D1FAE5' };
  if (pct >= 50)   return { label: '🟡 PROGRES',    color: '#B45309', bg: '#FEF3C7' };
  if (pct > 0)     return { label: '🔴 FOLLOW UP',  color: '#DC2626', bg: '#FEE2E2' };
  return               { label: '🔴 KRITIS',     color: '#991B1B', bg: '#FEE2E2' };
}

// Ambil stores dengan status REAL dari cache WR, fallback ke localStores
function _getStores(c) {
  // Prioritas 1: WR data cache — berisi status real hasil merge Sheet/Excel
  if (window._eravisWrDataCache && window._eravisWrDataCache[c.id]) {
    return window._eravisWrDataCache[c.id];
  }
  // Prioritas 2: localStores dari campaign object
  return Array.isArray(c.localStores) ? c.localStores : [];
}


// ── GENERATE ──────────────────────────────────────────────────────

async function generateSummaryReport() {
  if (srState.generating) return;
  srState.generating = true;

  const monthKey  = (document.getElementById('sr-month-select')  || {}).value || 'current';
  const regionKey = (document.getElementById('sr-region-select') || {}).value || 'ALL';
  const info      = _srMonthInfo(monthKey);

  srState.monthKey   = monthKey;
  srState.monthLabel = info.label;
  srState.regionKey  = regionKey;

  _srShowEmpty(false);
  _srShowLoading(true);
  _srShowPreview(false);

  const genBtn = document.getElementById('sr-generate-btn');
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = '⏳ Generating...'; }

  try {
    await new Promise(r => setTimeout(r, 80));

    const allCampaigns = typeof campaigns !== 'undefined' ? campaigns : [];

    // Filter campaign berdasarkan deadline bulan
    let filtered = allCampaigns.filter(c => _campaignInMonth(c, info.num, info.year));
    if (filtered.length === 0 && monthKey === 'current') {
      filtered = allCampaigns.filter(c => c.status === 'active');
    }

    // Build rows dengan region filter di level store
    let rowNum = 1;
    const rows = [];

    for (const c of filtered) {
      const allStores = _getStores(c);

      let scopedStores;
      if (regionKey !== 'ALL') {
        scopedStores = allStores.filter(s =>
          (s.region || '').toUpperCase().trim() === regionKey.toUpperCase().trim()
        );
        if (scopedStores.length === 0) continue;
      } else {
        scopedStores = allStores;
      }

      let alokasi, done, notDone, pct;

      if (scopedStores.length > 0) {
        alokasi = scopedStores.length;
        done    = scopedStores.filter(s => (s.status || '').toUpperCase() === 'DONE').length;
        notDone = alokasi - done;
        pct     = Math.round(done / alokasi * 100);
      } else if (regionKey === 'ALL' && typeof dataCache !== 'undefined' && dataCache[c.id]) {
        // Fallback ke dataCache hanya jika ALL region dan tidak ada store data
        alokasi = dataCache[c.id].totalStores || 0;
        done    = dataCache[c.id].doneCount   || 0;
        notDone = alokasi - done;
        pct     = dataCache[c.id].rate        || 0;
      } else {
        alokasi = 0; done = 0; notDone = 0; pct = 0;
      }

      rows.push({
        no        : rowNum++,
        visibility: c.name || '—',
        materi    : _deriveMateri(c),
        alokasi,
        done,
        notDone,
        pct,
        periode   : _srFmtPeriode(c),
      });
    }

    srState.tableData = rows;

    _renderSrPage(rows, info.label, regionKey);
    _srShowPreview(true);

    ['sr-export-pdf-btn','sr-export-pdf-btn2'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.disabled = false;
    });

    toast('Summary report berhasil di-generate!', 'success');

  } catch (err) {
    console.error('[SR] generate error:', err);
    toast('Gagal generate: ' + err.message, 'error');
    _srShowEmpty(true);
  } finally {
    srState.generating = false;
    _srShowLoading(false);
    if (genBtn) { genBtn.disabled = false; genBtn.innerHTML = '&#x1F3A8; Generate Slides'; }
  }
}


// ── RENDER (table + slide) ────────────────────────────────────────

function _renderSrPage(rows, monthLabel, regionKey) {
  const regionLabel = regionKey !== 'ALL' ? regionKey : 'Semua Region';
  const fullTitle   = `${monthLabel} — ${regionLabel}`;

  _renderSrTable(rows, fullTitle);
  _buildSrSlide(rows, fullTitle);
}


// ── TABLE VIEW ────────────────────────────────────────────────────

function _renderSrTable(rows, title) {
  const wrap = document.getElementById('sr-table-wrap');
  if (!wrap) return;

  if (!rows || rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="ico">📋</div>
      <p>Tidak ada campaign untuk filter ini.<br>Pastikan deadline campaign sesuai bulan yang dipilih.</p></div>`;
    return;
  }

  // KPI totals
  const totAlokasi = rows.reduce((s, r) => s + (r.alokasi || 0), 0);
  const totDone    = rows.reduce((s, r) => s + (r.done    || 0), 0);
  const totNotDone = rows.reduce((s, r) => s + (r.notDone || 0), 0);
  const totPct     = totAlokasi > 0 ? Math.round(totDone / totAlokasi * 100) : 0;
  const totPctColor = totPct >= 80 ? '#16A34A' : totPct >= 50 ? '#D97706' : '#DC2626';

  const kpiHtml = `
    <div class="sr-kpi-bar">
      <div class="sr-kpi-card">
        <div class="sr-kpi-val">${rows.length}</div>
        <div class="sr-kpi-lbl">Campaign Aktif</div>
      </div>
      <div class="sr-kpi-card">
        <div class="sr-kpi-val">${totAlokasi}</div>
        <div class="sr-kpi-lbl">Total Alokasi</div>
      </div>
      <div class="sr-kpi-card sr-kpi-green">
        <div class="sr-kpi-val">${totDone}</div>
        <div class="sr-kpi-lbl">Sudah Kirim</div>
      </div>
      <div class="sr-kpi-card sr-kpi-red">
        <div class="sr-kpi-val">${totNotDone}</div>
        <div class="sr-kpi-lbl">Belum Kirim</div>
      </div>
      <div class="sr-kpi-card sr-kpi-pct">
        <div class="sr-kpi-val" style="color:${totPctColor}">${totPct}%</div>
        <div class="sr-kpi-lbl">Overall Done</div>
      </div>
    </div>`;

  const rowsHtml = rows.map(r => {
    const pct     = typeof r.pct === 'number' ? r.pct : 0;
    const badge   = _srBadge(pct);
    const pctColor = pct === 100 ? '#16A34A' : pct >= 80 ? '#0B8F6C' : pct >= 50 ? '#B45309' : '#DC2626';
    return `<tr class="sr-row">
      <td class="sr-td sr-td-no">${r.no}</td>
      <td class="sr-td sr-td-visibility">${r.visibility}</td>
      <td class="sr-td sr-td-materi">${r.materi}</td>
      <td class="sr-td sr-td-num">${r.alokasi}</td>
      <td class="sr-td sr-td-num sr-done">${r.done}</td>
      <td class="sr-td sr-td-num sr-notdone">${r.notDone}</td>
      <td class="sr-td sr-td-pct" style="color:${pctColor}">${pct}%</td>
      <td class="sr-td sr-td-badge"><span class="sr-badge" style="color:${badge.color};background:${badge.bg}">${badge.label}</span></td>
      <td class="sr-td sr-td-periode">${r.periode}</td>
    </tr>`;
  }).join('');

  const totalBadge = _srBadge(totPct);

  wrap.innerHTML = `
    <div class="sr-table-header">
      <h2 class="sr-table-title">Report Dokumentasi Visibility &mdash; ${title}</h2>
    </div>
    ${kpiHtml}
    <div class="sr-table-scroll">
      <table class="sr-table">
        <thead>
          <tr class="sr-thead-row">
            <th class="sr-th sr-th-no">No</th>
            <th class="sr-th">VISIBILITY</th>
            <th class="sr-th">MATERI</th>
            <th class="sr-th sr-th-num">ALOKASI</th>
            <th class="sr-th sr-th-num" style="color:#86EFAC">DONE</th>
            <th class="sr-th sr-th-num" style="color:#FCA5A5">BELUM</th>
            <th class="sr-th sr-th-num">%</th>
            <th class="sr-th">STATUS</th>
            <th class="sr-th">PERIODE</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="sr-row-total">
            <td class="sr-td" colspan="3" style="font-weight:700;color:#1E293B;padding:10px 14px">TOTAL</td>
            <td class="sr-td sr-td-num" style="font-weight:800">${totAlokasi}</td>
            <td class="sr-td sr-td-num sr-done" style="font-weight:800">${totDone}</td>
            <td class="sr-td sr-td-num sr-notdone" style="font-weight:800">${totNotDone}</td>
            <td class="sr-td sr-td-pct" style="color:${totPctColor};font-weight:900;font-size:15px">${totPct}%</td>
            <td class="sr-td"><span class="sr-badge" style="color:${totalBadge.color};background:${totalBadge.bg}">${totalBadge.label}</span></td>
            <td class="sr-td"></td>
          </tr>
        </tbody>
      </table>
    </div>`;
}


// ── SLIDE HTML ────────────────────────────────────────────────────

function _buildSrSlide(rows, title) {
  const scaler = document.getElementById('sr-slide-scaler');
  if (scaler) {
    scaler.innerHTML = _genSrSlideHtml(rows, title);
    _scaleSrSlide();
  }
}

function _genSrSlideHtml(rows, title) {
  const totAlokasi = rows.reduce((s, r) => s + (r.alokasi || 0), 0);
  const totDone    = rows.reduce((s, r) => s + (r.done    || 0), 0);
  const totNotDone = rows.reduce((s, r) => s + (r.notDone || 0), 0);
  const totPct     = totAlokasi > 0 ? Math.round(totDone / totAlokasi * 100) : 0;
  const totPctColor = totPct >= 80 ? '#16A34A' : totPct >= 50 ? '#D97706' : '#DC2626';

  const fs  = rows.length > 9 ? '10px'  : '11.5px';
  const pad = rows.length > 9 ? '5px 7px' : '7px 10px';

  const rowsHtml = rows.map((r, i) => {
    const bg    = i % 2 === 0 ? '#FFFFFF' : '#F0F4FF';
    const pct   = typeof r.pct === 'number' ? r.pct : 0;
    const pctC  = pct === 100 ? '#16A34A' : pct >= 80 ? '#0B8F6C' : pct >= 50 ? '#B45309' : '#DC2626';
    const badge = _srBadge(pct);
    const cell  = `padding:${pad};border-bottom:1px solid #E8ECF4`;
    return `<tr style="background:${bg}">
      <td style="${cell};text-align:center;font-size:${fs};color:#94A3B8">${r.no}</td>
      <td style="${cell};font-size:${fs};font-weight:600;color:#1E293B">${r.visibility}</td>
      <td style="${cell};font-size:${fs};color:#475569">${r.materi}</td>
      <td style="${cell};text-align:center;font-size:${fs};color:#1E293B">${r.alokasi}</td>
      <td style="${cell};text-align:center;font-size:${fs};font-weight:700;color:#16A34A">${r.done}</td>
      <td style="${cell};text-align:center;font-size:${fs};font-weight:700;color:#DC2626">${r.notDone}</td>
      <td style="${cell};text-align:center;font-size:${fs};font-weight:900;color:${pctC}">${pct}%</td>
      <td style="${cell};text-align:center"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;color:${badge.color};background:${badge.bg}">${badge.label}</span></td>
      <td style="${cell};text-align:center;font-size:${fs};font-weight:600;color:#1E293B">${r.periode}</td>
    </tr>`;
  }).join('');

  const totalBadge = _srBadge(totPct);
  const totalRow = `<tr style="background:#EEF2FF;border-top:2px solid #3B5CE5">
    <td colspan="3" style="padding:${pad};font-size:${fs};font-weight:800;color:#1E293B;letter-spacing:.3px">TOTAL</td>
    <td style="padding:${pad};text-align:center;font-size:${fs};font-weight:800;color:#1E293B">${totAlokasi}</td>
    <td style="padding:${pad};text-align:center;font-size:${fs};font-weight:800;color:#16A34A">${totDone}</td>
    <td style="padding:${pad};text-align:center;font-size:${fs};font-weight:800;color:#DC2626">${totNotDone}</td>
    <td style="padding:${pad};text-align:center;font-size:${fs};font-weight:900;color:${totPctColor}">${totPct}%</td>
    <td style="padding:${pad};text-align:center"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;color:${totalBadge.color};background:${totalBadge.bg}">${totalBadge.label}</span></td>
    <td></td>
  </tr>`;

  // KPI strip
  const kpiBar = `
    <div style="display:flex;gap:10px;margin-bottom:14px">
      ${[
        { v: rows.length,  l: 'Campaign',    c: '#3B5CE5', bg: '#EEF2FF' },
        { v: totAlokasi,   l: 'Alokasi',     c: '#475569', bg: '#F8FAFC' },
        { v: totDone,      l: 'Sudah Kirim', c: '#16A34A', bg: '#DCFCE7' },
        { v: totNotDone,   l: 'Belum Kirim', c: '#DC2626', bg: '#FEE2E2' },
        { v: totPct + '%', l: 'Overall',     c: totPctColor, bg: '#F8FAFC' },
      ].map(k => `<div style="flex:1;background:${k.bg};border-radius:8px;padding:8px 10px;text-align:center">
        <div style="font-size:18px;font-weight:900;color:${k.c};line-height:1">${k.v}</div>
        <div style="font-size:9px;color:#64748B;font-weight:600;margin-top:2px">${k.l}</div>
      </div>`).join('')}
    </div>`;

  const now = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<div class="wr-slide" style="width:1120px;height:630px;background:#FAFBFF;font-family:'Inter',sans-serif;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box">
    <div style="padding:24px 40px 16px;flex:1;display:flex;flex-direction:column;box-sizing:border-box">

      <!-- Title -->
      <div style="text-align:center;margin-bottom:14px">
        <h1 style="font-size:22px;font-weight:900;color:#1E293B;margin:0;letter-spacing:-.5px">
          Report Dokumentasi Visibility
          <span style="color:#3B5CE5"> &mdash; ${title}</span>
        </h1>
      </div>

      <!-- KPI bar -->
      ${kpiBar}

      <!-- Table -->
      <div style="flex:1;overflow:hidden;border-radius:10px;box-shadow:0 2px 14px rgba(59,92,229,.12);border:1px solid #DDE3F5">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:linear-gradient(90deg,#3B5CE5,#5B21B6)">
              <th style="padding:9px 7px;color:#fff;font-size:10px;font-weight:700;text-align:center;width:40px">No</th>
              <th style="padding:9px 10px;color:#fff;font-size:10px;font-weight:700;text-align:left">VISIBILITY</th>
              <th style="padding:9px 10px;color:#fff;font-size:10px;font-weight:700;text-align:left;width:150px">MATERI</th>
              <th style="padding:9px 7px;color:#fff;font-size:10px;font-weight:700;text-align:center;width:65px">ALOKASI</th>
              <th style="padding:9px 7px;color:#86EFAC;font-size:10px;font-weight:700;text-align:center;width:60px">DONE</th>
              <th style="padding:9px 7px;color:#FCA5A5;font-size:10px;font-weight:700;text-align:center;width:60px">BELUM</th>
              <th style="padding:9px 7px;color:#fff;font-size:10px;font-weight:700;text-align:center;width:52px">%</th>
              <th style="padding:9px 7px;color:#fff;font-size:10px;font-weight:700;text-align:center;width:110px">STATUS</th>
              <th style="padding:9px 10px;color:#fff;font-size:10px;font-weight:700;text-align:center;width:110px">PERIODE</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}${totalRow}</tbody>
        </table>
      </div>

      <!-- Footer -->
      <div style="display:flex;justify-content:space-between;margin-top:8px">
        <div style="font-size:9px;color:#94A3B8;font-weight:600">ERA-VIS AI v2.0 — Erafone Visibility Intelligence</div>
        <div style="font-size:9px;color:#94A3B8">Generated ${now}</div>
      </div>
    </div>
  </div>`;
}


// ── SCALE ─────────────────────────────────────────────────────────

function _scaleSrSlide() {
  const vp = document.getElementById('sr-slide-viewport');
  const sc = document.getElementById('sr-slide-scaler');
  if (!vp || !sc) return;
  const s = Math.min(1, (vp.offsetWidth - 24) / 1120);
  sc.style.transform       = `scale(${s})`;
  sc.style.transformOrigin = 'top center';
  sc.style.width           = '1120px';
  sc.style.display         = 'block';
  vp.style.height          = Math.round(630 * s + 16) + 'px';
}


// ── UI HELPERS ────────────────────────────────────────────────────

function _srShowEmpty(show) {
  const el = document.getElementById('sr-empty-state');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function _srShowLoading(show) {
  const el = document.getElementById('sr-loading-state');
  if (el) el.style.display = show ? 'block' : 'none';
}

function _srShowPreview(show) {
  const el = document.getElementById('sr-preview-area');
  if (el) el.style.display = show ? 'block' : 'none';
}


// ── EXPORT PDF ────────────────────────────────────────────────────

async function exportSrPdf() {
  const scaler  = document.getElementById('sr-slide-scaler');
  const slideEl = scaler ? scaler.querySelector('.wr-slide') : null;
  if (!slideEl) { toast('Generate laporan dulu sebelum export PDF.', 'warn'); return; }
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    toast('Library belum dimuat. Refresh halaman.', 'error'); return;
  }
  toast('Memproses PDF...', 'info');
  const vp = document.getElementById('sr-slide-viewport');
  const prevT = scaler.style.transform, prevH = vp ? vp.style.height : '';
  scaler.style.transform = 'scale(1)';
  scaler.style.transformOrigin = 'top left';
  if (vp) vp.style.height = 'auto';
  await new Promise(r => setTimeout(r, 200));
  try {
    const canvas = await html2canvas(slideEl, { scale: 2, width: 1120, height: 630, useCORS: true, allowTaint: true, backgroundColor: '#FAFBFF', logging: false });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1120, 630], hotfixes: ['px_scaling'], compress: true });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 1120, 630);
    doc.save(`ERA-VIS_SummaryReport_${_safeFilename(srState.monthLabel)}_${_dateTag()}.pdf`);
    toast('PDF berhasil diunduh!', 'success');
  } catch (err) {
    toast('Export PDF gagal: ' + err.message, 'error');
  } finally {
    scaler.style.transform = prevT;
    if (vp) vp.style.height = prevH;
    _scaleSrSlide();
  }
}


// ── EXPORT PNG ────────────────────────────────────────────────────

async function exportSrPng() {
  const scaler  = document.getElementById('sr-slide-scaler');
  const slideEl = scaler ? scaler.querySelector('.wr-slide') : null;
  if (!slideEl) { toast('Generate laporan dulu sebelum screenshot.', 'warn'); return; }
  if (typeof html2canvas === 'undefined') { toast('html2canvas belum dimuat.', 'error'); return; }
  toast('Memproses screenshot...', 'info');
  const vp = document.getElementById('sr-slide-viewport');
  const prevT = scaler.style.transform, prevH = vp ? vp.style.height : '';
  scaler.style.transform = 'scale(1)';
  scaler.style.transformOrigin = 'top left';
  if (vp) vp.style.height = 'auto';
  await new Promise(r => setTimeout(r, 200));
  try {
    const canvas = await html2canvas(slideEl, { scale: 2, width: 1120, height: 630, useCORS: true, allowTaint: true, backgroundColor: '#FAFBFF', logging: false });
    _triggerDownload(canvas.toDataURL('image/png'), `ERA-VIS_SummaryReport_${_safeFilename(srState.monthLabel)}_${_dateTag()}.png`);
    toast('Screenshot berhasil diunduh!', 'success');
  } catch (err) {
    toast('Screenshot gagal: ' + err.message, 'error');
  } finally {
    scaler.style.transform = prevT;
    if (vp) vp.style.height = prevH;
    _scaleSrSlide();
  }
}
