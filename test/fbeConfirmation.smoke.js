'use strict';
/**
 * Smoke test yang bisa dijalankan langsung: `node test/fbeConfirmation.smoke.js`
 * Repo ini tidak punya test framework (tidak ada jest/mocha/dll), jadi ini
 * pakai pola smoke-test yang sudah dipakai selama pengembangan fbeImport.js:
 * load context lewat vm (fbeHarness.js), lempar Error kalau assertion
 * gagal (exit code 1), console.log('OK ...') + exit 0 kalau semua lolos.
 *
 * Ini adalah versi tersimpan dari test parseFbeConfirmation (Task 3) —
 * dua baris respons form wide-format dengan 2 pasang kolom Status+Foto
 * (toko E061: Easel & Poster "Terpasang" + foto, Hanging Gate kosong;
 * toko E106: Easel & Poster "Belum" + foto tetap diisi) di-transpose
 * jadi long format, supaya perubahan di parser ini ketahuan regresinya
 * lewat `node test/fbeConfirmation.smoke.js`, bukan cuma lewat command
 * node -e sekali jalan. Fixture E106 khusus menutupi cabang ternary
 * "Belum Terpasang" di parseFbeConfirmation (js/fbeImport.js) yang
 * sebelumnya belum pernah diuji.
 */
const { loadFbeContext } = require('./fbeHarness');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const ctx = loadFbeContext();

  const rows = [
    ['Timestamp', 'KODE TOKO', 'NAMA TOKO', 'Status Easel & Poster', 'Foto Easel & Poster', 'Status Hanging Gate', 'Foto Hanging Gate'],
    ['8/20/2026 10:00:00', 'E061', 'ERAFONE 2 MEGA MALL MANADO', 'Terpasang', 'https://drive.google.com/open?id=ABC123', '', ''],
    ['8/20/2026 10:05:00', 'E106', 'ERAFONE TOKO LAIN', 'Belum', 'https://drive.google.com/open?id=DEF456', '', ''],
  ];

  const out = ctx.parseFbeConfirmation(rows);

  const e061 = out.filter(r => r.plantCode === 'E061');
  const e106 = out.filter(r => r.plantCode === 'E106');

  assert(out.length === 2, 'seharusnya 2 baris total (E061 + E106, Hanging Gate tanpa foto tidak masuk), dapat ' + out.length);

  assert(e061.length === 1, 'E061 seharusnya 1 baris, dapat ' + e061.length);
  assert(e061[0].jenisMateri === 'EASEL_POSTER', 'jenisMateri: ' + e061[0].jenisMateri);
  assert(e061[0].status === 'Terpasang', 'status: ' + e061[0].status);
  assert(e061[0].linkFoto === 'https://drive.google.com/open?id=ABC123', 'linkFoto: ' + e061[0].linkFoto);
  assert(e061[0].tanggal === '8/20/2026 10:00:00', 'tanggal: ' + e061[0].tanggal);

  assert(e106.length === 1, 'E106 seharusnya 1 baris, dapat ' + e106.length);
  assert(e106[0].jenisMateri === 'EASEL_POSTER', 'jenisMateri: ' + e106[0].jenisMateri);
  assert(e106[0].status === 'Belum Terpasang', 'status E106 (cabang "Belum"): ' + e106[0].status);
  assert(e106[0].linkFoto === 'https://drive.google.com/open?id=DEF456', 'linkFoto: ' + e106[0].linkFoto);

  // Nice-to-have: pastikan cabang "tanpa foto = skip" tetap eksplisit teruji
  // per-materi (bukan cuma via out.length total), supaya tetap ketahuan
  // kalau ada materi baru ditambahkan tapi cabang skip-nya jadi bocor.
  assert(!out.some(r => r.jenisMateri === 'HANGING_GATE'), 'tidak boleh ada baris HANGING_GATE karena kolom foto-nya kosong di kedua toko');

  console.log('OK parseFbeConfirmation');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
