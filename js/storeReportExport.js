/* ================================================================
   ERA-VIS AI v2.0 — storeReportExport.js
   "Export All PDF" untuk campaign biasa (halaman Data Toko).
   Membangun report HTML off-screen — 1 halaman = 4 toko (grid 2x2,
   landscape): tiap sel = header + satu foto dokumentasi utuh — lalu
   meng-export-nya ke 1 file PDF pakai html2canvas + jsPDF (dua-duanya
   sudah ter-load di index.html, tidak perlu dependency baru).

   Ini versi campaign biasa dari fbeReportExport.js (yang menangani
   campaign FBE multi-materi). Sengaja dipisah supaya layout FBE
   (grid 1920x1080, banyak materi, 1 toko/halaman) dan layout campaign
   biasa (landscape A4, 4 toko/halaman, 1 foto) bisa berkembang
   sendiri-sendiri.

   Depends on: stores.js (getFilteredStoreRows, STATUS),
               fbeReportExport.js (driveImgUrl — helper konversi link
               Drive jadi URL gambar CORS-friendly),
               campaigns.js (campaigns, addLog, toast), api.js (esc)
   ================================================================ */

'use strict';

const SR_PER_PAGE = 4;                 // 4 toko per halaman (grid 2x2)
const SR_PAGE = [1414, 1000];          // px — rasio A4 landscape

function _srCellPhotoHtml(store) {
  const raw = (store.dokumentasi || '').trim();
  const hasPhoto = store.status === STATUS.DONE && raw.startsWith('http');
  return hasPhoto
    ? `<div class="sr-report-photo-wrap"><img src="${esc(driveImgUrl(raw))}" crossorigin="anonymous"></div>`
    : `<div class="sr-report-photo-wrap"><div class="sr-report-missing">Belum Terpasang</div></div>`;
}

function buildStoreCellHtml(store, campaignName) {
  const judul = [store.plantDesc || store.plantCode, store.plantCode]
    .filter(Boolean).join(' - ');
  const tag = campaignName
    ? `<div class="sr-report-tag">${esc(campaignName)}</div>`
    : '';
  const lokasi = [store.region, store.city].filter(Boolean).map(esc).join(' · ');
  const st = store.status === STATUS.DONE
    ? '<span class="done">DONE</span>'
    : `<span class="notdone">${esc(store.status || 'NOT DONE')}</span>`;

  return `
    <div class="sr-report-cell">
      <div class="sr-report-head">
        <h3 class="sr-report-title">${esc(judul)}</h3>
        ${tag}
      </div>
      <div class="sr-report-sub">Foto Dokumentasi Visibility</div>
      ${_srCellPhotoHtml(store)}
      <div class="sr-report-foot"><span>${lokasi}</span>${st}</div>
    </div>`;
}

// 1 halaman = maksimal SR_PER_PAGE sel toko. Halaman terakhir boleh
// terisi < 4 (grid tetap 2x2 jadi sel yang ada tetap setengah tinggi).
function buildStorePageHtml(storesChunk, campaignName) {
  return `
    <div class="sr-report-page">
      ${storesChunk.map(s => buildStoreCellHtml(s, campaignName)).join('')}
    </div>`;
}

// Render 1 halaman (chunk toko) ke `container` (off-screen, sudah
// di-append ke body oleh pemanggil) lalu kembalikan canvas snapshot.
async function _renderStorePageCanvas(storesChunk, container, campaignName) {
  container.innerHTML = buildStorePageHtml(storesChunk, campaignName);

  // Beri waktu <img> untuk load sebelum snapshot canvas diambil.
  const imgs = container.querySelectorAll('img');
  await Promise.all([...imgs].map(img => new Promise(resolve => {
    if (img.complete) return resolve();
    img.onload = img.onerror = resolve;
  })));

  // scale:1 — .sr-report-page sudah fixed 1414x1000 (lihat
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
// jadi 1 file PDF, 4 toko per halaman (grid 2x2 landscape). Proses
// sekuensial (bukan paralel) karena tiap halaman butuh render +
// snapshot html2canvas sendiri — untuk campaign besar (ratusan/ribuan
// toko) ini bisa lama, makanya ada konfirmasi + estimasi durasi dulu.
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

  const totalPages = Math.ceil(rows.length / SR_PER_PAGE);

  if (rows.length > 40) {
    const estMin = Math.ceil(totalPages * 3 / 60);
    if (!confirm(`Export PDF untuk ${rows.length} toko (${totalPages} halaman, 4 toko per halaman) — perkiraan ${estMin} menit, diproses satu-satu. Lanjutkan?`)) return;
  }

  const c = (typeof campaigns !== 'undefined') ? campaigns.find(x => x.id === cid) : null;
  const campaignName = c ? c.name : '';

  toast(`Menyiapkan PDF (${rows.length} toko, ${totalPages} halaman)...`, 'info');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'landscape', unit: 'px', format: SR_PAGE.slice(),
    hotfixes: ['px_scaling'], compress: true,
  });
  const container = _srOffscreenContainer();

  let done = 0;
  try {
    for (let p = 0; p < totalPages; p++) {
      const chunk = rows.slice(p * SR_PER_PAGE, (p + 1) * SR_PER_PAGE);
      try {
        const canvas = await _renderStorePageCanvas(chunk, container, campaignName);
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (p > 0) doc.addPage(SR_PAGE.slice(), 'landscape');
        doc.addImage(imgData, 'JPEG', 0, 0, SR_PAGE[0], SR_PAGE[1]);
        done += chunk.length;
      } catch (e) {
        console.warn('[stores] gagal render halaman PDF', p + 1, e.message);
      }
      if ((p + 1) % 5 === 0 || p === totalPages - 1) {
        toast(`Memproses halaman ${p + 1}/${totalPages}...`, 'info');
      }
    }

    const safeName = (campaignName || 'Campaign').replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Report_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`);
    if (typeof addLog === 'function') {
      addLog('system', `Export All PDF: ${campaignName} (${done}/${rows.length} toko, ${totalPages} halaman)`);
    }
    toast(`PDF berhasil! ${done}/${rows.length} toko terekspor.`);
  } catch (err) {
    toast('Gagal generate PDF: ' + err.message, 'error');
  } finally {
    document.body.removeChild(container);
  }
}
