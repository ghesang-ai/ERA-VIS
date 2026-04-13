// ERA-VIS — Campaign Sync via Netlify Blobs
// Menyimpan campaign data di Netlify Blobs (server-side, reliable, no redirect issues)
// GET  → baca dari Blobs
// POST → tulis ke Blobs

const { getStore } = require('@netlify/blobs');

const BLOB_KEY = 'campaigns';

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

  const store = getStore({ name: 'era-vis', consistency: 'strong' });

  try {
    if (event.httpMethod === 'GET') {
      const data = await store.get(BLOB_KEY, { type: 'json' });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(Array.isArray(data) ? data : []),
      };
    }

    if (event.httpMethod === 'POST') {
      let campaigns;
      try {
        campaigns = JSON.parse(event.body);
      } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
      }
      if (!Array.isArray(campaigns)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body harus array' }) };
      }
      await store.setJSON(BLOB_KEY, campaigns);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: campaigns.length }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
  }
};
