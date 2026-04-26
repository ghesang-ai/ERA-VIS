/* ================================================================
   ERA-VIS AI v2.0 — summaryReport.js
   Summary Weekly Report — tabel semua campaign per bulan
   ================================================================ */
'use strict';

// ── STATE ─────────────────────────────────────────────────────────
const srState = {
  monthKey  : 'current',
  monthLabel: 'April 2026',
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
    _renderSrTable(srState.tableData, srState.monthLabel);
    _scaleSrSlide();
  }
}


// ── HELPERS ───────────────────────────────────────────────────────

const SR_MONTH_MAP = {
  'jan_2026': { label: 'Januari 2026',  num: 1,  year: 2026 },
  'feb_2026': { label: 'Februari 2026', num: 2,  year: 2026 },
  'mar_2026': { label: 'Maret 2026',    num: 3,  year: 2026 },
  'current' : { label: 'April 2026',   num: 4,  year: 2026 },
  'apr_2026': { label: 'April 2026',   num: 4,  year: 2026 },
  'may_2026': { label: 'Mei 2026',     num: 5,  year: 2026 },
  'jun_2026': { label: 'Juni 2026',    num: 6,  year: 2026 },
};

function _srMonthInfo(key) {
  return SR_MONTH_MAP[key] || SR_MONTH_MAP['current'];
}

// Derive Materi from campaign name prefix + brand
function _deriveMateri(c) {
  const name  = (c.name || '').toUpperCase();
  const brand = (c.brand || '').toUpperCase();
  const types = ['EASEL', 'HANGING', 'WOBBLER', 'POSTER', 'BANNER', 'STANDEE', 'LIGHTBOX', 'BACKDROP'];
  const prefix = types.find(t => name.startsWith(t)) || name.split(' ')[0] || '—';
  const brandMap = { ERAFONE: 'ERAFONE', IBOX: 'IBOX', SAMSUNG: 'SAMSUNG' };
  // Check if "NASA" appears in the name as a store-scope indicator
  const isNasa   = /\bNASA\b/.test(name);
  const brandStr = isNasa ? 'NASA' : (brandMap[brand] || brand);
  return prefix + ' ' + brandStr;
}

// Format deadline → "1 - DD Bulan"
function _srFmtPeriode(c) {
  if (!c.deadline) return '—';
  const d = new Date(c.deadline + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  const shortMonths = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `1 - ${d.getDate()} ${months[d.getMonth()]}`;
}

// Format long period for slide label
function _srFmtPeriodeFull(c) {
  if (!c.deadline) return '—';
  const d = new Date(c.deadline + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  return `1 - ${d.getDate()} ${months[d.getMonth()]}`;
}

function _campaignInMonth(c, num, year) {
  if (!c.deadline) return false;
  const dl = new Date(c.deadline + 'T00:00:00');
  return dl.getMonth() + 1 === num && dl.getFullYear() === year;
}


// ── GENERATE ──────────────────────────────────────────────────────

async function generateSummaryReport() {
  if (srState.generating) return;
  srState.generating = true;

  const sel      = document.getElementById('sr-month-select');
  const monthKey = sel ? sel.value : 'current';
  const info     = _srMonthInfo(monthKey);

  srState.monthKey   = monthKey;
  srState.monthLabel = info.label;

  _srShowEmpty(false);
  _srShowLoading(true);
  _srShowPreview(false);

  const genBtn = document.getElementById('sr-generate-btn');
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = '⏳ Generating...'; }

  try {
    await new Promise(r => setTimeout(r, 100)); // let UI paint

    const allCampaigns = typeof campaigns !== 'undefined' ? campaigns : [];

    // Filter: campaigns with deadline in chosen month, or all active if current
    let filtered = allCampaigns.filter(c => _campaignInMonth(c, info.num, info.year));

    // Fallback: if none match by deadline, include active campaigns for current month
    if (filtered.length === 0 && monthKey === 'current') {
      filtered = allCampaigns.filter(c => c.status === 'active');
    }

    // Build rows
    let rowNum = 1;
    const rows = filtered.map(c => {
      let alokasi = 0, kirimDok = 0, pct = 0;

      // Try dataCache first (most accurate — matches Dashboard numbers)
      if (typeof dataCache !== 'undefined' && dataCache[c.id]) {
        alokasi  = dataCache[c.id].totalStores || 0;
        kirimDok = dataCache[c.id].doneCount   || 0;
        pct      = dataCache[c.id].rate        || 0;
      } else if (Array.isArray(c.localStores) && c.localStores.length > 0) {
        alokasi  = c.localStores.length;
        kirimDok = c.localStores.filter(s => s.status === 'DONE').length;
        pct      = alokasi > 0 ? Math.round(kirimDok / alokasi * 100) : 0;
      }

      return {
        no        : rowNum++,
        visibility: c.name || '—',
        materi    : _deriveMateri(c),
        alokasi,
        kirimDok,
        pct,
        periode   : _srFmtPeriode(c),
      };
    });

    // Add empty row at end (matches design)
    rows.push({ no: rowNum, visibility: '', materi: '', alokasi: '', kirimDok: '', pct: '', periode: '' });

    srState.tableData = rows;

    _renderSrTable(rows, info.label);
    _buildSrSlide(rows, info.label);
    _srShowPreview(true);

    const pdfBtn1 = document.getElementById('sr-export-pdf-btn');
    const pdfBtn2 = document.getElementById('sr-export-pdf-btn2');
    if (pdfBtn1) pdfBtn1.disabled = false;
    if (pdfBtn2) pdfBtn2.disabled = false;

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


// ── RENDER TABLE (in-page view) ───────────────────────────────────

function _renderSrTable(rows, monthLabel) {
  const wrap = document.getElementById('sr-table-wrap');
  if (!wrap) return;

  if (!rows || rows.filter(r => r.visibility).length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="ico">📋</div><p>Tidak ada campaign untuk bulan ini.<br>Pastikan deadline campaign sesuai bulan yang dipilih.</p></div>';
    return;
  }

  const rowsHtml = rows.map(r => {
    if (!r.visibility) {
      return `<tr class="sr-row sr-row-empty">
        <td class="sr-td sr-td-no">${r.no}</td>
        <td class="sr-td" colspan="6"></td>
      </tr>`;
    }
    const pctNum   = typeof r.pct === 'number' ? r.pct : 0;
    const pctColor = pctNum === 100 ? '#16A34A' : pctNum >= 80 ? '#0B8F6C' : pctNum >= 50 ? '#D97706' : '#DC2626';
    const under    = typeof r.kirimDok === 'number' && typeof r.alokasi === 'number' && r.kirimDok < r.alokasi;
    return `<tr class="sr-row">
      <td class="sr-td sr-td-no">${r.no}</td>
      <td class="sr-td sr-td-visibility">${r.visibility}</td>
      <td class="sr-td sr-td-materi">${r.materi}</td>
      <td class="sr-td sr-td-num">${r.alokasi}</td>
      <td class="sr-td sr-td-num" style="font-weight:${under?700:400};color:${under?'#DC2626':'inherit'}">${r.kirimDok !== '' ? r.kirimDok : '—'}</td>
      <td class="sr-td sr-td-pct" style="color:${pctColor}">${r.pct !== '' ? r.pct + '%' : ''}</td>
      <td class="sr-td sr-td-periode">${r.periode}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="sr-table-header">
      <h2 class="sr-table-title">Report Dokumentasi Visibility &mdash; ${monthLabel}</h2>
    </div>
    <div class="sr-table-scroll">
      <table class="sr-table">
        <thead>
          <tr class="sr-thead-row">
            <th class="sr-th sr-th-no">No</th>
            <th class="sr-th">VISIBILITY</th>
            <th class="sr-th">MATERI</th>
            <th class="sr-th sr-th-num">ALOKASI</th>
            <th class="sr-th sr-th-num">KIRIM DOK</th>
            <th class="sr-th sr-th-num">%</th>
            <th class="sr-th">PERIODE</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}


// ── SLIDE HTML ────────────────────────────────────────────────────

function _buildSrSlide(rows, monthLabel) {
  const html   = _genSrSlideHtml(rows, monthLabel);
  const scaler = document.getElementById('sr-slide-scaler');
  if (scaler) {
    scaler.innerHTML = html;
    _scaleSrSlide();
  }
}

function _genSrSlideHtml(rows, monthLabel) {
  // Filter out the trailing empty row for slide — keep only real rows
  const realRows = rows.filter(r => r.visibility !== '');
  const emptyRow = { no: realRows.length + 1, visibility: '', materi: '', alokasi: '', kirimDok: '', pct: '', periode: '' };
  const allRows  = [...realRows, emptyRow];

  const fontSize   = realRows.length > 10 ? '10.5px' : '12px';
  const rowPadding = realRows.length > 10 ? '5px 8px' : '7px 10px';

  const rowsHtml = allRows.map((r, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F0F3FA';
    if (!r.visibility) {
      return `<tr style="background:${bg}">
        <td style="padding:${rowPadding};text-align:center;font-size:${fontSize};color:#94A3B8;border-bottom:1px solid #E8ECF4">${r.no}</td>
        <td colspan="6" style="border-bottom:1px solid #E8ECF4"></td>
      </tr>`;
    }
    const pctNum   = typeof r.pct === 'number' ? r.pct : 0;
    const pctColor = pctNum === 100 ? '#16A34A' : pctNum >= 80 ? '#0B8F6C' : pctNum >= 50 ? '#D97706' : '#DC2626';
    const under    = typeof r.kirimDok === 'number' && typeof r.alokasi === 'number' && r.kirimDok < r.alokasi;
    return `<tr style="background:${bg}">
      <td style="padding:${rowPadding};text-align:center;font-size:${fontSize};color:#64748B;border-bottom:1px solid #E8ECF4">${r.no}</td>
      <td style="padding:${rowPadding};font-size:${fontSize};font-weight:500;color:#1E293B;border-bottom:1px solid #E8ECF4">${r.visibility}</td>
      <td style="padding:${rowPadding};font-size:${fontSize};color:#475569;border-bottom:1px solid #E8ECF4">${r.materi}</td>
      <td style="padding:${rowPadding};text-align:center;font-size:${fontSize};color:#1E293B;border-bottom:1px solid #E8ECF4">${r.alokasi}</td>
      <td style="padding:${rowPadding};text-align:center;font-size:${fontSize};font-weight:${under?700:400};color:${under?'#DC2626':'#1E293B'};border-bottom:1px solid #E8ECF4">${r.kirimDok !== '' ? r.kirimDok : '—'}</td>
      <td style="padding:${rowPadding};text-align:center;font-size:${fontSize};font-weight:800;color:${pctColor};border-bottom:1px solid #E8ECF4">${r.pct !== '' ? r.pct + '%' : ''}</td>
      <td style="padding:${rowPadding};text-align:center;font-size:${fontSize};font-weight:600;color:#1E293B;border-bottom:1px solid #E8ECF4">${r.periode}</td>
    </tr>`;
  }).join('');

  const now = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<div class="wr-slide" style="width:1120px;height:630px;background:#FAFBFF;font-family:'Inter',sans-serif;display:flex;flex-direction:column;overflow:hidden;position:relative;box-sizing:border-box">
    <div style="position:relative;z-index:1;padding:32px 44px 20px;flex:1;display:flex;flex-direction:column;box-sizing:border-box">

      <!-- Title bar -->
      <div style="text-align:center;margin-bottom:22px">
        <h1 style="font-size:26px;font-weight:900;color:#1E293B;margin:0;letter-spacing:-0.5px;line-height:1.2">
          Report Dokumentasi Visibility
          <span style="color:#3B5CE5"> &mdash; ${monthLabel}</span>
        </h1>
      </div>

      <!-- Table -->
      <div style="flex:1;overflow:hidden;border-radius:10px;box-shadow:0 2px 12px rgba(59,92,229,0.10);border:1px solid #E2E8F0">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:linear-gradient(90deg,#3B5CE5 0%,#5B21B6 100%)">
              <th style="padding:10px 8px;color:#fff;font-size:11px;font-weight:700;text-align:center;letter-spacing:0.5px;width:46px">No</th>
              <th style="padding:10px 12px;color:#fff;font-size:11px;font-weight:700;text-align:left;letter-spacing:0.5px">VISIBILITY</th>
              <th style="padding:10px 12px;color:#fff;font-size:11px;font-weight:700;text-align:left;letter-spacing:0.5px;width:160px">MATERI</th>
              <th style="padding:10px 8px;color:#fff;font-size:11px;font-weight:700;text-align:center;letter-spacing:0.5px;width:72px">ALOKASI</th>
              <th style="padding:10px 8px;color:#fff;font-size:10px;font-weight:700;text-align:center;letter-spacing:0.3px;width:80px">KIRIM DOK</th>
              <th style="padding:10px 8px;color:#fff;font-size:11px;font-weight:700;text-align:center;letter-spacing:0.5px;width:58px">%</th>
              <th style="padding:10px 12px;color:#fff;font-size:11px;font-weight:700;text-align:center;letter-spacing:0.5px;width:130px">PERIODE</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      <!-- Footer -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <div style="font-size:9.5px;color:#94A3B8;font-weight:600;letter-spacing:.3px">ERA-VIS AI v2.0 — Erafone Visibility Intelligence</div>
        <div style="font-size:9.5px;color:#94A3B8">Generated ${now}</div>
      </div>
    </div>
  </div>`;
}


// ── SCALE SLIDE ───────────────────────────────────────────────────

function _scaleSrSlide() {
  const vp  = document.getElementById('sr-slide-viewport');
  const sc  = document.getElementById('sr-slide-scaler');
  if (!vp || !sc) return;
  const w   = vp.offsetWidth || 800;
  const s   = Math.min(1, (w - 24) / 1120);
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

  if (!slideEl) {
    toast('Generate laporan dulu sebelum export PDF.', 'warn');
    return;
  }
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    toast('Library belum dimuat. Refresh halaman dan coba lagi.', 'error');
    return;
  }

  toast('Memproses PDF...', 'info');

  const vp = document.getElementById('sr-slide-viewport');
  const prevT = scaler.style.transform;
  const prevH = vp ? vp.style.height : '';

  scaler.style.transform       = 'scale(1)';
  scaler.style.transformOrigin = 'top left';
  if (vp) vp.style.height = 'auto';

  await new Promise(r => setTimeout(r, 200));

  try {
    const canvas = await html2canvas(slideEl, {
      scale          : 2,
      width          : 1120,
      height         : 630,
      useCORS        : true,
      allowTaint     : true,
      backgroundColor: '#FAFBFF',
      logging        : false,
      imageTimeout   : 8000,
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1120, 630], hotfixes: ['px_scaling'], compress: true });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 1120, 630);

    const fn = `ERA-VIS_SummaryReport_${_safeFilename(srState.monthLabel)}_${_dateTag()}.pdf`;
    doc.save(fn);
    toast('PDF berhasil diunduh!', 'success');

  } catch (err) {
    console.error('[SR] PDF error:', err);
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

  if (!slideEl) {
    toast('Generate laporan dulu sebelum screenshot.', 'warn');
    return;
  }
  if (typeof html2canvas === 'undefined') {
    toast('Library html2canvas belum dimuat.', 'error');
    return;
  }

  toast('Memproses screenshot...', 'info');

  const vp = document.getElementById('sr-slide-viewport');
  const prevT = scaler.style.transform;
  const prevH = vp ? vp.style.height : '';

  scaler.style.transform       = 'scale(1)';
  scaler.style.transformOrigin = 'top left';
  if (vp) vp.style.height = 'auto';

  await new Promise(r => setTimeout(r, 200));

  try {
    const canvas = await html2canvas(slideEl, {
      scale          : 2,
      width          : 1120,
      height         : 630,
      useCORS        : true,
      allowTaint     : true,
      backgroundColor: '#FAFBFF',
      logging        : false,
      imageTimeout   : 8000,
    });

    const fn = `ERA-VIS_SummaryReport_${_safeFilename(srState.monthLabel)}_${_dateTag()}.png`;
    _triggerDownload(canvas.toDataURL('image/png'), fn);
    toast('Screenshot berhasil diunduh!', 'success');

  } catch (err) {
    console.error('[SR] PNG error:', err);
    toast('Screenshot gagal: ' + err.message, 'error');
  } finally {
    scaler.style.transform = prevT;
    if (vp) vp.style.height = prevH;
    _scaleSrSlide();
  }
}
