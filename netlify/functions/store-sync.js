// ERA-VIS — LocalStores Sync via Netlify Blobs
//
// Konfigurasi Blobs:
//   1. Auto-config — dipakai duluan. Netlify menyuntikkan kredensial deploy
//      (NETLIFY_BLOBS_CONTEXT) ke setiap Function, jadi tidak butuh token apa pun.
//   2. Personal access token (NETLIFY_AUTH_TOKEN + SITE_ID) — hanya dipakai
//      kalau auto-config gagal. Token yang kedaluwarsa TIDAK lagi memblokir
//      auto-config seperti versi sebelumnya.
//
// GET  ?id=<campaignId>  → ambil localStores untuk satu campaign
// GET  ?diag=1           → cek konfigurasi Blobs (untuk debug, tanpa bocorkan token)
// POST {id, localStores} → simpan localStores
// DELETE ?id=<id>        → hapus localStores

'use strict';

const { getStore } = require('@netlify/blobs');

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type'                : 'application/json',
};

const STORE_NAME = 'localstores';

// Bikin store instance. mode 'auto' = kredensial deploy, 'token' = PAT manual.
function makeStore(mode) {
  if (mode === 'token') {
    const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
    const token  = process.env.NETLIFY_AUTH_TOKEN;
    if (!siteID || !token) return null;
    return getStore({ name: STORE_NAME, siteID, token, consistency: 'strong' });
  }
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

// Jalankan operasi Blobs: coba auto-config dulu, kalau error baru pakai token.
// Semua operasi di sini idempotent, jadi retry aman.
async function withStore(fn) {
  let lastErr = null;
  for (const mode of ['auto', 'token']) {
    let store;
    try { store = makeStore(mode); }
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
async function diagnose() {
  const out = {
    hasBlobsContext: Boolean(process.env.NETLIFY_BLOBS_CONTEXT),
    hasSiteId      : Boolean(process.env.SITE_ID || process.env.NETLIFY_SITE_ID),
    hasAuthToken   : Boolean(process.env.NETLIFY_AUTH_TOKEN),
    modes          : {},
  };
  for (const mode of ['auto', 'token']) {
    try {
      const store = makeStore(mode);
      if (!store) { out.modes[mode] = 'skip (env tidak lengkap)'; continue; }
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
        const diag = await diagnose();
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify(diag) };
      }
      const id = event.queryStringParameters?.id;
      if (!id) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id wajib ada' }) };
      }
      const data = await withStore(s => s.get(id, { type: 'json' }));
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
      await withStore(s => s.setJSON(id, localStores));
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, count: localStores.length }) };
    }

    // ── DELETE ────────────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id wajib ada' }) };
      await withStore(s => s.delete(id));
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[ERA-VIS store-sync]', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
