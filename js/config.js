/* ================================================================
   ERA-VIS AI v2.0 — config.js
   Central configuration: spreadsheet IDs, campaigns, column maps
   ================================================================ */

'use strict';

// ── GOOGLE SHEETS ─────────────────────────────────────────────────
// Spreadsheet ID campaign utama (dari URL Google Sheets)
const SPREADSHEET_ID = '1MpGnsBYbL1faYOaQplQKWQFX2CMEXVXgUCfpW1W97Yc';

// API Key Google Sheets (opsional — ERA-VIS pakai gviz/CSV publik, tidak wajib)
// Isi jika sheet tidak dipublish dan butuh auth
const GOOGLE_API_KEY = '';   // ← isi jika diperlukan

// ── CLOUD SYNC (Google Apps Script) ──────────────────────────────
// URL Apps Script Web App untuk sync campaign ke semua device.
// Isi setelah deploy Apps Script (lihat panduan Setup Guide).
// Kosongkan ('') untuk tetap pakai localStorage saja.
const CAMPAIGN_SYNC_URL = 'https://script.google.com/macros/s/AKfycbyEXaVRvtRb2ofZTNA-FVIj8wqjZaIasWbf6UsluEBDbIUolKlMFHLAlWI1Wolc-Ivrng/exec';

// Base URL helper untuk fetch CSV publik
function sheetCsvUrl(spreadsheetId, sheetName) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}


// ── LOCALSTORAGE KEYS ─────────────────────────────────────────────
const SK = {
  campaigns : 'eravis_campaigns',
  cache     : 'eravis_cache',
  settings  : 'eravis_settings',
  logs      : 'eravis_logs',
  reminders : 'eravis_reminders',
  master    : 'eravis_master',
  sldb      : 'eravis_sldb',
  deleted   : 'eravis_deleted_campaigns',
};


// ── DEFAULT CAMPAIGNS ─────────────────────────────────────────────
// Dipakai hanya jika localStorage kosong (first-run seed)
const DEFAULT_CAMPAIGNS = [
  {
    id            : 'c_hanging_mobile',
    name          : 'Hanging Mobile & Click N Pick — April 2026',
    mode          : 'sheet',
    spreadsheetId : SPREADSHEET_ID,
    masterSheet   : 'MASTER GHS',
    importSheet   : 'IMPORTING',
    headerRow     : 6,
    formLink      : 'https://forms.gle/skeCp6dpcm83o6tw8',
    deadline      : '2026-04-15',
    status        : 'active',
    createdAt     : new Date().toISOString(),
  },
];


// ── COLUMN MAP — MASTER GHS sheet ─────────────────────────────────
// Indeks kolom (0-based) setelah header row dilewati
// Sesuaikan jika format sheet berubah
const COL_MASTER = {
  NO          : 0,
  REGION      : 1,
  PLANT_CODE  : 2,
  PLANT_DESC  : 3,
  CITY        : 4,
  NOMOR_RESI  : 5,
  DOKUMENTASI : 6,
  STATUS      : 7,   // "DONE" / "NOT DONE"
  PENERIMA    : 8,
};

// Indeks kolom — IMPORTING sheet (form responses)
const COL_IMPORT = {
  TIMESTAMP   : 0,
  KODE_STORE  : 1,
  NAMA_STORE  : 2,
  REGION      : 3,
  DOKUMENTASI : 4,
};


// ── COLUMN MAP — STORE LEADER Excel ───────────────────────────────
// parseStoreLeaderExcel() menggunakan fallback ke indeks ini
// jika header keyword tidak ditemukan
const COL_SL_FALLBACK = {
  SAP_CODE : 1,    // kolom SAP / Plant Code
  SL_NAME  : 37,   // kolom "SL (Nama HRIS)" atau "SL (Nama KTP)"
  SL_PHONE : 38,   // kolom kontak SL (bukan "contact store" / landline)
};


// ── STATUS VALUES ──────────────────────────────────────────────────
const STATUS = {
  DONE     : 'DONE',
  NOT_DONE : 'NOT DONE',
  NOT_IKUT : 'TIDAK IKUT',
};


// ── REMINDER LEVELS ────────────────────────────────────────────────
const REMINDER_LEVELS = {
  1: { label: 'Gentle',   days: '1–2',  color: 'teal'   },
  2: { label: 'Urgent',   days: '3–4',  color: 'orange' },
  3: { label: 'Escalate', days: '5+',   color: 'red'    },
};


// ── PAGE META (titles + sub-labels for topbar) ────────────────────
const PAGE_TITLES = {
  dashboard      : 'Dashboard',
  stores         : 'Data Toko',
  leaderboard    : 'Leaderboard',
  'weekly-report': 'Weekly Report',
  reminder       : 'Auto Reminder',
  insights       : 'AI Insights',
  logs           : 'Activity Log',
  campaigns      : 'Campaigns',
  settings       : 'Settings',
  guide          : 'Setup Guide',
};

const PAGE_SUBLABELS = {
  dashboard      : 'KPI + Progress Overview',
  stores         : 'Data & Filter Toko',
  leaderboard    : 'Performance Ranking',
  'weekly-report': 'Generate Presentasi Senin Pagi',
  reminder       : 'WhatsApp Auto Reminder',
  insights       : 'AI Analysis',
  logs           : 'Activity History',
  campaigns      : 'Kelola Campaign',
  settings       : 'Konfigurasi',
  guide          : 'Panduan Setup',
};


// ── HEALTH SCORE WEIGHTS ───────────────────────────────────────────
const HEALTH_WEIGHTS = {
  compliance : 0.50,
  momentum   : 0.20,
  deadline   : 0.20,
  coverage   : 0.10,
};


// ── MISC CONSTANTS ─────────────────────────────────────────────────
const MAX_LOG_ENTRIES    = 500;   // batas entri activity log
const MAX_RECENT_ROWS    = 15;    // baris "Submission Terbaru" di dashboard
const MAX_CITY_LB_ROWS   = 15;   // baris leaderboard kota
const REMINDER_DELAY_MS  = 500;  // jeda antar kirim WA (ms) agar tidak rate-limit
const FONNTE_SEND_URL    = 'https://api.fonnte.com/send';
const FONNTE_DEVICE_URL  = 'https://api.fonnte.com/device';
const DEFAULT_COUNTRY    = '+62';
const DEFAULT_MASTER_SHEET = 'MASTER GHS';
const DEFAULT_IMPORT_SHEET = 'IMPORTING';
const DEFAULT_HEADER_ROW   = 6;
