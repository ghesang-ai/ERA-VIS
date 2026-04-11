/**
 * ERA-VIS — Google Apps Script Backend
 * Simpan file ini di Google Apps Script (bukan di project ERA-VIS)
 *
 * CARA SETUP:
 * 1. Buka Google Sheet ERA-VIS Anda
 * 2. Extensions → Apps Script
 * 3. Hapus semua kode default, paste kode ini
 * 4. Klik Deploy → New deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Authorize → Copy URL deployment
 * 6. Paste URL ke CAMPAIGN_SYNC_URL di js/config.js ERA-VIS
 * ================================================================ */

const CAMPAIGN_SHEET_NAME = 'ERA_VIS_CAMPAIGNS';

// ── GET: Ambil semua campaigns ─────────────────────────────────────
function doGet(e) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let   sheet = ss.getSheetByName(CAMPAIGN_SHEET_NAME);

    // Buat sheet jika belum ada
    if (!sheet) {
      sheet = ss.insertSheet(CAMPAIGN_SHEET_NAME);
      sheet.getRange('A1').setValue('[]');
    }

    const raw = sheet.getRange('A1').getValue();
    const campaigns = raw ? JSON.parse(raw) : [];

    return ContentService
      .createTextOutput(JSON.stringify(campaigns))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST: Simpan semua campaigns ───────────────────────────────────
function doPost(e) {
  try {
    const campaigns = JSON.parse(e.postData.contents);

    if (!Array.isArray(campaigns)) {
      throw new Error('Data bukan array');
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let   sheet = ss.getSheetByName(CAMPAIGN_SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(CAMPAIGN_SHEET_NAME);
    }

    // Simpan seluruh campaigns sebagai JSON di cell A1
    sheet.getRange('A1').setValue(JSON.stringify(campaigns));

    // Catat log di sheet (opsional — baris 2 ke bawah)
    const logSheet = ss.getSheetByName('ERA_VIS_LOG') || ss.insertSheet('ERA_VIS_LOG');
    logSheet.appendRow([
      new Date().toLocaleString('id-ID'),
      campaigns.length + ' campaigns',
      'sync'
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, count: campaigns.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
