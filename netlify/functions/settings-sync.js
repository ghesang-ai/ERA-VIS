// ERA-VIS — Settings Sync via Netlify Blobs
//
// Permanent, cross-device storage untuk data Settings yang sebelumnya
// hanya hidup di localStorage (device yang upload doang):
//   - Database Store Leader (key "sldb")
//   - Closed Stores        (key "closedStores")
//
// Konfigurasi Blobs sama seperti store-sync.js (dicoba berurutan):
//   1. connectLambda(event) — kredensial dari event.blobs, tanpa token.
//   2. Auto-config via env NETLIFY_BLOBS_CONTEXT.
//   3. Personal access token (NETLIFY_AUTH_TOKEN + SITE_ID) — fallback.
//
// GET  ?key=<sldb|closedStores> → ambil data tersimpan (null kalau belum ada)
// GET  ?diag=1                  → cek konfigurasi Blobs (debug)
// POST {key, data}              → simpan/replace data (upload ulang = update)
// DELETE ?key=<key>             → hapus data

'use strict';

const { getStore, connectLambda } = require('@netlify/blobs');

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type'                : 'application/json',
};

const STORE_NAME  = 'era-vis-settings';
const ALLOWED_KEYS = ['sldb', 'closedStores'];

const MODES = ['lambda', 'auto', 'token'];

function makeStore(mode, event) {
  if (mode === 'lambda') {
    if (!event || !event.blobs) return null;
    connectLambda(event);
    return getStore({ name: STORE_NAME });
  }
  if (mode === 'auto') {
    if (!process.env.NETLIFY_BLOBS_CONTEXT) return null;
    return getStore({ name: STORE_NAME });
  }
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) return null;
  return getStore({ name: STORE_NAME, siteID, token, consistency: 'strong' });
}

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
      console.warn(`[ERA-VIS settings-sync] mode ${mode} gagal:`, e.message);
    }
  }
  throw lastErr || new Error('Netlify Blobs belum terkonfigurasi');
}

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
      await store.get('__diag__', { type: 'text' });
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
    if (event.httpMethod === 'GET') {
      if (event.queryStringParameters?.diag) {
        const diag = await diagnose(event);
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify(diag) };
      }
      const key = event.queryStringParameters?.key;
      if (!key || !ALLOWED_KEYS.includes(key)) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'key wajib salah satu dari: ' + ALLOWED_KEYS.join(', ') }) };
      }
      const data = await withStore(event, s => s.get(key, { type: 'json' }));
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data ?? null) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { key, data } = body;
      if (!key || !ALLOWED_KEYS.includes(key) || data === undefined) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'key (sldb|closedStores) dan data wajib ada' }) };
      }
      await withStore(event, s => s.setJSON(key, data));
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === 'DELETE') {
      const key = event.queryStringParameters?.key;
      if (!key || !ALLOWED_KEYS.includes(key)) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'key wajib salah satu dari: ' + ALLOWED_KEYS.join(', ') }) };
      }
      await withStore(event, s => s.delete(key));
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[ERA-VIS settings-sync]', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
