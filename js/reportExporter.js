/* ================================================================
   ERA-VIS AI v2.0 — reportExporter.js
   Export slide ke PNG (html2canvas) dan PDF (jsPDF)
   ================================================================ */
'use strict';

/**
 * Pastikan slide element visible dan di posisi default untuk capture.
 * Sementara lepas scale transform agar html2canvas tangkap ukuran full.
 *
 * @param {HTMLElement} slideEl     - element .wr-slide
 * @param {HTMLElement} viewportEl  - element .wr-slide-viewport
 * @param {HTMLElement} scalerEl    - element .wr-slide-scaler
 * @returns {Function} restore - panggil setelah selesai capture
 */
function _prepareForCapture(slideEl, viewportEl, scalerEl) {
  const prevTransform    = scalerEl.style.transform;
  const prevHeight       = viewportEl.style.height;
  const prevOverflow     = viewportEl.style.overflow;
  const prevMinHeight    = viewportEl.style.minHeight;

  scalerEl.style.transform = 'scale(1)';
  scalerEl.style.transformOrigin = 'top left';
  viewportEl.style.height    = 'auto';
  viewportEl.style.minHeight = '630px';
  viewportEl.style.overflow  = 'visible';

  return function restore() {
    scalerEl.style.transform    = prevTransform;
    scalerEl.style.transformOrigin = 'top center';
    viewportEl.style.height    = prevHeight;
    viewportEl.style.minHeight = prevMinHeight;
    viewportEl.style.overflow  = prevOverflow;
  };
}

/**
 * Trigger download file dari blob/dataURL
 *
 * @param {string} url      - data URL atau object URL
 * @param {string} filename - nama file yang akan diunduh
 */
function _triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Buat nama file aman dari teks bebas
 * @param {string} text
 * @returns {string}
 */
function _safeFilename(text) {
  return text.replace(/[^a-zA-Z0-9\-_. ]/g, '').replace(/\s+/g, '_').slice(0, 80);
}

/**
 * Format tanggal untuk nama file → "20260419"
 * @returns {string}
 */
function _dateTag() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
}


// ── PNG EXPORT ────────────────────────────────────────────────────

/**
 * Export slide yang sedang ditampilkan sebagai PNG (2x retina quality)
 *
 * @param {number} slideIndex   - 0-based index
 * @param {string} slideTitle   - judul slide untuk nama file
 * @returns {Promise<void>}
 */
async function exportSlidePng(slideIndex, slideTitle) {
  if (typeof html2canvas === 'undefined') {
    toast('Library html2canvas belum dimuat. Refresh halaman dan coba lagi.', 'error');
    return;
  }

  const viewportEl = document.getElementById('wr-slide-viewport');
  const scalerEl   = document.getElementById('wr-slide-scaler');
  const slideEl    = scalerEl ? scalerEl.querySelector('.wr-slide') : null;

  if (!slideEl) {
    toast('Tidak ada slide untuk diexport.', 'error');
    return;
  }

  toast('Memproses screenshot...', 'info');

  const restore = _prepareForCapture(slideEl, viewportEl, scalerEl);

  // Beri waktu render setelah style change
  await new Promise(r => setTimeout(r, 150));

  try {
    const canvas = await html2canvas(slideEl, {
      scale        : 2,           // 2× untuk retina quality
      width        : 1120,
      height       : 630,
      useCORS      : true,
      allowTaint   : true,
      backgroundColor: '#ffffff',
      logging      : false,
      imageTimeout : 8000,
    });

    const filename = `ERA-VIS_Slide${slideIndex + 1}_${_safeFilename(slideTitle)}_${_dateTag()}.png`;
    _triggerDownload(canvas.toDataURL('image/png'), filename);
    toast('Screenshot berhasil! File PNG terunduh.', 'success');

  } catch (err) {
    console.error('[reportExporter] PNG export error:', err);
    toast('Screenshot gagal: ' + err.message, 'error');
  } finally {
    restore();
  }
}


// ── PDF EXPORT ────────────────────────────────────────────────────

/**
 * Export semua slides sebagai satu file PDF.
 * Setiap slide jadi satu halaman landscape 1120×630px.
 *
 * @param {Array<{index: number, title: string, el: HTMLElement}>} slides
 * @param {string} reportPeriod - label periode untuk nama file
 * @returns {Promise<void>}
 */
async function exportAllSlidesPdf(slides, reportPeriod) {
  if (typeof html2canvas === 'undefined') {
    toast('Library html2canvas belum dimuat. Refresh halaman dan coba lagi.', 'error');
    return;
  }
  if (typeof window.jspdf === 'undefined') {
    toast('Library jsPDF belum dimuat. Refresh halaman dan coba lagi.', 'error');
    return;
  }

  if (!slides || slides.length === 0) {
    toast('Tidak ada slides untuk diexport.', 'error');
    return;
  }

  const viewportEl = document.getElementById('wr-slide-viewport');
  const scalerEl   = document.getElementById('wr-slide-scaler');

  toast(`Memproses PDF (${slides.length} halaman)...`, 'info');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit        : 'px',
    format      : [1120, 630],
    hotfixes    : ['px_scaling'],
    compress    : true,
  });

  // Simpan slide yang sedang ditampilkan supaya bisa dikembalikan
  const origIndex = typeof wrState !== 'undefined' ? wrState.currentIndex : 0;

  try {
    for (let i = 0; i < slides.length; i++) {
      // Tampilkan slide ini ke viewport agar bisa di-capture
      if (typeof showWrSlide === 'function') showWrSlide(i, true /* silent */);
      await new Promise(r => setTimeout(r, 200));

      const slideEl = scalerEl ? scalerEl.querySelector('.wr-slide') : null;
      if (!slideEl) continue;

      const restore = _prepareForCapture(slideEl, viewportEl, scalerEl);
      await new Promise(r => setTimeout(r, 150));

      try {
        const canvas = await html2canvas(slideEl, {
          scale          : 2,
          width          : 1120,
          height         : 630,
          useCORS        : true,
          allowTaint     : true,
          backgroundColor: '#ffffff',
          logging        : false,
          imageTimeout   : 8000,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92);

        if (i > 0) doc.addPage([1120, 630], 'landscape');
        doc.addImage(imgData, 'JPEG', 0, 0, 1120, 630);

        toast(`Halaman ${i + 1} dari ${slides.length}...`, 'info');

      } finally {
        restore();
      }
    }

    const filename = `ERA-VIS_WeeklyReport_${_safeFilename(reportPeriod)}_${_dateTag()}.pdf`;
    doc.save(filename);
    toast(`PDF berhasil! ${slides.length} halaman terunduh.`, 'success');

  } catch (err) {
    console.error('[reportExporter] PDF export error:', err);
    toast('Export PDF gagal: ' + err.message, 'error');
  } finally {
    // Kembalikan ke slide semula
    if (typeof showWrSlide === 'function') showWrSlide(origIndex, true);
  }
}
