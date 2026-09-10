'use strict';

// ══════════════════════════════════════════════════════════════════
//  WHATSAPP BLAST — broadcast pesan custom ke Store Leader
//  Berbeda dari Auto Reminder: teks bebas (bukan template Level 1/2/3),
//  tidak terikat daftar "toko belum submit". Penerima bisa "Semua SL
//  di Database" atau "Peserta Campaign tertentu". Dedupe per nomor HP.
// ══════════════════════════════════════════════════════════════════

// WhatsApp Blast dikunci ke Region 5 — seluruh operasi Store Leader ada di sini.
// Penerima di luar Region 5 tidak pernah ikut ter-blast.
const BLAST_REGION = 'REGION 5';

// true bila region cocok "Region 5" (toleran spasi/kapital) ATAU kosong/tak
// diketahui — SL tanpa data region tetap dianggap Region 5 (memang semuanya).
function isBlastRegion(region) {
  const r = String(region || '').toUpperCase().replace(/\s+/g, ' ').trim();
  return !r || /\bREGION 0*5\b/.test(r) || r === '5';
}

// Lookup kode toko -> { region, city, storeName } dari Master Toko (Settings).
// Dipakai untuk opsi filter City + placeholder {region}/{city}.
let blastMasterLookup   = {};
let blastMasterLoaded    = false;

// Daftar toko peserta campaign terpilih (mode "campaign"). null = belum load.
let blastCampaignStores = null;

// Hasil perhitungan penerima terakhir (sudah difilter + dedupe per HP).
let blastRecipientsCache = [];


// ── INIT ──────────────────────────────────────────────────────────
async function initBlastPage() {
  // Isi dropdown campaign
  const csel = document.getElementById('blast-campaign-select');
  csel.innerHTML = '<option value="">-- Pilih Campaign --</option>' +
    campaigns.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

  // Load Master Toko sekali (untuk region/city). Silent jika belum dikonfigurasi.
  if (!blastMasterLoaded && masterTokoConfig && masterTokoConfig.spreadsheetId) {
    try {
      const rows = await fetchMasterToko(masterTokoConfig);
      blastMasterLookup = {};
      rows.forEach(s => {
        blastMasterLookup[String(s.plantCode).toUpperCase()] = {
          region: s.region || '', city: s.city || '', storeName: s.plantDesc || '',
        };
      });
      blastMasterLoaded = true;
    } catch (e) { /* abaikan — filter geo tetap jalan tanpa data ini */ }
  }

  onBlastSourceChange();   // atur visibilitas kontrol campaign + render awal
}


// ── SOURCE MODE ───────────────────────────────────────────────────
function onBlastSourceChange() {
  const mode = document.getElementById('blast-source').value;
  const isCampaign = mode === 'campaign';
  document.getElementById('blast-campaign-select').style.display = isCampaign ? '' : 'none';
  document.getElementById('blast-status-filter').style.display   = isCampaign ? '' : 'none';
  if (!isCampaign) blastCampaignStores = null;

  if (isCampaign && document.getElementById('blast-campaign-select').value) {
    onBlastCampaignChange();
  } else {
    populateBlastGeoFilters();
    renderBlastRecipients();
    updateBlastPreview();
  }
}

async function onBlastCampaignChange() {
  const cid = document.getElementById('blast-campaign-select').value;
  blastCampaignStores = null;
  if (cid) {
    try {
      blastCampaignStores = await fetchBlastCampaignStores(cid);
    } catch (err) {
      toast('Gagal muat toko campaign: ' + err.message, 'error');
    }
  }
  populateBlastGeoFilters();
  renderBlastRecipients();
  updateBlastPreview();
}

// Ambil toko peserta campaign (DONE + NOT DONE) tanpa mengganggu state
// halaman lain (currentMasterData dsb).
async function fetchBlastCampaignStores(cid) {
  let c = campaigns.find(x => x.id === cid);
  if (!c) return [];
  let stores = [];

  if (c.mode === 'excel') {
    if (!c.localStores || !c.localStores.length) {
      const pulled = await ensureLocalStores(cid);
      if (!pulled.ok) { toastLocalStoresError(pulled); return []; }
      c = campaigns.find(x => x.id === cid) || c;
    }
    let importRows = [];
    if (c.responseSheetId) {
      try { importRows = await fetchSheet(c.responseSheetId, c.importSheet || DEFAULT_IMPORT_SHEET); }
      catch (e) { /* belum ada import */ }
    }
    stores = mergeStatusFromImport(c.localStores, parseImport(importRows));
  } else {
    const rows = await fetchSheet(c.spreadsheetId, c.masterSheet);
    stores = parseMaster(rows, c.headerRow || DEFAULT_HEADER_ROW);
  }

  return stores.filter(s => s.status === STATUS.DONE || s.status === STATUS.NOT_DONE);
}


// ── KANDIDAT PENERIMA (sebelum filter geo + dedupe) ───────────────
function getBlastCandidates() {
  const mode = document.getElementById('blast-source').value;

  if (mode === 'campaign') {
    if (!blastCampaignStores) return [];
    const statusF = document.getElementById('blast-status-filter').value;
    let stores = blastCampaignStores;
    if (statusF) stores = stores.filter(s => s.status === statusF);
    return stores.map(s => {
      const code = String(s.plantCode).toUpperCase();
      const sl   = getSL(code);
      const m    = blastMasterLookup[code] || {};
      return {
        code,
        phone     : sl && sl.phone ? sl.phone : '',
        slName    : (sl && sl.name) || '',
        storeName : s.plantDesc || (sl && sl.storeName) || m.storeName || '',
        brand     : (sl && sl.brand) || slBrandFromSheet('', code),
        region    : s.region || m.region || '',
        city      : s.city   || m.city   || '',
      };
    });
  }

  // mode === 'all' — semua entri Database Store Leader
  return Object.entries(storeLeaderDB).map(([code, sl]) => {
    const CODE = String(code).toUpperCase();
    const m    = blastMasterLookup[CODE] || {};
    return {
      code      : CODE,
      phone     : sl.phone || '',
      slName    : sl.name || '',
      storeName : sl.storeName || m.storeName || '',
      brand     : sl.brand || slBrandFromSheet('', CODE),
      region    : m.region || '',
      city      : m.city   || '',
    };
  });
}

// Normalisasi nomor untuk dedupe: hanya digit, awalan 0 -> 62.
function blastNormPhone(p) {
  let d = String(p || '').replace(/[^0-9]/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return d;
}

// Penerima final: wajib punya HP, di Region 5, lolos filter Brand + City,
// dedupe per HP.
function getBlastRecipients() {
  const brandF = document.getElementById('blast-brand-filter').value;
  const cityF  = document.getElementById('blast-city-filter').value;

  let list = getBlastCandidates().filter(r => r.phone && isBlastRegion(r.region));
  if (brandF) list = list.filter(r => r.brand === brandF);
  if (cityF)  list = list.filter(r => r.city  === cityF);

  const seen = new Map();
  list.forEach(r => {
    const key = blastNormPhone(r.phone);
    if (!key) return;
    if (!seen.has(key)) {
      seen.set(key, { ...r, key, codes: [r.code], brands: r.brand ? [r.brand] : [], storeCount: 1 });
    } else {
      const e = seen.get(key);
      e.storeCount++;
      if (e.codes.length < 6) e.codes.push(r.code);
      if (r.brand && !e.brands.includes(r.brand)) e.brands.push(r.brand);
    }
  });
  return [...seen.values()];
}


// ── FILTER BRAND + CITY (kandidat Region 5) ──────────────────────
function populateBlastGeoFilters() {
  const pool = getBlastCandidates().filter(r => r.phone && isBlastRegion(r.region));

  const brands = [...new Set(pool.map(r => r.brand).filter(Boolean))].sort();
  const bSel   = document.getElementById('blast-brand-filter');
  const prevB  = bSel.value;
  bSel.innerHTML = '<option value="">Semua Brand</option>' +
    brands.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  if (prevB && brands.includes(prevB)) bSel.value = prevB;

  // City menyesuaikan brand yang sedang dipilih
  let cityPool = pool;
  if (bSel.value) cityPool = cityPool.filter(r => r.brand === bSel.value);
  const cities = [...new Set(cityPool.map(r => r.city).filter(Boolean))].sort();
  const cSel   = document.getElementById('blast-city-filter');
  const prevC  = cSel.value;
  cSel.innerHTML = '<option value="">Semua City (Region 5)</option>' +
    cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (prevC && cities.includes(prevC)) cSel.value = prevC;
}

function onBlastBrandChange() {
  populateBlastGeoFilters();   // refresh opsi City sesuai brand
  renderBlastRecipients();
}


// ── RENDER TABEL PENERIMA ────────────────────────────────────────
function renderBlastRecipients() {
  blastRecipientsCache = getBlastRecipients();
  const rows  = blastRecipientsCache;
  const tbody = document.getElementById('blast-tbody');
  const label = document.getElementById('blast-count');

  // Info kandidat tanpa HP (biar user sadar ada yang dilewati)
  const noPhone = getBlastCandidates().filter(r => !r.phone).length;
  label.textContent = `${rows.length} penerima unik` + (noPhone ? ` — ${noPhone} tanpa No. HP dilewati` : '');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">
      ${document.getElementById('blast-source').value === 'campaign' && !blastCampaignStores
        ? 'Pilih campaign dulu'
        : 'Tidak ada Store Leader dengan No. HP yang cocok'}
    </td></tr>`;
    document.getElementById('blast-check-all').checked = false;
    updateBlastPreview();
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const codeCell = r.storeCount > 1
      ? `<strong>${esc(r.codes[0])}</strong> <span class="badge badge-pending">+${r.storeCount - 1} toko</span>`
      : `<strong>${esc(r.code)}</strong>`;
    const brandTxt = (r.brands && r.brands.length ? r.brands.join(', ') : r.brand) || '';
    return `<tr>
      <td><input type="checkbox" class="blast-check" data-key="${esc(r.key)}" checked></td>
      <td>${codeCell}</td>
      <td>${brandTxt ? `<span class="badge badge-sent">${esc(brandTxt)}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
      <td style="font-size:12px">${esc(r.slName) || '<span style="color:var(--muted)">—</span>'}</td>
      <td><span style="font-family:var(--mono);font-size:11px;color:var(--teal)">${esc(r.phone)}</span></td>
      <td>${esc(r.region) || '<span style="color:var(--muted)">—</span>'}</td>
      <td>${esc(r.city) || '<span style="color:var(--muted)">—</span>'}</td>
    </tr>`;
  }).join('');
  document.getElementById('blast-check-all').checked = true;

  updateBlastPreview();   // jaga sample preview tetap sesuai penerima pertama
}

function toggleAllBlast(el) {
  document.querySelectorAll('.blast-check').forEach(cb => { cb.checked = el.checked; });
}


// ── PESAN + PREVIEW ─────────────────────────────────────────────
function buildBlastMsg(tpl, r) {
  return String(tpl || '')
    .replace(/\{nama_sl\}/g,    (r && r.slName)    || '')
    .replace(/\{nama_toko\}/g,  (r && r.storeName) || '')
    .replace(/\{kode_store\}/g, (r && r.code)      || '')
    .replace(/\{brand\}/g,      (r && (r.brand || (r.brands && r.brands.join(', ')))) || '')
    .replace(/\{region\}/g,     (r && r.region)    || '')
    .replace(/\{city\}/g,       (r && r.city)      || '');
}

function updateBlastPreview() {
  const tpl = document.getElementById('blast-message').value;
  document.getElementById('blast-charcount').textContent = tpl.length + ' karakter';

  const sample = blastRecipientsCache[0] || {
    slName: 'Budi Santoso', storeName: 'Erafone Contoh Store',
    code: 'S001', brand: 'Erafone', region: 'REGION 5', city: 'TANGERANG',
  };
  const msg = buildBlastMsg(tpl, sample);
  document.getElementById('blast-preview').innerHTML = tpl.trim()
    ? `<div class="wa-bubble">${esc(msg).replace(/\n/g, '<br>')}</div>`
    : '<span style="color:var(--muted)">Preview muncul di sini setelah pesan diketik…</span>';
}

function insertBlastVar(token) {
  const ta = document.getElementById('blast-message');
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + token + ta.value.slice(e);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + token.length;
  updateBlastPreview();
}


// ── KIRIM ────────────────────────────────────────────────────────
async function sendBlast(onlyChecked) {
  const tpl = document.getElementById('blast-message').value.trim();
  if (!tpl) { toast('Tulis pesan blast dulu', 'error'); return; }
  if (!settings.fonnteToken) { toast('Set Fonnte Token di Settings!', 'error'); return; }

  let recipients = blastRecipientsCache.slice();
  if (onlyChecked) {
    const keys = new Set([...document.querySelectorAll('.blast-check:checked')].map(cb => cb.dataset.key));
    recipients = recipients.filter(r => keys.has(r.key));
  }
  if (!recipients.length) { toast('Tidak ada penerima terpilih', 'warn'); return; }
  if (!confirm(`Kirim WhatsApp Blast ke ${recipients.length} Store Leader?`)) return;

  const btns = document.querySelectorAll('#page-blast .filter-row button');
  btns.forEach(b => b.disabled = true);

  let sent = 0, fail = 0;
  for (let i = 0; i < recipients.length; i++) {
    const r  = recipients[i];
    const ok = await sendViaFonnte(r.phone, buildBlastMsg(tpl, r), settings);
    ok ? sent++ : fail++;
    if (i % 10 === 0 || i === recipients.length - 1) {
      toast(`Blast… ${i + 1}/${recipients.length}`, 'info');
    }
    await new Promise(res => setTimeout(res, REMINDER_DELAY_MS));
  }

  btns.forEach(b => b.disabled = false);
  addLog('reminder', `WA Blast: ${sent}/${recipients.length} terkirim${fail ? ` (${fail} gagal)` : ''}`);
  toast(`Blast selesai — ${sent} terkirim${fail ? `, ${fail} gagal` : ''}`);
}
