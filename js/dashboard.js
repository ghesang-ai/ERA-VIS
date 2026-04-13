/* ================================================================
   ERA-VIS AI v2.0 — dashboard.js
   Halaman Dashboard: load data, KPI, health, regions, recent,
   executive summary, action zone, leaderboard podium.
   Depends on: config.js, api.js
   ================================================================ */

'use strict';

// ── LOAD CAMPAIGN DATA (main entry point) ─────────────────────────
async function loadCampaignData(cid) {
  const c = campaigns.find(x => x.id === cid);
  if (!c) return;

  document.getElementById('dash-empty').style.display    = 'none';
  document.getElementById('dash-main-grid').style.display = '';
  document.getElementById('exec-zone').style.display      = '';
  document.getElementById('dash-campaign-info').textContent = 'Loading...';

  try {
    // ── Fetch stores & submissions ──────────────────────────────
    let importRows = [];

    if (c.mode === 'excel') {
      if (!c.localStores || !c.localStores.length) {
        toast('Data toko belum ada — edit campaign untuk upload Excel', 'error');
        return;
      }
      if (c.responseSheetId) {
        try {
          importRows = await fetchSheet(c.responseSheetId, c.importSheet || DEFAULT_IMPORT_SHEET);
        } catch (e) { console.warn('Import fetch failed', e); }
      }
      currentImportData  = parseImport(importRows);
      currentMasterData  = mergeStatusFromImport(c.localStores, currentImportData);
    } else {
      const [masterRows, impRows] = await Promise.all([
        fetchSheet(c.spreadsheetId, c.masterSheet),
        fetchSheet(c.spreadsheetId, c.importSheet).catch(() => []),
      ]);
      currentMasterData = parseMaster(masterRows, c.headerRow || DEFAULT_HEADER_ROW);
      currentImportData = parseImport(impRows);
    }

    allMasterToko = await fetchMasterToko(masterTokoConfig);

    // ── Compute KPIs ────────────────────────────────────────────
    const ikut       = currentMasterData.length;
    const totalMaster = allMasterToko.length || ikut;
    const done       = currentMasterData.filter(s => s.status === STATUS.DONE).length;
    const notDone    = ikut - done;
    const rate       = ikut > 0 ? Math.round(done / ikut * 100) : 0;

    // Cache for campaigns page stats
    dataCache[c.id] = { totalStores: ikut, doneCount: done, rate, lastSync: new Date().toISOString() };
    save(SK.cache, dataCache);

    // ── Render KPI cards ────────────────────────────────────────
    document.getElementById('kpi-ikut').textContent     = ikut;
    document.getElementById('kpi-ikut-sub').textContent = totalMaster > ikut ? `dari ${totalMaster} toko` : 'Dialokasi campaign';
    document.getElementById('kpi-total').textContent    = totalMaster;
    document.getElementById('kpi-done').textContent     = done;
    document.getElementById('kpi-notdone').textContent  = notDone;
    document.getElementById('kpi-rate').textContent     = rate + '%';
    document.getElementById('kpi-reminders').textContent = Object.keys(reminderHistory[c.id] || {}).length;

    // ── Health score ────────────────────────────────────────────
    const health = calcHealth(c, ikut, done, rate);
    document.getElementById('kpi-health').textContent = health.score;
    renderHealth(health);

    // ── Progress ring ───────────────────────────────────────────
    const circ   = 314.16;
    const offset = circ - (rate / 100) * circ;
    document.getElementById('progress-ring').setAttribute('stroke-dashoffset', offset);
    document.getElementById('progress-pct').textContent = rate + '%';

    // ── Sub-sections ────────────────────────────────────────────
    renderRegions(currentMasterData);
    renderRecent(currentImportData);
    renderExecutiveSummary(c, ikut, done, rate, notDone);
    renderActionZone(rate, notDone, ikut);

    // ── Nav badge & topbar ──────────────────────────────────────
    const nb = document.getElementById('nav-badge-reminder');
    if (nb) nb.textContent = notDone > 0 ? notDone : '';

    document.getElementById('dash-campaign-info').textContent = c.name;
    document.getElementById('last-sync').innerHTML =
      `<span class="status-dot online"></span>Last sync: ${new Date().toLocaleTimeString('id-ID')}`;

    toast(`Dimuat — ${ikut} toko`);

  } catch (err) {
    console.error(err);
    toast('Gagal load: ' + err.message, 'error');
    document.getElementById('dash-campaign-info').textContent = 'Error';
  }
}


// ── CLEAR DASHBOARD ────────────────────────────────────────────────
function clearDashboard() {
  ['kpi-ikut','kpi-total','kpi-done','kpi-notdone','kpi-rate','kpi-health']
    .forEach(id => document.getElementById(id).textContent = '—');

  document.getElementById('kpi-reminders').textContent = '0';
  document.getElementById('progress-ring').setAttribute('stroke-dashoffset', '314.16');
  document.getElementById('progress-pct').textContent  = '—';
  document.getElementById('region-grid').innerHTML     = '';
  document.getElementById('recent-tbody').innerHTML    = '';
  document.getElementById('recent-count').textContent  = '';
  document.getElementById('dash-campaign-info').textContent = '';

  // V2 extras
  const eh = document.getElementById('exec-headline');
  if (eh) eh.textContent = 'Pilih campaign untuk melihat summary';

  ['exec-what','exec-why','exec-action'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });

  const az = document.getElementById('action-zone-body');
  if (az) az.innerHTML =
    '<div class="empty-state" style="padding:16px 0"><p>Pilih campaign untuk melihat prioritas aksi</p></div>';

  const ab = document.getElementById('action-badge');
  if (ab) ab.textContent = '';
}


// ── HEALTH SCORE ───────────────────────────────────────────────────
function calcHealth(c, total, done, rate) {
  let score = 0;
  const factors = [];

  // 1. Compliance (50%)
  score += rate * HEALTH_WEIGHTS.compliance;
  factors.push({
    label : 'Compliance',
    val   : rate + '%',
    color : rate >= 80 ? 'var(--teal)' : rate >= 50 ? 'var(--gold)' : 'var(--red)',
  });

  // 2. Momentum — submissions in last 7 days (20%)
  const recent = currentImportData.filter(s => {
    try { return Date.now() - new Date(s.timestamp).getTime() < 7 * 864e5; }
    catch { return false; }
  }).length;
  const mom = total > 0 ? Math.min(100, Math.round(recent / total * 200)) : 0;
  score += mom * HEALTH_WEIGHTS.momentum;
  factors.push({
    label : 'Momentum (7d)',
    val   : recent + ' subs',
    color : mom >= 50 ? 'var(--teal)' : 'var(--gold)',
  });

  // 3. Deadline (20%)
  let ds = 80;
  if (c.deadline) {
    const dl  = Math.ceil((new Date(c.deadline) - Date.now()) / 864e5);
    const rem = total - done;
    if      (dl > 7)                    ds = 90;
    else if (dl > 3)                    ds = rem > total * .3 ? 40 : 70;
    else if (dl > 0)                    ds = rem > total * .2 ? 20 : 60;
    else                                ds = rem > 0 ? 10 : 100;
    factors.push({
      label : 'Deadline',
      val   : dl > 0 ? dl + 'd left' : 'Lewat',
      color : dl > 3 ? 'var(--teal)' : 'var(--red)',
    });
  } else {
    factors.push({ label: 'Deadline', val: '—', color: 'var(--muted)' });
  }
  score += ds * HEALTH_WEIGHTS.deadline;

  // 4. Region coverage ≥ 80% (10%)
  const regs = {};
  currentMasterData.forEach(s => {
    if (!regs[s.region]) regs[s.region] = { t: 0, d: 0 };
    regs[s.region].t++;
    if (s.status === STATUS.DONE) regs[s.region].d++;
  });
  const rv   = Object.values(regs);
  const good = rv.filter(r => r.t > 0 && r.d / r.t >= .8).length;
  const cov  = rv.length > 0 ? Math.round(good / rv.length * 100) : 0;
  score += cov * HEALTH_WEIGHTS.coverage;
  factors.push({
    label : 'Region >80%',
    val   : good + '/' + rv.length,
    color : cov >= 60 ? 'var(--teal)' : 'var(--gold)',
  });

  score = Math.round(score);
  const color = score >= 80 ? 'var(--teal)' : score >= 50 ? 'var(--gold)' : 'var(--red)';
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Attention' : 'Critical';
  return { score, color, label, factors };
}

function renderHealth(h) {
  const c   = 2 * Math.PI * 35;
  const off = c - (h.score / 100) * c;
  document.getElementById('health-content').innerHTML =
    `<div class="health-ring">
       <svg viewBox="0 0 90 90">
         <circle cx="45" cy="45" r="35" fill="none" stroke="#E2E8F0" stroke-width="7"/>
         <circle cx="45" cy="45" r="35" fill="none" stroke="${h.color}" stroke-width="7"
           stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
           transform="rotate(-90 45 45)"/>
       </svg>
       <div class="h-text" style="color:${h.color}">${h.score}</div>
     </div>
     <div class="health-details">
       <div style="font-size:13px;font-weight:700;margin-bottom:6px;color:${h.color}">${h.label}</div>
       ${h.factors.map(f =>
         `<div class="health-item">
            <span class="label">${f.label}</span>
            <span class="val" style="color:${f.color}">${f.val}</span>
          </div>`
       ).join('')}
     </div>`;
}


// ── REGION CARDS ───────────────────────────────────────────────────
function renderRegions(stores) {
  const regs = {};
  stores.forEach(s => {
    if (!regs[s.region]) regs[s.region] = { t: 0, d: 0 };
    regs[s.region].t++;
    if (s.status === STATUS.DONE) regs[s.region].d++;
  });

  const grid   = document.getElementById('region-grid');
  const sorted = Object.entries(regs).sort((a, b) => a[0].localeCompare(b[0]));

  if (!sorted.length) {
    grid.innerHTML = '<div style="color:var(--muted)">Tidak ada data</div>';
    return;
  }

  grid.innerHTML = sorted.map(([n, d]) => {
    const p = d.t > 0 ? Math.round(d.d / d.t * 100) : 0;
    return `<div class="region-card">
      <div class="region-name">
        <span>${esc(n)}</span>
        <span style="color:var(--teal);font-weight:800">${p}%</span>
      </div>
      <div class="region-bar"><div class="region-bar-fill" style="width:${p}%"></div></div>
      <div class="region-stats">
        <span style="color:var(--teal)">Done: ${d.d}</span>
        <span style="color:var(--red)">Not: ${d.t - d.d}</span>
        <span>Total: ${d.t}</span>
      </div>
    </div>`;
  }).join('');
}


// ── RECENT SUBMISSIONS ─────────────────────────────────────────────
function renderRecent(subs) {
  const tb = document.getElementById('recent-tbody');
  document.getElementById('recent-count').textContent = subs.length + ' submissions';

  if (!subs.length) {
    tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Belum ada</td></tr>';
    return;
  }

  tb.innerHTML = subs.slice(0, MAX_RECENT_ROWS).map(s =>
    `<tr>
       <td style="font-family:var(--mono);font-size:11px;white-space:nowrap">${esc(s.timestamp)}</td>
       <td><strong>${esc(s.kodeStore)}</strong></td>
       <td>${esc(s.namaStore)}</td>
       <td>${esc(s.region)}</td>
       <td>${s.dokumentasi && s.dokumentasi.startsWith('http')
         ? `<a href="${esc(s.dokumentasi)}" target="_blank">Lihat</a>`
         : '—'}</td>
     </tr>`
  ).join('');
}


// ── EXECUTIVE SUMMARY (V2) ─────────────────────────────────────────
function renderExecutiveSummary(c, ikut, done, rate, notDone) {
  const eh   = document.getElementById('exec-headline');
  const ew   = document.getElementById('exec-what');
  const ewhy = document.getElementById('exec-why');
  const ea   = document.getElementById('exec-action');
  if (!eh) return;

  const color  = rate >= 80 ? 'var(--teal)' : rate >= 50 ? 'var(--gold)' : 'var(--red)';
  const status = rate >= 80 ? 'Excellent — Sesuai Target'
               : rate >= 50 ? 'Attention — Perlu Push'
               :              'Critical — Butuh Tindakan Segera';

  eh.innerHTML = `<span style="color:${color}">${status}</span>`;

  ew.textContent =
    `${done} dari ${ikut} toko sudah submit. ` +
    `Compliance rate ${rate}%. ` +
    `${notDone} toko masih belum upload dokumentasi.`;

  // Deadline analysis
  let whyText = '';
  if (c.deadline) {
    const dl = Math.ceil((new Date(c.deadline) - Date.now()) / 864e5);
    if      (dl < 0)  whyText = `Deadline sudah lewat ${Math.abs(dl)} hari. ${notDone} toko masih outstanding.`;
    else if (dl <= 3) whyText = `Sisa ${dl} hari menuju deadline. Perlu escalation segera.`;
    else              whyText = `${dl} hari menuju deadline ${c.deadline}. ${rate < 80 ? 'Momentum perlu ditingkatkan.' : 'Tracking on target.'}`;
  } else {
    whyText = `Compliance saat ini ${rate}%. ${rate >= 80 ? 'Target 80% tercapai.' : 'Target 80% belum tercapai.'}`;
  }
  ewhy.textContent = whyText;

  ea.textContent = rate >= 80
    ? 'Maintain momentum. Monitor region yang masih di bawah target.'
    : notDone > 20
      ? `Blast reminder ke ${notDone} toko. Prioritaskan region dengan compliance terendah.`
      : `Kirim reminder personal ke ${notDone} toko yang tersisa.`;
}


// ── ACTION ZONE (V2) ───────────────────────────────────────────────
function renderActionZone(rate, notDone, ikut) {
  const az = document.getElementById('action-zone-body');
  const ab = document.getElementById('action-badge');
  if (!az) return;

  const actions = [];

  if (notDone > 0) {
    const priority = notDone > 20 ? 'high' : notDone > 5 ? 'med' : 'low';
    const bg  = priority === 'high' ? 'var(--red-bg)'  : priority === 'med' ? 'var(--gold-bg)' : 'var(--teal-bg)';
    const ico = priority === 'high' ? 'var(--red)'     : priority === 'med' ? 'var(--gold)'    : 'var(--teal)';
    actions.push({
      icon    : '📨', bg, ico,
      title   : `Kirim Reminder ke ${notDone} Toko`,
      desc    : `${notDone} toko belum submit. Buka Auto Reminder untuk blast WA.`,
      priority,
    });
  }

  if (rate < 50) {
    actions.push({
      icon     : '🚨',
      bg       : 'var(--red-bg)', ico: 'var(--red)',
      title    : 'Compliance Kritis — Perlu Eskalasi',
      desc     : `Rate ${rate}% di bawah target 50%. Koordinasi dengan Area Manager.`,
      priority : 'high',
    });
  }

  if (rate >= 80) {
    actions.push({
      icon     : '✅',
      bg       : 'var(--teal-bg)', ico: 'var(--teal)',
      title    : 'Target Tercapai!',
      desc     : `Compliance ${rate}% sudah ≥ 80%. Fokus ke finalisasi toko sisa.`,
      priority : 'low',
    });
  }

  if (notDone > 0) {
    actions.push({
      icon     : '📊',
      bg       : 'var(--blue-bg)', ico: 'var(--blue)',
      title    : 'Export Laporan Excel',
      desc     : 'Download rekap DONE/NOT DONE untuk reporting ke management.',
      priority : 'low',
    });
  }

  if (!actions.length) {
    az.innerHTML = '<div class="empty-state" style="padding:16px 0"><p>Semua terlihat baik! ✅</p></div>';
    if (ab) ab.textContent = '';
    return;
  }

  const urgentCount = actions.filter(a => a.priority === 'high').length;
  if (ab) ab.textContent = urgentCount || '';

  az.innerHTML = actions.map(a =>
    `<div class="action-item">
       <div class="action-item-icon" style="background:${a.bg};color:${a.ico}">${a.icon}</div>
       <div class="action-item-body">
         <div class="action-item-title">
           ${a.title}
           <span class="action-priority ${a.priority}">${
             a.priority === 'high' ? 'URGENT' : a.priority === 'med' ? 'PENTING' : 'INFO'
           }</span>
         </div>
         <div class="action-item-desc">${a.desc}</div>
       </div>
     </div>`
  ).join('');
}


// ── LEADERBOARD REGION (shared — dipakai juga oleh halaman LB) ────
function renderRegionLB(stores) {
  const regs = {};
  stores.forEach(s => {
    if (!regs[s.region]) regs[s.region] = { t: 0, d: 0 };
    regs[s.region].t++;
    if (s.status === STATUS.DONE) regs[s.region].d++;
  });

  const sorted = Object.entries(regs)
    .map(([n, d]) => ({ name: n, ...d, pct: d.t > 0 ? Math.round(d.d / d.t * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);

  // V2: render podium before list
  renderPodium(sorted.slice(0, 3));

  const body = document.getElementById('lb-region-body');
  if (!sorted.length) {
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">Tidak ada data</div>';
    return;
  }

  body.innerHTML = sorted.map((r, i) => {
    const rc = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
    const bc = r.pct >= 80 ? 'var(--teal)' : r.pct >= 50 ? 'var(--gold)' : 'var(--red)';
    return `<div class="lb-row">
      <div class="lb-rank ${rc}">${i + 1}</div>
      <div class="lb-info">
        <div class="lb-name">${esc(r.name)}</div>
        <div class="lb-meta">${r.d}/${r.t} done</div>
      </div>
      <div class="lb-bar-wrap">
        <div class="lb-bar"><div class="lb-bar-fill" style="width:${r.pct}%;background:${bc}"></div></div>
      </div>
      <div class="lb-pct" style="color:${bc}">${r.pct}%</div>
    </div>`;
  }).join('');
}

function renderCityLB(stores) {
  const cities = {};
  stores.forEach(s => {
    const k = (s.city || '?').toUpperCase();
    if (!cities[k]) cities[k] = { t: 0, d: 0 };
    cities[k].t++;
    if (s.status === STATUS.DONE) cities[k].d++;
  });

  const sorted = Object.entries(cities)
    .map(([n, d]) => ({ name: n, ...d, pct: d.t > 0 ? Math.round(d.d / d.t * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, MAX_CITY_LB_ROWS);

  const body = document.getElementById('lb-city-body');
  if (!sorted.length) {
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">Tidak ada data</div>';
    return;
  }

  body.innerHTML = sorted.map((r, i) => {
    const bc = r.pct >= 80 ? 'var(--teal)' : r.pct >= 50 ? 'var(--gold)' : 'var(--red)';
    return `<div class="lb-row">
      <div class="lb-rank normal">${i + 1}</div>
      <div class="lb-info">
        <div class="lb-name">${esc(r.name)}</div>
        <div class="lb-meta">${r.d}/${r.t} toko</div>
      </div>
      <div class="lb-bar-wrap">
        <div class="lb-bar"><div class="lb-bar-fill" style="width:${r.pct}%;background:${bc}"></div></div>
      </div>
      <div class="lb-pct" style="color:${bc}">${r.pct}%</div>
    </div>`;
  }).join('');
}


// ── PODIUM TOP 3 (V2) ──────────────────────────────────────────────
function renderPodium(top3) {
  const el   = document.getElementById('lb-podium');
  const card = document.getElementById('lb-podium-card');
  if (!el || !top3 || !top3.length) { if (card) card.style.display = 'none'; return; }
  if (card) card.style.display = '';

  const medals  = ['🥇', '🥈', '🥉'];
  const classes = ['podium-1', 'podium-2', 'podium-3'];

  // Visual order: 2nd left, 1st centre, 3rd right (classic podium)
  const display = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
      ? [top3[1], top3[0]]
      : top3;

  const realIdx = (vi) => {
    if (top3.length >= 3) return vi === 0 ? 1 : vi === 1 ? 0 : 2;
    return vi;
  };

  el.innerHTML = `<div class="podium-wrap">
    ${display.map((r, vi) => {
      const ri       = realIdx(vi);
      const pctColor = r.pct >= 80 ? 'var(--teal)' : r.pct >= 50 ? 'var(--gold)' : 'var(--red)';
      return `<div class="podium-item">
        <div class="podium-crown">${medals[ri] || ''}</div>
        <div class="podium-name">${esc(r.name)}</div>
        <div class="podium-pct" style="color:${pctColor}">${r.pct}%</div>
        <div class="podium-block ${classes[ri] || 'podium-3'}">${r.d}/${r.t}</div>
      </div>`;
    }).join('')}
  </div>`;
}


// ── AI INSIGHTS ────────────────────────────────────────────────────
function analyzeData(c, stores, subs) {
  const ins   = [];
  const total = stores.length;
  const done  = stores.filter(s => s.status === STATUS.DONE).length;
  const rate  = total > 0 ? Math.round(done / total * 100) : 0;
  const nd    = total - done;

  // Overall compliance
  if      (rate >= 90) ins.push({ type:'positive', icon:'✅', title:`Hampir Selesai! (${rate}%)`,    desc:`Tinggal ${nd} toko. Excellent!` });
  else if (rate <  30) ins.push({ type:'critical',  icon:'🚨', title:`Butuh Perhatian (${rate}%)`,   desc:`${nd}/${total} belum submit. Blast reminder segera.` });
  else if (rate <  60) ins.push({ type:'warning',   icon:'⚠️', title:`Di Bawah Target (${rate}%)`, desc:`Perlu push ${nd} toko lagi.` });

  // Deadline
  if (c.deadline) {
    const dl = Math.ceil((new Date(c.deadline) - Date.now()) / 864e5);
    if      (dl < 0)          ins.push({ type:'critical', icon:'⏰', title:`Deadline Lewat ${Math.abs(dl)} Hari`, desc:`${nd} toko masih belum submit.` });
    else if (dl <= 3 && nd>0) ins.push({ type:'critical', icon:'⏰', title:`${dl} Hari Lagi!`, desc:'Kirim escalation Level 3 sekarang.' });
    else if (dl <= 7 && rate<80) ins.push({ type:'warning', icon:'📅', title:`${dl} Hari ke Deadline`, desc:`Perlu ${Math.ceil(total*.8)-done} toko lagi untuk 80%.` });
  }

  // Region extremes
  const regs = {};
  stores.forEach(s => {
    if (!regs[s.region]) regs[s.region] = { t:0, d:0 };
    regs[s.region].t++;
    if (s.status === STATUS.DONE) regs[s.region].d++;
  });
  const re = Object.entries(regs).sort((a,b) => (a[1].d/a[1].t) - (b[1].d/b[1].t));
  if (re.length > 0) {
    const [wn,wd] = re[0];
    const wp = Math.round(wd.d/wd.t*100);
    if (wp < 50) ins.push({ type:'critical', icon:'📍', title:`${wn} Paling Rendah (${wp}%)`, desc:`${wd.d}/${wd.t} done. Perlu perhatian ekstra.` });
  }
  if (re.length > 0) {
    const [bn,bd] = re[re.length-1];
    const bp = Math.round(bd.d/bd.t*100);
    if (bp >= 90) ins.push({ type:'positive', icon:'🏆', title:`${bn} Best (${bp}%)`, desc:'Bisa jadi benchmark region lain.' });
  }

  // Momentum
  const rec3d = subs.filter(s => { try { return Date.now()-new Date(s.timestamp).getTime() < 3*864e5; } catch { return false; } });
  if (!rec3d.length && nd > 0) ins.push({ type:'warning', icon:'📉', title:'Tidak Ada Submission 3 Hari', desc:'Momentum stop. Kirim reminder.' });

  // Participation
  if (allMasterToko.length > 0) {
    const pct = Math.round(total/allMasterToko.length*100);
    ins.push({ type:'info', icon:'📊', title:`Partisipasi: ${total}/${allMasterToko.length} toko (${pct}%)`, desc:`${allMasterToko.length-total} toko tidak dialokasi campaign ini.` });
  }

  // Reminder conversion
  const rh = reminderHistory[c.id] || {};
  const rc = Object.keys(rh).length;
  if (rc > 0) {
    const nowD = Object.keys(rh).filter(code => stores.find(s => s.plantCode===code && s.status===STATUS.DONE)).length;
    const cv   = Math.round(nowD/rc*100);
    ins.push({ type: cv>50?'positive':'info', icon:'📨', title:`Reminder Conversion: ${cv}%`, desc:`${nowD}/${rc} yang di-remind sudah submit.` });
  }

  return ins;
}

function renderInsights(ins) {
  const ct = document.getElementById('insights-container');
  if (!ins.length) {
    ct.innerHTML = '<div class="insight-card positive"><div class="insight-icon">✅</div><div class="insight-body"><div class="insight-title">Normal</div><div class="insight-desc">Tidak ada temuan.</div></div></div>';
    return;
  }
  ct.innerHTML = ins.map(i =>
    `<div class="insight-card ${i.type}">
       <div class="insight-icon">${i.icon}</div>
       <div class="insight-body">
         <div class="insight-title">${i.title}</div>
         <div class="insight-desc">${i.desc}</div>
       </div>
     </div>`
  ).join('');
}


// ── REFRESH ALL ────────────────────────────────────────────────────
function refreshAllData() {
  const d = document.getElementById('dash-campaign-select').value;
  const s = document.getElementById('store-campaign-select').value;

  // Sync campaign list dulu (pull cloud + push local-only), lalu reload data
  syncCampaignsFromCloud().then(result => {
    if (result === true) {
      // Cloud punya data terbaru → push local-only jika ada (sudah dilakukan di dalam sync)
      // Reload dashboard dengan campaign aktif terbaru
      const latestD = document.getElementById('dash-campaign-select').value;
      const latestS = document.getElementById('store-campaign-select').value;
      if (latestD) loadCampaignData(latestD);
      if (latestS) loadStoreData(latestS);
    } else {
      if (d) loadCampaignData(d);
      if (s) loadStoreData(s);
    }
    if (!d && !s && result !== true) toast('Pilih campaign terlebih dahulu', 'info');
  });
}
