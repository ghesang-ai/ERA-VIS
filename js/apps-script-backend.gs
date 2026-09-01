/**
 * ERA-VIS — Google Apps Script Backend
 * Simpan file ini di Google Apps Script (bukan di project ERA-VIS)
 *
 * CARA SETUP / UPDATE:
 * 1. Buka Google Sheet ERA-VIS Anda
 * 2. Extensions → Apps Script
 * 3. Hapus semua kode default, paste kode ini
 * 4. Klik Deploy → Manage deployments → edit deployment lama → Version: New version → Deploy
 *    (JANGAN buat deployment baru — URL-nya berubah dan harus diganti di config.js)
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Authorize kalau diminta
 *
 * PERUBAHAN vs versi lama:
 * - Setiap POST menyimpan salinan A1 lama ke sheet ERA_VIS_CAMPAIGNS_BACKUP
 *   (timestamp + JSON) sebelum ditimpa — recovery selalu ada.
 * - Shrink guard: tolak write yang memangkas jumlah campaign > 40% kecuali
 *   payload menyertakan flag ?force (mencegah 1 device dengan localStorage
 *   kosong menimpa cloud jadi 1 campaign).
 * - Chunking: JSON > 45.000 char dipecah ke A1, A2, A3, … dan digabung lagi
 *   saat GET — lewat batas 50.000 char per cell milik Google Sheets.
 * ================================================================ */

const CAMPAIGN_SHEET_NAME = 'ERA_VIS_CAMPAIGNS';
const BACKUP_SHEET_NAME   = 'ERA_VIS_CAMPAIGNS_BACKUP';
const LOG_SHEET_NAME      = 'ERA_VIS_LOG';

const CHUNK_SIZE      = 45000;  // < 50.000 (limit per cell Google Sheets)
const SHRINK_MIN_KEEP = 0.6;    // hasil baru harus >= 60% jumlah lama (kecuali force)
const BACKUP_MAX_ROWS = 200;    // simpan 200 backup terakhir


// ── GET: Ambil semua campaigns ─────────────────────────────────────
function doGet(e) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let   sheet = ss.getSheetByName(CAMPAIGN_SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(CAMPAIGN_SHEET_NAME);
      sheet.getRange('A1').setValue('[]');
    }

    const raw       = _readCampaignRaw(sheet);
    const campaigns = raw ? JSON.parse(raw) : [];

    return ContentService
      .createTextOutput(JSON.stringify(campaigns))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Penting: JANGAN balas [] saat error — client menganggap [] = "cloud kosong".
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── POST: Simpan semua campaigns ───────────────────────────────────
function doPost(e) {
  try {
    const body      = (e && e.postData && e.postData.contents) || '[]';
    const campaigns = JSON.parse(body);
    const force     = Boolean(e && e.parameter && (e.parameter.force || e.parameter.force === ''));

    if (!Array.isArray(campaigns)) throw new Error('Data bukan array');

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let   sheet = ss.getSheetByName(CAMPAIGN_SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(CAMPAIGN_SHEET_NAME);

    // ── Baca kondisi lama untuk backup + shrink guard ──
    const oldRaw = _readCampaignRaw(sheet);
    let oldCount = 0;
    try { const o = JSON.parse(oldRaw || '[]'); oldCount = Array.isArray(o) ? o.length : 0; } catch (_) {}

    // ── Shrink guard ──
    if (!force && oldCount >= 5 && campaigns.length < Math.floor(oldCount * SHRINK_MIN_KEEP)) {
      _appendLog(ss, 'REJECT shrink ' + oldCount + ' → ' + campaigns.length + ' (pakai ?force untuk paksa)');
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: false,
          error: 'shrink-guard',
          message: 'Ditolak: ' + oldCount + ' → ' + campaigns.length +
                   ' campaign. Tambah ?force=1 di URL kalau memang disengaja.',
          oldCount: oldCount, newCount: campaigns.length,
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Backup A1 lama ──
    if (oldRaw && oldRaw !== '[]') _appendBackup(ss, oldRaw, oldCount);

    // ── Tulis (chunked kalau perlu) ──
    _writeCampaignRaw(sheet, JSON.stringify(campaigns));

    _appendLog(ss, campaigns.length + ' campaigns' + (force ? ' (force)' : ''));

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, count: campaigns.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── Helpers ────────────────────────────────────────────────────────

// Gabung kolom A (A1 ke bawah) jadi satu string. Berhenti di sel kosong pertama.
function _readCampaignRaw(sheet) {
  const last = Math.max(sheet.getLastRow(), 1);
  const vals = sheet.getRange(1, 1, last, 1).getValues();
  let out = '';
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i][0];
    if (v === '' || v === null) break;
    out += String(v);
  }
  return out;
}

// Tulis string ke kolom A, dipecah per CHUNK_SIZE char. Bersihkan sisa sel lama.
function _writeCampaignRaw(sheet, str) {
  const chunks = [];
  for (let i = 0; i < str.length; i += CHUNK_SIZE) chunks.push([str.substr(i, CHUNK_SIZE)]);
  if (!chunks.length) chunks.push(['[]']);

  const prevLast = Math.max(sheet.getLastRow(), chunks.length);
  sheet.getRange(1, 1, chunks.length, 1).setValues(chunks);

  // Kosongkan baris sisa dari tulisan sebelumnya yang lebih panjang
  if (prevLast > chunks.length) {
    sheet.getRange(chunks.length + 1, 1, prevLast - chunks.length, 1).clearContent();
  }
}

function _appendBackup(ss, rawJson, count) {
  let b = ss.getSheetByName(BACKUP_SHEET_NAME);
  if (!b) {
    b = ss.insertSheet(BACKUP_SHEET_NAME);
    b.appendRow(['timestamp', 'count', 'json']);
  }
  b.appendRow([new Date().toISOString(), count, rawJson]);

  // Pangkas biar sheet tidak membengkak tak terbatas
  const extra = b.getLastRow() - (BACKUP_MAX_ROWS + 1);
  if (extra > 0) b.deleteRows(2, extra);
}

function _appendLog(ss, msg) {
  try {
    let l = ss.getSheetByName(LOG_SHEET_NAME);
    if (!l) l = ss.insertSheet(LOG_SHEET_NAME);
    l.appendRow([new Date().toLocaleString('id-ID'), msg, 'sync']);
  } catch (_) { /* log opsional */ }
}
