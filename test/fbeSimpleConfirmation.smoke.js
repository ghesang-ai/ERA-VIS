'use strict';
/**
 * Smoke test yang bisa dijalankan langsung: `node test/fbeSimpleConfirmation.smoke.js`
 *
 * Ini menguji `parseFbeSimpleConfirmation()` — parser untuk realita
 * lapangan (5 Google Form/sheet konfirmasi terpisah per grup materi,
 * bentuk sederhana Timestamp|Kode Store|Nama Store|Region|Submit
 * Dokumentasi, tanpa kolom Status terpisah). Fixture-nya diambil
 * persis dari data real sheet respons "Easel & Poster" dan "Hanging
 * Mobile" yang sudah aktif dipakai Store Leader di produksi.
 */
const { loadFbeContext } = require('./fbeHarness');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const ctx = loadFbeContext();

  // Fixture nyata dari sheet respons "Easel & Poster" (1 materi = 1 key).
  const easelRows = [
    ['Timestamp', 'KODE STORE', 'NAMA STORE', 'REGION', 'SUBMIT DOKUMENTTASI '],
    ['14/08/2026 14:18:55', 'E073', 'Erafone 2 supermall', 'REGION 4', 'https://drive.google.com/open?id=1YvlV_loQ8LetIHCwTDcJ1nJZ7ljQuYUH'],
    ['14/08/2026 14:23:06', 'E221', 'Erafone & More Mall Citraraya Tangerang', 'REGION 5', 'https://drive.google.com/open?id=1Je9CWlTjDovvccf6CQ530Ar1bTW3TVoQ'],
  ];
  const easelOut = ctx.parseFbeSimpleConfirmation(easelRows, ['EASEL_POSTER']);
  assert(easelOut.length === 2, 'Easel & Poster seharusnya 2 baris, dapat ' + easelOut.length);
  assert(easelOut[0].plantCode === 'E073', 'plantCode: ' + easelOut[0].plantCode);
  assert(easelOut[0].jenisMateri === 'EASEL_POSTER', 'jenisMateri: ' + easelOut[0].jenisMateri);
  assert(easelOut[0].status === 'Terpasang', 'status: ' + easelOut[0].status);
  assert(easelOut[0].linkFoto === 'https://drive.google.com/open?id=1YvlV_loQ8LetIHCwTDcJ1nJZ7ljQuYUH', 'linkFoto: ' + easelOut[0].linkFoto);
  assert(easelOut[0].tanggal === '14/08/2026 14:18:55', 'tanggal: ' + easelOut[0].tanggal);

  // Fixture nyata dari sheet respons "Hanging Mobile" (gabungan Desain 1 & 2
  // — 1 baris sumber harus fan-out jadi 2 baris konfirmasi, satu per key).
  const hmRows = [
    ['Timestamp', 'KODE STORE', 'NAMA STORE', 'REGION ', 'SUBMIT DOKUMENTASI'],
    ['14/08/2026 14:19:47', 'E073', 'Erafone 2 supermall', 'REGION 4', 'https://drive.google.com/open?id=1R-RsVjkiml59UsQNXMRQeBM0eTJns0KU'],
  ];
  const hmOut = ctx.parseFbeSimpleConfirmation(hmRows, ['HANGING_MOBILE_1', 'HANGING_MOBILE_2']);
  assert(hmOut.length === 2, 'Hanging Mobile seharusnya fan-out jadi 2 baris, dapat ' + hmOut.length);
  assert(hmOut[0].jenisMateri === 'HANGING_MOBILE_1', 'key pertama: ' + hmOut[0].jenisMateri);
  assert(hmOut[1].jenisMateri === 'HANGING_MOBILE_2', 'key kedua: ' + hmOut[1].jenisMateri);
  assert(hmOut[0].linkFoto === hmOut[1].linkFoto, 'linkFoto harus sama untuk kedua key (1 submission)');
  assert(hmOut[0].plantCode === 'E073' && hmOut[1].plantCode === 'E073', 'plantCode harus sama untuk kedua baris fan-out');

  // Baris tanpa link foto harus dilewati (belum terkonfirmasi).
  const emptyRows = [
    ['Timestamp', 'KODE STORE', 'NAMA STORE', 'REGION', 'SUBMIT DOKUMENTASI'],
    ['14/08/2026 14:51:43', 'E949', 'Erafone Platina', 'REGION 2', ''],
  ];
  const emptyOut = ctx.parseFbeSimpleConfirmation(emptyRows, ['HANGING_GATE']);
  assert(emptyOut.length === 0, 'baris tanpa foto seharusnya dilewati, dapat ' + emptyOut.length);

  // Header row saja (tidak ada baris data) harus mengembalikan array kosong.
  const headerOnly = [['Timestamp', 'KODE STORE', 'NAMA STORE', 'REGION', 'SUBMIT DOKUMENTASI']];
  assert(ctx.parseFbeSimpleConfirmation(headerOnly, ['STICKER_KACA']).length === 0, 'header-only harus kosong');

  console.log('OK parseFbeSimpleConfirmation');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
