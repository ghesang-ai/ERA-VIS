// ================================================================
// ERA-REVISUAL — Export PDF Wall Branding
// ----------------------------------------------------------------
// Dibangun langsung pakai jsPDF (teks vektor + foto JPEG), bukan
// screenshot html2canvas, supaya teks tajam & ukuran file wajar.
//
// Isi PDF (A4 portrait):
//   1. Ringkasan: KPI + daftar toko Belum Submit & Perlu Revisi
//   2. Satu bagian per toko yang sudah submit: info toko, lalu per wall
//      jenis + ukuran + foto Depan & Meteran besar + foto opsional kecil
// Toko yang masuk = sesuai filter status & pencarian di halaman.
// ================================================================

const RV_PDF = {
  W: 210, H: 297, M: 12,
  red: [227, 6, 19], ink: [15, 23, 42], muted: [100, 116, 139],
  border: [226, 232, 240], soft: [248, 250, 252],
  green: [22, 163, 74], gold: [180, 83, 9],
};
const RV_SLOT_LABEL = { depan: 'Depan', meteran: 'Meteran', kiri: 'Sudut Kiri', kanan: 'Sudut Kanan', sekitar: 'Area Sekitar' };

// Foto → dataURL JPEG kecil (maks 900 px) supaya PDF tidak membengkak
async function rvPdfLoadImage(url) {
  try {
    const blob = await fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); });
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.72), w: c.width, h: c.height };
  } catch (e) {
    console.warn('[ERA-REVISUAL PDF] foto gagal dimuat:', url, e);
    return null;
  }
}

async function rvPdfPreload(urls, onProgress) {
  const out = new Map(), list = [...new Set(urls)];
  let done = 0, i = 0;
  const worker = async () => {
    while (i < list.length) {
      const u = list[i++];
      out.set(u, await rvPdfLoadImage(u));
      onProgress(++done, list.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

function rvWallPhotos(w) {
  if (w.photos) return Object.entries(w.photos).map(([slot, key]) => ({ slot, url: rvPhotoUrl(key) }));
  return w.img ? [{ slot: 'depan', url: w.img }] : [];   // data contoh (mode mockup)
}

async function rvExportPdf() {
  if (!window.jspdf) { toast('Library PDF belum ter-load, refresh halaman lalu coba lagi', 'error'); return; }
  const rows = rvFilteredRows();
  if (!rows.length) { toast('Tidak ada toko sesuai filter untuk di-export', 'error'); return; }

  const btn = document.getElementById('rv-pdf-btn');
  const label = btn.innerHTML;
  btn.disabled = true;
  try {
    const submitted = rows.filter(r => r.status !== 'BELUM');
    const urls = submitted.flatMap(r => r.walls.flatMap(w => rvWallPhotos(w).map(p => p.url)));
    const imgs = await rvPdfPreload(urls, (d, n) => { btn.textContent = `Memuat foto ${d}/${n}…`; });
    btn.textContent = 'Menyusun PDF…';
    await new Promise(r => setTimeout(r, 30));

    const doc = rvBuildPdf(rows, submitted, imgs);
    const f = document.getElementById('rv-filter');
    const scope = f.value === 'ALL' ? 'Semua' : f.options[f.selectedIndex].text.replace(/[^\w ]/g, '').trim().replace(/ /g, '-');
    doc.save(`ERA-REVISUAL_Wall-Branding_${scope}_${new Date().toISOString().slice(0, 10)}${rvMock ? '_MOCKUP' : ''}.pdf`);
    toast(`PDF dibuat — ${submitted.length} toko dengan foto`);
  } catch (e) {
    console.error(e);
    toast('Gagal membuat PDF: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = label;
  }
}

function rvBuildPdf(rows, submitted, imgs) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { W, H, M } = RV_PDF;
  const CW = W - 2 * M;
  const color = (c, kind = 'text') => kind === 'text' ? doc.setTextColor(...c) : kind === 'fill' ? doc.setFillColor(...c) : doc.setDrawColor(...c);
  const font = (size, style = 'normal', c = RV_PDF.ink) => { doc.setFont('helvetica', style); doc.setFontSize(size); color(c); };
  const fit = (text, maxW) => {
    let t = String(text || '');
    while (t.length > 1 && doc.getTextWidth(t) > maxW) t = t.slice(0, -2) + '…';
    return t;
  };
  const generated = new Date().toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function header(sub) {
    color(RV_PDF.red, 'fill'); doc.rect(0, 0, W, 22, 'F');
    font(8, 'bold', [255, 255, 255]); doc.text('ERA-REVISUAL  ·  REGION 5', M, 8);
    font(14, 'bold', [255, 255, 255]); doc.text('Revisual Wall Branding — Upgrade Terus', M, 16);
    if (sub) { font(8.5, 'normal', [255, 230, 230]); doc.text(sub, W - M, 16, { align: 'right' }); }
  }
  function footer() {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      font(7.5, 'normal', RV_PDF.muted);
      doc.text(`ERA-VIS · dibuat ${generated}${rvMock ? ' · DATA CONTOH (MOCKUP)' : ''}`, M, H - 6);
      doc.text(`Hal. ${i} / ${n}`, W - M, H - 6, { align: 'right' });
    }
  }

  // ── 1. Ringkasan ─────────────────────────────────────────────────
  header(`Deadline 27 Nov 2026`);
  let y = 32;
  const all = rvRows;
  const k = {
    total: all.length,
    sub: all.filter(r => r.status === 'SUBMIT').length,
    rev: all.filter(r => r.status === 'REVISI').length,
    bel: all.filter(r => r.status === 'BELUM').length,
    walls: all.reduce((a, r) => a + r.walls.length, 0),
  };
  const kpis = [
    ['Toko Region 5', k.total, RV_PDF.ink], ['Sudah Submit', k.sub, RV_PDF.green], ['Perlu Revisi', k.rev, RV_PDF.gold],
    ['Belum Submit', k.bel, RV_PDF.red], ['Total Wall', k.walls, RV_PDF.ink],
    ['Progress', (k.total ? Math.round(k.sub / k.total * 100) : 0) + '%', RV_PDF.green],
  ];
  const kw = (CW - 5 * 3) / 6;
  kpis.forEach(([lbl, val, c], i) => {
    const x = M + i * (kw + 3);
    color(RV_PDF.soft, 'fill'); color(RV_PDF.border, 'draw'); doc.roundedRect(x, y, kw, 20, 2, 2, 'FD');
    font(6.5, 'bold', RV_PDF.muted); doc.text(lbl.toUpperCase(), x + 3, y + 6);
    font(15, 'bold', c); doc.text(String(val), x + 3, y + 16);
  });
  y += 28;

  const f = document.getElementById('rv-filter');
  const q = document.getElementById('rv-search').value.trim();
  font(8.5, 'normal', RV_PDF.muted);
  doc.text(`Isi PDF: ${f.options[f.selectedIndex].text.replace(/[^\w ]/g, '').trim()}${q ? ` · pencarian "${q}"` : ''} — ${rows.length} toko, ${submitted.length} dengan foto.`, M, y);
  y += 8;

  // Tabel ringkas semua toko dalam PDF
  const cols = [
    ['No', 9], ['Plant', 16], ['Toko', 62], ['Pengirim / SL', 38], ['Wall', 24], ['Status', 37],
  ];
  const tableHead = () => {
    color(RV_PDF.ink, 'fill'); doc.rect(M, y, CW, 7, 'F');
    font(7.5, 'bold', [255, 255, 255]);
    let x = M + 2; cols.forEach(([h, w]) => { doc.text(h, x, y + 4.8); x += w; });
    y += 7;
  };
  tableHead();
  rows.forEach((r, i) => {
    if (y > H - 18) { doc.addPage(); header('Ringkasan (lanjutan)'); y = 30; tableHead(); }
    if (i % 2) { color(RV_PDF.soft, 'fill'); doc.rect(M, y, CW, 6.5, 'F'); }
    const st = RV_STATUS[r.status].label + (r.revisi ? ` — ${r.revisi}` : '');
    const wallTxt = r.walls.length ? `${r.walls.length} wall` : '—';
    const cells = [String(i + 1), r.code, r.name, r.sl || '', wallTxt, st];
    let x = M + 2;
    cells.forEach((t, ci) => {
      const c = ci === 5 ? (r.status === 'SUBMIT' ? RV_PDF.green : r.status === 'REVISI' ? RV_PDF.gold : RV_PDF.red) : RV_PDF.ink;
      font(7.5, ci === 1 || ci === 5 ? 'bold' : 'normal', c);
      doc.text(fit(t, cols[ci][1] - 2), x, y + 4.5);
      x += cols[ci][1];
    });
    y += 6.5;
  });

  // ── 2. Detail per toko ───────────────────────────────────────────
  const BLOCK_H = 118;               // tinggi 1 blok wall
  submitted.forEach(r => {
    doc.addPage();
    header(`${r.code} · ${r.ticket || ''}`);
    y = 30;
    font(13, 'bold'); doc.text(fit(r.name, CW), M, y); y += 6;
    font(8.5, 'normal', RV_PDF.muted);
    doc.text(fit(`Plant ${r.code}   ·   Pengirim: ${r.sl || '-'}${r.hp ? ' (' + r.hp + ')' : ''}   ·   Tiket ${r.ticket || '-'}   ·   ${r.time || ''}`, CW), M, y); y += 5;
    const sc = r.status === 'REVISI' ? RV_PDF.gold : RV_PDF.green;
    font(8.5, 'bold', sc); doc.text(fit(RV_STATUS[r.status].label + (r.revisi ? ` — ${r.revisi}` : ''), CW), M, y); y += 5;

    r.walls.forEach((w, wi) => {
      if (y + BLOCK_H > H - 12) { doc.addPage(); header(`${r.code} · lanjutan`); y = 30; }
      const top = y;
      color(RV_PDF.border, 'draw'); doc.roundedRect(M, top, CW, BLOCK_H - 4, 2, 2, 'S');
      font(10, 'bold'); doc.text(`Wall #${wi + 1}  —  ${w.type ? w.type.name : 'Jenis tidak diisi'}`, M + 4, top + 7);
      font(10, 'bold', RV_PDF.red); doc.text(`${w.w} × ${w.h} cm`, W - M - 4, top + 7, { align: 'right' });

      const photos = rvWallPhotos(w);
      const main = ['depan', 'meteran'].map(s => photos.find(p => p.slot === s)).filter(Boolean);
      const extra = photos.filter(p => !['depan', 'meteran'].includes(p.slot));
      const box = (p, x, yy, bw, bh) => {
        color(RV_PDF.soft, 'fill'); doc.rect(x, yy, bw, bh, 'F');
        const im = imgs.get(p.url);
        if (im) {
          const s = Math.min(bw / im.w, bh / im.h), dw = im.w * s, dh = im.h * s;
          doc.addImage(im.data, 'JPEG', x + (bw - dw) / 2, yy + (bh - dh) / 2, dw, dh, undefined, 'FAST');
        } else {
          font(7.5, 'normal', RV_PDF.muted); doc.text('foto tidak tersedia', x + bw / 2, yy + bh / 2, { align: 'center' });
        }
        font(7.5, 'bold', RV_PDF.ink); doc.text(RV_SLOT_LABEL[p.slot] || p.slot, x, yy + bh + 3.8);
      };
      const mw = (CW - 8 - 4) / 2, mh = extra.length ? 68 : 96;
      main.forEach((p, i) => box(p, M + 4 + i * (mw + 4), top + 11, mw, mh));
      if (extra.length) {
        const ew = (CW - 8 - 2 * 4) / 3;
        extra.slice(0, 3).forEach((p, i) => box(p, M + 4 + i * (ew + 4), top + 11 + mh + 7, ew, 24));
      }
      y = top + BLOCK_H;
    });
  });

  footer();
  return doc;
}
