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
