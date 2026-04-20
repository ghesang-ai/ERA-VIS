/* ================================================================
   ERA-VIS AI v2.0 — weeklyReport.js
   Controller utama untuk fitur Weekly Report Generator
   ================================================================ */
'use strict';

// ── STATE ─────────────────────────────────────────────────────────
const wrState = {
  slides      : [],      // Array of {index, title, type, html}
  currentIndex: 0,       // Index slide yang sedang ditampilkan
  filters     : {
    period : 'current',
    region : 'ALL',
    status : 'NOT_DONE',
  },
  initialized : false,
  generating  : false,
};


// ── INIT ──────────────────────────────────────────────────────────

/**
 * Inisialisasi halaman Weekly Report.
 * Dipanggil setiap kali user navigasi ke halaman ini.
 */
function initWeeklyReport() {
  if (!wrState.initialized) {
    wrState.initialized = true;
    _bindWrListeners();
  }
  // Tampilkan empty state jika belum ada slides
  if (wrState.slides.length === 0) {
    _showWrEmptyState();
  } else {
    // Ada slides dari sesi sebelumnya — tampilkan preview
    _renderWrPreview();
  }
}

/**
 * Bind event listeners pada elemen halaman Weekly Report.
 * Dipanggil sekali saat init.
 */
function _bindWrListeners() {
  // Keyboard navigation
  document.addEventListener('keydown', function(e) {
    const page = document.getElementById('page-weekly-report');
    if (!page || !page.classList.contains('active')) return;
    if (wrState.slides.length === 0) return;
    if (e.key === 'ArrowRight') nextWrSlide();
    if (e.key === 'ArrowLeft')  prevWrSlide();
  });
}


// ── DATA ──────────────────────────────────────────────────────────

/**
 * Fetch data report dari ERA-VIS campaigns yang sudah ada.
 * Untuk setiap campaign: pakai localStores (Excel mode) atau fetch dari
 * Google Sheets (Sheet mode), lalu merge dengan data import/response.
 *
 * @param {Object} filters - {period, region, status}
 * @returns {Promise<{overview, campaigns, stores, regions}>}
 */
async function _fetchWrData(filters) {
  // Ambil campaigns aktif dari global state ERA-VIS
  const activeCampaigns = (typeof campaigns !== 'undefined' ? campaigns : [])
    .filter(c => c.status !== 'ended');

  if (activeCampaigns.length === 0) {
    // Fallback ke sample data jika belum ada campaign
    return _fetchWrSampleData(filters);
  }

  // ── Fetch store data untuk setiap campaign ────────────────────
  _wrUpdateLoadingText('Memuat data campaign...');

  const campaignResults = [];
  const allStoresNotDone = [];

  // ID campaign yang sedang aktif di halaman Data Toko / Dashboard
  const loadedCampaignId = (document.getElementById('store-campaign-select') || {}).value ||
                            (document.getElementById('dash-campaign-select')  || {}).value || '';

  for (let i = 0; i < activeCampaigns.length; i++) {
    const c = activeCampaigns[i];
    _wrUpdateLoadingText(`Memuat campaign ${i + 1}/${activeCampaigns.length}: ${c.name}`);

    // ── Gunakan currentMasterData jika campaign ini sudah di-load ──────
    // Ini memastikan angka Weekly Report identik dengan Data Toko
    let merged = [];

    if (c.id === loadedCampaignId &&
        typeof currentMasterData !== 'undefined' && currentMasterData.length > 0) {
      // Pakai data yang sudah di-load di halaman Data Toko (sudah ter-merge)
      merged = currentMasterData;

    } else {
      // ── Fetch ulang — ikuti pola PERSIS sama dengan stores.js ─────────
      let masterStores = [];
      let importRows   = [];

      try {
        if (c.mode === 'excel') {
          // Excel mode: localStores sudah ada, tinggal fetch import
          masterStores = Array.isArray(c.localStores) ? c.localStores : [];
          if (c.responseSheetId) {
            // Import fetch punya try-catch SENDIRI agar gagal tidak mempengaruhi master
            try {
              importRows = await fetchSheet(c.responseSheetId, c.importSheet || DEFAULT_IMPORT_SHEET);
            } catch (e) { /* sheet belum publish atau belum ada response — normal */ }
          }
        } else {
          // Sheet mode: fetch master dari Google Sheets
          const mRows  = await fetchSheet(c.spreadsheetId, c.masterSheet || DEFAULT_MASTER_SHEET);
          masterStores = parseMaster(mRows, c.headerRow || DEFAULT_HEADER_ROW);
          // Import fetch punya try-catch SENDIRI
          try {
            importRows = await fetchSheet(c.spreadsheetId, c.importSheet || DEFAULT_IMPORT_SHEET);
          } catch (e) { /* silent */ }
        }
      } catch (err) {
        console.warn('[weeklyReport] Fetch master gagal:', c.name, err.message);
      }

      const importData = parseImport(importRows);
      merged = mergeStatusFromImport(masterStores, importData);
    }

    // ── Terapkan filter Region ke store-level ─────────────────────────
    const regionFilter  = filters.region;
    const storesInScope = regionFilter !== 'ALL'
      ? merged.filter(s => (s.region || '').toUpperCase() === regionFilter.toUpperCase())
      : merged;

    const doneStores = storesInScope.filter(s => s.status === STATUS.DONE);
    const ndStores   = storesInScope.filter(s => s.status === STATUS.NOT_DONE);
    const total      = storesInScope.length;
    const done       = doneStores.length;
    const notDone    = ndStores.length;
    const rate       = total > 0 ? Math.round(done / total * 100) : 0;

    // Jika filter region aktif dan campaign ini tidak punya toko di region tsb, skip
    if (regionFilter !== 'ALL' && total === 0) continue;

    // Update dataCache (angka global semua region, bukan angka filtered)
    if (typeof dataCache !== 'undefined') {
      const allDone  = merged.filter(s => s.status === STATUS.DONE).length;
      const allTotal = merged.length;
      const allRate  = allTotal > 0 ? Math.round(allDone / allTotal * 100) : 0;
      dataCache[c.id] = { totalStores: allTotal, doneCount: allDone, rate: allRate, lastSync: new Date().toISOString() };
      if (typeof save === 'function') save(SK.cache, dataCache);
    }

    // ── Kumpulkan stores NOT DONE untuk slide (sudah terfilter region) ──
    ndStores.forEach(s => {
      allStoresNotDone.push({
        id           : allStoresNotDone.length + 1,
        campaign_id  : c.id,
        region       : s.region    || '',
        plant_code   : s.plantCode || '',
        store_name   : s.plantDesc || '',
        city         : s.city      || '',
        area         : s.city      || '',
        days_overdue : 0,
        last_reminder: null,
      });
    });

    // ── Deadline sebagai period_end ──────────────────────────
    const priority = rate === 0 ? 'URGENT' : rate < 50 ? 'HIGH' : rate < 80 ? 'MEDIUM' : 'LOW';

    campaignResults.push({
      id              : c.id,
      campaign_name   : c.name,
      campaign_type   : 'CAMPAIGN',
      period_start    : null,
      period_end      : c.deadline || null,
      total_stores    : total,
      stores_done     : done,
      stores_not_done : notDone,
      completion_rate : rate,
      region          : 'ALL_REGIONS',
      status          : 'ACTIVE',
      priority,
    });
  }

  // ── Filter sesuai pilihan user ────────────────────────────
  let filtered = [...campaignResults];
  if (filters.status === 'NOT_DONE') filtered = filtered.filter(c => c.stores_not_done > 0);
  if (filters.status === 'DONE')     filtered = filtered.filter(c => c.completion_rate === 100);

  // Sort: completion rate terendah dulu (paling urgent)
  filtered.sort((a, b) => a.completion_rate - b.completion_rate);

  // ── Overview stats ────────────────────────────────────────
  const totStores  = filtered.reduce((s, c) => s + c.total_stores, 0);
  const totDone    = filtered.reduce((s, c) => s + c.stores_done, 0);
  const totNotDone = filtered.reduce((s, c) => s + c.stores_not_done, 0);
  const overallRate = totStores > 0 ? Math.round(totDone / totStores * 100) : 0;

  const overview = {
    total_campaigns_active  : filtered.filter(c => c.stores_not_done > 0).length,
    overall_completion_rate : overallRate,
    total_stores_not_done   : totNotDone,
    total_stores            : totStores,
    last_updated            : new Date().toISOString(),
    top_urgent_campaigns    : filtered.slice(0, 3).map(c => ({
      campaign_name   : c.campaign_name,
      completion_rate : c.completion_rate,
      stores_not_done : c.stores_not_done,
      total_stores    : c.total_stores,
      priority_level  : c.priority,
    })),
  };

  // ── Regional summary: hitung dari data real ───────────────
  const regionMap = {};
  allStoresNotDone.forEach(s => {
    const r = s.region || 'LAINNYA';
    if (!regionMap[r]) regionMap[r] = { done: 0, notDone: 0 };
    regionMap[r].notDone++;
  });
  campaignResults.forEach(c => {
    // done stores sudah tercount di master - ini approx
  });
  // Gunakan SAMPLE_REGIONAL_SUMMARY sebagai template, update angka jika cocok
  const regions = SAMPLE_REGIONAL_SUMMARY.map(r => ({
    ...r,
    stores_not_done : (regionMap[r.region] || {}).notDone || r.stores_not_done,
  }));

  return {
    overview,
    campaigns : filtered,
    stores    : allStoresNotDone.filter(s =>
      filtered.some(c => c.id === s.campaign_id)
    ),
    regions,
  };
}

/**
 * Fallback ke sample data jika belum ada campaign di ERA-VIS.
 * @param {Object} filters
 */
function _fetchWrSampleData(filters) {
  let cList = [...SAMPLE_CAMPAIGNS];
  if (filters.status === 'NOT_DONE') cList = cList.filter(c => c.stores_not_done > 0);
  if (filters.status === 'DONE')     cList = cList.filter(c => c.completion_rate === 100);
  cList.sort((a, b) => a.completion_rate - b.completion_rate);

  const stores = SAMPLE_STORES_NOT_DONE.filter(s =>
    filters.region === 'ALL' || s.region === filters.region
  );

  return { overview: SAMPLE_OVERVIEW_STATS, campaigns: cList, stores, regions: SAMPLE_REGIONAL_SUMMARY };
}

/**
 * Update teks loading di halaman Weekly Report
 * @param {string} msg
 */
function _wrUpdateLoadingText(msg) {
  const el = document.querySelector('#wr-loading .wr-loading-text');
  if (el) el.textContent = msg;
}


// ── GENERATE ──────────────────────────────────────────────────────

/**
 * Generate semua slides berdasarkan filter yang aktif.
 * Dipanggil saat user klik tombol "Generate Slides".
 */
async function generateWeeklyReport() {
  if (wrState.generating) return;

  // Ambil nilai filter dari UI
  wrState.filters.period = document.getElementById('wr-period-select').value  || 'current';
  wrState.filters.region = document.getElementById('wr-region-select').value  || 'ALL';
  wrState.filters.status = document.getElementById('wr-status-select').value  || 'NOT_DONE';

  wrState.generating = true;

  // Tampilkan loading state
  _showWrLoading(true);
  _showWrEmptyState(false);
  _setWrPreviewVisible(false);

  // Disable tombol generate
  const genBtn = document.getElementById('wr-generate-btn');
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = '⏳ Generating...'; }

  try {
    const data = await _fetchWrData(wrState.filters);
    wrState.slides = _buildSlides(data, wrState.filters);

    if (wrState.slides.length === 0) {
      toast('Tidak ada data untuk ditampilkan dengan filter ini.', 'warn');
      _showWrEmptyState(true, 'Tidak ada data dengan filter yang dipilih. Coba ubah filter Region atau Status.');
    } else {
      wrState.currentIndex = 0;
      _renderWrPreview();
      toast(`${wrState.slides.length} slides berhasil digenerate!`, 'success');
      addLog('system', `Weekly Report generated: ${wrState.slides.length} slides, periode ${wrState.filters.period}`);
    }

  } catch (err) {
    console.error('[weeklyReport] Generate error:', err);
    toast('Gagal generate report: ' + err.message, 'error');
    _showWrEmptyState(true, 'Gagal generate report. Cek koneksi internet dan coba lagi.');
  } finally {
    wrState.generating = false;
    _showWrLoading(false);
    if (genBtn) { genBtn.disabled = false; genBtn.innerHTML = '🎨 Generate Slides'; }
  }
}

/**
 * Susun array slide objects dari data yang sudah difetch.
 *
 * @param {Object} data    - {overview, campaigns, stores, regions}
 * @param {Object} filters
 * @returns {Array<{index, title, type, html}>}
 */
function _buildSlides(data, filters) {
  const slides = [];

  // Hitung total slides dulu
  const totalPages = 1                              // overview
    + data.campaigns.length                        // 1 per campaign
    + 1;                                           // summary/penutup

  // Slide 1: Overview
  slides.push({
    index: 0,
    title: 'Overview',
    type : 'overview',
    html : generateOverviewSlide(
      data.overview,
      data.regions,
      filters.period,
      1,
      totalPages
    ),
  });

  // Slide 2-N: Per campaign
  data.campaigns.forEach((campaign, i) => {
    const storesForCampaign = data.stores.filter(s => s.campaign_id === campaign.id);
    slides.push({
      index: i + 1,
      title: campaign.campaign_name,
      type : 'campaign',
      html : generateCampaignSlide(campaign, storesForCampaign, i + 2, totalPages),
    });
  });

  // Slide terakhir: Summary
  slides.push({
    index: slides.length,
    title: 'Ringkasan',
    type : 'summary',
    html : generateSummarySlide(data.overview, filters.period, slides.length + 1, totalPages),
  });

  return slides;
}


// ── RENDER ────────────────────────────────────────────────────────

/**
 * Render keseluruhan preview area setelah slides berhasil digenerate.
 */
function _renderWrPreview() {
  _renderWrThumbnails();
  showWrSlide(wrState.currentIndex, true);
  _setWrPreviewVisible(true);
  _updateWrExportButtons(true);
}

/**
 * Render thumbnail nav (baris tombol slide kecil)
 */
function _renderWrThumbnails() {
  const container = document.getElementById('wr-thumbnails');
  if (!container) return;

  const typeColors = {
    overview: '#2563EB',
    campaign: '#DC2626',
    summary : '#0B8F6C',
  };

  container.innerHTML = wrState.slides.map((s, i) => {
    const color   = typeColors[s.type] || '#64748B';
    const isActive = i === wrState.currentIndex;
    return `<button
      class="wr-thumb-btn ${isActive ? 'active' : ''}"
      onclick="showWrSlide(${i})"
      title="${s.title}"
      style="--thumb-color:${color}"
    >
      <span class="wr-thumb-num">${i + 1}</span>
      <span class="wr-thumb-label">${s.title.length > 20 ? s.title.slice(0, 18) + '…' : s.title}</span>
    </button>`;
  }).join('');

  // Update count label
  const countEl = document.getElementById('wr-slide-count');
  if (countEl) countEl.textContent = wrState.slides.length + ' slides';
}

/**
 * Tampilkan slide pada index tertentu.
 *
 * @param {number}  index  - 0-based slide index
 * @param {boolean} silent - jika true, skip scale re-calculation (untuk export)
 */
function showWrSlide(index, silent) {
  if (!wrState.slides.length) return;
  index = Math.max(0, Math.min(index, wrState.slides.length - 1));
  wrState.currentIndex = index;

  const slide = wrState.slides[index];

  // Inject HTML ke scaler
  const scaler = document.getElementById('wr-slide-scaler');
  if (scaler) scaler.innerHTML = slide.html;

  // Update nav: prev/next button states
  const prevBtn = document.getElementById('wr-prev-btn');
  const nextBtn = document.getElementById('wr-next-btn');
  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.disabled = index === wrState.slides.length - 1;

  // Update title label
  const titleEl = document.getElementById('wr-current-title');
  if (titleEl) titleEl.textContent = `Slide ${index + 1} dari ${wrState.slides.length}: ${slide.title}`;

  // Update thumbnail active state
  document.querySelectorAll('.wr-thumb-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });

  if (!silent) {
    _scaleWrSlide();
  }
}

/**
 * Navigasi ke slide sebelumnya
 */
function prevWrSlide() {
  if (wrState.currentIndex > 0) showWrSlide(wrState.currentIndex - 1);
}

/**
 * Navigasi ke slide berikutnya
 */
function nextWrSlide() {
  if (wrState.currentIndex < wrState.slides.length - 1) showWrSlide(wrState.currentIndex + 1);
}

/**
 * Hitung dan terapkan scale CSS transform pada slide agar fit di preview.
 */
function _scaleWrSlide() {
  const viewport = document.getElementById('wr-slide-viewport');
  const scaler   = document.getElementById('wr-slide-scaler');
  if (!viewport || !scaler) return;

  const availWidth = viewport.clientWidth - 2; // 2px buffer
  const scale      = Math.min(availWidth / 1120, 1);

  scaler.style.transform      = `scale(${scale})`;
  scaler.style.transformOrigin = 'top center';
  viewport.style.height       = Math.ceil(630 * scale + 4) + 'px';
}

// Re-scale ketika window resize
window.addEventListener('resize', function() {
  if (wrState.slides.length > 0) _scaleWrSlide();
});


// ── EXPORT ────────────────────────────────────────────────────────

/**
 * Export slide saat ini sebagai PNG
 */
async function exportWrSlidePng() {
  if (!wrState.slides.length) { toast('Generate slides dulu!', 'warn'); return; }
  const slide = wrState.slides[wrState.currentIndex];
  await exportSlidePng(wrState.currentIndex, slide.title);
}

/**
 * Export semua slides sebagai PDF
 */
async function exportWrPdf() {
  if (!wrState.slides.length) { toast('Generate slides dulu!', 'warn'); return; }

  const pdfBtn = document.getElementById('wr-export-pdf-btn');
  const pdfBtn2 = document.getElementById('wr-export-pdf-btn2');
  [pdfBtn, pdfBtn2].forEach(btn => { if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating PDF...'; } });

  try {
    await exportAllSlidesPdf(
      wrState.slides,
      wrFmtFilterPeriod(wrState.filters.period)
    );
  } finally {
    [pdfBtn, pdfBtn2].forEach(btn => {
      if (btn) { btn.disabled = false; btn.innerHTML = '📥 Export PDF'; }
    });
    _updateWrExportButtons(true);
  }
}


// ── UI HELPERS ────────────────────────────────────────────────────

/**
 * Toggle visibility preview area
 * @param {boolean} visible
 */
function _setWrPreviewVisible(visible) {
  const area = document.getElementById('wr-preview-area');
  if (area) area.style.display = visible ? '' : 'none';
}

/**
 * Toggle loading spinner
 * @param {boolean} show
 */
function _showWrLoading(show) {
  const el = document.getElementById('wr-loading');
  if (el) el.style.display = show ? '' : 'none';
}

/**
 * Toggle / update empty state
 * @param {boolean} show
 * @param {string}  [msg] - custom message
 */
function _showWrEmptyState(show, msg) {
  const el = document.getElementById('wr-empty-state');
  if (!el) return;
  el.style.display = (show === false) ? 'none' : '';
  if (msg) {
    const p = el.querySelector('p');
    if (p) p.textContent = msg;
  }
}

/**
 * Enable/disable export buttons
 * @param {boolean} enabled
 */
function _updateWrExportButtons(enabled) {
  ['wr-export-pdf-btn', 'wr-export-pdf-btn2'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !enabled;
  });
}
