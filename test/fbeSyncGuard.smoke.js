'use strict';
/**
 * Smoke test yang bisa dijalankan langsung: `node test/fbeSyncGuard.smoke.js`
 *
 * js/campaigns.js banyak menyentuh document/DOM sehingga tidak bisa di-load
 * penuh lewat harness vm seperti fbeHarness.js (lihat test/fbeImport.smoke.js).
 * Jadi test ini SENGAJA tidak eval seluruh campaigns.js — cukup salin ulang
 * definisi _minStoresForSync (persis seperti di js/campaigns.js) sebagai pure
 * function, lalu diuji terhadap data fixture.
 *
 * Ini regression guard untuk bug kritis: cloud-sync helpers lama di
 * js/campaigns.js (cleanupStoredCampaigns, pushCampaignsToCloud,
 * pullLocalStoresFromCloud, pushMissingLocalStores) memproyeksikan localStores
 * campaign FBE (long-format, banyak baris per plantCode) ke bentuk minimal
 * excel biasa (plantCode/plantDesc/region/city/nomorResi) — yang membuang
 * field jenisMateri/subDesain/qty dan bikin data materi FBE hilang total saat
 * push ke cloud. _minStoresForSync() harus mempertahankan field FBE dan tidak
 * pernah mengurangi jumlah baris.
 */

// Salinan persis _minStoresForSync dari js/campaigns.js.
function _minStoresForSync(c) {
  return c.fbeMode
    ? c.localStores.map(s => ({
        plantCode  : s.plantCode,
        namaToko   : s.namaToko,
        region     : s.region,
        kota       : s.kota,
        jenisMateri: s.jenisMateri,
        subDesain  : s.subDesain || '',
        qty        : s.qty || 1,
        noResi     : s.noResi || '',
        statusResi : s.statusResi || '',
        pic        : s.pic || '',
        kontak     : s.kontak || '',
      }))
    : c.localStores.map(s => ({
        plantCode: s.plantCode,
        plantDesc: s.plantDesc,
        region   : s.region,
        city     : s.city,
        nomorResi: s.nomorResi || '',
      }));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  // 1. Campaign FBE dengan 2 baris long-format berbeda jenisMateri, plantCode sama.
  const fbeCampaign = {
    fbeMode: true,
    localStores: [
      { plantCode: 'E173', namaToko: 'ERAFONE & MORE TELUK GONG', region: 'REGION 1', kota: 'Jakarta Utara',
        jenisMateri: 'STICKER_KACA', subDesain: 'Desain 1 (LxT) 80x55cm', qty: 1, noResi: '101411199669',
        statusResi: 'Received', pic: 'Roma Septiana', kontak: '81997171997' },
      { plantCode: 'E173', namaToko: 'ERAFONE & MORE TELUK GONG', region: 'REGION 1', kota: 'Jakarta Utara',
        jenisMateri: 'FRAME_HANGING_LFD', subDesain: '', qty: 4, noResi: '101411199669',
        statusResi: 'Received', pic: 'Roma Septiana', kontak: '81997171997' },
    ],
  };

  const fbeOut = _minStoresForSync(fbeCampaign);
  assert(fbeOut.length === 2, 'FBE: seharusnya TIDAK dedupe, dapat ' + fbeOut.length + ' baris (bukan 2)');
  assert(fbeOut[0].plantCode === 'E173' && fbeOut[1].plantCode === 'E173',
    'FBE: plantCode kedua baris harus tetap E173');
  assert(fbeOut[0].jenisMateri === 'STICKER_KACA', 'FBE: baris 1 jenisMateri: ' + fbeOut[0].jenisMateri);
  assert(fbeOut[1].jenisMateri === 'FRAME_HANGING_LFD', 'FBE: baris 2 jenisMateri: ' + fbeOut[1].jenisMateri);
  assert(fbeOut[0].subDesain === 'Desain 1 (LxT) 80x55cm', 'FBE: baris 1 subDesain: ' + fbeOut[0].subDesain);
  assert(fbeOut[1].qty === 4, 'FBE: baris 2 qty: ' + fbeOut[1].qty);
  assert(fbeOut[0].namaToko === 'ERAFONE & MORE TELUK GONG', 'FBE: namaToko harus ikut terproyeksi');
  assert(fbeOut[0].kota === 'Jakarta Utara', 'FBE: kota harus ikut terproyeksi (bukan city)');
  assert(!('plantDesc' in fbeOut[0]) && !('city' in fbeOut[0]),
    'FBE: TIDAK boleh ada field plantDesc/city (itu bentuk excel biasa)');

  // 2. Campaign non-FBE (fbeMode tidak diset) dengan localStores biasa — perilaku lama.
  const excelCampaign = {
    mode: 'excel',
    localStores: [
      { plantCode: 'E005', plantDesc: 'ERAFONE 2 BOTANI SQUARE', region: 'REGION 1', city: 'Bogor', nomorResi: '101411199667', extraJunk: 'harus dibuang' },
    ],
  };

  const excelOut = _minStoresForSync(excelCampaign);
  assert(excelOut.length === 1, 'Excel biasa: jumlah baris tidak boleh berubah, dapat ' + excelOut.length);
  const row = excelOut[0];
  assert(row.plantCode === 'E005', 'Excel biasa: plantCode: ' + row.plantCode);
  assert(row.plantDesc === 'ERAFONE 2 BOTANI SQUARE', 'Excel biasa: plantDesc: ' + row.plantDesc);
  assert(row.region === 'REGION 1', 'Excel biasa: region: ' + row.region);
  assert(row.city === 'Bogor', 'Excel biasa: city: ' + row.city);
  assert(row.nomorResi === '101411199667', 'Excel biasa: nomorResi: ' + row.nomorResi);
  assert(!('jenisMateri' in row) && !('namaToko' in row) && !('kota' in row),
    'Excel biasa: TIDAK boleh ada field FBE (jenisMateri/namaToko/kota)');
  assert(Object.keys(row).length === 5,
    'Excel biasa: harus persis 5 field {plantCode,plantDesc,region,city,nomorResi}, dapat ' + JSON.stringify(row));

  // 3. Campaign excel biasa dengan fbeMode eksplisit false — sama seperti tidak diset.
  const excelCampaignFalse = {
    mode: 'excel',
    fbeMode: false,
    localStores: [
      { plantCode: 'E006', plantDesc: 'ERAFONE 3', region: 'REGION 2', city: 'Depok' },
    ],
  };
  const excelOutFalse = _minStoresForSync(excelCampaignFalse);
  assert(excelOutFalse.length === 1 && excelOutFalse[0].nomorResi === '',
    'Excel biasa (fbeMode:false): nomorResi default kosong string, dapat ' + JSON.stringify(excelOutFalse[0]));

  console.log('OK _minStoresForSync');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
