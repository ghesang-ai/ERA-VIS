/* ================================================================
   ERA-VIS AI v2.0 — fbeReportExport.js
   Membangun report HTML off-screen yang cocok dengan layout referensi
   FBE (1 halaman per toko: header + satu section per materi yang
   dialokasikan, menampilkan foto asli hasil upload Store Leader) lalu
   meng-export-nya ke JPG pakai html2canvas — sudah ter-load di
   index.html, tidak perlu dependency baru.
   Depends on: fbe.js (fbeStoreStatus, fbeCurrentCampaign)
   ================================================================ */

'use strict';

// Jawaban file-upload Google Form berbentuk link "view" Drive
// (drive.google.com/open?id=... atau .../file/d/ID/view) yang tidak
// bisa langsung dipakai sebagai <img src> (hotlink diblokir). Ini
// mengubahnya jadi URL gambar publik Drive, yang berfungsi untuk file
// yang di-share sebagai "Anyone with the link can view" (wajib — lihat
// spesifikasi field Google Form di plan Task 3).
//
// PENTING: pakai lh3.googleusercontent.com langsung, JANGAN
// drive.google.com/thumbnail — thumbnail endpoint itu me-redirect (302)
// ke lh3.googleusercontent.com, dan response redirect-nya sendiri TIDAK
// punya header Access-Control-Allow-Origin (cuma tujuan akhirnya yang
// punya). Karena <img crossorigin="anonymous"> di bawah wajib dipakai
// supaya html2canvas bisa baca piksel gambar ke canvas (tanpa itu,
// canvas "tainted" dan gagal total), browser menolak seluruh redirect
// chain begitu 1 hop di tengah tidak punya header CORS — gambarnya
// gagal load diam-diam (img.onerror), hasil JPG jadi kotak kosong,
// PADAHAL link foto-nya sendiri sudah benar "Anyone with the link".
// Sudah diverifikasi langsung: lh3.googleusercontent.com/d/ID=wN selalu
// balas Access-Control-Allow-Origin:* untuk file yang link-nya publik.
function driveImgUrl(link) {
  if (!link) return '';
  const m = link.match(/[-\w]{25,}/); // ID file Drive selalu 25+ karakter url-safe
  if (!m) return link;
  return `https://lh3.googleusercontent.com/d/${m[0]}=w1000`;
}

function _fbeReportSectionHtml(material) {
  const hasPhoto = material.confirmed && material.linkFoto;
  const body = hasPhoto
    ? `<img src="${esc(driveImgUrl(material.linkFoto))}" crossorigin="anonymous">`
    : `<div class="fbe-report-missing">Belum Terpasang</div>`;
  return `
    <div class="fbe-report-section">
      <div class="fbe-report-section-title">${esc(material.label)}</div>
      <div class="fbe-report-photo-wrap">${body}</div>
    </div>`;
}

// Grid selalu 3 kolom, tapi jumlah baris menyesuaikan jumlah materi toko
// (FBE bisa 1-6 materi tergantung alokasi; Scoring selalu 6) — dihitung di
// sini (bukan CSS statis) supaya kanvas 1920x1080 yang fixed tetap terisi
// rapi baik toko dengan 1 materi maupun 6 materi, lihat css/fbe.css.
function buildFbeReportHtml(store) {
  const sections = store.materials.map(_fbeReportSectionHtml).join('');
  const rows = Math.max(1, Math.ceil(store.materials.length / 3));

  const isScoring = fbeCurrentCampaign && fbeCurrentCampaign.scoringMode;
  const tag = isScoring
    ? '<div class="fbe-report-tag tag-scoring">Scoring Visibility FBE</div>'
    : '<div class="fbe-report-tag tag-fbe">FBE</div>';

  return `
    <div class="fbe-report-page">
      <div class="fbe-report-header">
        <div class="fbe-report-title">${esc(store.namaToko)} - ${esc(store.plantCode)}</div>
        ${tag}
      </div>
      <div class="fbe-report-grid" style="grid-template-rows:repeat(${rows},1fr)">${sections}</div>
    </div>`;
}

// Render 1 halaman report toko ke dalam `container` (off-screen, sudah
// di-append ke body oleh pemanggil) dan kembalikan canvas hasil snapshot.
// Dipakai bareng oleh downloadFbeReport() (1 toko -> JPG) dan
// exportFbeAllPdf() (banyak toko -> 1 PDF, 1 halaman per toko) supaya
// logic render + tunggu foto load-nya cuma ada di 1 tempat.
async function _renderFbeReportCanvas(store, container) {
  container.innerHTML = buildFbeReportHtml(store);

  // Beri waktu tag <img> untuk load sebelum snapshot canvas diambil.
  const imgs = container.querySelectorAll('img');
  await Promise.all([...imgs].map(img => new Promise(resolve => {
    if (img.complete) return resolve();
    img.onload = img.onerror = resolve;
  })));

  // scale:1 — .fbe-report-page sudah fixed 1920x1080 (lihat css/fbe.css),
  // jadi outputnya presisi 1920x1080 tanpa perlu dikalikan lagi.
  return html2canvas(container.querySelector('.fbe-report-page'), {
    useCORS: true, backgroundColor: '#ffffff', scale: 1,
  });
}

function _fbeOffscreenContainer() {
  const container = document.createElement('div');
  container.id = 'fbe-report-render';
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top  = '0';
  document.body.appendChild(container);
  return container;
}

async function downloadFbeReport(plantCode) {
  const store = fbeStoreStatus.find(s => s.plantCode === plantCode);
  if (!store) { toast('Toko tidak ditemukan', 'error'); return; }

  toast('Menyiapkan report...', 'info');
  const container = _fbeOffscreenContainer();

  try {
    const canvas = await _renderFbeReportCanvas(store, container);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `FBE_Report_${store.plantCode}_${store.namaToko.replace(/[^a-zA-Z0-9]/g,'_')}.jpg`;
    a.click();

    addLog('system', `FBE report downloaded: ${store.plantCode}`);
    toast('Report berhasil di-download');
  } catch (err) {
    toast('Gagal generate report: ' + err.message, 'error');
  } finally {
    document.body.removeChild(container);
  }
}

// Export SEMUA toko yang lolos filter tabel saat ini (sama seperti
// exportFbeExcel() — pakai getFilteredFbeStores(), bukan seluruh campaign
// tanpa filter) jadi 1 file PDF, 1 halaman 1920x1080 per toko. Proses
// sekuensial (bukan paralel) karena tiap halaman butuh render + snapshot
// html2canvas sendiri-sendiri — untuk campaign besar (ratusan/ribuan toko)
// ini bisa makan waktu lama, makanya ada konfirmasi + estimasi durasi dulu.
async function exportFbeAllPdf() {
  if (!fbeCurrentCampaign) { toast('Pilih campaign FBE', 'error'); return; }
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    toast('Library PDF belum dimuat. Refresh halaman dan coba lagi.', 'error');
    return;
  }

  const rows = getFilteredFbeStores();
  if (!rows.length) { toast('Tidak ada toko untuk diexport (cek filter)', 'error'); return; }

  if (rows.length > 30) {
    const estMin = Math.ceil(rows.length * 1.5 / 60);
    if (!confirm(`Export PDF untuk ${rows.length} toko — perkiraan ${estMin} menit (1 halaman per toko, diproses satu-satu). Lanjutkan?`)) return;
  }

  toast(`Menyiapkan PDF (${rows.length} toko)...`, 'info');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'landscape', unit: 'px', format: [1920, 1080],
    hotfixes: ['px_scaling'], compress: true,
  });
  const container = _fbeOffscreenContainer();

  let ok = 0;
  try {
    for (let i = 0; i < rows.length; i++) {
      try {
        const canvas = await _renderFbeReportCanvas(rows[i], container);
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (i > 0) doc.addPage([1920, 1080], 'landscape');
        doc.addImage(imgData, 'JPEG', 0, 0, 1920, 1080);
        ok++;
      } catch (e) {
        console.warn('[FBE] gagal render halaman PDF untuk', rows[i].plantCode, e.message);
      }
      if ((i + 1) % 10 === 0 || i === rows.length - 1) {
        toast(`Memproses ${i + 1}/${rows.length} toko...`, 'info');
      }
    }

    const name = fbeCurrentCampaign.name;
    doc.save(`FBE_All_${name.replace(/[^a-zA-Z0-9]/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    addLog('system', `FBE Export All PDF: ${name} (${ok}/${rows.length} toko)`);
    toast(`PDF berhasil! ${ok}/${rows.length} toko terekspor.`);
  } catch (err) {
    toast('Gagal generate PDF: ' + err.message, 'error');
  } finally {
    document.body.removeChild(container);
  }
}
