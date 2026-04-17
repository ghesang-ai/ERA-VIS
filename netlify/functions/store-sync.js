// ERA-VIS — LocalStores Sync via Netlify Blobs
// Menyimpan localStores tiap campaign Excel secara terpisah dari metadata campaign,
// karena Apps Script tidak bisa menyimpan localStores (size limit).
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

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  try {
    const store = getStore({ name: 'localstores', consistency: 'strong' });

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
