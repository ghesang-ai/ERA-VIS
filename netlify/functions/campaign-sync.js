// ERA-VIS — Campaign Sync Proxy (Netlify Function)
// Proxies GET/POST ke Google Apps Script agar tidak terblokir CORS di browser
// Browser tidak bisa POST ke Apps Script dengan Content-Type header (no-cors strip headers),
// sehingga Apps Script tidak bisa parse JSON. Proxy ini mengirim request server-side.

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyEXaVRvtRb2ofZTNA-FVIj8wqjZaIasWbf6UsluEBDbIUolKlMFHLAlWI1Wolc-Ivrng/exec';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const resp = await fetch(APPS_SCRIPT_URL + '?action=get');
      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch { data = []; }
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'POST') {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : event.body,
      });
      // Apps Script doPost mengembalikan text/plain atau JSON
      const text = await resp.text();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, response: text }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
  }
};
