// ERA-VIS — LocalStores Sync via Netlify Blobs
// Memerlukan env var NETLIFY_AUTH_TOKEN (personal access token) di Netlify site settings.
// SITE_ID otomatis tersedia di Netlify Functions.
//
// GET  ?id=<campaignId>  → ambil localStores untuk satu campaign
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

function getConfiguredStore() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    // Manual config via personal access token (production fallback)
    return getStore({ name: 'localstores', siteID, token });
  }
  // Coba auto-config (akan berhasil jika NETLIFY_BLOBS_CONTEXT tersedia)
  return getStore({ name: 'localstores', consistency: 'strong' });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  try {
    const store = getConfiguredStore();

    // ── GET ──────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id wajib ada' }) };
      }
      const data = await store.get(id, { type: 'json' });
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
      await store.setJSON(id, localStores);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, count: localStores.length }) };
    }

    // ── DELETE ────────────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id wajib ada' }) };
      await store.delete(id);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[ERA-VIS store-sync]', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
