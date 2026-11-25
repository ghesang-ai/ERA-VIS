// ================================================================
// ERA-REVISUAL — Wall Branding "Upgrade Terus" (Region 5)
// ----------------------------------------------------------------
// STATUS: MOCKUP. Semua data submission di halaman ini adalah DATA
// CONTOH (dummy) untuk preview tampilan. Belum ada backend — nanti
// disambungkan ke form https://era-revisual-wallbranding.netlify.app/submit
// ================================================================

const RV_CONFIG = {
  submitUrl : 'https://era-revisual-wallbranding.netlify.app/submit',
  deadline  : '2026-11-27T23:59:59+07:00',
  deadlineLabel: '27 November 2026',
  target    : 'SOB Aksesoris +10%',
};

// Jenis wall branding — dari deck "Revisual Wallbranding - Upgrade Terus"
const RV_TYPES = [
  { key: 'kasir',    name: 'Wallbranding Kasir',  size: '80 × 130 cm',
    note: 'Poster di dinding belakang kasir', imgs: ['assets/revisual/kasir-1.jpg', 'assets/revisual/kasir-2.jpg'] },
  { key: 'custom',   name: 'Custom Size',         size: '150 × 190 cm · 200 × 155 cm',
    note: 'Wall besar — ukuran mengikuti dinding toko', imgs: ['assets/revisual/custom-1.jpg'] },
  { key: 'lightbox', name: 'Lightbox',            size: 'tbc',
    note: 'Lightbox di pilar / area display', imgs: ['assets/revisual/lightbox.jpg'] },
];

// Toko dummy — dipakai kalau master toko Region 5 belum ke-load
const RV_DUMMY_STORES = [
  ['E501', 'ERAFONE MEGASTORE CIBUBUR JUNCTION', 'Bekasi'],
  ['E502', 'ERAFONE MALL CIPUTRA CIBUBUR',       'Bogor'],
  ['E503', 'ERAFONE BOTANI SQUARE',              'Bogor'],
  ['E504', 'ERAFONE AEON MALL SENTUL',           'Bogor'],
  ['E505', 'ERAFONE CIBINONG CITY MALL',         'Bogor'],
  ['E506', 'ERAFONE MARGO CITY',                 'Depok'],
  ['E507', 'ERAFONE DEPOK TOWN SQUARE',          'Depok'],
  ['E508', 'ERAFONE CIMANGGIS SQUARE',           'Depok'],
  ['E509', 'ERAFONE BEKASI CYBER PARK',          'Bekasi'],
  ['E510', 'ERAFONE SUMMARECON MAL BEKASI',      'Bekasi'],
  ['E511', 'ERAFONE GRAND GALAXY PARK',          'Bekasi'],
  ['E512', 'ERAFONE METROPOLITAN MALL',          'Bekasi'],
  ['E513', 'ERAFONE MAL CIPUTRA CIKARANG',       'Bekasi'],
  ['E514', 'ERAFONE LIPPO CIKARANG',             'Bekasi'],
  ['E515', 'ERAFONE KARAWANG CENTRAL PLAZA',     'Karawang'],
  ['E516', 'ERAFONE RESINDA PARK MALL',          'Karawang'],
  ['E517', 'ERAFONE BOGOR TRADE MALL',           'Bogor'],
  ['E518', 'ERAFONE TRANS STUDIO MALL CIBUBUR',  'Depok'],
];

const RV_STATUS = {
  SUBMIT : { label: 'Sudah Submit', cls: 'badge-done' },
  REVISI : { label: 'Perlu Revisi', cls: 'badge-pending' },
  BELUM  : { label: 'Belum Submit', cls: 'badge-notdone' },
};

let rvRows = [];
let rvInited = false;

// Pseudo-random deterministik supaya mockup stabil tiap reload
function rvRand(seed) {
  let x = 2166136261;
  for (const ch of String(seed)) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
  return () => { // mulberry32
    x = (x + 0x6D2B79F5) >>> 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rvBuildRows() {
  let stores = [];
  if (typeof allMasterToko !== 'undefined' && Array.isArray(allMasterToko)) {
    stores = allMasterToko
      .filter(s => /\b5\b/.test(String(s.region || '')))
      .map(s => ({ code: s.plantCode, name: s.plantDesc, city: s.city || '' }));
  }
  if (!stores.length) stores = RV_DUMMY_STORES.map(([code, name, city]) => ({ code, name, city }));

  const names = ['Andi', 'Rina', 'Budi', 'Sari', 'Dimas', 'Putri', 'Fajar', 'Lina', 'Yoga', 'Maya'];
  return stores.map((s, i) => {
    const r = rvRand(s.code);
    const roll = r();
    const status = roll < 0.58 ? 'SUBMIT' : roll < 0.7 ? 'REVISI' : 'BELUM';
    const sl = (typeof getSL === 'function' && getSL(s.code)) || null;
    const row = { ...s, status, sl: sl ? (sl.nama || sl.name || '') : names[i % names.length], walls: [], ticket: '', time: '' };
    if (status !== 'BELUM') {
      const n = 1 + Math.floor(r() * 3);
      for (let w = 0; w < n; w++) {
        const t = RV_TYPES[Math.floor(r() * RV_TYPES.length)];
        const W = t.key === 'kasir' ? 80 : 120 + Math.round(r() * 10) * 10;
        const H = t.key === 'kasir' ? 130 : 150 + Math.round(r() * 6) * 10;
        row.walls.push({ type: t, w: W, h: H, img: t.imgs[0] });
      }
      row.ticket = 'RV-' + String(s.code).replace(/\W/g, '').slice(-4).toUpperCase() + '-' + String(100 + Math.floor(r() * 900));
      const day = 20 + Math.floor(r() * 6), hh = 8 + Math.floor(r() * 12), mm = Math.floor(r() * 60);
      row.time = `${day} Nov · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      if (status === 'REVISI') row.revisi = r() < 0.5 ? 'Foto meteran tidak terbaca' : 'Foto depan terpotong (plafon tidak terlihat)';
    }
    return row;
  });
}

function initRevisual() {
  if (!rvInited) {
    rvInited = true;
    document.getElementById('rv-filter').addEventListener('change', rvRenderTable);
    document.getElementById('rv-search').addEventListener('input', rvRenderTable);
    rvRenderTypes();
    rvRenderPhone(0);
    document.getElementById('rv-blast-text').textContent = rvBlastText();
  }
  rvRows = rvBuildRows();
  rvRenderHero();
  rvRenderKpi();
  rvRenderTable();
}

function rvRenderHero() {
  const ms = new Date(RV_CONFIG.deadline) - new Date();
  const days = Math.floor(ms / 86400000);
  const el = document.getElementById('rv-countdown');
  el.textContent = ms <= 0 ? 'Deadline lewat' : days < 1 ? 'Hari terakhir!' : `Sisa ${days} hari`;
  el.classList.toggle('urgent', days <= 2);
}

function rvRenderKpi() {
  const total = rvRows.length;
  const sub = rvRows.filter(r => r.status === 'SUBMIT').length;
  const rev = rvRows.filter(r => r.status === 'REVISI').length;
  const bel = rvRows.filter(r => r.status === 'BELUM').length;
  const walls = rvRows.reduce((a, r) => a + r.walls.length, 0);
  const pct = total ? Math.round((sub / total) * 100) : 0;
  document.getElementById('rv-kpi').innerHTML = `
    <div class="kpi-card c-blue"><div class="kpi-label">Toko Region 5</div><div class="kpi-value">${total}</div><div class="kpi-sub">Wajib submit</div></div>
    <div class="kpi-card c-teal"><div class="kpi-label">Sudah Submit</div><div class="kpi-value">${sub}</div><div class="kpi-sub">Foto + ukuran OK</div></div>
    <div class="kpi-card c-gold"><div class="kpi-label">Perlu Revisi</div><div class="kpi-value">${rev}</div><div class="kpi-sub">Foto / ukuran salah</div></div>
    <div class="kpi-card c-red"><div class="kpi-label">Belum Submit</div><div class="kpi-value">${bel}</div><div class="kpi-sub">Perlu di-follow up</div></div>
    <div class="kpi-card c-purple"><div class="kpi-label">Total Wall</div><div class="kpi-value">${walls}</div><div class="kpi-sub">Terukur & terfoto</div></div>
    <div class="kpi-card c-green"><div class="kpi-label">Progress</div><div class="kpi-value">${pct}%</div>
      <div class="rv-bar"><span style="width:${pct}%"></span></div></div>`;
}

function rvRenderTypes() {
  document.getElementById('rv-types').innerHTML = RV_TYPES.map(t => `
    <div class="rv-type">
      <div class="rv-type-imgs">${t.imgs.map(src => `<img src="${src}" alt="${esc(t.name)}" loading="lazy">`).join('')}</div>
      <div class="rv-type-body">
        <div class="rv-type-name">${esc(t.name)}</div>
        <div class="rv-type-size">${esc(t.size)}</div>
        <div class="rv-type-note">${esc(t.note)}</div>
      </div>
    </div>`).join('');
}

function rvRenderTable() {
  const f = document.getElementById('rv-filter').value;
  const q = document.getElementById('rv-search').value.trim().toLowerCase();
  const rows = rvRows.filter(r =>
    (f === 'ALL' || r.status === f) &&
    (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.city || '').toLowerCase().includes(q)));
  document.getElementById('rv-count').textContent = `${rows.length} dari ${rvRows.length} toko`;
  document.getElementById('rv-table').innerHTML = rows.length ? `
    <table>
      <thead><tr><th>Plant Code</th><th>Toko</th><th>Store Leader</th><th>Wall</th><th>Foto</th><th>Tiket</th><th>Waktu</th><th>Status</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td><strong>${esc(r.code)}</strong></td>
          <td>${esc(r.name)}<div class="rv-sub">${esc(r.city)}</div></td>
          <td>${esc(r.sl)}</td>
          <td>${r.walls.length ? r.walls.map(w => `<div class="rv-wall"><b>${esc(w.type.name)}</b> ${w.w}×${w.h} cm</div>`).join('') : '<span class="rv-sub">—</span>'}</td>
          <td><div class="rv-thumbs">${r.walls.map(w => `<img src="${w.img}" alt="" loading="lazy">`).join('')}</div></td>
          <td class="rv-mono">${esc(r.ticket || '—')}</td>
          <td class="rv-sub">${esc(r.time || '—')}</td>
          <td><span class="badge ${RV_STATUS[r.status].cls}">${RV_STATUS[r.status].label}</span>${r.revisi ? `<div class="rv-sub rv-warn">${esc(r.revisi)}</div>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty-state"><p>Tidak ada toko yang cocok dengan filter.</p></div>';
}

// ── Preview form submit (tampilan HP) ──────────────────────────────
const RV_STEPS = ['Plant Code', 'Data Diri', 'Foto & Ukuran', 'Selesai'];

function rvRenderPhone(step) {
  document.querySelectorAll('.rv-step').forEach((b, i) => b.classList.toggle('active', i === step));
  const screens = [
    `<div class="rv-ph-h">Masukkan Plant Code</div>
     <div class="rv-ph-row"><div class="rv-ph-input">E506</div><div class="rv-ph-btn">Cek</div></div>
     <div class="rv-ph-ok">✓ ERAFONE MARGO CITY · Depok</div>
     <div class="rv-ph-hint">Plant Code bisa dilihat di papan nama toko / sistem POS.</div>`,
    `<div class="rv-ph-h">Data Pengirim</div>
     <label>Nama</label><div class="rv-ph-input">Putri Lestari</div>
     <label>No. HP</label><div class="rv-ph-input">0812-xxxx-xxxx</div>
     <label>Kategori</label>
     <div class="rv-ph-chips"><span class="on">Wall Branding · Upgrade Terus</span></div>`,
    `<div class="rv-ph-h">Wall #1</div>
     <div class="rv-ph-grid">
       <div class="rv-ph-slot filled"><img src="assets/revisual/custom-1.jpg" alt=""><span>Depan *</span></div>
       <div class="rv-ph-slot filled"><img src="assets/revisual/kasir-2.jpg" alt=""><span>Meteran *</span></div>
       <div class="rv-ph-slot"><b>+</b><span>Kiri</span></div>
       <div class="rv-ph-slot"><b>+</b><span>Kanan</span></div>
     </div>
     <div class="rv-ph-row"><div class="rv-ph-input">L 150 cm</div><div class="rv-ph-x">×</div><div class="rv-ph-input">T 190 cm</div></div>
     <div class="rv-ph-ghost">+ Tambah Wall</div>
     <div class="rv-ph-btn full">Kirim</div>`,
    `<div class="rv-ph-done">✅</div>
     <div class="rv-ph-h center">Terkirim!</div>
     <div class="rv-ph-ticket">RV-E506-482</div>
     <div class="rv-ph-hint center">Simpan nomor tiket ini. Salah foto/ukuran? Buka link yang sama, masukkan Plant Code lagi → data lama otomatis ditimpa.</div>`,
  ];
  document.getElementById('rv-phone-screen').innerHTML = screens[step];
}

// ── Pesan WA blast ─────────────────────────────────────────────────
function rvBlastText() {
  return `*📢 ERA-REVISUAL*

Semangat Pagi rekan-rekan Store Leader / TSH / LOB 🙏

🎯 *Target kita: naikkan SOB Aksesoris +10%!*
Salah satu caranya: Revisual Wall Branding *Upgrade Terus* yang visibility-nya tidak produktif di toko Erafone.

Mohon bantuannya *foto & ukur wall branding* tersebut lewat link berikut:
🔗 ${RV_CONFIG.submitUrl}

*Cara submit (±5 menit dari HP):*
1️⃣ Masukkan *Plant Code* → klik *Cek*
2️⃣ Isi *Nama* & *No. HP*
3️⃣ Pilih kategori: *Wall Branding* = Upgrade Terus
4️⃣ Upload foto:
   • *Depan* (wajib) → lurus, lantai–plafon terlihat
   • *Meteran* (wajib) → angka meteran terbaca
   • Sudut kiri/kanan & area sekitar (opsional)
5️⃣ Isi *ukuran* Lebar × Tinggi (cm)
6️⃣ Ada wall lain? Klik *+ Tambah Wall*
7️⃣ Klik *Kirim* → simpan nomor tiket ✅

✏️ *Salah foto/ukuran?* Buka link yang sama, masukkan Plant Code lagi, ganti yang salah → Kirim. Data lama otomatis *ditimpa*.

⏰ Mohon submit paling lambat *${RV_CONFIG.deadlineLabel}*.`;
}

function rvCopy(text, msg) {
  const done = () => typeof toast === 'function' && toast(msg);
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(done);
  else done();
}
