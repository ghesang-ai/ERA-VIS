/**
 * ERA-VIS — Apps Script: sync VMD Compliance ke Sheet "5 Store Mall Performance"
 * Simpan file ini di Apps Script yang BOUND ke spreadsheet
 * "5 Store Mall Performance" (bukan di project ERA-VIS, dan bukan di
 * Apps Script campaign — ini project Apps Script TERPISAH).
 *
 * CARA SETUP (sekali saja):
 * 1. Buka Google Sheet "5 Store Mall Performance"
 *    (https://docs.google.com/spreadsheets/d/1M-F3eBw00xubdGXcNVr0zfdr4OTX9zvB4DngWJZdOhM)
 * 2. Extensions → Apps Script
 * 3. Hapus semua kode default di Code.gs, paste kode ini
 * 4. Klik Deploy → New deployment → pilih tipe "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    - Deploy, lalu Authorize kalau diminta
 * 5. Copy URL "/exec" yang muncul, lalu tempel ke
 *    netlify/functions/vmd-5store-sync.js (konstanta APPS_SCRIPT_URL)
 *    di project ERA-VIS, commit + push supaya Netlify re-deploy.
 *
 * CARA UPDATE KODE INI NANTI:
 * Deploy → Manage deployments → edit deployment lama → Version: New
 * version → Deploy (JANGAN buat deployment baru, URL-nya akan berubah).
 *
 * APA YANG DILAKUKAN:
 * Terima POST { month: "Oktober", stores: [{code:"E281", score:100}, ...] }
 * dari ERA-VIS (tiap kali user klik "Generate Compliance" di halaman
 * VMD Compliance), lalu:
 *   - Cari kolom bulan tsb di header row 2 sheet "VMD COMPLIANCE"
 *     (match nama bulan, case-insensitive). Kalau belum ada kolomnya,
 *     dibuat otomatis di kolom kosong berikutnya.
 *   - Cari baris toko lewat SAP CODE di kolom A, isi skor (score/100,
 *     format persen) di kolom bulan yang cocok.
 * ================================================================ */

const VMD5_SHEET_NAME   = 'VMD COMPLIANCE';
const VMD5_HEADER_ROW   = 2;   // baris header: SAP CODE | STORE NAME | <bulan> | <bulan> | ...
const VMD5_DATA_ROW     = 3;   // baris pertama data toko
const VMD5_FIRST_MONTH_COL = 3; // kolom C = bulan pertama (A = SAP CODE, B = STORE NAME)


function doPost(e) {
  try {
    const body   = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const month  = String(body.month || '').trim();
    const stores = Array.isArray(body.stores) ? body.stores : [];

    if (!month) throw new Error('month wajib diisi');
    if (!stores.length) throw new Error('stores kosong');

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(VMD5_SHEET_NAME);
    if (!sheet) throw new Error('Sheet "' + VMD5_SHEET_NAME + '" tidak ditemukan');

    const monthCol = _vmd5FindOrCreateMonthCol(sheet, month);

    // ── Ambil semua SAP CODE di kolom A (mulai VMD5_DATA_ROW) ──
    const lastRow = sheet.getLastRow();
    const nRows   = Math.max(lastRow - VMD5_DATA_ROW + 1, 0);
    const codes   = nRows > 0
      ? sheet.getRange(VMD5_DATA_ROW, 1, nRows, 1).getValues().map(r => String(r[0] || '').trim().toUpperCase())
      : [];

    // ── Map SAP CODE → score dari payload ──
    const scoreByCode = {};
    stores.forEach(s => {
      if (s && s.code) scoreByCode[String(s.code).trim().toUpperCase()] = s.score;
    });

    let written = 0;
    codes.forEach((code, idx) => {
      if (!code || !(code in scoreByCode)) return;
      const score = scoreByCode[code];
      if (score === null || score === undefined || isNaN(Number(score))) return;

      const cell = sheet.getRange(VMD5_DATA_ROW + idx, monthCol);
      cell.setValue(Number(score) / 100);
      cell.setNumberFormat('0%');
      written++;
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, month: month, col: monthCol, written: written }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, info: 'ERA-VIS VMD 5-Store sync endpoint. Gunakan POST.' }))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── Helper: cari kolom bulan di header row; bikin baru kalau belum ada ──
function _vmd5FindOrCreateMonthCol(sheet, month) {
  const lastCol  = Math.max(sheet.getLastColumn(), VMD5_FIRST_MONTH_COL);
  const nCols    = lastCol - VMD5_FIRST_MONTH_COL + 1;
  const headers  = sheet.getRange(VMD5_HEADER_ROW, VMD5_FIRST_MONTH_COL, 1, nCols).getValues()[0];

  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').trim();
    if (h.toLowerCase() === month.toLowerCase()) return VMD5_FIRST_MONTH_COL + i;
  }

  // Belum ada kolom bulan ini → pakai kolom kosong pertama, atau tambah di akhir
  let emptyIdx = -1;
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim() === '') { emptyIdx = i; break; }
  }
  const targetIdx = emptyIdx === -1 ? headers.length : emptyIdx;
  const targetCol = VMD5_FIRST_MONTH_COL + targetIdx;

  sheet.getRange(VMD5_HEADER_ROW, targetCol).setValue(month);
  return targetCol;
}
