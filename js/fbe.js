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
      if (!pulled.ok) { toastLocalStoresError(pulled); return; }
      fbeCurrentCampaign = campaigns.find(x => x.id === cid) || c;
    }

    let confirmRows = [];
    if (fbeCurrentCampaign.responseSheetId) {
      try {
        const rows = await fetchSheet(fbeCurrentCampaign.responseSheetId, fbeCurrentCampaign.importSheet || 'Form Responses 1');
        confirmRows = parseFbeConfirmation(rows);
      } catch (e) { console.warn('[FBE] fetch konfirmasi gagal', e); }
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">Tidak ada toko yang cocok dengan filter</td></tr>`;
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
      <td colspan="7">
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
function buildFbeMsg(storeName, plantCode, materialLabel, campaignName, formLink) {
  return `Halo Store Leader *${storeName}* (${plantCode}),\n\n` +
    `Materi *${materialLabel}* untuk campaign *${campaignName}* belum terkonfirmasi terpasang.\n` +
    `Mohon segera pasang dan submit dokumentasi via form:\n${formLink || '(link form belum diset)'}\n\n` +
    `Terima kasih! 🙏`;
}

async function scanAndRemindFbe() {
  if (!fbeCurrentCampaign) { toast('Pilih campaign FBE', 'error'); return; }
  if (!settings.fonnteToken) { toast('Set Fonnte Token!', 'error'); return; }

  const pending = [];
  fbeStoreStatus.forEach(s => {
    const sl = getSL(s.plantCode);
    if (!sl) return;
    s.materials.forEach(m => { if (!m.confirmed) pending.push({ store: s, material: m, sl }); });
  });

  if (!pending.length) { toast('Tidak ada materi belum terpasang dengan SL terdaftar', 'warn'); return; }
  if (!confirm(`Kirim ${pending.length} reminder (per materi) ke Store Leader?`)) return;

  let sent = 0;
  const cid = fbeCurrentCampaign.id;
  for (const p of pending) {
    const msg = buildFbeMsg(p.store.namaToko, p.store.plantCode, p.material.label, fbeCurrentCampaign.name, fbeCurrentCampaign.formLink || '');
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
  toast(`${sent}/${pending.length} reminder terkirim`);
}
