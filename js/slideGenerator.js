/* ================================================================
   ERA-VIS AI v2.0 — slideGenerator.js
   Generate HTML string untuk setiap jenis slide Weekly Report
   ================================================================ */
'use strict';

// ── FORMAT HELPERS ────────────────────────────────────────────────

/**
 * Format tanggal ISO → "19 Apr 2026"
 * @param {string} iso - ISO date string (YYYY-MM-DD atau ISO8601)
 * @returns {string}
 */
function wrFmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

/**
 * Format period dari start/end date → "1 - 31 Maret 2026"
 * @param {string} start - YYYY-MM-DD
 * @param {string} end   - YYYY-MM-DD
 * @returns {string}
 */
function wrFmtPeriod(start, end) {
  if (!start || !end) return '—';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const months = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return s.getDate() + ' \u2013 ' + e.getDate() + ' ' + months[e.getMonth()] + ' ' + e.getFullYear();
  }
  return s.getDate() + ' ' + months[s.getMonth()] + ' \u2013 ' + e.getDate() + ' ' + months[e.getMonth()] + ' ' + e.getFullYear();
}

/**
 * Label periode dari filter value → "April 2026"
 * @param {string} period
 * @returns {string}
 */
function wrFmtFilterPeriod(period) {
  const map = { current: 'April 2026', april_2026: 'April 2026', march_2026: 'Maret 2026' };
  return map[period] || 'April 2026';
}

/**
 * Warna prioritas berdasarkan completion rate
 * @param {number} rate - 0-100
 * @returns {{dot: string, label: string, color: string}}
 */
function wrPriorityMeta(rate) {
  if (rate === 0)       return { dot: '🔴', label: 'KRITIS',  color: '#DC2626' };
  if (rate < 30)        return { dot: '🔴', label: 'URGENT',  color: '#DC2626' };
  if (rate < 60)        return { dot: '🟡', label: 'PERLU FOLLOW UP', color: '#D97706' };
  if (rate < 80)        return { dot: '🟢', label: 'PROGRES BAIK',    color: '#0B8F6C' };
  return                       { dot: '🟢', label: 'HAMPIR SELESAI',   color: '#16A34A' };
}

/**
 * Generate progress bar HTML untuk slide
 * @param {number} pct  - 0-100
 * @param {string} color - hex color
 * @returns {string} HTML
 */
function wrProgressBar(pct, color) {
  const safe = Math.min(100, Math.max(0, pct));
  return `<div style="height:8px;border-radius:4px;background:#E2E8F0;overflow:hidden;margin:4px 0">
    <div style="height:100%;border-radius:4px;width:${safe}%;background:${color};transition:width .4s ease"></div>
  </div>`;
}

/**
 * Generate footer HTML yang konsisten untuk semua slide
 * @param {number} pageNum   - 1-based slide number
 * @param {number} totalPages
 * @param {string} genDate   - formatted date string
 * @returns {string} HTML
 */
function wrSlideFooter(pageNum, totalPages, genDate) {
  return `<div class="wr-slide-footer">
    <span>Generated: ${genDate}</span>
    <span style="color:#94A3B8">|</span>
    <span>ERA-VIS v2.0 AI</span>
    <span style="color:#94A3B8">|</span>
    <span>Halaman ${pageNum} dari ${totalPages}</span>
  </div>`;
}

/**
 * Generate header HTML yang konsisten untuk semua slide
 * @param {string} title       - judul utama slide
 * @param {string} subtitle    - subjudul/periode
 * @param {string} [badgeText] - badge opsional di kanan (e.g. "URGENT")
 * @param {string} [badgeColor]
 * @returns {string} HTML
 */
function wrSlideHeader(title, subtitle, badgeText, badgeColor) {
  const badge = badgeText
    ? `<div style="background:${badgeColor || '#DC2626'};color:#fff;font-size:10px;font-weight:800;
                  padding:3px 10px;border-radius:12px;letter-spacing:.8px;text-transform:uppercase;
                  font-family:ui-monospace,monospace">${badgeText}</div>`
    : '';
  return `<div class="wr-slide-header">
    <div class="wr-slide-header-brand">
      <div class="wr-slide-logo">V</div>
      <div>
        <div class="wr-slide-title">${title}</div>
        <div class="wr-slide-subtitle">${subtitle}</div>
      </div>
    </div>
    ${badge}
  </div>`;
}


// ── SLIDE 1 — OVERVIEW ────────────────────────────────────────────

/**
 * Generate HTML untuk Overview Slide (Slide 1)
 * Menampilkan: stats ringkasan, top urgent campaigns, regional breakdown
 *
 * @param {Object} stats       - SAMPLE_OVERVIEW_STATS
 * @param {Array}  regions     - SAMPLE_REGIONAL_SUMMARY
 * @param {string} period      - filter period string
 * @param {number} pageNum     - 1-based index
 * @param {number} totalPages
 * @returns {string} HTML string
 */
function generateOverviewSlide(stats, regions, period, pageNum, totalPages) {
  const genDate = wrFmtDate(new Date().toISOString());
  const periodLabel = wrFmtFilterPeriod(period);

  // ── Stat cards
  const statCards = [
    {
      label: 'CAMPAIGNS ACTIVE',
      value: stats.total_campaigns_active,
      color: '#2563EB',
      bg:    '#EFF6FF',
      icon:  '📋',
    },
    {
      label: 'COMPLETION RATE',
      value: stats.overall_completion_rate + '%',
      color: stats.overall_completion_rate >= 70 ? '#0B8F6C' : stats.overall_completion_rate >= 40 ? '#D97706' : '#DC2626',
      bg:    stats.overall_completion_rate >= 70 ? '#E6F7F2' : stats.overall_completion_rate >= 40 ? '#FFFBEB' : '#FEF2F2',
      icon:  stats.overall_completion_rate >= 70 ? '✅' : '⚠️',
    },
    {
      label: 'STORES NOT DONE',
      value: stats.total_stores_not_done,
      color: '#DC2626',
      bg:    '#FEF2F2',
      icon:  '❌',
    },
  ];

  const statCardsHtml = statCards.map(c => `
    <div style="background:${c.bg};border:1px solid ${c.color}30;border-radius:12px;padding:16px 18px;
                border-top:3px solid ${c.color};text-align:center;flex:1">
      <div style="font-size:20px;margin-bottom:6px">${c.icon}</div>
      <div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;
                  letter-spacing:.8px;font-family:ui-monospace,monospace;margin-bottom:8px">${c.label}</div>
      <div style="font-size:32px;font-weight:900;color:${c.color};line-height:1;font-family:ui-monospace,monospace">${c.value}</div>
    </div>
  `).join('');

  // ── Top urgent campaigns
  const topUrgent = (stats.top_urgent_campaigns || []).slice(0, 3);
  const urgentHtml = topUrgent.map((c, i) => {
    const meta = wrPriorityMeta(c.completion_rate);
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #F1F5F9">
      <span style="font-size:13px">${meta.dot}</span>
      <span style="font-weight:700;font-size:12px;color:#0F172A;flex:1;letter-spacing:-.2px">${i + 1}. ${c.campaign_name}</span>
      <span style="font-family:ui-monospace,monospace;font-size:11px;color:${meta.color};font-weight:800;
                   background:${meta.color}15;padding:2px 8px;border-radius:6px">${c.completion_rate}%</span>
      <span style="font-size:10px;color:#94A3B8;font-family:ui-monospace,monospace">${c.stores_not_done}/${c.total_stores}</span>
    </div>`;
  }).join('');

  // ── Regional breakdown
  const regHtml = regions.map(r => `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:11px;font-weight:700;color:#334155">${r.region}: ${r.region_name}</span>
        <span style="font-family:ui-monospace,monospace;font-size:12px;font-weight:800;
                     color:${r.completion_rate >= 70 ? '#0B8F6C' : r.completion_rate >= 40 ? '#D97706' : '#DC2626'}">${r.completion_rate}%</span>
      </div>
      ${wrProgressBar(r.completion_rate, r.completion_rate >= 70 ? '#0B8F6C' : r.completion_rate >= 40 ? '#D97706' : '#DC2626')}
      <div style="font-size:9px;color:#94A3B8;font-family:ui-monospace,monospace;margin-top:2px">
        ${r.stores_done} selesai · ${r.stores_not_done} belum · dari ${r.total_stores} toko
      </div>
    </div>
  `).join('');

  return `<div class="wr-slide" data-slide-index="${pageNum - 1}">
    ${wrSlideHeader('ERA-VIS WEEKLY REPORT', 'Periode: ' + periodLabel)}
    <div class="wr-slide-body">

      <!-- Stat cards row -->
      <div style="display:flex;gap:12px;margin-bottom:18px">
        ${statCardsHtml}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- Top urgent campaigns -->
        <div>
          <div class="wr-section-head">🔴 TOP URGENT CAMPAIGNS</div>
          ${urgentHtml || '<p style="font-size:12px;color:#94A3B8;padding:8px 0">Tidak ada campaign urgent</p>'}
        </div>

        <!-- Regional breakdown -->
        <div>
          <div class="wr-section-head">📍 REGIONAL BREAKDOWN</div>
          ${regHtml || '<p style="font-size:12px;color:#94A3B8;padding:8px 0">Data regional tidak tersedia</p>'}
        </div>

      </div>
    </div>
    ${wrSlideFooter(pageNum, totalPages, genDate)}
  </div>`;
}


// ── SLIDE 2-N — CAMPAIGN DETAIL ───────────────────────────────────

/**
 * Generate HTML untuk Campaign Detail Slide
 * Menampilkan: completion status, daftar toko belum submit (dikelompok per area)
 *
 * @param {Object} campaign      - campaign object dari SAMPLE_CAMPAIGNS
 * @param {Array}  storesNotDone - array store objects dari SAMPLE_STORES_NOT_DONE
 * @param {number} pageNum       - 1-based index
 * @param {number} totalPages
 * @returns {string} HTML string
 */
function generateCampaignSlide(campaign, storesNotDone, pageNum, totalPages) {
  const genDate      = wrFmtDate(new Date().toISOString());
  const periodStr    = wrFmtPeriod(campaign.period_start, campaign.period_end);
  const meta         = wrPriorityMeta(campaign.completion_rate);
  const rate         = campaign.completion_rate;
  const barColor     = rate >= 70 ? '#0B8F6C' : rate >= 40 ? '#D97706' : '#DC2626';

  // Kelompokkan toko per area
  const byArea = {};
  storesNotDone.forEach(s => {
    const area = s.area || s.city || 'LAINNYA';
    if (!byArea[area]) byArea[area] = [];
    byArea[area].push(s);
  });

  // Hitung hidden (lebih dari 8 total items)
  const MAX_VISIBLE_TOTAL = 8;
  let visibleCount = 0;
  let hiddenCount  = 0;
  const areaHtmlParts = [];

  const areaKeys = Object.keys(byArea).sort();
  for (const area of areaKeys) {
    const stores = byArea[area];
    const areaStores = [];
    for (const s of stores) {
      if (visibleCount < MAX_VISIBLE_TOTAL) {
        areaStores.push(s);
        visibleCount++;
      } else {
        hiddenCount++;
      }
    }
    if (areaStores.length === 0) {
      hiddenCount += stores.length;
      continue;
    }
    const storeRows = areaStores.map(s => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #F8FAFC">
        <span style="color:#DC2626;font-size:12px;flex-shrink:0">❌</span>
        <span style="font-size:11px;font-weight:600;color:#0F172A;flex:1;letter-spacing:-.2px">${s.store_name}</span>
        <span style="font-size:10px;color:#64748B;font-family:ui-monospace,monospace;text-align:right;white-space:nowrap">${s.city}</span>
        ${s.days_overdue > 7 ? `<span style="font-size:9px;background:#FEF2F2;color:#DC2626;padding:1px 5px;border-radius:4px;font-family:ui-monospace,monospace;font-weight:700">${s.days_overdue}h</span>` : ''}
      </div>
    `).join('');

    areaHtmlParts.push(`
      <div class="wr-section-head" style="margin-top:10px">📍 ${area}</div>
      ${storeRows}
    `);
  }

  const hiddenNote = hiddenCount > 0
    ? `<div style="font-size:11px;color:#64748B;font-style:italic;margin-top:8px;padding:6px 10px;
                   background:#F8FAFC;border-radius:6px;border-left:3px solid #CBD5E1">
         ... dan <strong>${hiddenCount} toko lainnya</strong> belum submit
       </div>`
    : '';

  const actionNote = campaign.stores_not_done > 0
    ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 14px;
                   margin-top:12px;display:flex;align-items:center;gap:8px">
         <span style="font-size:14px">⚠️</span>
         <span style="font-size:11.5px;color:#92400E;font-weight:600">
           ACTION NEEDED: Follow up <strong>${campaign.stores_not_done} toko</strong> via Auto Reminder
         </span>
       </div>`
    : '';

  return `<div class="wr-slide" data-slide-index="${pageNum - 1}">
    ${wrSlideHeader(
      campaign.campaign_name,
      'Periode Campaign: ' + periodStr,
      meta.label,
      meta.color
    )}
    <div class="wr-slide-body">

      <!-- Completion header -->
      <div style="margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;
                       letter-spacing:.5px;font-family:ui-monospace,monospace">Completion Status</span>
          <span style="font-size:22px;font-weight:900;color:${barColor};font-family:ui-monospace,monospace">${rate}%</span>
        </div>
        ${wrProgressBar(rate, barColor)}
        <div style="display:flex;gap:16px;margin-top:8px">
          <div style="background:#E6F7F2;border:1px solid #6EE7B7;border-radius:8px;padding:8px 14px;
                      display:flex;align-items:center;gap:6px">
            <span style="font-size:13px">✅</span>
            <div>
              <div style="font-size:18px;font-weight:900;color:#0B8F6C;line-height:1;font-family:ui-monospace,monospace">${campaign.stores_done}</div>
              <div style="font-size:9px;color:#0B8F6C;font-weight:700;text-transform:uppercase;letter-spacing:.5px">DONE</div>
            </div>
          </div>
          <div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:8px 14px;
                      display:flex;align-items:center;gap:6px">
            <span style="font-size:13px">❌</span>
            <div>
              <div style="font-size:18px;font-weight:900;color:#DC2626;line-height:1;font-family:ui-monospace,monospace">${campaign.stores_not_done}</div>
              <div style="font-size:9px;color:#DC2626;font-weight:700;text-transform:uppercase;letter-spacing:.5px">NOT DONE</div>
            </div>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:8px 14px;
                      display:flex;align-items:center;gap:6px">
            <div>
              <div style="font-size:18px;font-weight:900;color:#334155;line-height:1;font-family:ui-monospace,monospace">${campaign.total_stores}</div>
              <div style="font-size:9px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.5px">TOTAL TOKO</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Store list by area -->
      <div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:4px;text-transform:uppercase;
                  letter-spacing:.5px;font-family:ui-monospace,monospace">Toko Belum Submit</div>
      <div style="columns:2;column-gap:16px;column-fill:balance">
        ${areaHtmlParts.join('')}
      </div>
      ${hiddenNote}
      ${actionNote}
    </div>
    ${wrSlideFooter(pageNum, totalPages, genDate)}
  </div>`;
}


// ── SLIDE — PENUTUP / SUMMARY ─────────────────────────────────────

/**
 * Generate HTML untuk Summary / Closing Slide (slide terakhir)
 *
 * @param {Object} stats
 * @param {string} period
 * @param {number} pageNum
 * @param {number} totalPages
 * @returns {string} HTML string
 */
function generateSummarySlide(stats, period, pageNum, totalPages) {
  const genDate     = wrFmtDate(new Date().toISOString());
  const periodLabel = wrFmtFilterPeriod(period);
  const done        = stats.total_stores - stats.total_stores_not_done;
  const doneRate    = stats.overall_completion_rate;
  const barColor    = doneRate >= 70 ? '#0B8F6C' : doneRate >= 40 ? '#D97706' : '#DC2626';

  return `<div class="wr-slide" data-slide-index="${pageNum - 1}">
    ${wrSlideHeader('RINGKASAN LAPORAN MINGGUAN', 'Periode: ' + periodLabel)}
    <div class="wr-slide-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;height:100%">

      <div style="margin-bottom:20px">
        <div style="font-size:64px;font-weight:900;color:${barColor};font-family:ui-monospace,monospace;line-height:1">${doneRate}%</div>
        <div style="font-size:14px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-top:4px">Overall Completion Rate</div>
        <div style="width:240px;margin:12px auto">
          ${wrProgressBar(doneRate, barColor)}
        </div>
      </div>

      <div style="display:flex;gap:20px;justify-content:center;margin-bottom:24px">
        <div style="text-align:center">
          <div style="font-size:28px;font-weight:900;color:#2563EB;font-family:ui-monospace,monospace">${stats.total_campaigns_active}</div>
          <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Campaigns</div>
        </div>
        <div style="width:1px;background:#E2E8F0"></div>
        <div style="text-align:center">
          <div style="font-size:28px;font-weight:900;color:#0B8F6C;font-family:ui-monospace,monospace">${done}</div>
          <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Toko Done</div>
        </div>
        <div style="width:1px;background:#E2E8F0"></div>
        <div style="text-align:center">
          <div style="font-size:28px;font-weight:900;color:#DC2626;font-family:ui-monospace,monospace">${stats.total_stores_not_done}</div>
          <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Perlu Follow-Up</div>
        </div>
        <div style="width:1px;background:#E2E8F0"></div>
        <div style="text-align:center">
          <div style="font-size:28px;font-weight:900;color:#334155;font-family:ui-monospace,monospace">${stats.total_stores}</div>
          <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Total Toko</div>
        </div>
      </div>

      <div style="background:linear-gradient(135deg,#EFF6FF,#F5F3FF);border:1px solid #BFDBFE;
                  border-radius:12px;padding:16px 24px;max-width:440px">
        <div style="font-size:13px;font-weight:800;color:#1E40AF;margin-bottom:4px">📋 Next Steps</div>
        <div style="font-size:11.5px;color:#1E40AF;line-height:1.7">
          Follow up <strong>${stats.total_stores_not_done} toko</strong> yang belum submit via Auto Reminder.<br>
          Target completion rate <strong>≥ 90%</strong> sebelum akhir periode.
        </div>
      </div>

    </div>
    ${wrSlideFooter(pageNum, totalPages, genDate)}
  </div>`;
}
