// ERA-VIS — LocalStores Sync via Netlify Blobs
// Menyimpan localStores tiap campaign Excel secara terpisah dari metadata campaign,
// karena Apps Script hanya menyimpan metadata (tidak cukup kapasitas untuk localStores).
//
// GET  ?id=<campaignId>  → ambil localStores untuk satu campaign
// GET  (tanpa id)        → ambil semua {id: localStores[]}
// POST {id, localStores} → simpan localStores
// DELETE ?id=<id>        → hapus localStores

'use strict';

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type'                : 'application/json',
};

// ── Netlify Blobs helper (tanpa npm — pakai REST API internal) ───────
function getBlobsBase() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) return null;
  try {
    const ctx = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    // ctx.url sudah include siteId, misal: https://blobs.netlify.com/{siteId}
    return { baseUrl: ctx.url, token: ctx.token };
  } catch { return null; }
}

async function blobGet(key) {
  const b = getBlobsBase();
  if (!b) return null;
  const res = await fetch(`${b.baseUrl}/localstores/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${b.token}` },
  });
  if (!res.ok) return null;
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function blobPut(key, value) {
  const b = getBlobsBase();
  if (!b) throw new Error('Netlify Blobs tidak tersedia');
  const res = await fetch(`${b.baseUrl}/localstores/${encodeURIComponent(key)}`, {
    method : 'PUT',
    headers: { Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json' },
    body   : JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Blob PUT gagal: ${res.status}`);
}

async function blobDelete(key) {
  const b = getBlobsBase();
  if (!b) return;
  await fetch(`${b.baseUrl}/localstores/${encodeURIComponent(key)}`, {
    method : 'DELETE',
    headers: { Authorization: `Bearer ${b.token}` },
  });
}

async function blobList() {
  const b = getBlobsBase();
  if (!b) return [];
  const res = await fetch(`${b.baseUrl}/localstores`, {
    headers: { Authorization: `Bearer ${b.token}` },
  });
  if (!res.ok) return [];
  try { return await res.json(); } catch { return []; }
}


// ── Handler ──────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  try {
    // ── GET ──────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters?.id;

      if (id) {
        // Ambil satu campaign punya localStores
        const stores = await blobGet(id);
        return {
          statusCode: 200,
          headers   : HEADERS,
          body      : JSON.stringify(stores || []),
        };
      }

      // Ambil semua — return map {campaignId: localStores[]}
      const list = await blobList();
      const result = {};
      if (Array.isArray(list?.blobs)) {
        await Promise.all(list.blobs.map(async (b) => {
          const key = b.key;
          result[key] = await blobGet(key) || [];
        }));
      }
      return {
        statusCode: 200,
        headers   : HEADERS,
        body      : JSON.stringify(result),
      };
    }

    // ── POST ─────────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { id, localStores } = body;
      if (!id || !Array.isArray(localStores)) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id dan localStores wajib ada' }) };
      }
      await blobPut(id, localStores);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, count: localStores.length }) };
    }

    // ── DELETE ────────────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id wajib ada' }) };
      await blobDelete(id);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[ERA-VIS store-sync]', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
