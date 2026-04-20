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
 * Ambil data report. Saat ini pakai sample data.
 * Ganti isi fungsi ini dengan API call ke Google Apps Script saat production.
 *
 * @param {Object} filters - {period, region, status}
 * @returns {Promise<{overview, campaigns, stores, regions}>}
 */
async function _fetchWrData(filters) {
  // Simulasi loading delay
  await new Promise(r => setTimeout(r, 300));

  // Filter campaigns berdasarkan region & status
  let campaigns = [...SAMPLE_CAMPAIGNS];
  if (filters.region !== 'ALL') {
    campaigns = campaigns.filter(c =>
      c.region === filters.region || c.region === 'ALL_REGIONS'
    );
  }
  if (filters.status === 'NOT_DONE') {
    campaigns = campaigns.filter(c => c.stores_not_done > 0);
  } else if (filters.status === 'DONE') {
    campaigns = campaigns.filter(c => c.completion_rate === 100);
  }

  // Sort: urgent/tidak selesai dulu
  campaigns.sort((a, b) => a.completion_rate - b.completion_rate);

  // Filter stores
  const stores = SAMPLE_STORES_NOT_DONE.filter(s => {
    if (filters.region !== 'ALL' && s.region !== filters.region) return false;
    return true;
  });

  return {
    overview  : SAMPLE_OVERVIEW_STATS,
    campaigns,
    stores,
    regions   : SAMPLE_REGIONAL_SUMMARY,
  };
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
