/* ================================================================
   ERA-VIS AI v2.0 — storeReportExport.js
   "Export All PDF" untuk campaign biasa (halaman Data Toko).
   Membangun report HTML off-screen (1 halaman POTRAIT per toko:
   header + satu foto dokumentasi utuh) lalu meng-export-nya ke 1 file
   PDF pakai html2canvas + jsPDF — dua-duanya sudah ter-load di
   index.html, tidak perlu dependency baru.

   Ini versi campaign biasa dari fbeReportExport.js (yang menangani
   campaign FBE multi-materi). Sengaja dipisah supaya layout FBE
   (grid 1920x1080, banyak materi) dan layout campaign biasa (potrait
   A4, 1 foto) bisa berkembang sendiri-sendiri.

   Depends on: stores.js (getFilteredStoreRows, STATUS),
               fbeReportExport.js (driveImgUrl — helper konversi link
               Drive jadi URL gambar CORS-friendly),
               campaigns.js (campaigns, addLog, toast), api.js (esc)
   ================================================================ */

'use strict';

function _srReportBodyHtml(store) {
  const raw = (store.dokumentasi || '').trim();
  const hasPhoto = store.status === STATUS.DONE && raw.startsWith('http');
  const inner = hasPhoto
    ? `<img src="${esc(driveImgUrl(raw))}" crossorigin="anonymous">`
    : `<div class="sr-report-missing">Belum Terpasang</div>`;
  return `
    <div class="sr-report-body">
      <div class="sr-report-section-title">Foto Dokumentasi Visibility</div>
      <div class="sr-report-photo-wrap">${inner}</div>
    </div>`;
}

function buildStoreReportHtml(store, campaignName) {
  const judul = [store.plantDesc || store.plantCode, store.plantCode]
    .filter(Boolean).join(' - ');
  const tag = campaignName
    ? `<div class="sr-report-tag">${esc(campaignName)}</div>`
    : '';
  const region = store.region ? esc(store.region) : '';
  const city   = store.city ? esc(store.city) : '';
  const lokasi = [region, city].filter(Boolean).join(' · ');

  return `
    <div class="sr-report-page">
      <div class="sr-report-header">
        <h2 class="sr-report-title">${esc(judul)}</h2>
        ${tag}
      </div>
      ${_srReportBodyHtml(store)}
      <div class="sr-report-foot">
        <span>${lokasi}</span>
        <span>${esc(store.status || '')}</span>
      </div>
    </div>`;
}

// Render 1 halaman report toko ke `container` (off-screen, sudah
// di-append ke body oleh pemanggil) lalu kembalikan canvas snapshot.
async function _renderStoreReportCanvas(store, container, campaignName) {
  container.innerHTML = buildStoreReportHtml(store, campaignName);

  // Beri waktu <img> untuk load sebelum snapshot canvas diambil.
  const imgs = container.querySelectorAll('img');
  await Promise.all([...imgs].map(img => new Promise(resolve => {
    if (img.complete) return resolve();
    img.onload = img.onerror = resolve;
  })));

  // scale:1 — .sr-report-page sudah fixed 1000x1414 (lihat
  // css/storeReport.css), jadi output presisi tanpa dikalikan lagi.
  return html2canvas(container.querySelector('.sr-report-page'), {
    useCORS: true, backgroundColor: '#ffffff', scale: 1,
  });
}

function _srOffscreenContainer() {
  const container = document.createElement('div');
  container.id = 'sr-report-render';
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top  = '0';
  document.body.appendChild(container);
  return container;
}

// Export SEMUA toko yang lolos filter tabel saat ini (Region/Status/
// City/Search — sama seperti exportExcel(), pakai getFilteredStoreRows())
// jadi 1 file PDF, 1 halaman A4 potrait per toko. Proses sekuensial
// (bukan paralel) karena tiap halaman butuh render + snapshot
// html2canvas sendiri — untuk campaign besar (ratusan/ribuan toko) ini
// bisa lama, makanya ada konfirmasi + estimasi durasi dulu.
async function exportStoreAllPdf() {
  const cid = document.getElementById('store-campaign-select').value;
  if (!cid) { toast('Pilih campaign dulu', 'error'); return; }
  if (typeof html2canvas === 'undefined' || !window.jspdf) {
    toast('Library PDF belum dimuat. Refresh halaman dan coba lagi.', 'error');
    return;
  }

  const rows = (typeof getFilteredStoreRows === 'function')
    ? getFilteredStoreRows() : [];
  if (!rows.length) { toast('Tidak ada toko untuk diexport (cek filter)', 'error'); return; }

  if (rows.length > 30) {
    const estMin = Math.ceil(rows.length * 1.5 / 60);
    if (!confirm(`Export PDF untuk ${rows.length} toko — perkiraan ${estMin} menit (1 halaman per toko, diproses satu-satu). Lanjutkan?`)) return;
  }

  const c = (typeof campaigns !== 'undefined') ? campaigns.find(x => x.id === cid) : null;
  const campaignName = c ? c.name : '';

  toast(`Menyiapkan PDF (${rows.length} toko)...`, 'info');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait', unit: 'px', format: [1000, 1414],
    hotfixes: ['px_scaling'], compress: true,
  });
  const container = _srOffscreenContainer();

  let ok = 0;
  try {
    for (let i = 0; i < rows.length; i++) {
      try {
        const canvas = await _renderStoreReportCanvas(rows[i], container, campaignName);
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (i > 0) doc.addPage([1000, 1414], 'portrait');
        doc.addImage(imgData, 'JPEG', 0, 0, 1000, 1414);
        ok++;
      } catch (e) {
        console.warn('[stores] gagal render halaman PDF untuk', rows[i].plantCode, e.message);
      }
      if ((i + 1) % 10 === 0 || i === rows.length - 1) {
        toast(`Memproses ${i + 1}/${rows.length} toko...`, 'info');
      }
    }

    const safeName = (campaignName || 'Campaign').replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Report_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`);
    if (typeof addLog === 'function') {
      addLog('system', `Export All PDF: ${campaignName} (${ok}/${rows.length} toko)`);
    }
    toast(`PDF berhasil! ${ok}/${rows.length} toko terekspor.`);
  } catch (err) {
    toast('Gagal generate PDF: ' + err.message, 'error');
  } finally {
    document.body.removeChild(container);
  }
}
