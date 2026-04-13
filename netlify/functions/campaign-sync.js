// ERA-VIS — Campaign Sync via Netlify Blobs
// GET  → baca campaigns dari Blobs
// POST → tulis campaigns ke Blobs

const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'era-vis';
const BLOB_KEY   = 'campaigns';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type'                : 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let store;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    console.error('[ERA-VIS] getStore error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Blobs init gagal: ' + err.message }) };
  }

  try {
    // ── GET: ambil campaign list ───────────────────────────────────
    if (event.httpMethod === 'GET') {
      const raw = await store.get(BLOB_KEY);
      console.log('[ERA-VIS] GET raw:', raw ? raw.slice(0, 100) : 'null');
      let data = [];
      if (raw) {
        try { data = JSON.parse(raw); } catch { data = []; }
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(Array.isArray(data) ? data : []),
      };
    }

    // ── POST: simpan campaign list ─────────────────────────────────
    if (event.httpMethod === 'POST') {
      let campaigns;
      try {
        campaigns = JSON.parse(event.body);
      } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      }
      if (!Array.isArray(campaigns)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body harus array' }) };
      }
      await store.set(BLOB_KEY, JSON.stringify(campaigns));
      console.log('[ERA-VIS] POST saved', campaigns.length, 'campaigns');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, count: campaigns.length }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[ERA-VIS] Blobs error:', err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
  }
};
