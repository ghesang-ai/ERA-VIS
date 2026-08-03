/* ================================================================
   ERA-VIS AI v2.0 — api.js
   Semua fungsi fetch & parse data: Google Sheets, Excel (SheetJS)
   Depends on: config.js
   ================================================================ */

'use strict';

// ── CSV PARSER ─────────────────────────────────────────────────────
/**
 * Parse raw CSV text → array of string arrays.
 * Handles quoted fields dan embedded newlines/commas.
 */
function parseCSV(text) {
  const lines = [];
  let cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === '\n' && !inQ) {
      lines.push(cur); cur = '';
    } else if (c === '\r' && !inQ) {
      // skip
    } else {
      cur += c;
    }
  }
  if (cur) lines.push(cur);

  return lines
    .filter(l => l.trim())
    .map(line => {
      const cells = []; let cell = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (q && line[i + 1] === '"') { cell += '"'; i++; }
          else q = !q;
        } else if (c === ',' && !q) {
          cells.push(cell); cell = '';
        } else {
          cell += c;
        }
      }
      cells.push(cell);
      return cells;
    });
}


// ── GOOGLE SHEETS FETCH ────────────────────────────────────────────
/**
 * Fetch satu sheet sebagai CSV rows[][].
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @returns {Promise<string[][]>}
 */
async function fetchSheet(spreadsheetId, sheetName) {
  const url = sheetCsvUrl(spreadsheetId, sheetName);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} saat fetch sheet "${sheetName}"`);
  return parseCSV(await res.text());
}


// ── PARSE MASTER GHS ───────────────────────────────────────────────
/**
 * Parse rows[][] dari sheet MASTER GHS menjadi array store objects.
 * Cari header row yang mengandung "plant code", lalu ambil data di bawahnya.
 */
function parseMaster(rows, headerRow) {
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, (headerRow || DEFAULT_HEADER_ROW) + 2); i++) {
    if (rows[i].join(' ').toLowerCase().includes('plant code')) {
      start = i + 1;
      break;
    }
  }
  if (!start) start = headerRow || DEFAULT_HEADER_ROW;

  return rows
    .slice(start)
    .filter(r => r[COL_MASTER.PLANT_CODE] && r[COL_MASTER.PLANT_CODE].trim())
    .filter(r => {
      const s = (r[COL_MASTER.STATUS] || '').trim().toUpperCase();
      return s === STATUS.DONE || s === STATUS.NOT_DONE;
    })
    .map(r => ({
      no          : r[COL_MASTER.NO]          || '',
      region      : (r[COL_MASTER.REGION]      || '').trim(),
      plantCode   : (r[COL_MASTER.PLANT_CODE]  || '').trim(),
      plantDesc   : (r[COL_MASTER.PLANT_DESC]  || '').trim(),
      city        : (r[COL_MASTER.CITY]        || '').trim().toUpperCase(),
      nomorResi   : (r[COL_MASTER.NOMOR_RESI]  || '').trim(),
      dokumentasi : (r[COL_MASTER.DOKUMENTASI] || '').trim(),
      status      : (r[COL_MASTER.STATUS]      || '').trim().toUpperCase(),
      penerima    : (r[COL_MASTER.PENERIMA]    || '').trim(),
    }));
}


// ── NORMALIZE KODE STORE (fuzzy matching) ─────────────────────────
/**
 * Ekstrak kode toko murni dari string yang mungkin mengandung teks tambahan.
 * Contoh: "S044 - SES 2 ITC ROXY MAS" → "S044"
 *         "S044-SES ROXY" → "S044"
 *         "S044" → "S044"
 */
function normalizeKodeStore(raw) {
  const s = (raw || '').trim().toUpperCase();
  // Prioritas: ambil pola huruf + angka di awal string (misal S044, S015, C001)
  const m = s.match(/^([A-Z]\d+)/);
  if (m) return m[1];
  // Fallback: ambil bagian sebelum tanda " - " atau " – "
  const parts = s.split(/\s*[-–]\s*/);
  return parts[0].trim() || s;
}


// ── VALIDASI KODE TOKO ─────────────────────────────────────────────
/**
 * Pola kode toko (plant/SAP code): 1–2 huruf + 2–4 angka, opsional 1 huruf.
 * Valid  : E879, M163, F022, S044
 * Invalid: "NAMA STORE", "ALAMAT", "QTY", "TOTAL", "E052 32-JKT" (kode account vendor)
 */
const RE_PLANT_CODE = /^[A-Z]{1,2}\d{2,4}[A-Z]?$/;

/**
 * Ambil kode toko yang sah dari satu sel Excel.
 * Return '' kalau sel itu bukan kode toko — dipakai untuk membuang baris
 * non-toko, mis. label form vertikal di sheet "TAG ALAMAT"
 * ("KODE STORE : M048" → kolom label ikut terbaca sebagai kode).
 */
function extractPlantCode(raw) {
  const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().toUpperCase();
  if (!s) return '';
  if (RE_PLANT_CODE.test(s)) return s;
  // "S044 - SES 2 ITC ROXY MAS" → S044 (kode + pemisah + nama toko)
  const m = s.match(/^([A-Z]{1,2}\d{2,4}[A-Z]?)\s*[-–—/]\s*\S/);
  return m ? m[1] : '';
}

/**
 * Buang baris yang bukan data toko + duplikat kode dari array store objects.
 * Selain dipakai saat parsing Excel, ini juga membersihkan data lama yang
 * terlanjur tersimpan di localStorage/cloud tanpa perlu upload ulang.
 */
function sanitizeStores(stores) {
  if (!Array.isArray(stores)) return [];
  const seen = new Set();
  const out  = [];
  stores.forEach(s => {
    if (!s) return;
    const code = extractPlantCode(s.plantCode);
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push(s.plantCode === code ? s : { ...s, plantCode: code });
  });
  return out;
}


// ── PARSE IMPORTING (form responses) ──────────────────────────────
/**
 * Parse rows[][] dari sheet IMPORTING menjadi array submission objects.
 * Auto-detect kolom dari header row — support format Erafone & iBox.
 * iBox headers: Timestamp | STORE APPLE ID | NAMA STORE | PROGRAM | KODE BU | REGION | ... | DOKUMENTASI EASEL
 */
function parseImport(rows) {
  if (rows.length < 2) return [];

  // Deteksi apakah row[0] adalah header
  const firstLower = rows[0].map(c => String(c || '').trim().toLowerCase());
  const hasHeader  = firstLower.some(h =>
    h.includes('timestamp') || h.includes('kode') || h.includes('store apple')
  );

  let dataRows = rows;
  let tIdx = COL_IMPORT.TIMESTAMP;
  let kIdx = COL_IMPORT.KODE_STORE;
  let nIdx = COL_IMPORT.NAMA_STORE;
  let rIdx = COL_IMPORT.REGION;
  let dIdx = COL_IMPORT.DOKUMENTASI;

  if (hasHeader) {
    dataRows = rows.slice(1);
    const findCol = (...keywords) => {
      for (const kw of keywords) {
        const i = firstLower.findIndex(h => h.includes(kw));
        if (i >= 0) return i;
      }
      return -1;
    };
    const t = findCol('timestamp', 'waktu');
    const k = findCol('kode bu', 'kode store', 'kode_store', 'kode toko', 'plant code', 'store apple', 'kode');
    const n = findCol('nama store', 'nama toko', 'store name');
    const r = findCol('region');
    const d = findCol('dokumentasi easel', 'dokumentasi', 'store front', 'close up', 'foto');
    if (t >= 0) tIdx = t;
    if (k >= 0) kIdx = k;
    if (n >= 0) nIdx = n;
    if (r >= 0) rIdx = r;
    if (d >= 0) dIdx = d;
  }

  return dataRows.filter(r => r[tIdx]).map(r => ({
    timestamp   : r[tIdx] || '',
    kodeStore   : normalizeKodeStore(r[kIdx]),
    namaStore   : (r[nIdx] || '').trim(),
    region      : (r[rIdx] || '').trim(),
    dokumentasi : (r[dIdx] || '').trim(),
  }));
}


// ── ENSURE LOCAL STORES (cross-device) ─────────────────────────────
/**
 * Pastikan campaign mode Excel punya localStores di device ini.
 *
 * Data toko hasil upload Excel disimpan di localStorage device yang upload,
 * jadi saat dibuka di HP/browser lain array-nya kosong. Fungsi ini menarik
 * ulang dari Netlify Blobs (/store-sync) dan menyimpannya ke localStorage.
 *
 * Return { ok, stores, reason }:
 *   ok:true                 → stores siap dipakai
 *   reason 'empty'          → cloud tidak punya data (memang belum pernah upload)
 *   reason 'offline'|'error'→ gagal hubungi/baca cloud (bukan salah user)
 */
async function ensureLocalStores(cid) {
  const c = campaigns.find(x => x.id === cid);
  if (!c) return { ok: false, stores: [], reason: 'not-found' };
  if (c.localStores && c.localStores.length) {
    return { ok: true, stores: sanitizeStores(c.localStores), reason: 'local' };
  }

  let res;
  try {
    res = await fetch(`/.netlify/functions/store-sync?id=${encodeURIComponent(cid)}`, { cache: 'no-store' });
  } catch (e) {
    console.warn('[ERA-VIS] store-sync tidak bisa dihubungi:', e.message);
    return { ok: false, stores: [], reason: 'offline' };
  }

  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try { detail = (await res.json()).error || detail; } catch (_) {}
    console.warn('[ERA-VIS] store-sync error:', detail);
    return { ok: false, stores: [], reason: 'error', detail };
  }

  let pulled;
  try { pulled = sanitizeStores(await res.json()); } catch (_) { return { ok: false, stores: [], reason: 'error' }; }
  if (!pulled.length) {
    return { ok: false, stores: [], reason: 'empty' };
  }

  const idx = campaigns.findIndex(x => x.id === cid);
  if (idx >= 0) {
    campaigns[idx] = { ...campaigns[idx], localStores: pulled };
    try { save(SK.campaigns, campaigns); }
    catch (e) { console.warn('[ERA-VIS] localStorage penuh, localStores tidak dicache:', e.message); }
  }
  return { ok: true, stores: pulled, reason: 'cloud' };
}

/**
 * Toast pesan error yang sesuai penyebab dari ensureLocalStores().
 */
function toastLocalStoresError(result) {
  if (result.reason === 'empty') {
    toast('Data toko belum ada — upload Excel di edit campaign', 'error');
  } else if (result.reason === 'offline') {
    toast('Tidak ada koneksi ke server — data toko gagal diambil', 'error');
  } else {
    toast('Gagal ambil data toko dari cloud' + (result.detail ? ': ' + result.detail : ''), 'error');
  }
}


// ── MERGE STATUS FROM IMPORT ───────────────────────────────────────
/**
 * Gabungkan daftar toko (localStores dari Excel) dengan
 * data submission (IMPORTING sheet) untuk menentukan status DONE/NOT DONE.
 */
function mergeStatusFromImport(stores, importData) {
  stores = sanitizeStores(stores); // buang baris non-toko dari data lama
  const submitted = {};
  importData.forEach(r => {
    const k = normalizeKodeStore(r.kodeStore);
    if (k) submitted[k] = { dokumentasi: r.dokumentasi || '', timestamp: r.timestamp || '' };
  });
  return stores.map(s => {
    const k = normalizeKodeStore(s.plantCode);
    if (submitted[k]) return { ...s, status: STATUS.DONE, dokumentasi: submitted[k].dokumentasi };
    return { ...s, status: STATUS.NOT_DONE, dokumentasi: '' };
  });
}


// ── PARSE EXCEL STORES ─────────────────────────────────────────────
/**
 * Parse rows[][] dari satu sheet Excel (via SheetJS) menjadi array store objects.
 * Mencari header row yang mengandung kata "plant", "kode", atau "code".
 */
const STORE_HEADER_KEYWORDS = [
  'plant code', 'plant desc', 'sap code', 'store name', 'nama toko', 'nama store',
  'kode toko', 'kode store', 'region', 'kota', 'city', 'nomor resi', 'no resi',
  'resi', 'qty', 'store leader', 'store address', 'alamat',
];

// Kolom yang namanya mirip kode toko tapi bukan (kode account vendor, dll)
const NON_STORE_CODE_HEADERS = ['kode account', 'account', 'kode barang', 'kode vendor'];

function parseExcelStores(rows) {
  const norm = h => String(h == null ? '' : h)
    .replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  const buildColMap = row => {
    const map = {};
    row.forEach((h, idx) => {
      const k = norm(h);
      if (k && map[k] === undefined) map[k] = idx;
    });
    return map;
  };

  let headerIdx = -1;
  let colMap    = {};

  // 1) Header "beneran": minimal 2 sel cocok nama kolom tabel toko.
  //    Syarat 2 sel penting agar sheet form vertikal (mis. "TAG ALAMAT" yang
  //    berisi "KODE STORE : M048" per baris) tidak dikira tabel toko.
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map(norm);
    const hits  = cells.filter(c => c && STORE_HEADER_KEYWORDS.some(k => c.includes(k))).length;
    if (hits >= 2) { headerIdx = i; colMap = buildColMap(rows[i]); break; }
  }

  // 2) Fallback longgar (format lama): cukup satu kata kunci kode.
  //    Baris sampahnya tetap tersaring oleh extractPlantCode() di bawah.
  if (headerIdx < 0) {
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const joined = (rows[i] || []).map(norm).join(' ');
      if (joined.includes('plant') || joined.includes('kode') || joined.includes('code') ||
          joined.includes('sap') || joined.includes('store name') || joined.includes('nama toko')) {
        headerIdx = i; colMap = buildColMap(rows[i]); break;
      }
    }
  }

  if (headerIdx < 0) return [];

  const findCol = (...names) => {
    for (const n of names) {
      if (colMap[n] !== undefined) return colMap[n];
    }
    // Partial/substring fallback
    for (const n of names) {
      const key = Object.keys(colMap).find(k => k.includes(n) && !NON_STORE_CODE_HEADERS.includes(k));
      if (key !== undefined) return colMap[key];
    }
    return -1;
  };

  // 'site code' / 'site description' = format export SAP (kolom "Company Code"
  // ikut ada di sheet itu, jadi harus dicoba sebelum kata kunci generik 'code')
  const iCode   = findCol('plant code', 'sap code', 'site code', 'kode toko', 'kode store', 'kode', 'sap', 'code');
  const iDesc   = findCol('plant desc', 'store name', 'nama toko', 'site description', 'plant description', 'desc');
  const iRegion = findCol('region');
  const iCity   = findCol('kota', 'city', 'kab/kota');
  const iNo     = findCol('no.', 'no');
  const iResi   = findCol('nomor resi', 'no resi', 'resi', 'channel/resi', 'channel');

  return rows
    .slice(headerIdx + 1)
    .map(r => {
      // Hanya baris dengan kode toko valid yang dianggap data toko —
      // baris label form, subtotal, atau catatan otomatis terbuang.
      const code = iCode >= 0 ? extractPlantCode(r[iCode]) : '';
      if (!code) return null;
      return {
        no          : iNo     >= 0 ? r[iNo]     || '' : '',
        plantCode   : code,
        plantDesc   : iDesc   >= 0 ? String(r[iDesc]   || '').trim() : '',
        region      : iRegion >= 0 ? String(r[iRegion] || '').trim() : '',
        city        : iCity   >= 0 ? String(r[iCity]   || '').trim().toUpperCase() : '',
        nomorResi   : iResi   >= 0 ? String(r[iResi]   || '').trim() : '',
        dokumentasi : '',
        penerima    : '',
      };
    })
    .filter(Boolean);
}


// ── PARSE CLOSED STORES EXCEL ─────────────────────────────────────
/**
 * Parse workbook SheetJS untuk daftar toko tutup.
 * Baca semua sheet, cari kolom Plant/SAP Code, kembalikan array kode yang dinormalisasi.
 */
function parseClosedStoresExcel(wb) {
  const codes = new Set();
  wb.SheetNames.forEach(sn => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    if (!rows.length) return;

    let hi = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const r = rows[i].map(c => String(c || '').toLowerCase());
      if (r.some(c => c.includes('plant') || c.includes('sap') || c.includes('kode'))) {
        hi = i; break;
      }
    }

    const hdr  = rows[hi].map(c => String(c || '').trim().toLowerCase());
    const iCol = hdr.findIndex(h => h.includes('plant') || h.includes('sap') || h === 'kode');
    const col  = iCol >= 0 ? iCol : 2; // fallback kolom C

    rows.slice(hi + 1).forEach(r => {
      const code = normalizeKodeStore(String(r[col] || ''));
      if (code) codes.add(code);
    });
  });
  return [...codes];
}


// ── PARSE STORE LEADER EXCEL ───────────────────────────────────────
/**
 * Parse workbook SheetJS untuk Store Leader database.
 * Returns { [PLANT_CODE_UPPER]: { name, phone, storeName, updatedAt } }
 *
 * Fix phone: cari kolom "contact" yang BUKAN "contact store" (landline).
 * Fix nomor: tambah "0" di depan jika angka tanpa leading zero.
 */
function parseStoreLeaderExcel(wb) {
  const db = {};

  wb.SheetNames.forEach(sn => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    if (!rows.length) return;

    // Cari header row
    let hi = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const r = rows[i].map(c => String(c || '').toLowerCase());
      if (r.some(c => c.includes('sap') || c.includes('plant'))) { hi = i; break; }
    }

    const hdr = rows[hi].map(c => String(c || '').trim().toLowerCase());

    const iCode = hdr.findIndex(h =>
      h.includes('sap') || h === 'plant code' || h === 'kode' || h === 'plant_code'
    );
    const iName = hdr.findIndex(h =>
      h.includes('sl (nama hris)') || h.includes('sl (nama ktp)') ||
      h.includes('store leader') || h.includes('nama sl') || h === 'sl'
    );

    const colCode = iCode >= 0 ? iCode : COL_SL_FALLBACK.SAP_CODE;
    const colName = iName >= 0 ? iName : COL_SL_FALLBACK.SL_NAME;

    // Cari kolom phone: keyword diperluas — cover header Indonesia & English
    const PHONE_KW  = ['contact', 'hp', 'handphone', 'phone', 'mobile', 'wa', 'whatsapp',
                       'telp', 'telepon', 'no.', 'nomor'];
    const PHONE_EXC = ['store', 'toko', 'kantor', 'office'];   // hindari landline toko

    let colPhone = -1;
    // Scan seluruh header, prioritaskan kolom setelah iName
    const scanStart = iName >= 0 ? iName + 1 : 0;
    for (let pass = 0; pass < 2 && colPhone < 0; pass++) {
      const start = pass === 0 ? scanStart : 0;
      const end   = pass === 0 ? Math.min(scanStart + 8, hdr.length) : hdr.length;
      for (let i = start; i < end; i++) {
        const h = hdr[i];
        if (PHONE_KW.some(kw => h.includes(kw)) && !PHONE_EXC.some(ex => h.includes(ex))) {
          colPhone = i;
          break;
        }
      }
    }
    if (colPhone < 0) colPhone = COL_SL_FALLBACK.SL_PHONE;

    rows.slice(hi + 1).forEach(r => {
      const code = String(r[colCode] || '').trim().toUpperCase();
      if (!code) return;

      const name = String(r[colName] || '').trim();
      let phone  = String(r[colPhone] || '').trim().replace(/[^0-9+]/g, '');

      // Tambah leading zero jika nomor diformat sebagai integer Excel (misal: 81292867708)
      if (phone && !phone.startsWith('0') && !phone.startsWith('+') && phone.length >= 9) {
        phone = '0' + phone;
      }

      // Simpan entri meski phone kosong — agar nama SL tetap tampil di UI
      // Phone kosong akan ditandai sehingga tombol Kirim bisa di-disable
      if (code) {
        db[code] = {
          name,
          phone,
          storeName : String(r[2] || '').trim(),
          updatedAt : new Date().toISOString(),
        };
      }
    });
  });

  return db;
}


// ── MASTER TOKO (all-stores reference) ────────────────────────────
/**
 * Fetch daftar SEMUA toko dari spreadsheet Master Toko (config di Settings).
 * Dipakai untuk kalkulasi partisipasi & toko yang tidak ikut campaign.
 */
async function fetchMasterToko(masterTokoConfig) {
  if (!masterTokoConfig || !masterTokoConfig.spreadsheetId) return [];
  try {
    const rows = await fetchSheet(
      masterTokoConfig.spreadsheetId,
      masterTokoConfig.sheetName || DEFAULT_MASTER_SHEET
    );
    return parseMaster(rows, masterTokoConfig.headerRow || DEFAULT_HEADER_ROW);
  } catch (e) {
    console.warn('Master toko fetch failed:', e.message);
    return [];
  }
}


// ── FONNTE WHATSAPP ────────────────────────────────────────────────
/**
 * Kirim pesan WA via Fonnte API.
 * @returns {Promise<boolean>} true jika berhasil
 */
async function sendViaFonnte(phone, message, settings) {
  const token = settings.fonnteToken;
  if (!token) { toast('Set Fonnte Token di Settings!', 'error'); return false; }

  let p = phone.replace(/[^0-9+]/g, '');
  if (p.startsWith('0')) p = (settings.countryCode || DEFAULT_COUNTRY) + p.substring(1);

  try {
    const res = await fetch(FONNTE_SEND_URL, {
      method  : 'POST',
      headers : { Authorization: token },
      body    : new URLSearchParams({
        target      : p,
        message,
        countryCode : (settings.countryCode || DEFAULT_COUNTRY).replace('+', ''),
      }),
    });
    const data = await res.json();
    if (data.status) return true;
    toast('Fonnte: ' + (data.reason || 'Error'), 'error');
    return false;
  } catch (e) {
    toast('Network error: ' + e.message, 'error');
    return false;
  }
}

/**
 * Test koneksi Fonnte — cek device status.
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function testFonnteConnection(token) {
  try {
    const res  = await fetch(FONNTE_DEVICE_URL, { method: 'POST', headers: { Authorization: token } });
    const data = await res.json();
    if (data.status) return { ok: true,  message: 'Connected! Device: ' + (data.device || 'OK') };
    return { ok: false, message: 'Error: ' + (data.reason || 'Invalid token') };
  } catch (e) {
    return { ok: false, message: 'Network: ' + e.message };
  }
}


// ── EXTRACT SHEET ID ───────────────────────────────────────────────
/**
 * Ekstrak spreadsheet ID dari URL Google Sheets atau kembalikan string aslinya.
 */
function extractSheetId(input) {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}


// ── HTML ESCAPE ────────────────────────────────────────────────────
/**
 * Escape string untuk disisipkan ke HTML (XSS prevention).
 */
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
