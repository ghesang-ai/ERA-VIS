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


// ── PARSE IMPORTING (form responses) ──────────────────────────────
/**
 * Parse rows[][] dari sheet IMPORTING menjadi array submission objects.
 */
function parseImport(rows) {
  if (rows.length < 2) return [];
  return rows.slice(1).filter(r => r[0]).map(r => ({
    timestamp   : r[COL_IMPORT.TIMESTAMP]   || '',
    kodeStore   : normalizeKodeStore(r[COL_IMPORT.KODE_STORE]),
    namaStore   : (r[COL_IMPORT.NAMA_STORE]  || '').trim(),
    region      : (r[COL_IMPORT.REGION]      || '').trim(),
    dokumentasi : (r[COL_IMPORT.DOKUMENTASI] || r[COL_IMPORT.REGION] || '').trim(),
  }));
}


// ── MERGE STATUS FROM IMPORT ───────────────────────────────────────
/**
 * Gabungkan daftar toko (localStores dari Excel) dengan
 * data submission (IMPORTING sheet) untuk menentukan status DONE/NOT DONE.
 */
function mergeStatusFromImport(stores, importData) {
  const submitted = {};
  importData.forEach(r => {
    const k = normalizeKodeStore(r.kodeStore);
    if (k) submitted[k] = { dokumentasi: r.dokumentasi || '', timestamp: r.timestamp || '' };
  });
  return stores.map(s => {
    const k = s.plantCode.trim().toUpperCase();
    if (submitted[k]) return { ...s, status: STATUS.DONE, dokumentasi: submitted[k].dokumentasi };
    return { ...s, status: STATUS.NOT_DONE, dokumentasi: '' };
  });
}


// ── PARSE EXCEL STORES ─────────────────────────────────────────────
/**
 * Parse rows[][] dari satu sheet Excel (via SheetJS) menjadi array store objects.
 * Mencari header row yang mengandung kata "plant" atau "kode".
 */
function parseExcelStores(rows) {
  let headerIdx = 0;
  let colMap = {};

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = rows[i].map(c => String(c || '').trim().toLowerCase()).join(' ');
    if (joined.includes('plant') || joined.includes('kode')) {
      headerIdx = i;
      rows[i].forEach((h, idx) => {
        colMap[String(h || '').trim().toLowerCase()] = idx;
      });
      break;
    }
  }

  const findCol = (...names) => {
    for (const n of names) {
      if (colMap[n] !== undefined) return colMap[n];
    }
    return -1;
  };

  const iCode   = findCol('plant code', 'kode toko', 'kode');
  const iDesc   = findCol('plant desc', 'nama toko', 'plant description', 'desc');
  const iRegion = findCol('region');
  const iCity   = findCol('kota', 'city', 'kab/kota');
  const iNo     = findCol('no.', 'no');
  const iResi   = findCol('resi', 'nomor resi', 'no resi');

  return rows
    .slice(headerIdx + 1)
    .map(r => {
      const code = iCode >= 0 ? String(r[iCode] || '').trim() : '';
      if (!code || code.toLowerCase() === 'plant code') return null;
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
