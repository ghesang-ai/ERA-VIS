// ERA-VIS — Campaign Sync via Google Apps Script proxy
// Netlify Function ini hanya sebagai proxy CORS-safe ke Google Apps Script
// GET  → ambil campaigns dari Apps Script
// POST → simpan campaigns ke Apps Script
//
// Tidak butuh package npm apapun — gunakan built-in fetch (Node 18)

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyEXaVRvtRb2ofZTNA-FVIj8wqjZaIasWbf6UsluEBDbIUolKlMFHLAlWI1Wolc-Ivrng/exec';

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type'                : 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  try {
    // ── GET: ambil campaigns dari Apps Script ─────────────────────
    if (event.httpMethod === 'GET') {
      const resp = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch { data = []; }
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify(Array.isArray(data) ? data : []),
      };
    }

    // ── POST: simpan campaigns ke Apps Script ──────────────────────
    // Apps Script /exec redirect POST → harus follow redirect manual agar
    // tetap pakai method POST (bukan GET seperti default fetch redirect)
    if (event.httpMethod === 'POST') {
      let targetUrl = APPS_SCRIPT_URL;
      let resp;
      let redirects = 0;

      while (redirects <= 5) {
        resp = await fetch(targetUrl, {
          method  : 'POST',
          headers : { 'Content-Type': 'application/json' },
          body    : event.body,
          redirect: 'manual',
        });

        const location = resp.headers.get('location');
        if ((resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) && location) {
          targetUrl = location;
          redirects++;
        } else {
          break;
        }
      }

      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { ok: true }; }
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify(data),
      };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[ERA-VIS] Proxy error:', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
