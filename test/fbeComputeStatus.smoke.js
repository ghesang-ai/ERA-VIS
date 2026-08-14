'use strict';
/**
 * Smoke test yang bisa dijalankan langsung: `node test/fbeComputeStatus.smoke.js`
 * Repo ini tidak punya test framework (tidak ada jest/mocha/dll), jadi ini
 * pakai pola smoke-test yang sudah dipakai selama pengembangan fbeImport.js:
 * load context lewat vm (fbeHarness.js), lempar Error kalau assertion
 * gagal (exit code 1), console.log('OK ...') + exit 0 kalau semua lolos.
 *
 * Ini adalah versi tersimpan dari test computeFbeStoreStatus (Task 4) —
 * toko E173 (2 kategori materi: STICKER_KACA dengan 2 sub-desain +
 * EASEL_POSTER, hanya STICKER_KACA yang terkonfirmasi) memverifikasi
 * catatan desain paling penting di fungsi ini: denominator scorePct
 * dihitung dari JUMLAH KATEGORI MATERI, bukan jumlah baris long-format
 * sub-desain — toko dengan 2 baris sub-desain Sticker Kaca + 1 materi
 * lain tetap totalCount = 2, bukan 3.
 *
 * Ditambah 2 toko lagi untuk menutupi cabang yang belum diuji smoke
 * test dasar di atas:
 * - E061 (nama lebih besar dari E173 secara alfabetis): sama sekali
 *   tidak punya baris konfirmasi -> semua materi confirmed:false,
 *   doneCount 0, scorePct 0.
 * - A001 (nama lebih kecil dari E173 secara alfabetis): semua
 *   materinya terkonfirmasi -> doneCount === totalCount, scorePct 100.
 * Ketiganya sekaligus dipakai untuk memverifikasi hasil computeFbeStoreStatus
 * ter-sort alfabetis by plantCode (A001, E061, E173) walau input master
 * rows tidak diurutkan begitu.
 */
const { loadFbeContext } = require('./fbeHarness');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const ctx = loadFbeContext();

  const master = [
    { plantCode: 'E173', namaToko: 'ERAFONE TELUK GONG', region: 'REGION 1', kota: 'Jakarta Utara', jenisMateri: 'STICKER_KACA', subDesain: 'Desain 1', qty: 1, noResi: 'R1' },
    { plantCode: 'E173', namaToko: 'ERAFONE TELUK GONG', region: 'REGION 1', kota: 'Jakarta Utara', jenisMateri: 'STICKER_KACA', subDesain: 'Desain 2', qty: 1, noResi: 'R1' },
    { plantCode: 'E173', namaToko: 'ERAFONE TELUK GONG', region: 'REGION 1', kota: 'Jakarta Utara', jenisMateri: 'EASEL_POSTER', subDesain: '', qty: 2, noResi: 'R2' },
    // Toko tanpa konfirmasi sama sekali.
    { plantCode: 'E061', namaToko: 'ERAFONE 2 MEGA MALL MANADO', region: 'REGION 2', kota: 'Manado', jenisMateri: 'HANGING_GATE', subDesain: '', qty: 1, noResi: 'R3' },
    // Toko dengan semua materi terkonfirmasi (2 kategori materi).
    { plantCode: 'A001', namaToko: 'ERAFONE ANGGREK', region: 'REGION 1', kota: 'Jakarta Barat', jenisMateri: 'EASEL_POSTER', subDesain: '', qty: 1, noResi: 'R4' },
    { plantCode: 'A001', namaToko: 'ERAFONE ANGGREK', region: 'REGION 1', kota: 'Jakarta Barat', jenisMateri: 'HANGING_GATE', subDesain: '', qty: 1, noResi: 'R4' },
  ];

  const confirm = [
    { plantCode: 'E173', jenisMateri: 'STICKER_KACA', status: 'Terpasang', tanggal: 't1', linkFoto: 'f1' },
    { plantCode: 'A001', jenisMateri: 'EASEL_POSTER', status: 'Terpasang', tanggal: 't2', linkFoto: 'f2' },
    { plantCode: 'A001', jenisMateri: 'HANGING_GATE', status: 'Terpasang', tanggal: 't3', linkFoto: 'f3' },
  ];

  const out = ctx.computeFbeStoreStatus(master, confirm);

  // ── Sort order: A001, E061, E173 ──────────────────────────────────
  if (out.length !== 3) throw new Error('seharusnya 3 toko, dapat ' + out.length);
  assert(out[0].plantCode === 'A001', 'urutan pertama seharusnya A001, dapat ' + out[0].plantCode);
  assert(out[1].plantCode === 'E061', 'urutan kedua seharusnya E061, dapat ' + out[1].plantCode);
  assert(out[2].plantCode === 'E173', 'urutan ketiga seharusnya E173, dapat ' + out[2].plantCode);

  // ── E173: kasus dasar dari Step 3 rencana (denominator per kategori) ──
  const e173 = out.find(r => r.plantCode === 'E173');
  assert(e173.totalCount === 2, 'E173 totalCount seharusnya 2 (kategori STICKER_KACA + EASEL_POSTER), dapat ' + e173.totalCount);
  assert(e173.doneCount === 1, 'E173 doneCount seharusnya 1 (hanya STICKER_KACA terkonfirmasi), dapat ' + e173.doneCount);
  assert(e173.scorePct === 50, 'E173 scorePct seharusnya 50, dapat ' + e173.scorePct);
  const sk = e173.materials.find(m => m.jenisMateri === 'STICKER_KACA');
  assert(sk.details.length === 2, 'STICKER_KACA seharusnya simpan 2 detail sub-desain, dapat ' + sk.details.length);
  assert(sk.confirmed === true, 'STICKER_KACA E173 seharusnya confirmed');

  // ── E061: toko tanpa konfirmasi sama sekali ───────────────────────
  const e061 = out.find(r => r.plantCode === 'E061');
  assert(e061.totalCount === 1, 'E061 totalCount seharusnya 1, dapat ' + e061.totalCount);
  assert(e061.doneCount === 0, 'E061 doneCount seharusnya 0 (tidak ada konfirmasi), dapat ' + e061.doneCount);
  assert(e061.scorePct === 0, 'E061 scorePct seharusnya 0, dapat ' + e061.scorePct);
  assert(e061.materials.every(m => m.confirmed === false), 'semua materi E061 seharusnya confirmed:false');

  // ── A001: toko dengan semua materi terkonfirmasi ──────────────────
  const a001 = out.find(r => r.plantCode === 'A001');
  assert(a001.totalCount === 2, 'A001 totalCount seharusnya 2, dapat ' + a001.totalCount);
  assert(a001.doneCount === a001.totalCount, 'A001 doneCount seharusnya sama dengan totalCount, dapat doneCount=' + a001.doneCount + ' totalCount=' + a001.totalCount);
  assert(a001.scorePct === 100, 'A001 scorePct seharusnya 100, dapat ' + a001.scorePct);
  assert(a001.materials.every(m => m.confirmed === true), 'semua materi A001 seharusnya confirmed:true');

  console.log('OK computeFbeStoreStatus');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
