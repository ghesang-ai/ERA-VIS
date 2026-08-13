'use strict';
/**
 * Smoke test yang bisa dijalankan langsung: `node test/fbeConfirmation.smoke.js`
 * Repo ini tidak punya test framework (tidak ada jest/mocha/dll), jadi ini
 * pakai pola smoke-test yang sudah dipakai selama pengembangan fbeImport.js:
 * load context lewat vm (fbeHarness.js), lempar Error kalau assertion
 * gagal (exit code 1), console.log('OK ...') + exit 0 kalau semua lolos.
 *
 * Ini adalah versi tersimpan dari test parseFbeConfirmation (Task 3) —
 * satu baris respons form wide-format dengan 2 pasang kolom Status+Foto
 * (Easel & Poster terisi, Hanging Gate kosong) di-transpose jadi long
 * format, supaya perubahan di parser ini ketahuan regresinya lewat
 * `node test/fbeConfirmation.smoke.js`, bukan cuma lewat command node -e
 * sekali jalan.
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
  ];

  const out = ctx.parseFbeConfirmation(rows);

  assert(out.length === 1, 'seharusnya 1 baris (Hanging Gate tanpa foto tidak masuk), dapat ' + out.length);
  assert(out[0].plantCode === 'E061', 'plantCode: ' + out[0].plantCode);
  assert(out[0].jenisMateri === 'EASEL_POSTER', 'jenisMateri: ' + out[0].jenisMateri);
  assert(out[0].status === 'Terpasang', 'status: ' + out[0].status);
  assert(out[0].linkFoto === 'https://drive.google.com/open?id=ABC123', 'linkFoto: ' + out[0].linkFoto);
  assert(out[0].tanggal === '8/20/2026 10:00:00', 'tanggal: ' + out[0].tanggal);

  console.log('OK parseFbeConfirmation');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
