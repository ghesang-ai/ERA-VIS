/* ================================================================
   ERA-VIS AI v2.0 — fbeImport.js
   FBE (Festival Belanja Erafone): parse 5 file Excel alokasi master
   dan sheet respons Google Form konfirmasi menjadi bentuk long-format
   yang sama (1 baris = 1 toko + 1 materi), lalu join keduanya.
   Hanya logika murni — tanpa akses DOM, jadi bisa di-test dari Node biasa.
   Depends on: config.js (FBE_MATERIALS), api.js (extractPlantCode)
   ================================================================ */

'use strict';

function _fbeNorm(h) {
  return String(h == null ? '' : h).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function _fbeFindHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = (rows[i] || []).map(_fbeNorm).join(' ');
    if (joined.includes('plant code')) return i;
  }
  return 0;
}

function _fbeColMap(headerRow) {
  const map = {};
  (headerRow || []).forEach((h, idx) => {
    const k = _fbeNorm(h);
    if (k && map[k] === undefined) map[k] = idx;
  });
  return map;
}

// Exact-match pass dulu, baru fallback substring (pass kedua) kalau tidak
// ada exact match. Ini aman untuk 5 file FBE asli karena headernya semua
// kata tunggal ("Resi", "Status", dst) sehingga selalu kena exact-match
// di pass pertama. TAPI kalau ada pemanggil baru dengan header multi-kata
// (mis. "Status Resi" & "No Resi" di sheet yang sama), fallback substring
// di sini bisa nyasar — 'resi' dan 'status' bisa sama-sama match ke kolom
// yang sama karena substring-nya pakai OR, bukan match paling spesifik.
// Pemanggil semacam itu (lihat parseFbeConfirmation di Task 3) sebaiknya
// TIDAK memakai _fbeFindCol, melainkan AND manual sendiri, mis.
// `header.includes('status') && header.includes(phrase)`.
function _fbeFindCol(colMap, ...names) {
  for (const n of names) if (colMap[n] !== undefined) return colMap[n];
  for (const n of names) {
    const key = Object.keys(colMap).find(k => k.includes(n));
    if (key !== undefined) return colMap[key];
  }
  return -1;
}

// ── FILE MATERI SEDERHANA ──────────────────────────────────────────
// Easel & Poster, Hanging Gate, Hanging Mobile Desain 1/2.
// Setiap baris sumber -> maksimal 1 baris output long-format. Kolom
// beda-beda tiap file (Hanging Gate sama sekali tidak punya kolom
// Status/qty) jadi setiap kolom dicari lewat keyword header, bukan
// index tetap.
function parseFbeMaterialFile(rows, jenisMateri) {
  const headerIdx = _fbeFindHeaderRow(rows);
  const colMap    = _fbeColMap(rows[headerIdx]);
  const iCode   = _fbeFindCol(colMap, 'plant code');
  const iDesc   = _fbeFindCol(colMap, 'plant desc');
  const iRegion = _fbeFindCol(colMap, 'region');
  const iKota   = _fbeFindCol(colMap, 'kota');
  const iResi   = _fbeFindCol(colMap, 'resi');
  const iStatus = _fbeFindCol(colMap, 'status');
  const iQty    = _fbeFindCol(colMap, 'qty');
  const iPic    = _fbeFindCol(colMap, 'pic');
  const iKontak = _fbeFindCol(colMap, 'kontak');

  if (iCode < 0) return [];

  return rows.slice(headerIdx + 1)
    .map(r => {
      const code = extractPlantCode(r[iCode]);
      if (!code) return null;
      return {
        plantCode : code,
        namaToko  : iDesc   >= 0 ? String(r[iDesc]   || '').trim() : '',
        region    : iRegion >= 0 ? String(r[iRegion] || '').trim() : '',
        kota      : iKota   >= 0 ? String(r[iKota]   || '').trim() : '',
        jenisMateri,
        subDesain : '',
        qty       : iQty    >= 0 ? (parseInt(r[iQty], 10) || 1) : 1,
        noResi    : iResi   >= 0 ? String(r[iResi]   || '').trim() : '',
        statusResi: iStatus >= 0 ? String(r[iStatus] || '').trim() : '',
        pic       : iPic    >= 0 ? String(r[iPic]    || '').trim() : '',
        kontak    : iKontak >= 0 ? String(r[iKontak] || '').trim() : '',
      };
    })
    .filter(Boolean);
}

// ── STICKER KACA + FRAME HANGING/STANDING LFD (file gabungan) ─────
// 1 baris sumber bisa pecah jadi BEBERAPA baris long-format: 1 baris
// per baris sub-desain Sticker Kaca (masing-masing punya qty sendiri,
// misal "Desain 1 (LxT) 80x55cm : 1"), ditambah 1 baris masing-masing
// untuk Frame Hanging LFD / Frame Standing LFD kalau toko itu punya
// qty di kolom tersebut.
function parseFbeStickerKacaFile(rows) {
  const headerIdx = _fbeFindHeaderRow(rows);
  const colMap    = _fbeColMap(rows[headerIdx]);
  const iCode    = _fbeFindCol(colMap, 'plant code');
  const iDesc    = _fbeFindCol(colMap, 'plant desc');
  const iRegion  = _fbeFindCol(colMap, 'region');
  const iKota    = _fbeFindCol(colMap, 'kota');
  const iResi    = _fbeFindCol(colMap, 'resi');
  const iStatus  = _fbeFindCol(colMap, 'status');
  const iSticker = _fbeFindCol(colMap, 'sticker kaca');
  const iFrameH  = _fbeFindCol(colMap, 'frame hanging');
  const iFrameS  = _fbeFindCol(colMap, 'frame standing');
  const iPic     = _fbeFindCol(colMap, 'pic');
  const iKontak  = _fbeFindCol(colMap, 'kontak');

  if (iCode < 0) return [];

  const out = [];
  rows.slice(headerIdx + 1).forEach(r => {
    const code = extractPlantCode(r[iCode]);
    if (!code) return;
    const base = {
      plantCode : code,
      namaToko  : iDesc   >= 0 ? String(r[iDesc]   || '').trim() : '',
      region    : iRegion >= 0 ? String(r[iRegion] || '').trim() : '',
      kota      : iKota   >= 0 ? String(r[iKota]   || '').trim() : '',
      noResi    : iResi   >= 0 ? String(r[iResi]   || '').trim() : '',
      statusResi: iStatus >= 0 ? String(r[iStatus] || '').trim() : '',
      pic       : iPic    >= 0 ? String(r[iPic]    || '').trim() : '',
      kontak    : iKontak >= 0 ? String(r[iKontak] || '').trim() : '',
    };

    const stickerText = iSticker >= 0 ? String(r[iSticker] || '').trim() : '';
    if (stickerText) {
      stickerText.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
        const m = line.match(/^(.*?):\s*(\d+)\s*$/);
        out.push({
          ...base,
          jenisMateri: 'STICKER_KACA',
          subDesain  : m ? m[1].trim() : line,
          qty        : m ? parseInt(m[2], 10) : 1,
        });
      });
    }

    const frameHQty = iFrameH >= 0 ? parseInt(r[iFrameH], 10) : NaN;
    if (frameHQty > 0) out.push({ ...base, jenisMateri: 'FRAME_HANGING_LFD', subDesain: '', qty: frameHQty });

    const frameSQty = iFrameS >= 0 ? parseInt(r[iFrameS], 10) : NaN;
    if (frameSQty > 0) out.push({ ...base, jenisMateri: 'FRAME_STANDING_LFD', subDesain: '', qty: frameSQty });
  });
  return out;
}

// ── SHEET KONFIRMASI (respons Google Form) ─────────────────────────
// Form-nya berbentuk wide (1 submission = 1 toko, 1 pasang kolom
// Status+Foto per materi — Store Leader hanya isi yang berlaku). Ini
// men-transpose-nya jadi long format yang sama seperti baris master:
// 1 baris output per (toko, materi) yang memang punya link foto.
function parseFbeConfirmation(rows) {
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map(_fbeNorm);
  const iTime = header.findIndex(h => h.includes('timestamp'));
  const iCode = header.findIndex(h => h.includes('kode toko') || h.includes('kode store'));
  if (iCode < 0) return [];

  const materialCols = {};
  Object.keys(FBE_MATERIALS).forEach(key => {
    const phrase = FBE_MATERIALS[key].formLabel;
    materialCols[key] = {
      iFoto  : header.findIndex(h => h.includes('foto')   && h.includes(phrase)),
      iStatus: header.findIndex(h => h.includes('status') && h.includes(phrase)),
    };
  });

  const out = [];
  rows.slice(1).forEach(r => {
    const code = extractPlantCode(r[iCode]);
    if (!code) return;
    const timestamp = iTime >= 0 ? String(r[iTime] || '').trim() : '';

    Object.keys(materialCols).forEach(key => {
      const { iFoto, iStatus } = materialCols[key];
      const linkFoto = iFoto >= 0 ? String(r[iFoto] || '').trim() : '';
      if (!linkFoto) return; // tidak ada foto ter-upload = belum terkonfirmasi untuk materi ini
      const statusText = iStatus >= 0 ? String(r[iStatus] || '').trim().toLowerCase() : '';
      out.push({
        plantCode  : code,
        jenisMateri: key,
        status     : statusText.includes('belum') ? 'Belum Terpasang' : 'Terpasang',
        tanggal    : timestamp,
        linkFoto,
      });
    });
  });
  return out;
}

// ── JOIN: alokasi master ⋈ konfirmasi → status per toko ────────────
// Kelompokkan baris master long-format berdasarkan (toko, kategori
// materi) — BUKAN per baris sub-desain, lihat catatan desain di atas —
// lalu tandai tiap materi terkonfirmasi kalau ada konfirmasi Terpasang
// yang cocok. Denominator scorePct adalah jumlah kategori materi.
function computeFbeStoreStatus(masterRows, confirmationRows) {
  const byStore = {};
  masterRows.forEach(m => {
    if (!byStore[m.plantCode]) {
      // Asumsi: namaToko/region/kota konsisten untuk plantCode yang sama
      // di semua baris master (biasanya dari file berbeda) — kalau tidak,
      // nilai dari baris pertama yang ditemukan yang dipakai secara diam-diam.
      byStore[m.plantCode] = {
        plantCode: m.plantCode, namaToko: m.namaToko, region: m.region, kota: m.kota,
        materialsByType: {},
      };
    }
    const store = byStore[m.plantCode];
    if (!store.materialsByType[m.jenisMateri]) {
      store.materialsByType[m.jenisMateri] = {
        jenisMateri: m.jenisMateri,
        label      : (FBE_MATERIALS[m.jenisMateri] || {}).label || m.jenisMateri,
        details    : [],
        confirmed  : false,
        tanggal    : '',
        linkFoto   : '',
      };
    }
    store.materialsByType[m.jenisMateri].details.push({
      subDesain: m.subDesain || '', qty: m.qty || 1, noResi: m.noResi || '',
    });
  });

  const confirmByKey = {};
  confirmationRows.forEach(c => { confirmByKey[c.plantCode + '|' + c.jenisMateri] = c; });

  const result = Object.values(byStore).map(store => {
    const materials = Object.values(store.materialsByType).map(mat => {
      const c = confirmByKey[store.plantCode + '|' + mat.jenisMateri];
      if (c && c.status === 'Terpasang') {
        mat.confirmed = true;
        mat.tanggal   = c.tanggal;
        mat.linkFoto  = c.linkFoto;
      }
      return mat;
    });
    const totalCount = materials.length;
    const doneCount  = materials.filter(m => m.confirmed).length;
    return {
      plantCode: store.plantCode, namaToko: store.namaToko, region: store.region, kota: store.kota,
      materials, totalCount, doneCount,
      scorePct: totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0,
    };
  });

  return result.sort((a, b) => a.plantCode.localeCompare(b.plantCode));
}

if (typeof module !== 'undefined') {
  module.exports = { parseFbeMaterialFile, parseFbeStickerKacaFile, parseFbeConfirmation, computeFbeStoreStatus };
}
