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

if (typeof module !== 'undefined') {
  module.exports = { parseFbeMaterialFile, parseFbeStickerKacaFile };
}
