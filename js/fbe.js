/* ================================================================
   ERA-VIS AI v2.0 — fbe.js
   Controller halaman FBE (Festival Belanja Erafone): load data, render
   summary + tabel + mini-leaderboard region, filter, scan reminder.
   Depends on: config.js, api.js, fbeImport.js
   ================================================================ */

'use strict';

let fbeCurrentCampaign = null;
let fbeStoreStatus = []; // hasil computeFbeStoreStatus() untuk campaign yang dipilih

// ── LOAD ────────────────────────────────────────────────────────────
async function loadFbePage(cid) {
  const c = campaigns.find(x => x.id === cid);
  document.getElementById('fbe-empty').style.display     = c ? 'none' : '';
  document.getElementById('fbe-kpi-row').style.display    = c ? '' : 'none';
  document.getElementById('fbe-main-grid').style.display  = c ? '' : 'none';
  if (!c) { fbeCurrentCampaign = null; fbeStoreStatus = []; return; }

  fbeCurrentCampaign = c;

  try {
    if (!c.localStores || !c.localStores.length) {
      toast('Mengambil data toko FBE dari cloud...', 'info');
      const pulled = await ensureLocalStores(cid);
      if (!pulled.ok) {
        // Pesan default ensureLocalStores() ("upload Excel di edit campaign")
        // tidak cocok untuk campaign FBE — campaign FBE biasa pakai upload
        // per-slot materi, sedangkan Scoring sama sekali tidak ada upload
        // Excel (datanya diturunkan otomatis dari campaign FBE utama).
        const emptyMsg = c.scoringMode
          ? 'Data toko belum ada — edit & simpan ulang campaign FBE utama untuk generate ulang, lalu klik Refresh di sini'
          : 'Data toko FBE belum ada di cloud — upload ulang materi di Edit Campaign';
        toastLocalStoresError(pulled, emptyMsg);
        return;
      }
      fbeCurrentCampaign = campaigns.find(x => x.id === cid) || c;
    }

    const confirmSheets = fbeCurrentCampaign.confirmSheets || {};
    let confirmRows;

    if (fbeCurrentCampaign.scoringMode) {
      // Scoring Visibility FBE: 1 form gabungan, ke-6 materi wajib diisi
      // sekaligus per submission — lihat parseFbeScoringConfirmation().
      const sheetCfg = confirmSheets.SCORING;
      if (sheetCfg && sheetCfg.sheetId) {
        try {
          const rows = await fetchSheet(sheetCfg.sheetId, sheetCfg.sheetName || DEFAULT_FBE_CONFIRM_SHEET_NAME);
          confirmRows = parseFbeScoringConfirmation(rows);
        } catch (e) {
          console.warn('[FBE] fetch konfirmasi scoring gagal', e);
          confirmRows = [];
        }
      } else {
        confirmRows = [];
      }
    } else {
      // Realita lapangan: 5 sheet konfirmasi terpisah per grup materi
      // (lihat FBE_CONFIRM_GROUPS) — fetch semuanya paralel, gabung hasilnya.
      const confirmResults = await Promise.all(
        Object.keys(FBE_CONFIRM_GROUPS).map(async group => {
          const sheetCfg = confirmSheets[group];
          if (!sheetCfg || !sheetCfg.sheetId) return [];
          try {
            const rows = await fetchSheet(sheetCfg.sheetId, sheetCfg.sheetName || DEFAULT_FBE_CONFIRM_SHEET_NAME);
            return parseFbeSimpleConfirmation(rows, FBE_CONFIRM_GROUPS[group].materials);
          } catch (e) {
            console.warn('[FBE] fetch konfirmasi gagal untuk grup', group, e);
            return [];
          }
        })
      );
      confirmRows = confirmResults.flat();
    }

    fbeStoreStatus = computeFbeStoreStatus(fbeCurrentCampaign.localStores, confirmRows);

    populateFbeRegionFilter();
    renderFbeSummary();
    renderFbeRegionLeaderboard();
    renderFbeTable();

  } catch (err) {
    toast('Gagal load FBE: ' + err.message, 'error');
  }
}

function populateFbeRegionFilter() {
  const regions = [...new Set(fbeStoreStatus.map(s => s.region))].filter(Boolean).sort();
  const sel = document.getElementById('fbe-region-filter');
  const prev = sel.value;
  sel.innerHTML = '<option value="">Semua Region</option>' +
    regions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  if (prev && regions.includes(prev)) sel.value = prev;
}

// ── SUMMARY (KPI + progress ring) ──────────────────────────────────
function renderFbeSummary() {
  const total    = fbeStoreStatus.length;
  const complete = fbeStoreStatus.filter(s => s.totalCount > 0 && s.doneCount === s.totalCount).length;
  const empty    = fbeStoreStatus.filter(s => s.doneCount === 0).length;
  const partial  = total - complete - empty;

  document.getElementById('fbe-kpi-complete').textContent = complete;
  document.getElementById('fbe-kpi-partial').textContent  = partial;
  document.getElementById('fbe-kpi-empty').textContent    = empty;
  document.getElementById('fbe-kpi-total').textContent    = total;

  const avgPct = total > 0
    ? Math.round(fbeStoreStatus.reduce((sum, s) => sum + s.scorePct, 0) / total)
    : 0;
  const circ   = 314.16;
  const offset = circ - (avgPct / 100) * circ;
  document.getElementById('fbe-progress-ring').setAttribute('stroke-dashoffset', offset);
  document.getElementById('fbe-progress-pct').textContent = avgPct + '%';
}

// ── MINI-LEADERBOARD REGION ─────────────────────────────────────────
// Pola visual CSS-bar yang sama seperti renderRegionLB di dashboard.js,
// tapi rata-rata dari scorePct FBE yang denominatornya variabel, bukan
// rasio biner DONE/NOT-DONE (lihat catatan desain di plan Task 4).
function renderFbeRegionLeaderboard() {
  const byRegion = {};
  fbeStoreStatus.forEach(s => {
    if (!s.region) return;
    if (!byRegion[s.region]) byRegion[s.region] = { sum: 0, count: 0 };
    byRegion[s.region].sum   += s.scorePct;
    byRegion[s.region].count += 1;
  });
  const rows = Object.keys(byRegion)
    .map(r => ({ region: r, pct: Math.round(byRegion[r].sum / byRegion[r].count), count: byRegion[r].count }))
    .sort((a, b) => b.pct - a.pct);

  const wrap = document.getElementById('fbe-region-lb');
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state" style="padding:16px 0"><p>Belum ada data</p></div>'; return; }

  wrap.innerHTML = rows.map(r => `
    <div class="region-row">
      <div class="region-row-label">${esc(r.region)} <span style="color:var(--muted);font-weight:500">(${r.count} toko)</span></div>
      <div class="region-bar"><div class="region-bar-fill" style="width:${r.pct}%"></div></div>
      <div class="region-row-pct">${r.pct}%</div>
    </div>
  `).join('');
}

// ── FILTER + SEARCH ─────────────────────────────────────────────────
function getFilteredFbeStores() {
  const region = document.getElementById('fbe-region-filter').value;
  const status = document.getElementById('fbe-status-filter').value;
  const q       = document.getElementById('fbe-search').value.trim().toLowerCase();

  return fbeStoreStatus.filter(s => {
    if (region && s.region !== region) return false;
    if (status === 'complete' && !(s.totalCount > 0 && s.doneCount === s.totalCount)) return false;
    if (status === 'partial'  && !(s.doneCount > 0 && s.doneCount < s.totalCount)) return false;
    if (status === 'empty'    && s.doneCount !== 0) return false;
    if (q && !(s.plantCode.toLowerCase().includes(q) || s.namaToko.toLowerCase().includes(q))) return false;
    return true;
  });
}

// ── TABEL ────────────────────────────────────────────────────────────
function renderFbeTable() {
  if (!fbeCurrentCampaign) return;
  const rows = getFilteredFbeStores();
  document.getElementById('fbe-count').textContent = `${rows.length} dari ${fbeStoreStatus.length} toko`;

  const tbody = document.getElementById('fbe-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px">Tidak ada toko yang cocok dengan filter</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(s => {
    const rowId    = 'fbe-row-' + s.plantCode;
    const complete = s.totalCount > 0 && s.doneCount === s.totalCount;
    const chips = s.materials.map(m => {
      const cls = m.confirmed ? 'badge badge-done' : 'badge badge-notdone';
      return `<span class="${cls}" title="${esc(m.label)}${m.details.length > 1 ? ' (' + m.details.length + ' item)' : ''}">${esc(m.label)}</span>`;
    }).join(' ');

    const detailRows = s.materials.map(m => `
      <tr>
        <td>${esc(m.label)}</td>
        <td>${m.details.map(d => esc(d.subDesain || '—') + ' (qty ' + d.qty + ')').join('<br>')}</td>
        <td>${m.confirmed ? `<span class="badge badge-done">Terpasang</span>` : `<span class="badge badge-notdone">Belum</span>`}</td>
        <td>${m.tanggal ? esc(m.tanggal) : '—'}</td>
      </tr>
    `).join('');

    return `
    <tr>
      <td><input type="checkbox" class="fbe-check" data-code="${esc(s.plantCode)}"></td>
      <td><button class="btn btn-sm" onclick="toggleFbeExpand('${esc(s.plantCode)}')">&#x25BC;</button></td>
      <td><strong>${esc(s.plantCode)}</strong></td>
      <td>${esc(s.namaToko)}</td>
      <td>${esc(s.region)}</td>
      <td>${s.doneCount}/${s.totalCount} (${s.scorePct}%)</td>
      <td>${chips}</td>
      <td>
        <button class="btn btn-sm btn-teal" ${complete ? '' : 'title="Sebagian materi belum terkonfirmasi — report tetap bisa didownload"'}
          onclick="downloadFbeReport('${esc(s.plantCode)}')">&#x1F4E5; Download</button>
      </td>
    </tr>
    <tr id="${rowId}" class="fbe-expand-row" style="display:none">
      <td colspan="8">
        <table class="fbe-material-detail"><thead><tr><th>Materi</th><th>Detail</th><th>Status</th><th>Tanggal</th></tr></thead>
        <tbody>${detailRows}</tbody></table>
      </td>
    </tr>`;
  }).join('');
}

function toggleFbeExpand(plantCode) {
  const row = document.getElementById('fbe-row-' + plantCode);
  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

function toggleAllFbe(el) {
  document.querySelectorAll('.fbe-check').forEach(cb => cb.checked = el.checked);
}

// ── EXPORT EXCEL ─────────────────────────────────────────────────────
function exportFbeExcel() {
  if (!fbeStoreStatus.length) { toast('Tidak ada data', 'error'); return; }
  const rows = getFilteredFbeStores();

  const data = [
    ['Plant Code', 'Nama Toko', 'Region', 'Kota', 'Jenis Materi', 'Sub-Desain', 'Status', 'Tanggal Terpasang'],
  ];
  rows.forEach(s => {
    s.materials.forEach(m => {
      const subDesains = m.details.map(d => d.subDesain).filter(Boolean).join('; ') || '—';
      data.push([s.plantCode, s.namaToko, s.region, s.kota, m.label, subDesains, m.confirmed ? 'Terpasang' : 'Belum Terpasang', m.tanggal || '']);
    });
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:12},{wch:35},{wch:12},{wch:18},{wch:22},{wch:30},{wch:16},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws, 'FBE Materials');

  const name = fbeCurrentCampaign ? fbeCurrentCampaign.name : 'FBE';
  XLSX.writeFile(wb, `FBE_${name.replace(/[^a-zA-Z0-9]/g,'_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast('Excel FBE berhasil di-download');
  addLog('system', 'FBE Export Excel: ' + name);
}

// ── REMINDER (per materi, bukan per toko) ────────────────────────────
// Tiap grup materi (lihat FBE_CONFIRM_GROUPS) punya Google Form sendiri,
// jadi reminder harus kirim link form yang sesuai grup materi tsb — bukan
// 1 link generik untuk semua materi. Scoring Visibility FBE beda: cuma 1
// form gabungan untuk semua materi, jadi pakai formLink generik campaign.
function _fbeFormLinkForMaterial(campaign, materialKey) {
  if (campaign.scoringMode) return campaign.formLink || '';
  const group = Object.keys(FBE_CONFIRM_GROUPS).find(g => FBE_CONFIRM_GROUPS[g].materials.includes(materialKey));
  return (group && campaign.formLinks && campaign.formLinks[group]) || '';
}

function buildFbeMsg(storeName, plantCode, materialLabel, campaignName, formLink) {
  return `Halo Store Leader *${storeName}* (${plantCode}),\n\n` +
    `Materi *${materialLabel}* untuk campaign *${campaignName}* belum terkonfirmasi terpasang.\n` +
    `Mohon segera pasang dan submit dokumentasi via form:\n${formLink || '(link form belum diset)'}\n\n` +
    `Terima kasih! 🙏`;
}

// Kumpulan (toko, materi) yang lagi ditampilkan di modal preview — dibangun
// sekali saat modal dibuka (snapshot), lalu dipakai lagi saat user klik
// "Kirim Semua" supaya tidak perlu scan ulang state yang mungkin berubah
// selagi modal terbuka.
let _fbePendingReminders = [];

function _fbeScanPendingReminders() {
  const pending = [];
  fbeStoreStatus.forEach(s => {
    const sl = getSL(s.plantCode);
    if (!sl) return;
    s.materials.forEach(m => { if (!m.confirmed) pending.push({ store: s, material: m, sl }); });
  });
  return pending;
}

// ── PREVIEW sebelum kirim massal ──────────────────────────────────
// Tombol "Scan & Kirim Reminder" / "Blast Terpilih" tidak langsung kirim —
// buka modal berisi isi pesan lengkap tiap (toko, materi) dulu, baru kirim
// semua kalau user menekan "Kirim Semua via WhatsApp" di modal itu. Dipakai
// bareng oleh kedua tombol, bedanya cuma daftar `pending` yang di-scan.
function _openFbeRemindPreviewModal(pending) {
  _fbePendingReminders = pending;

  document.getElementById('fbe-remind-summary').textContent =
    `${pending.length} reminder (per materi) akan dikirim ke ${new Set(pending.map(p => p.sl.phone)).size} nomor WhatsApp Store Leader:`;

  document.getElementById('fbe-remind-list').innerHTML = pending.map(p => {
    const formLink = _fbeFormLinkForMaterial(fbeCurrentCampaign, p.material.jenisMateri);
    const msg = buildFbeMsg(p.store.namaToko, p.store.plantCode, p.material.label, fbeCurrentCampaign.name, formLink);
    return `
      <div style="border:1px solid var(--border2);border-radius:var(--r-sm);padding:12px">
        <div style="font-weight:700;font-size:12.5px;margin-bottom:2px">${esc(p.store.namaToko)} (${esc(p.store.plantCode)}) — ${esc(p.material.label)}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">WA Store Leader: ${esc(p.sl.phone)}</div>
        <div class="msg-preview" style="max-height:none"><div class="wa-bubble">${esc(msg).replace(/\n/g, '<br>')}</div></div>
      </div>`;
  }).join('');

  openModal('modal-fbe-remind');
}

// Scan semua toko yang punya materi belum terpasang (tanpa filter pilihan).
function openFbeRemindPreview() {
  if (!fbeCurrentCampaign) { toast('Pilih campaign FBE', 'error'); return; }
  if (!settings.fonnteToken) { toast('Set Fonnte Token!', 'error'); return; }

  const pending = _fbeScanPendingReminders();
  if (!pending.length) { toast('Tidak ada materi belum terpasang dengan SL terdaftar', 'warn'); return; }

  _openFbeRemindPreviewModal(pending);
}

// Cuma toko yang dicentang di tabel (checkbox .fbe-check) — toko yang
// dicentang tapi semua materinya sudah terkonfirmasi otomatis dilewati.
function openFbeBlastPreview() {
  if (!fbeCurrentCampaign) { toast('Pilih campaign FBE', 'error'); return; }
  if (!settings.fonnteToken) { toast('Set Fonnte Token!', 'error'); return; }

  const checkedCodes = new Set([...document.querySelectorAll('.fbe-check:checked')].map(cb => cb.dataset.code));
  if (!checkedCodes.size) { toast('Centang toko dulu', 'warn'); return; }

  const pending = _fbeScanPendingReminders().filter(p => checkedCodes.has(p.store.plantCode));
  if (!pending.length) { toast('Toko yang dicentang tidak punya materi belum terpasang / SL tidak terdaftar', 'warn'); return; }

  _openFbeRemindPreviewModal(pending);
}

async function confirmSendFbeReminders() {
  const pending = _fbePendingReminders;
  if (!pending.length) { closeModal('modal-fbe-remind'); return; }

  const btn = document.getElementById('fbe-remind-send-btn');
  if (btn) btn.disabled = true;

  let sent = 0;
  const cid = fbeCurrentCampaign.id;
  for (const p of pending) {
    const formLink = _fbeFormLinkForMaterial(fbeCurrentCampaign, p.material.jenisMateri);
    const msg = buildFbeMsg(p.store.namaToko, p.store.plantCode, p.material.label, fbeCurrentCampaign.name, formLink);
    const ok  = await sendViaFonnte(p.sl.phone, msg, settings);
    if (ok) {
      sent++;
      const key = p.store.plantCode + '|' + p.material.jenisMateri;
      if (!reminderHistory[cid]) reminderHistory[cid] = {};
      reminderHistory[cid][key] = { level: 1, sentAt: new Date().toISOString(), phone: p.sl.phone };
      addLog('reminder', `[FBE] ${p.material.label} to ${p.store.namaToko} (${p.sl.phone})`);
    }
    await new Promise(r => setTimeout(r, REMINDER_DELAY_MS));
  }
  save(SK.reminders, reminderHistory);

  if (btn) btn.disabled = false;
  _fbePendingReminders = [];
  closeModal('modal-fbe-remind');
  toast(`${sent}/${pending.length} reminder terkirim`);
}
