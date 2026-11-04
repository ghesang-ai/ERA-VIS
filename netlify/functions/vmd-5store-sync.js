// ERA-VIS — VMD Compliance → "5 Store Mall Performance" sync, via Apps Script proxy
// Netlify Function ini hanya proxy CORS-safe ke Apps Script yang bound ke
// Google Sheet "5 Store Mall Performance" (lihat js/apps-script-vmd-5store-sync.gs
// untuk kode Apps Script + cara deploy-nya).
//
// POST { month: "Oktober", stores: [{code:"E281", score:100}, ...] }
//   → isi kolom bulan tsb di tab "VMD COMPLIANCE" sheet tersebut.
//
// Tidak butuh package npm apapun — gunakan built-in fetch (Node 18)

// ⚠️ Isi URL ini SETELAH deploy js/apps-script-vmd-5store-sync.gs sebagai
// Web App (Deploy → New deployment → Web app → Execute as Me → Anyone).
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwGBcAL_4TcRqhvHK3HWbly6wNpX28HMVddoNgLje90rBZX_dMWV1vnY88zrJfdYosN/exec';

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type'                : 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  if (!APPS_SCRIPT_URL) {
    return {
      statusCode: 501,
      headers   : HEADERS,
      body      : JSON.stringify({
        ok: false,
        error: 'APPS_SCRIPT_URL belum diisi. Deploy js/apps-script-vmd-5store-sync.gs dulu, ' +
               'lalu isi URL /exec-nya di netlify/functions/vmd-5store-sync.js.',
      }),
    };
  }

  try {
    // Apps Script /exec jalanin doPost (tulis datanya) PAS nerima POST ini,
    // lalu redirect (302) ke script.googleusercontent.com/macros/echo buat
    // ambil hasilnya — tapi URL echo itu CUMA terima GET (POST ke situ =
    // 405). Jadi: request pertama ke /exec pakai POST (biar doPost jalan),
    // redirect berikutnya WAJIB pakai GET (cuma ambil JSON hasil, bukan
    // nulis lagi). Kalau ini ikut-ikutan POST, tulisannya tetap sukses
    // (sudah kejadian di request pertama) tapi respons-nya 405 → keliatan
    // gagal padahal datanya sudah masuk.
    let targetUrl = APPS_SCRIPT_URL;
    let method    = 'POST';
    let resp;
    let redirects = 0;

    while (redirects <= 5) {
      resp = await fetch(targetUrl, {
        method  : method,
        headers : method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body    : method === 'POST' ? event.body : undefined,
        redirect: 'manual',
      });

      const location = resp.headers.get('location');
      if ((resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) && location) {
        targetUrl = location;
        method    = 'GET';
        redirects++;
      } else {
        break;
      }
    }

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, error: 'Apps Script balas non-JSON (HTTP ' + resp.status + ')' }; }
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) };

  } catch (err) {
    console.error('[ERA-VIS vmd-5store-sync] Proxy error:', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
