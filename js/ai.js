/* ================================================================
   ERA-VIS AI v2.0 — ai.js
   Gated AI call — hanya dipanggil saat user eksplisit minta insight.
   Prinsip: kirim KPI summary saja (<500 token), max output 400 token.
   Depends on: cache.js, config.js
   ================================================================ */

'use strict';

// ── CONSTANTS ──────────────────────────────────────────────────────
const AI_MODEL      = 'claude-haiku-4-5-20251001';  // Haiku = paling hemat
const AI_MAX_TOKENS = 400;                           // JANGAN naikkan
const AI_SYSTEM     = 'Kamu adalah analis visibilitas retail. Berikan insight singkat dalam Bahasa Indonesia. Maksimal 3 poin bernomor. Fokus pada tindakan konkret yang bisa dilakukan minggu ini.';

// ── BUILD MINIMAL PROMPT ────────────────────────────────────────────
/**
 * Ambil hanya KPI summary dari currentMasterData.
 * TIDAK kirim raw data store — hanya agregat.
 * @param {object[]} masterData  - dari parseMaster()
 * @param {object}   campaign    - object kampanye aktif
 * @returns {object} kpiSummary  - siap di-JSON.stringify ke API
 */
function buildKpiSummary(masterData, campaign) {
  const total = masterData.length;
  const done  = masterData.filter(s => s.status === STATUS.DONE).length;
  const rate  = total > 0 ? Math.round(done / total * 1000) / 10 : 0;

  const flag  = rate >= 80 ? 'green' : rate >= 60 ? 'yellow' : 'red';

  // Bottom 3: NOT DONE, ambil nama saja (max 3)
  const bottom = masterData
    .filter(s => s.status !== STATUS.DONE)
    .slice(0, 3)
    .map(s => s.plantDesc || s.plantCode);

  // Top 3: DONE dengan dokumentasi, ambil nama saja
  const top = masterData
    .filter(s => s.status === STATUS.DONE && s.dokumentasi)
    .slice(0, 3)
    .map(s => s.plantDesc || s.plantCode);

  // Period dari deadline kampanye atau now
  const period = (campaign.deadline || new Date().toISOString()).slice(0, 7);

  return {
    campaign        : campaign.name,
    period,
    compliance_rate : rate,
    trend_pct       : null,   // isi dari data historis jika tersedia
    flag,
    total_stores    : total,
    red_stores_count: masterData.filter(s => s.status !== STATUS.DONE).length,
    bottom_stores   : bottom,
    top_stores      : top,
  };
}

// ── GATED AI CALL ───────────────────────────────────────────────────
/**
 * Panggil Claude via Netlify Function proxy (API key aman di server).
 * Cek cache dulu — skip API jika data sama sudah di-cache.
 *
 * @param {object} kpiSummary   - dari buildKpiSummary()
 * @returns {Promise<{insight: string, tokensUsed: number, fromCache: boolean}>}
 */
async function callAiInsight(kpiSummary) {
  // 1. Hash KPI — cek cache
  const hash   = hashKpi(kpiSummary);
  const cached = eravisCache.get(hash);

  if (cached) {
    return { insight: cached.insight, tokensUsed: 0, fromCache: true, hash };
  }

  // 2. Panggil via Netlify proxy (API key tersimpan di server)
  const res = await fetch('/.netlify/functions/ai-proxy', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model      : AI_MODEL,
      max_tokens : AI_MAX_TOKENS,
      system     : AI_SYSTEM,
      messages   : [{ role: 'user', content: JSON.stringify(kpiSummary) }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data       = await res.json();
  const insight    = data.content?.[0]?.text || '';
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  // 3. Simpan ke cache
  eravisCache.set(hash, insight, tokensUsed);

  return { insight, tokensUsed, fromCache: false, hash };
}
