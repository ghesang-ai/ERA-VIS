/* ================================================================
   ERA-VIS AI v2.0 — cache.js
   Cache hasil AI per KPI hash, TTL 1 jam.
   Prinsip: data sama = reuse, 0 token tambahan.
   ================================================================ */

'use strict';

const CACHE_KEY  = 'eravis_ai_cache';
const DEFAULT_TTL = 3_600_000; // 1 jam dalam ms

// ── HASH HELPER ────────────────────────────────────────────────────
/**
 * Simple deterministic hash dari KPI summary object.
 * Bukan kriptografi — hanya untuk fingerprint data.
 * @param {object} kpiObj
 * @returns {string} hex pendek 8 karakter
 */
function hashKpi(kpiObj) {
  const str = JSON.stringify(kpiObj, Object.keys(kpiObj).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── CACHE API ──────────────────────────────────────────────────────
const eravisCache = {

  /**
   * Ambil entry cache jika masih valid.
   * @param {string} hash
   * @returns {object|null} entry atau null jika miss/expired
   */
  get(hash) {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const entry = store[hash];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(hash);
      return null;
    }
    return entry;
  },

  /**
   * Simpan hasil AI ke cache.
   * @param {string} hash      - dari hashKpi()
   * @param {string} insight   - teks response AI
   * @param {number} tokensUsed - total token (input + output)
   */
  set(hash, insight, tokensUsed) {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    store[hash] = {
      insight,
      timestamp : Date.now(),
      ttl       : DEFAULT_TTL,
      tokens_used: tokensUsed,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  },

  /** Hapus satu entry. */
  delete(hash) {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    delete store[hash];
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  },

  /** Hapus semua entry yang sudah expired. @returns {number} jumlah dihapus */
  clearExpired() {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const now   = Date.now();
    let removed = 0;
    for (const [hash, entry] of Object.entries(store)) {
      if (now - entry.timestamp > entry.ttl) {
        delete store[hash];
        removed++;
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
    return removed;
  },

  /** Hapus seluruh cache. */
  clearAll() {
    localStorage.removeItem(CACHE_KEY);
  },

  /**
   * Statistik cache saat ini.
   * @returns {{ valid, expired, totalTokensSaved, total, entries }}
   */
  stats() {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const now   = Date.now();
    let valid = 0, expired = 0, totalTokensSaved = 0;
    const entries = [];

    for (const [hash, entry] of Object.entries(store)) {
      const isValid = (now - entry.timestamp) < entry.ttl;
      if (isValid) {
        valid++;
        totalTokensSaved += entry.tokens_used || 0;
        entries.push({
          hash     : hash.slice(0, 8),
          ttlRemain: Math.round((entry.ttl - (now - entry.timestamp)) / 60000), // menit
          tokens   : entry.tokens_used || 0,
          preview  : (entry.insight || '').slice(0, 60) + '…',
        });
      } else {
        expired++;
      }
    }
    return { valid, expired, totalTokensSaved, total: valid + expired, entries };
  },

  /**
   * Perpanjang TTL semua entry valid +1 jam.
   * @returns {number} jumlah entry yang diperpanjang
   */
  extendTtl() {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const now   = Date.now();
    let count   = 0;
    for (const [, entry] of Object.entries(store)) {
      if (now - entry.timestamp < entry.ttl) {
        entry.ttl += DEFAULT_TTL;
        count++;
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
    return count;
  },
};
