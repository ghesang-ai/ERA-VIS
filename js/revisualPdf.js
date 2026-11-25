// ================================================================
// ERA-REVISUAL — Export PDF Wall Branding
// ----------------------------------------------------------------
// Dibangun langsung pakai jsPDF (teks vektor + foto JPEG), bukan
// screenshot html2canvas, supaya teks tajam & ukuran file wajar.
//
// Isi PDF (slide 16:9 landscape, 338.67 × 190.5 mm — sama dengan PowerPoint):
//   1. Ringkasan: KPI + daftar toko Belum Submit & Perlu Revisi
//   2. Satu slide per wall dari toko yang sudah submit: foto Depan &
//      Meteran besar di kiri, panel info + foto opsional di kanan
// Toko yang masuk = sesuai filter status & pencarian di halaman.
// ================================================================

const RV_PDF = {
  W: 338.67, H: 190.5, M: 12,
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
  const { W, H, M } = RV_PDF;
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape', compress: true });
  const CW = W - 2 * M;
  const color = (c, kind = 'text') => kind === 'text' ? doc.setTextColor(...c) : kind === 'fill' ? doc.setFillColor(...c) : doc.setDrawColor(...c);
  const font = (size, style = 'normal', c = RV_PDF.ink) => { doc.setFont('helvetica', style); doc.setFontSize(size); color(c); };
  const fit = (text, maxW) => {
    let t = String(text || '');
    while (t.length > 1 && doc.getTextWidth(t) > maxW) t = t.slice(0, -2) + '…';
    return t;
  };
  const statusColor = st => st === 'SUBMIT' ? RV_PDF.green : st === 'REVISI' ? RV_PDF.gold : RV_PDF.red;
  const generated = new Date().toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function header(sub) {
    color(RV_PDF.red, 'fill'); doc.rect(0, 0, W, 20, 'F');
    font(8, 'bold', [255, 255, 255]); doc.text('ERA-REVISUAL  ·  REGION 5', M, 7.5);
    font(15, 'bold', [255, 255, 255]); doc.text('Revisual Wall Branding — Upgrade Terus', M, 15.5);
    if (sub) { font(9, 'normal', [255, 230, 230]); doc.text(sub, W - M, 15.5, { align: 'right' }); }
  }
  function footer() {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      font(7.5, 'normal', RV_PDF.muted);
      doc.text(`ERA-VIS · dibuat ${generated}${rvMock ? ' · DATA CONTOH (MOCKUP)' : ''}`, M, H - 5);
      doc.text(`Hal. ${i} / ${n}`, W - M, H - 5, { align: 'right' });
    }
  }

  // ── 1. Ringkasan: KPI + tabel 2 kolom ────────────────────────────
  header('Deadline 27 Nov 2026');
  let y = 27;
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
  const kw = (CW - 5 * 4) / 6;
  kpis.forEach(([lbl, val, c], i) => {
    const x = M + i * (kw + 4);
    color(RV_PDF.soft, 'fill'); color(RV_PDF.border, 'draw'); doc.roundedRect(x, y, kw, 19, 2, 2, 'FD');
    font(7, 'bold', RV_PDF.muted); doc.text(lbl.toUpperCase(), x + 4, y + 6);
    font(17, 'bold', c); doc.text(String(val), x + 4, y + 15.5);
  });
  y += 25;

  const f = document.getElementById('rv-filter');
  const q = document.getElementById('rv-search').value.trim();
  font(8.5, 'normal', RV_PDF.muted);
  doc.text(`Isi PDF: ${f.options[f.selectedIndex].text.replace(/[^\w ]/g, '').trim()}${q ? ` · pencarian "${q}"` : ''} — ${rows.length} toko, ${submitted.length} dengan foto.`, M, y);
  y += 4;

  // Tabel dibagi 2 kolom berdampingan supaya muat banyak toko per slide
  const GAP = 6, TW = (CW - GAP) / 2, RH = 5.6;
  const cols = [['No', 8], ['Plant', 13], ['Toko', 62], ['Pengirim / SL', 36], ['Status', TW - 119]];
  const drawHead = (x0, yy) => {
    color(RV_PDF.ink, 'fill'); doc.rect(x0, yy, TW, 6.5, 'F');
    font(7.5, 'bold', [255, 255, 255]);
    let x = x0 + 2; cols.forEach(([h, w]) => { doc.text(h, x, yy + 4.4); x += w; });
  };
  let idx = 0, first = true;
  while (idx < rows.length) {
    if (!first) { doc.addPage(); header('Ringkasan (lanjutan)'); y = 26; }
    const top = y, perCol = Math.floor((H - 12 - top - 6.5) / RH);
    for (let c = 0; c < 2 && idx < rows.length; c++) {
      const x0 = M + c * (TW + GAP);
      drawHead(x0, top);
      let yy = top + 6.5;
      for (let n = 0; n < perCol && idx < rows.length; n++, idx++) {
        const r = rows[idx];
        if (n % 2) { color(RV_PDF.soft, 'fill'); doc.rect(x0, yy, TW, RH, 'F'); }
        const st = r.status === 'BELUM' ? 'Belum Submit'
          : `${RV_STATUS[r.status].label} · ${r.walls.length} wall${r.revisi ? ' — ' + r.revisi : ''}`;
        const cells = [String(idx + 1), r.code, r.name, r.sl || '', st];
        let x = x0 + 2;
        cells.forEach((t, ci) => {
          font(7.2, ci === 1 || ci === 4 ? 'bold' : 'normal', ci === 4 ? statusColor(r.status) : RV_PDF.ink);
          doc.text(fit(t, cols[ci][1] - 2), x, yy + 3.9);
          x += cols[ci][1];
        });
        yy += RH;
      }
    }
    first = false;
  }

  // ── 2. Satu slide per wall ──────────────────────────────────────
  const imgBox = (url, label, x, yy, bw, bh) => {
    color(RV_PDF.soft, 'fill'); doc.rect(x, yy, bw, bh, 'F');
    const im = url && imgs.get(url);
    if (im) {
      const s = Math.min(bw / im.w, bh / im.h), dw = im.w * s, dh = im.h * s;
      doc.addImage(im.data, 'JPEG', x + (bw - dw) / 2, yy + (bh - dh) / 2, dw, dh, undefined, 'FAST');
    } else {
      font(8, 'normal', RV_PDF.muted); doc.text(url ? 'foto tidak tersedia' : '—', x + bw / 2, yy + bh / 2, { align: 'center' });
    }
    font(8, 'bold', RV_PDF.ink); doc.text(label, x, yy + bh + 4);
  };

  submitted.forEach(r => {
    r.walls.forEach((w, wi) => {
      doc.addPage();
      header(`${r.code} · ${r.ticket || ''}`);
      // judul toko
      font(14, 'bold'); doc.text(fit(r.name, CW - 70), M, 29);
      font(8.5, 'normal', RV_PDF.muted);
      doc.text(fit(`Plant ${r.code}   ·   Pengirim: ${r.sl || '-'}${r.hp ? ' (' + r.hp + ')' : ''}   ·   Tiket ${r.ticket || '-'}   ·   ${r.time || ''}`, CW - 70), M, 35);
      font(9, 'bold', statusColor(r.status));
      doc.text(fit(RV_STATUS[r.status].label + (r.revisi ? ` — ${r.revisi}` : ''), 68), W - M, 29, { align: 'right' });
      font(8.5, 'normal', RV_PDF.muted);
      doc.text(`Wall ${wi + 1} dari ${r.walls.length}`, W - M, 35, { align: 'right' });

      const photos = rvWallPhotos(w);
      const get = slot => photos.find(p => p.slot === slot);
      const top = 41, bottom = H - 13, ph = bottom - top - 5;
      const leftW = 222, pw = (leftW - 5) / 2;
      imgBox(get('depan')?.url, 'Depan', M, top, pw, ph);
      imgBox(get('meteran')?.url, 'Meteran', M + pw + 5, top, pw, ph);

      // panel kanan
      const px = M + leftW + 6, pwid = W - M - px;
      color(RV_PDF.border, 'draw'); color([255, 255, 255], 'fill'); doc.roundedRect(px, top, pwid, ph + 5, 2, 2, 'FD');
      let ry = top + 8;
      font(8, 'bold', RV_PDF.muted); doc.text(`WALL #${wi + 1}`, px + 5, ry); ry += 7;
      font(14, 'bold'); doc.text(fit(w.type ? w.type.name : 'Jenis tidak diisi', pwid - 10), px + 5, ry); ry += 12;
      font(7.5, 'bold', RV_PDF.muted); doc.text('UKURAN (L × T)', px + 5, ry); ry += 9;
      font(22, 'bold', RV_PDF.red); doc.text(`${w.w} × ${w.h} cm`, px + 5, ry); ry += 12;

      const extra = ['kiri', 'kanan', 'sekitar'].map(s => get(s)).filter(Boolean);
      font(7.5, 'bold', RV_PDF.muted); doc.text('FOTO TAMBAHAN', px + 5, ry); ry += 3;
      if (extra.length) {
        const tw = (pwid - 10 - 2 * 3) / 3, th = Math.min(top + ph - ry - 4, tw * 1.35);
        extra.forEach((p, i) => imgBox(p.url, RV_SLOT_LABEL[p.slot], px + 5 + i * (tw + 3), ry, tw, th));
      } else {
        font(8.5, 'normal', RV_PDF.muted); doc.text('Tidak ada', px + 5, ry + 5);
      }
    });
  });

  footer();
  return doc;
}
