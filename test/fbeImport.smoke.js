'use strict';
/**
 * Smoke test yang bisa dijalankan langsung: `node test/fbeImport.smoke.js`
 * Repo ini tidak punya test framework (tidak ada jest/mocha/dll), jadi ini
 * pakai pola smoke-test yang sudah dipakai selama pengembangan fbeImport.js:
 * load context lewat vm (fbeHarness.js), lempar Error kalau assertion
 * gagal (exit code 1), console.log('OK ...') + exit 0 kalau semua lolos.
 *
 * Ini adalah versi tersimpan dari test parseFbeStickerKacaFile paling kaya
 * assertion-nya (fixture E173/E005), supaya perubahan di _fbeFindCol atau
 * parser lain di Task 3/4 dst ketahuan regresinya lewat `node
 * test/fbeImport.smoke.js`, bukan cuma lewat command node -e sekali jalan.
 */
const { loadFbeContext } = require('./fbeHarness');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const ctx = loadFbeContext();

  const rows = [
    ['No.', 'Plant Code', 'Plant Desc', 'Region', 'Kota', 'Resi', 'Status', 'Sticker kaca', 'Frame Hanging LFD', 'Frame Standing LFD', 'PIC', 'Kontak', 'Alamat'],
    [3, 'E173', 'ERAFONE & MORE RUKO TELUK GONG', 'REGION 1', 'Jakarta Utara', 101411199669, 'Received',
      'Desain 1 (LxT) 80x55cm : 1\nDesain 2 (LxT) 130x89cm : 1\nDesain 3 (LxT) 130x73cm : 1\nDesain 4 (LxT) 80x130cm : 1\n',
      4, '', 'Roma Septiana', 81997171997, 'Alamat X'],
    [1, 'E005', 'ERAFONE 2 BOTANI SQUARE', 'REGION 1', 'Bogor', 101411199667, 'Received', '', 4, '', 'Agung Al Ghaniyu', 85778469525, 'Alamat Y'],
  ];

  const out = ctx.parseFbeStickerKacaFile(rows);
  const e173 = out.filter(r => r.plantCode === 'E173');
  const e005 = out.filter(r => r.plantCode === 'E005');
  const e173Sticker = e173.filter(r => r.jenisMateri === 'STICKER_KACA');
  const e173Frame   = e173.filter(r => r.jenisMateri === 'FRAME_HANGING_LFD');

  assert(e173.length === 5, 'E173 seharusnya 5 baris total (4 sticker-kaca + 1 frame hanging LFD), dapat ' + e173.length);
  assert(e173Sticker.length === 4, 'E173 seharusnya 4 baris STICKER_KACA, dapat ' + e173Sticker.length);
  assert(e173Sticker[0].subDesain === 'Desain 1 (LxT) 80x55cm', 'subDesain: ' + e173Sticker[0].subDesain);
  assert(e173Frame.length === 1 && e173Frame[0].qty === 4, 'E173 seharusnya 1 baris FRAME_HANGING_LFD qty=4, dapat ' + JSON.stringify(e173Frame));
  assert(e005.length === 1 && e005[0].jenisMateri === 'FRAME_HANGING_LFD' && e005[0].qty === 4,
    'E005 seharusnya 1 baris FRAME_HANGING_LFD qty=4, dapat ' + JSON.stringify(e005));

  console.log('OK parseFbeStickerKacaFile');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
