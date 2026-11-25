// ERA-REVISUAL — Wall Branding submission backend (Netlify Blobs)
//
// Dipakai oleh form HP  /revisual/submit  dan halaman ERA-VIS
// "REVISUAL → Wall Branding".
//
// GET  ?check=<plantCode>   → cek toko (dari DB Store Leader di settings-sync)
//                             + submission lama kalau ada (buat edit/timpa)
// GET  ?list=1              → semua submission (tanpa data foto)
// GET  ?photo=<key>         → file foto (image/jpeg)
// POST {action:'photo', code, data}          → simpan 1 foto (dataURL jpeg) → {key}
// POST {action:'submit', code, nama, hp, walls:[{w,h,photos:{slot:key}}]}
//                                             → simpan/timpa submission → {ticket}
// POST {action:'review', code, status, note} → admin: tandai revisi / OK
//
// Foto di-upload SATU PER SATU (bukan sekaligus di submit) supaya tiap
// request jauh di bawah limit body Netlify Functions (6 MB).
// Submit ulang dengan Plant Code sama = data lama ditimpa; foto lama
// yang tidak dipakai lagi dihapus.

'use strict';

const { getStore, connectLambda } = require('@netlify/blobs');

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type'                : 'application/json',
};

const STORE_NAME    = 'era-revisual';
const SETTINGS_NAME = 'era-vis-settings';   // sldb ada di sini (lihat settings-sync.js)
const MODES = ['lambda', 'auto', 'token'];

const SLOTS      = ['depan', 'meteran', 'kiri', 'kanan', 'sekitar'];
const REQUIRED   = ['depan', 'meteran'];
const MAX_WALLS  = 10;
const TYPES      = ['kasir', 'custom-150x190', 'custom-200x155', 'lightbox', 'poster-table'];
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function makeStore(mode, event, name) {
  if (mode === 'lambda') {
    if (!event || !event.blobs) return null;
    connectLambda(event);
    return getStore({ name });
  }
  if (mode === 'auto') {
    if (!process.env.NETLIFY_BLOBS_CONTEXT) return null;
    return getStore({ name });
  }
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) return null;
  return getStore({ name, siteID, token, consistency: 'strong' });
}

async function withStore(event, name, fn) {
  let lastErr = null;
  for (const mode of MODES) {
    let store;
    try { store = makeStore(mode, event, name); }
    catch (e) { lastErr = e; continue; }
    if (!store) continue;
    try { return await fn(store); }
    catch (e) {
      lastErr = e;
      console.warn(`[ERA-REVISUAL] mode ${mode} gagal:`, e.message);
    }
  }
  throw lastErr || new Error('Netlify Blobs belum terkonfigurasi');
}

const json = (code, body) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(body) });
const normCode = c => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const clean = (s, n) => String(s || '').trim().slice(0, n);

async function lookupStore(event, code) {
  const sldb = await withStore(event, SETTINGS_NAME, s => s.get('sldb', { type: 'json' }));
  const rec = sldb && sldb[code];
  if (!rec) return null;
  return { code, storeName: rec.storeName || '', slName: rec.name || '' };
}

function newTicket(code) {
  const n = Math.floor(100 + Math.random() * 900);
  return `RV-${code.slice(-4)}-${n}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  const q = event.queryStringParameters || {};

  try {
    if (event.httpMethod === 'GET') {
      if (q.photo) {
        const key = String(q.photo);
        if (!key.startsWith('photo/')) return json(400, { error: 'key foto tidak valid' });
        const buf = await withStore(event, STORE_NAME, s => s.get(key, { type: 'arrayBuffer' }));
        if (!buf) return json(404, { error: 'foto tidak ditemukan' });
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
          body: Buffer.from(buf).toString('base64'),
          isBase64Encoded: true,
        };
      }

      if (q.check) {
        const code = normCode(q.check);
        if (!code) return json(400, { error: 'Plant Code wajib diisi' });
        const store = await lookupStore(event, code);
        if (!store) return json(404, { error: `Plant Code ${code} tidak ditemukan di database toko Region 5` });
        const existing = await withStore(event, STORE_NAME, s => s.get(`sub/${code}`, { type: 'json' }));
        return json(200, { ok: true, store, existing: existing || null });
      }

      if (q.list) {
        const items = await withStore(event, STORE_NAME, async s => {
          const { blobs } = await s.list({ prefix: 'sub/' });
          const out = await Promise.all(blobs.map(b => s.get(b.key, { type: 'json' })));
          return out.filter(Boolean);
        });
        return json(200, { ok: true, items });
      }

      return json(400, { error: 'parameter tidak dikenal' });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'method tidak didukung' });

    const body = JSON.parse(event.body || '{}');
    const code = normCode(body.code);
    if (!code) return json(400, { error: 'Plant Code wajib diisi' });

    if (body.action === 'photo') {
      const m = /^data:image\/jpeg;base64,(.+)$/.exec(String(body.data || ''));
      if (!m) return json(400, { error: 'format foto harus JPEG' });
      const buf = Buffer.from(m[1], 'base64');
      if (buf.length > MAX_PHOTO_BYTES) return json(413, { error: 'foto terlalu besar' });
      const key = `photo/${code}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await withStore(event, STORE_NAME, s => s.set(key, buf));
      return json(200, { ok: true, key });
    }

    if (body.action === 'submit') {
      const store = await lookupStore(event, code);
      if (!store) return json(404, { error: `Plant Code ${code} tidak ditemukan` });

      const nama = clean(body.nama, 80);
      const hp   = clean(body.hp, 20).replace(/[^0-9+]/g, '');
      if (!nama || hp.length < 9) return json(400, { error: 'Nama & No. HP wajib diisi dengan benar' });

      const wallsIn = Array.isArray(body.walls) ? body.walls.slice(0, MAX_WALLS) : [];
      if (!wallsIn.length) return json(400, { error: 'Minimal 1 wall' });
      const walls = [];
      for (const [i, w] of wallsIn.entries()) {
        const W = Number(w.w), H = Number(w.h);
        if (!(W > 0 && W <= 2000 && H > 0 && H <= 2000)) return json(400, { error: `Ukuran wall #${i + 1} belum benar` });
        const photos = {};
        for (const slot of SLOTS) {
          const k = w.photos && w.photos[slot];
          if (k && String(k).startsWith(`photo/${code}/`)) photos[slot] = String(k);
        }
        for (const r of REQUIRED) if (!photos[r]) return json(400, { error: `Foto ${r} wall #${i + 1} wajib diisi` });
        const type = TYPES.includes(w.type) ? w.type : '';
        if (!type) return json(400, { error: `Pilih jenis wall #${i + 1}` });
        walls.push({ type, w: Math.round(W), h: Math.round(H), photos });
      }

      const result = await withStore(event, STORE_NAME, async s => {
        const prev = await s.get(`sub/${code}`, { type: 'json' });
        const now = new Date().toISOString();
        const rec = {
          code, storeName: store.storeName, slName: store.slName,
          nama, hp, category: 'Wall Branding · Upgrade Terus', walls,
          ticket: prev?.ticket || newTicket(code),
          version: (prev?.version || 0) + 1,
          firstSubmittedAt: prev?.firstSubmittedAt || now,
          submittedAt: now,
          status: 'SUBMIT', note: '',
        };
        await s.setJSON(`sub/${code}`, rec);
        // Hapus foto lama yang sudah tidak dipakai (data lama "ditimpa")
        const used = new Set(walls.flatMap(w => Object.values(w.photos)));
        const { blobs } = await s.list({ prefix: `photo/${code}/` });
        const startedAt = Date.parse(body.startedAt || '') || 0;
        await Promise.all(blobs
          .filter(b => !used.has(b.key))
          // jangan hapus foto yang baru di-upload di sesi lain yang sedang jalan
          .filter(b => { const t = Number(b.key.split('/')[2].split('-')[0]); return !startedAt || t < startedAt; })
          .map(b => s.delete(b.key)));
        return rec;
      });
      return json(200, { ok: true, ticket: result.ticket, version: result.version });
    }

    if (body.action === 'review') {
      const status = body.status === 'REVISI' ? 'REVISI' : 'SUBMIT';
      const rec = await withStore(event, STORE_NAME, async s => {
        const prev = await s.get(`sub/${code}`, { type: 'json' });
        if (!prev) return null;
        const next = { ...prev, status, note: status === 'REVISI' ? clean(body.note, 200) : '', reviewedAt: new Date().toISOString() };
        await s.setJSON(`sub/${code}`, next);
        return next;
      });
      if (!rec) return json(404, { error: 'submission tidak ditemukan' });
      return json(200, { ok: true });
    }

    return json(400, { error: 'action tidak dikenal' });
  } catch (e) {
    console.error('[ERA-REVISUAL]', e);
    return json(500, { error: e.message || 'server error' });
  }
};
