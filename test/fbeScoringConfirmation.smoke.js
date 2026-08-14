'use strict';
/**
 * Smoke test yang bisa dijalankan langsung: `node test/fbeScoringConfirmation.smoke.js`
 *
 * Menguji `parseFbeScoringConfirmation()` — parser untuk form "Scoring
 * Visibility FBE" (1 form gabungan, 6 kolom foto berbeda wajib diisi
 * sekaligus per submission: Easel & Poster, Hanging Mobile, Hanging
 * Gate, POI, Signboard, Spanduk). Header fixture di bawah diambil
 * persis dari struktur form real (lihat screenshot form yang dikirim
 * user): KODE STORE, NAMA STORE, REGION, lalu 6 field "SUBMIT FOTO
 * BAGIAN ...".
 */
const { loadFbeContext } = require('./fbeHarness');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const ctx = loadFbeContext();

  const header = [
    'Timestamp', 'KODE STORE', 'NAMA STORE', 'REGION',
    'SUBMIT FOTO BAGIAN EASEL ATAU POSTER',
    'SUBMIT FOTO BAGIAN HANGING MOBILE',
    'SUBMIT FOTO BAGIAN HANGING GATE',
    'SUBMIT FOTO BAGIAN POI',
    'SUBMIT FOTO BAGIAN SIGNBOARD',
    'SUBMIT FOTO BAGIAN SPANDUK',
  ];

  // Submission lengkap: semua 6 kolom terisi link Drive yang BEDA-BEDA
  // (bukan 1 link yang sama untuk semua materi, beda dari parseFbeSimpleConfirmation).
  const rows = [
    header,
    ['14/08/2026 10:00:00', 'E038', 'Erafone Plaza Atrium', 'REGION 5',
      'https://drive.google.com/open?id=EASEL1',
      'https://drive.google.com/open?id=HM1',
      'https://drive.google.com/open?id=HG1',
      'https://drive.google.com/open?id=POI1',
      'https://drive.google.com/open?id=SIGN1',
      'https://drive.google.com/open?id=SPANDUK1'],
    // Submission sebagian: cuma 3 dari 6 kolom terisi.
    ['14/08/2026 11:00:00', 'E999', 'Erafone Test', 'REGION 1',
      'https://drive.google.com/open?id=EASEL2', '', '',
      'https://drive.google.com/open?id=POI2', '', ''],
  ];

  const out = ctx.parseFbeScoringConfirmation(rows);
  const e038 = out.filter(r => r.plantCode === 'E038');
  const e999 = out.filter(r => r.plantCode === 'E999');

  assert(e038.length === 6, 'E038 seharusnya 6 baris (semua materi terisi), dapat ' + e038.length);
  const byKey = {};
  e038.forEach(r => { byKey[r.jenisMateri] = r; });
  assert(byKey.EASEL_POSTER.linkFoto.includes('EASEL1'), 'EASEL_POSTER linkFoto salah: ' + JSON.stringify(byKey.EASEL_POSTER));
  assert(byKey.HANGING_MOBILE.linkFoto.includes('HM1'), 'HANGING_MOBILE linkFoto salah');
  assert(byKey.HANGING_GATE.linkFoto.includes('HG1'), 'HANGING_GATE linkFoto salah');
  assert(byKey.POI.linkFoto.includes('POI1'), 'POI linkFoto salah');
  assert(byKey.SIGNBOARD.linkFoto.includes('SIGN1'), 'SIGNBOARD linkFoto salah');
  assert(byKey.SPANDUK.linkFoto.includes('SPANDUK1'), 'SPANDUK linkFoto salah');
  assert(byKey.EASEL_POSTER.status === 'Terpasang', 'status harus Terpasang');
  assert(byKey.EASEL_POSTER.tanggal === '14/08/2026 10:00:00', 'tanggal salah');

  assert(e999.length === 2, 'E999 seharusnya cuma 2 baris (kolom kosong dilewati), dapat ' + e999.length);
  const e999Keys = e999.map(r => r.jenisMateri).sort();
  assert(e999Keys.join(',') === 'EASEL_POSTER,POI', 'E999 keys salah: ' + e999Keys.join(','));

  // Header-only harus kosong.
  assert(ctx.parseFbeScoringConfirmation([header]).length === 0, 'header-only harus kosong');

  console.log('OK parseFbeScoringConfirmation');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
