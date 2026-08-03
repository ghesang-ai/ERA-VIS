// ERA-VIS — LocalStores Sync via Netlify Blobs
//
// Konfigurasi Blobs (dicoba berurutan, yang pertama berhasil dipakai):
//   1. connectLambda(event) — WAJIB untuk function format lama (exports.handler).
//      Netlify menaruh kredensial deploy di event.blobs, bukan di env var, jadi
//      tanpa panggilan ini getStore() error "environment has not been configured".
//      Tidak butuh token sama sekali.
//   2. Auto-config via env NETLIFY_BLOBS_CONTEXT (function format baru).
//   3. Personal access token (NETLIFY_AUTH_TOKEN + SITE_ID) — fallback terakhir.
//      Token kedaluwarsa TIDAK memblokir dua mode di atas.
//
// GET  ?id=<campaignId>  → ambil localStores untuk satu campaign
// GET  ?diag=1           → cek konfigurasi Blobs (untuk debug, tanpa bocorkan token)
// POST {id, localStores} → simpan localStores
// DELETE ?id=<id>        → hapus localStores

'use strict';

const { getStore, connectLambda } = require('@netlify/blobs');

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type'                : 'application/json',
};

const STORE_NAME = 'localstores';

const MODES = ['lambda', 'auto', 'token'];

// Bikin store instance untuk satu mode. Return null kalau mode tidak tersedia.
//
// Catatan konsistensi: connectLambda() hanya menyediakan edgeURL (tanpa
// uncachedEdgeURL), jadi consistency 'strong' akan error di mode lambda —
// pakai default (eventual). Cukup untuk data toko: tulis lalu baca dari
// device lain jaraknya jauh lebih lama dari lag replikasi.
function makeStore(mode, event) {
  if (mode === 'lambda') {
    if (!event || !event.blobs) return null;
    connectLambda(event);              // ambil kredensial dari event.blobs
    return getStore({ name: STORE_NAME });
  }
  if (mode === 'auto') {
    if (!process.env.NETLIFY_BLOBS_CONTEXT) return null;
    return getStore({ name: STORE_NAME, consistency: 'strong' });
  }
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) return null;
  return getStore({ name: STORE_NAME, siteID, token, consistency: 'strong' });
}

// Jalankan operasi Blobs: coba tiap mode sampai ada yang berhasil.
// Semua operasi di sini idempotent, jadi retry aman.
async function withStore(event, fn) {
  let lastErr = null;
  for (const mode of MODES) {
    let store;
    try { store = makeStore(mode, event); }
    catch (e) { lastErr = e; continue; }
    if (!store) continue;
    try { return await fn(store); }
    catch (e) {
      lastErr = e;
      console.warn(`[ERA-VIS store-sync] mode ${mode} gagal:`, e.message);
    }
  }
  throw lastErr || new Error('Netlify Blobs belum terkonfigurasi');
}

// Diagnosa konfigurasi — dipakai untuk cek cepat kenapa sync gagal.
async function diagnose(event) {
  const out = {
    hasEventBlobs  : Boolean(event && event.blobs),
    hasBlobsContext: Boolean(process.env.NETLIFY_BLOBS_CONTEXT),
    hasSiteId      : Boolean(process.env.SITE_ID || process.env.NETLIFY_SITE_ID),
    hasAuthToken   : Boolean(process.env.NETLIFY_AUTH_TOKEN),
    modes          : {},
  };
  for (const mode of MODES) {
    try {
      const store = makeStore(mode, event);
      if (!store) { out.modes[mode] = 'skip (kredensial tidak tersedia)'; continue; }
      await store.get('__diag__', { type: 'text' });   // null kalau belum ada = OK
      out.modes[mode] = 'ok';
    } catch (e) {
      out.modes[mode] = 'error: ' + e.message;
    }
  }
  out.ok = Object.values(out.modes).includes('ok');
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  try {
    // ── GET ──────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      if (event.queryStringParameters?.diag) {
        const diag = await diagnose(event);
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify(diag) };
      }
      const id = event.queryStringParameters?.id;
      if (!id) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id wajib ada' }) };
      }
      const data = await withStore(event, s => s.get(id, { type: 'json' }));
      return {
        statusCode: 200,
        headers   : HEADERS,
        body      : JSON.stringify(data || []),
      };
    }

    // ── POST ─────────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { id, localStores } = body;
      if (!id || !Array.isArray(localStores)) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id dan localStores wajib ada' }) };
      }
      await withStore(event, s => s.setJSON(id, localStores));
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, count: localStores.length }) };
    }

    // ── DELETE ────────────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id wajib ada' }) };
      await withStore(event, s => s.delete(id));
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[ERA-VIS store-sync]', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
