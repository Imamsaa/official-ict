/* ════ CONFIG ════ */
const API_URL = "https://script.google.com/macros/s/AKfycbwrqUAnU4MTq_ANvXADI2SW6jJ9MAc1aT7XYAQ-iIkZKx9m_Folqhy2AIQ6Z2KULr2x/exec";
let DATA = null;

/* ════ CACHE & TOKEN SYSTEM ════ */
const TOKEN_KEY = 'ict_portal_token';
const CACHE_KEY = 'ict_portal_cache';
let ortuTugasData = [];
let currentOrtuMingguPage = 1;
const ORTU_MINGGU_PER_PAGE = 6;
let ortuKaryaData = [];
let currentOrtuKaryaPage = 1;
const ORTU_KARYA_PER_PAGE = 6;

// Fungsi mengecek sesi saat web dibuka
function initApp() {
  const savedToken = localStorage.getItem(TOKEN_KEY);
  const cachedDataStr = localStorage.getItem(CACHE_KEY);

  if (savedToken && cachedDataStr) {
    try {
      // 1. Tampilkan UI secara instan (0 detik loading) menggunakan Cache
      const cachedData = JSON.parse(cachedDataStr);
      DATA = cachedData;
      
      document.getElementById('search-screen').classList.add('hidden');
      const ps = document.getElementById('profile-screen');
      ps.classList.add('is-visible');
      if (window.innerWidth < 768) ps.style.display = 'block';
      else ps.style.display = '';

      loadProfile(cachedData);

      // 2. Lakukan sinkronisasi ke server menggunakan TOKEN
      refreshDataInBackground(savedToken);
    } catch (e) {
      doLogout();
    }
  }
}

// Fungsi memanggil API di latar belakang
async function refreshDataInBackground(token) {
  try {
    // ⬅️ PERBAIKAN 1: Tambahkan Anti-Cache (&_=${Date.now()}) di sini
    const json = await fetchJSONP(`${API_URL}?token=${token}&_=${Date.now()}`, 'cb_bg_' + Date.now());
    
    if (json.success) {
      DATA = json;
      localStorage.setItem(CACHE_KEY, JSON.stringify(json));
      loadProfile(json); // Render ulang tanpa mengganggu layar
      return true; // Beri tahu bahwa proses sukses
    } else if (json.expired) {
      alert("Sesi Anda telah berakhir. Silakan masukkan kode siswa kembali.");
      doLogout();
      return false;
    }
  } catch (e) {
    console.log("Koneksi gagal. Aplikasi berjalan sepenuhnya dari cache lokal.");
    throw e; // ⬅️ PERBAIKAN 2: Lempar error agar tombol Refresh tahu kalau gagal
  }
}

/* ════ JSONP ════ */
function fetchJSONP(url, cbName) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 15000);
    function cleanup() {
      delete window[cbName];
      const el = document.getElementById('jsonp-' + cbName);
      if (el) el.remove();
      clearTimeout(t);
    }
    window[cbName] = d => { cleanup(); resolve(d); };
    const s = document.createElement('script');
    s.id = 'jsonp-' + cbName;
    s.src = url + '&callback=' + cbName;
    s.onerror = () => { cleanup(); reject(new Error('load error')); };
    document.head.appendChild(s);
  });
}

/* ════ LOGIN / LOGOUT ════ */
async function doSearch() {
  const kode = document.getElementById('code-input').value.trim().toUpperCase();
  if (!kode) {
    document.getElementById('search-error').textContent = '⚠️ Masukkan kode siswa (NIS).';
    document.getElementById('search-error').classList.remove('hidden');
    return;
  }
  
  const btn = document.getElementById('search-btn');
  btn.disabled = true; 
  btn.textContent = 'Mengambil data...';
  document.getElementById('search-error').classList.add('hidden');
  
  try {
    // Tambahkan parameter unik (timestamp) agar request tidak ter-cache oleh browser
    const timestamp = Date.now();
    
    // Eksekusi Login dengan Kode Siswa menggunakan Jalur Khusus (role=ortu)
    const json = await fetchJSONP(`${API_URL}?kode=${kode}&role=ortu&t=${timestamp}`, 'cb_' + timestamp);
    
    if (!json.success) { 
      document.getElementById('search-error').textContent = `⚠️ ${json.message || 'Kode siswa tidak ditemukan.'}`;
      document.getElementById('search-error').classList.remove('hidden'); 
      return; 
    }
    
    // Bersihkan cache lama sebelum menyimpan yang baru
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CACHE_KEY);
    
    // Simpan TOKEN dari server dan simpan Cache JSON
    localStorage.setItem(TOKEN_KEY, json.token);
    localStorage.setItem(CACHE_KEY, JSON.stringify(json));

    DATA = json;
    loadProfile(json);
    
    // Transisi UI
    document.getElementById('search-screen').classList.add('hidden');
    const ps = document.getElementById('profile-screen');
    ps.classList.add('is-visible');
    if (window.innerWidth < 768) ps.style.display = 'block';
    else ps.style.display = '';
    
  } catch (e) {
    console.error("Login Error:", e);
    // Ubah alert menjadi error message agar tidak mengganggu (pop-up)
    document.getElementById('search-error').textContent = '⚠️ Gagal terhubung ke server. Periksa koneksi internet Anda.';
    document.getElementById('search-error').classList.remove('hidden');
  } finally {
    btn.disabled = false; 
    btn.textContent = 'Lihat Perkembangan Anak';
  }
}

function doLogout() {
  // Hapus token dan cache dari browser
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CACHE_KEY);

  const ps = document.getElementById('profile-screen');
  ps.classList.remove('is-visible');
  ps.style.display = '';
  document.getElementById('search-screen').classList.remove('hidden');
  document.getElementById('code-input').value = '';
  DATA = null;
  switchPage('beranda');
}

// ==========================================
// FUNGSI REFRESH MANUAL
// ==========================================
async function manualRefresh() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  const btnIcons = document.querySelectorAll('.refresh-icon');
  
  // 1. Putar ikon refresh
  btnIcons.forEach(icon => icon.classList.add('is-spinning'));

  try {
    // 2. Tarik data dari server, sekaligus paksa animasi berputar minimal 1 detik
    const refreshPromise = refreshDataInBackground(token);
    const delayPromise = new Promise(resolve => setTimeout(resolve, 1000));
    await Promise.all([refreshPromise, delayPromise]);

    // 3. Beri notifikasi halus tanpa membekukan layar (Ubah teks tombol di Desktop)
    const lbl = document.querySelector('.dh-logout span');
    if (lbl) {
      const originalText = lbl.textContent;
      lbl.textContent = 'Sukses!';
      setTimeout(() => { lbl.textContent = originalText; }, 2000);
    }
  } catch (e) {
    alert('⚠️ Gagal menyegarkan data. Periksa koneksi internet Anda.');
  } finally {
    // 4. Hentikan putaran ikon
    btnIcons.forEach(icon => icon.classList.remove('is-spinning'));
  }
}

/* ════ HELPERS ════ */
function escH(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function ns(raw = '') {
  const v = (raw || '').toLowerCase().trim();
  if (v.includes('selesai')) return 'selesai';
  if (v.includes('proses') || v.includes('dikerjakan')) return 'proses';
  return 'belum';
}
function fmtShort(v) {
  if (!v) return '–';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function ytEmbed(raw = '') {
  if (!raw) return '';
  const m = raw.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : '';
}

/* Helper: set text to multiple elements by id */
function setAll(pairs) {
  pairs.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}
function styleAll(pairs) {
  pairs.forEach(([id, prop, val]) => {
    const el = document.getElementById(id);
    if (el) el.style[prop] = val;
  });
}

/* ════ LOAD PROFILE ════ */
function loadProfile(json) {
  const s = json.siswa || {};

  // Sidebar (desktop) & mobile topbar share the same data
  setAll([
    ['sb-nama',   s.nama  || '–'],
    ['sb-kelas',  s.kelas || '–'],
    ['sb-kode',   s.kode  || '–'],
    ['mob-nama',  s.nama  || '–'],
    ['mob-kelas', s.kelas || '–'],
    ['mob-kode',  s.kode  || '–'],
  ]);

  // 1. FILTER PINTAR MATERI: Buang data progres yang Materi atau Bab-nya disembunyikan
  const babData = json.bab || [];
  const materiData = json.materi || [];
  
  json.progres = (json.progres || []).filter(p => {
    // Cek apakah materi masih ada di database
    const mat = materiData.find(m => m.id_materi === p.id_materi);
    if (!mat) return false; 
    
    // Cek apakah bab dari materi tersebut masih ada
    const b = babData.find(x => x.id_bab === mat.id_bab);
    if (!b) return false;
    
    // Pastikan keduanya TIDAK berstatus 'sembunyikan'
    const isMatHidden = (mat.buka_kelas || '').toLowerCase() === 'sembunyikan';
    const isBabHidden = (b.buka_kelas || '').toLowerCase() === 'sembunyikan';
    
    return !isMatHidden && !isBabHidden;
  });

  // 2. FILTER PINTAR TUGAS: Buang Tugas Mingguan yang disembunyikan
  json.tugasMingguan = (json.tugasMingguan || []).filter(tg => 
    (tg.buka_kelas_master || '').toLowerCase() !== 'sembunyikan'
  );

  // 3. KALKULASI STATISTIK (Dari data yang sudah bersih)
  const progres = json.progres;
  const sel = progres.filter(x => ns(x.status) === 'selesai').length;
  const pro = progres.filter(x => ns(x.status) === 'proses').length;
  const bel = progres.filter(x => ns(x.status) === 'belum').length;
  
  // Amankan dari pembagian dengan angka 0
  const pct = progres.length === 0 ? 0 : Math.round((sel / progres.length) * 100);

  setAll([
    ['sb-pct', pct + '%'], ['mob-pct', pct + '%'],
    ['sb-sel', sel], ['sb-pro', pro], ['sb-bel', bel],
    ['mob-sel', sel], ['mob-pro', pro], ['mob-bel', bel],
  ]);
  styleAll([
    ['sb-fill',  'width', pct + '%'],
    ['mob-fill', 'width', pct + '%'],
  ]);
  
  // 4. RESET & UPDATE NOTIFIKASI DOT MERAH
  ['snd-tugas', 'mnd-tugas', 'snd-minggu', 'mnd-minggu'].forEach(id => {
     const el = document.getElementById(id);
     if(el) el.classList.add('hidden');
  });

  // A. Cek Tanggungan Materi (Abaikan yang sedang Dikunci Guru)
  const tanggunganMateri = json.progres.filter(x => {
      if (ns(x.status) === 'selesai') return false;
      const mat = json.materi.find(m => m.id_materi === x.id_materi);
      if (mat && (mat.buka_kelas || '').toLowerCase() === 'kunci') return false;
      return true;
  }).length;

  if (tanggunganMateri > 0) {
    ['snd-tugas', 'mnd-tugas'].forEach(id => document.getElementById(id).classList.remove('hidden'));
  }

  // B. Cek Tanggungan Mingguan (Abaikan yang sedang Dikunci Guru)
  const mbel = json.tugasMingguan.filter(x => 
      ns(x.status) !== 'selesai' && 
      (x.buka_kelas_master || '').toLowerCase() !== 'kunci'
  ).length;
  
  if (mbel > 0) {
    ['snd-minggu', 'mnd-minggu'].forEach(id => document.getElementById(id).classList.remove('hidden'));
  }

  // Lanjutkan render komponen UI menggunakan data yang sudah bersih
  renderBeranda(json);
  renderTugas(json);
  renderMingguan(json.tugasMingguan);
  renderKarya(json.karya || []);
  renderSKL(json.skl || []);
  renderJadwal(json.jadwal || [], s.kelas);
}

/* ════ BERANDA ════ */
function renderBeranda(json) {
  const progres = json.progres || [];
  const tugas   = json.tugasMingguan || [];
  const skl     = json.skl || [];
  const materiData = json.materi || [];

  // 1. Tugas Belum Selesai (Materi)
  // Logika Pintar: Jangan tampilkan jika statusnya selesai ATAU sedang dikunci guru
  const pending = progres.filter(x => {
    if (ns(x.status) === 'selesai') return false;
    
    // Cari data master materi untuk mengecek status gemboknya
    const mat = materiData.find(m => m.id_materi === x.id_materi);
    if (mat && (mat.buka_kelas || '').toLowerCase() === 'kunci') return false;
    
    return true;
  });

  const pEl = document.getElementById('b-pending-list');
  if (!pending.length) {
    pEl.innerHTML = `<div style="padding:16px;text-align:center;color:#16a34a;font-size:12px;font-weight:700;">🎉 Semua materi aktif sudah selesai!</div>`;
  } else {
    pEl.innerHTML = '';
    pending.slice(0, 5).forEach(m => {
      const n = ns(m.status);
      const el = document.createElement('div');
      el.className = 'pending-item';
      el.innerHTML = `
        <div class="pending-dot ${n === 'proses' ? 'dot-amber' : 'dot-red'}"></div>
        <div style="flex:1;min-width:0;">
          <div class="pending-name text-truncate">${escH(m.nama_materi || m.id_materi || '–')}</div>
          ${m.deadline ? `<div class="pending-sub">Deadline: ${fmtShort(m.deadline)}</div>` : ''}
        </div>
        <span class="pending-status" style="color:${n === 'proses' ? '#d97706' : '#dc2626'}">${n === 'proses' ? 'Proses' : 'Belum'}</span>`;
      el.onclick = () => openMateriModal(m);
      pEl.appendChild(el);
    });
  }

  // 2. Mingguan Belum Selesai
  // Logika Pintar: Jangan tampilkan jika statusnya selesai ATAU sedang dikunci guru
  const wp = tugas.filter(x => 
    ns(x.status) !== 'selesai' && 
    (x.buka_kelas_master || '').toLowerCase() !== 'kunci'
  );
  
  const wEl = document.getElementById('b-weekly-list');
  if (!wp.length) {
    wEl.innerHTML = `<div style="padding:16px;text-align:center;color:#16a34a;font-size:12px;font-weight:700;">🎉 Semua tugas mingguan aktif selesai!</div>`;
  } else {
    wEl.innerHTML = '';
    wp.slice(0, 4).forEach(tg => {
      const n = ns(tg.status);
      const judul = tg.judul_tugas || tg.judul || tg.nama_tugas || '–';
      const el = document.createElement('div');
      el.className = 'pending-item';
      el.innerHTML = `
        <div class="pending-dot ${n === 'proses' ? 'dot-amber' : 'dot-red'}"></div>
        <div style="flex:1;min-width:0;">
          <div class="pending-name text-truncate">${escH(judul)}</div>
          ${tg.minggu ? `<div class="pending-sub">${escH(tg.minggu)}</div>` : ''}
        </div>
        <span class="pending-status" style="color:${n === 'proses' ? '#d97706' : '#dc2626'}">${n === 'proses' ? 'Proses' : 'Belum'}</span>`;
      el.onclick = () => openWeeklyModal(tg);
      wEl.appendChild(el);
    });
  }

  // 3. Hapus Catatan Guru
  // Logika yang merender isi Catatan Guru sudah dihapus. 
  // Baris di bawah ini memastikan wadah HTML-nya tetap bersembunyi (hidden).
  const nCard = document.getElementById('b-notes-card');
  if (nCard) nCard.classList.add('hidden');

  // 4. Standar Kompetensi (SKL) Mini
  const sklEl = document.getElementById('b-skl-mini');
  sklEl.innerHTML = '';
  if (!skl.length) {
    sklEl.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:6px 4px;">Belum ada data SKL.</div>';
  } else {
    skl.slice(0, 3).forEach(item => {
      const isTer = (item.status || '').toLowerCase().includes('terpenuhi');
      const isCuk = (item.status || '').toLowerCase().includes('cukup');
      const color = isTer ? '#16a34a' : isCuk ? '#d97706' : '#dc2626';
      const dot   = isTer ? '#22c55e' : isCuk ? '#f59e0b' : '#ef4444';
      sklEl.innerHTML += `<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
        <span style="font-size:12px;font-weight:600;color:#111827;flex:1;">${escH(item.mata_kompetensi || '–')}</span>
        <span style="font-size:11px;font-weight:700;color:${color};">${escH(item.status || 'Belum')}</span>
      </div>`;
    });
  }
}

function renderTugas(json) {
  const bab    = json.bab    || [];
  const materi = json.materi || [];
  const progres= json.progres|| [];
  const grid   = document.getElementById('bab-grid');
  grid.innerHTML = '';

  if (!bab.length) return;

  // ⬅️ LOGIKA BARU: Saring Bab yang disembunyikan menggunakan 'buka_kelas'
  const babAktif = bab.filter(b => (b.buka_kelas || '').toLowerCase() !== 'sembunyikan');

  babAktif.forEach(b => {
    // Cek apakah bab dikunci
    const isBabLocked = (b.buka_kelas || '').toLowerCase() === 'kunci';

    // Filter materi: Hanya hitung materi yang tidak disembunyikan
    let mats = materi.filter(m => m.id_bab === b.id_bab && (m.buka_kelas || '').toLowerCase() !== 'sembunyikan');

    const sel  = mats.filter(m => {
      const p = progres.find(px => px.id_materi === m.id_materi);
      return p && ns(p.status) === 'selesai';
    }).length;
    
    const pct = mats.length ? Math.round(sel / mats.length * 100) : 0;
    const thumb = b.thumbnail || null; 
    
    grid.appendChild(makeBabCard(b.judul_bab || b.id_bab, thumb, sel, mats.length, pct, isBabLocked, () => {
      const combined = mats.map(m => {
        const p = progres.find(px => px.id_materi === m.id_materi) || {};
        // Simpan buka_kelas_master agar bisa dibaca di dalam modal
        return { ...m, ...p, nama_materi: m.nama_materi || m.id_materi, buka_kelas_master: m.buka_kelas || '' };
      });
      showMateriList(b.judul_bab || b.id_bab, combined);
    }));
  });
}

// Tambahkan parameter isLocked
function makeBabCard(title, thumbnail, sel, tot, pct, isLocked, onClick) {
  const card = document.createElement('div');
  card.className = `bab-card ${isLocked ? 'locked-card' : ''}`;
  card.style.position = 'relative';
  
  const thumbContent = thumbnail 
    ? `<img src="${thumbnail}" alt="${title}" class="bab-thumb-img">`
    : `<svg width="36" height="36" viewBox="0 0 48 48" fill="none"><path d="M8 10C8 8.34 9.34 7 11 7H25L38 18V40C38 41.66 36.66 43 35 43H11C9.34 43 8 41.66 8 40V10Z" fill="#dbeafe" stroke="#1040a0" stroke-width="1.5"/><path d="M25 7L38 18H27C25.9 18 25 17.1 25 16V7Z" fill="#1040a0" opacity="0.3"/><line x1="15" y1="25" x2="31" y2="25" stroke="#1040a0" stroke-width="1.8" stroke-linecap="round"/><line x1="15" y1="30" x2="28" y2="30" stroke="#1040a0" stroke-width="1.8" stroke-linecap="round"/></svg>`;

  // Ikon gembok jika status tidak aktif
  const lockBadge = isLocked ? `
    <div class="locked-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      Terkunci
    </div>` : '';

  card.innerHTML = `
    ${lockBadge}
    <div class="bab-thumb">${thumbContent}</div>
    <div class="bab-body">
      <div class="bab-title">${title}</div>
      <div style="font-size:10px;color:#9ca3af;margin-bottom:5px;">${sel}/${tot} materi diselesaikan</div>
      <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
      <div class="prog-pct">${pct}%</div>
    </div>`;
    
  card.onclick = () => {
    if (isLocked) {
      alert('Materi ini belum dimulai. Guru akan mengaktifkannya sesuai jadwal pelajaran anak Anda.');
    } else {
      onClick();
    }
  };
  return card;
}

function showMateriList(title, items) {
  document.getElementById('view-bab-page').classList.add('hidden');
  document.getElementById('view-materi-page').classList.remove('hidden');
  document.getElementById('materi-bab-title').textContent = title;
  const list = document.getElementById('materi-list');
  list.innerHTML = '';
  
  items.forEach(m => {
    // ⬅️ LOGIKA BARU: Cek Kunci/Sembunyi level Materi
    const bukaMat = (m.buka_kelas_master || '').toLowerCase().trim();
    if (bukaMat === 'sembunyikan') return; // Jangan tampilkan di list
    const isLocked = bukaMat === 'kunci';

    const n   = ns(m.status || '');
    const cls = isLocked ? 'mi-belum' : (n === 'selesai' ? 'mi-selesai' : n === 'proses' ? 'mi-proses' : 'mi-belum');
    const ic  = isLocked ? '#9ca3af' : (n === 'selesai' ? '#22c55e' : n === 'proses' ? '#f59e0b' : '#d1d5db');
    const ip  = n === 'selesai'
      ? '<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>'
      : n === 'proses'
      ? '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
      : '<circle cx="12" cy="12" r="10"/>';
      
    const el = document.createElement('div');
    el.className = `materi-item ${cls} ${isLocked ? 'locked-card' : ''}`;
    
    // Ikon gembok kecil di kanan
    const lockIconHtml = isLocked ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" style="margin-left:auto; flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` : '';

    el.innerHTML = `
      <div class="mi-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${ic}" stroke-width="2.2">${isLocked ? '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' : ip}</svg>
      </div>
      <div style="flex:1;min-width:0;display:flex;align-items:center;">
        <div style="flex:1;">
          <div class="mi-name" style="${isLocked ? 'color:#6b7280;' : ''}">
            ${m.nama_materi || m.id_materi || '–'}
            ${m.nilai ? `<span style="display:inline-block; margin-left:6px; padding:2px 6px; background:#dcfce7; color:#15803d; border-radius:6px; font-size:10px; border:1px solid #bbf7d0;">Nilai: ${m.nilai}</span>` : ''}
          </div>
          <div class="mi-status" style="color:${isLocked ? '#6b7280' : (n==='selesai'?'#16a34a':n==='proses'?'#d97706':'#9ca3af')};">
            ${isLocked ? '🔒 Terkunci' : (n==='selesai'?'✅ Selesai':n==='proses'?'⏳ Dalam Proses':'⏸ Belum Dikerjakan')}
          </div>
          ${m.deadline ? `<div class="mi-date">Deadline: ${fmtShort(m.deadline)}</div>` : ''}
        </div>
        ${lockIconHtml}
      </div>`;
      
    el.onclick = () => {
      if (isLocked) {
        alert('Detail materi belum tersedia karena jadwal pembelajarannya belum dimulai.');
      } else {
        openMateriModal(m);
      }
    };
    list.appendChild(el);
  });
}

function backToBab() {
  document.getElementById('view-materi-page').classList.add('hidden');
  document.getElementById('view-bab-page').classList.remove('hidden');
}

/* ════ MINGGUAN (DENGAN SEARCH & PAGINATION) ════ */
function renderMingguan(list) {
  // Simpan data ke variabel global agar bisa difilter & dipaginasi tanpa fetch ulang
  ortuTugasData = list;
  currentOrtuMingguPage = 1;
  renderMingguanUI();
}

function filterOrtuMinggu() {
  currentOrtuMingguPage = 1;
  renderMingguanUI();
}

function renderMingguanUI() {
  // 1. Saring tugas yang sengaja disembunyikan guru
  const activeList = ortuTugasData.filter(tg => (tg.buka_kelas_master || '').toLowerCase() !== 'sembunyikan');
  const searchQ = (document.getElementById('ortu-search-minggu')?.value || '').toLowerCase();
  
  // 2. Render Statistik (Dihitung dari semua tugas aktif, tidak terpengaruh search)
  const sel  = activeList.filter(x => ns(x.status) === 'selesai');
  
  // ⬅️ PERBAIKAN: Hanya hitung 'Tersisa' jika tugasnya belum selesai DAN TIDAK dikunci
  const bel  = activeList.filter(x => 
    ns(x.status) !== 'selesai' && 
    (x.buka_kelas_master || '').toLowerCase() !== 'kunci'
  );
  
  const poin = sel.reduce((s, x) => s + (parseFloat(x.poin) || 0), 0);

  document.getElementById('minggu-stats').innerHTML = `
    <div class="ms-card ms-purple"><div class="ms-num">${poin} pts</div><div class="ms-lbl">Total Poin</div></div>
    <div class="ms-card ms-green"><div class="ms-num">${sel.length}</div><div class="ms-lbl">Selesai</div></div>
    <div class="ms-card ms-amber"><div class="ms-num">${bel.length}</div><div class="ms-lbl">Tersisa</div></div>`;

  // 3. Filter berdasarkan pencarian
  let filteredList = activeList;
  if (searchQ) {
    filteredList = filteredList.filter(tg => 
      (tg.judul_tugas || tg.judul || tg.nama_tugas || '').toLowerCase().includes(searchQ) ||
      (tg.minggu || '').toLowerCase().includes(searchQ)
    );
  }

  // 4. Urutkan secara kronologis (TM001, TM002, dst)
  const sorted = [...filteredList].sort((a, b) => {
    const numA = parseInt(String(a.id_tugas).replace(/\D/g, '')) || 0;
    const numB = parseInt(String(b.id_tugas).replace(/\D/g, '')) || 0;
    return numA - numB; 
  });

  const tbody = document.getElementById('minggu-tbody');
  const paginationEl = document.getElementById('ortu-minggu-pagination');
  tbody.innerHTML = '';
  
  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;">Tidak ada tugas ditemukan.</td></tr>';
    if(paginationEl) paginationEl.innerHTML = '';
    return;
  }
  
  // 5. Logika Pagination
  const totalItems = sorted.length;
  const totalPages = Math.ceil(totalItems / ORTU_MINGGU_PER_PAGE);
  if (currentOrtuMingguPage > totalPages) currentOrtuMingguPage = totalPages;

  const startIndex = (currentOrtuMingguPage - 1) * ORTU_MINGGU_PER_PAGE;
  const paginatedList = sorted.slice(startIndex, startIndex + ORTU_MINGGU_PER_PAGE);

  // 6. Render Baris per Baris (Sesuai Halaman)
  paginatedList.forEach(tg => {
    const isLocked = (tg.buka_kelas_master || '').toLowerCase() === 'kunci';
    const n     = ns(tg.status);
    const judul = tg.judul_tugas || tg.judul || tg.nama_tugas || '–';
    const tr    = document.createElement('tr');
    
    tr.className = `minggu-row ${isLocked ? 'locked-card' : ''} ${!isLocked && n==='belum'?'belum-row':!isLocked && n==='proses'?'proses-row':''}`;
    
    tr.innerHTML = `
      <td style="max-width:140px; ${isLocked ? 'color:#9ca3af;' : ''}">
        ${escH(judul)}
        ${isLocked ? '<span style="font-size:10px; margin-left:6px;">🔒</span>' : ''}
      </td>
      <td style="color:#9ca3af;font-size:11px;">${escH(tg.minggu || '–')}</td>
      <td>
         ${isLocked 
           ? '<span class="badge" style="background:#f3f4f6;color:#9ca3af;border:1px solid #d1d5db;">Terkunci</span>' 
           : `<span class="badge ${n==='selesai'?'badge-s':n==='proses'?'badge-p':'badge-b'}">${n==='selesai'?'Selesai':n==='proses'?'Proses':'Belum'}</span>`}
      </td>`;
      
    tr.onclick = () => {
      if (isLocked) { alert('Tugas mingguan ini belum diaktifkan oleh guru.'); return; }
      openWeeklyModal(tg);
    };
    tbody.appendChild(tr);
  });

  // 7. Render Tombol Paginasi
  renderOrtuMingguPagination(totalItems, totalPages);
}

function renderOrtuMingguPagination(totalItems, totalPages) {
  const container = document.getElementById('ortu-minggu-pagination');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const startCount = ((currentOrtuMingguPage - 1) * ORTU_MINGGU_PER_PAGE) + 1;
  const endCount = Math.min(currentOrtuMingguPage * ORTU_MINGGU_PER_PAGE, totalItems);

  // ⬅️ UBAH: Tambahkan flex-wrap dan pisahkan teks info ke atas tombol
  container.style.flexDirection = 'column';
  let html = `<div style="font-size:11px; color:#6b7280; margin-bottom:8px;"><strong>${startCount}-${endCount}</strong> dari <strong>${totalItems}</strong></div>`;
  
  html += `<div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">`;
  
  const prevDisabled = currentOrtuMingguPage === 1 ? 'opacity:0.5; pointer-events:none;' : '';
  html += `<button onclick="changeOrtuMingguPage(${currentOrtuMingguPage - 1})" style="padding:6px 12px; border-radius:8px; border:1px solid #e5e7eb; background:white; font-size:11px; font-weight:700; color:#374151; cursor:pointer; flex-shrink:0; ${prevDisabled}">Prev</button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentOrtuMingguPage - 1 && i <= currentOrtuMingguPage + 1)) {
      const isActive = i === currentOrtuMingguPage;
      const style = isActive 
          ? `background:#1040a0; color:white; border:1px solid #1040a0; pointer-events:none;` 
          : `background:white; color:#374151; border:1px solid #e5e7eb; cursor:pointer;`;
      html += `<button onclick="changeOrtuMingguPage(${i})" style="padding:6px 10px; border-radius:8px; font-size:11px; font-weight:700; flex-shrink:0; ${style}">${i}</button>`;
    } else if (i === currentOrtuMingguPage - 2 || i === currentOrtuMingguPage + 2) {
      html += `<span style="padding:4px; font-size:11px; color:#9ca3af;">...</span>`;
    }
  }

  const nextDisabled = currentOrtuMingguPage === totalPages ? 'opacity:0.5; pointer-events:none;' : '';
  html += `<button onclick="changeOrtuMingguPage(${currentOrtuMingguPage + 1})" style="padding:6px 12px; border-radius:8px; border:1px solid #e5e7eb; background:white; font-size:11px; font-weight:700; color:#374151; cursor:pointer; flex-shrink:0; ${nextDisabled}">Next</button>`;
  
  html += `</div>`;
  container.innerHTML = html;
}

function changeOrtuMingguPage(page) {
  currentOrtuMingguPage = page;
  renderMingguanUI();
}

/* ════ KARYA (DENGAN SEARCH & PAGINATION) ════ */
function renderKarya(karya) {
  // Simpan data mentah ke variabel global agar bisa difilter & dipaginasi
  ortuKaryaData = karya || [];
  currentOrtuKaryaPage = 1;
  renderKaryaUI();
}

function filterOrtuKarya() {
  currentOrtuKaryaPage = 1;
  renderKaryaUI();
}

function renderKaryaUI() {
  let ind = 0;
  let kel = 0;

  // 1. Hitung Statistik (Dihitung dari semua karya, tidak terpengaruh search)
  ortuKaryaData.forEach(k => {
    const arrKode = String(k.kode_siswa || '').split(',');
    const isKel = (k.jenis?.toLowerCase().includes('kelompok')) || arrKode.length > 1;
    if (isKel) kel++; else ind++;
  });

  document.getElementById('karya-stats').innerHTML = `
    <div class="ks-card" style="background:#fdf2f8;"><div style="font-size:20px;font-weight:700;color:#db2777;">${ortuKaryaData.length}</div><div style="font-size:10px;font-weight:600;color:#db2777;margin-top:2px;">Total Karya</div></div>
    <div class="ks-card" style="background:#eff6ff;"><div style="font-size:20px;font-weight:700;color:#2563eb;">${ind}</div><div style="font-size:10px;font-weight:600;color:#2563eb;margin-top:2px;">Individu</div></div>
    <div class="ks-card" style="background:#f0fdf4;"><div style="font-size:20px;font-weight:700;color:#16a34a;">${kel}</div><div style="font-size:10px;font-weight:600;color:#16a34a;margin-top:2px;">Kelompok</div></div>`;

  // 2. Filter berdasarkan pencarian
  const searchQ = (document.getElementById('ortu-search-karya')?.value || '').toLowerCase();
  let filteredList = ortuKaryaData;
  
  if (searchQ) {
    filteredList = filteredList.filter(k => 
      (k.judul || '').toLowerCase().includes(searchQ) ||
      (k.kategori || '').toLowerCase().includes(searchQ)
    );
  }

  const grid = document.getElementById('karya-grid');
  const paginationEl = document.getElementById('ortu-karya-pagination');
  grid.innerHTML = '';
  
  if (!filteredList.length) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#9ca3af; font-size:12px; background:white; border-radius:12px; border:1px solid #f0f0f0;">Tidak ada karya yang sesuai dengan pencarian.</div>';
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  // 3. Logika Pagination
  const totalItems = filteredList.length;
  const totalPages = Math.ceil(totalItems / ORTU_KARYA_PER_PAGE);
  if (currentOrtuKaryaPage > totalPages) currentOrtuKaryaPage = totalPages;

  const startIndex = (currentOrtuKaryaPage - 1) * ORTU_KARYA_PER_PAGE;
  const paginatedList = filteredList.slice(startIndex, startIndex + ORTU_KARYA_PER_PAGE);

  // 4. Render Kartu Karya (Sesuai Halaman Aktif)
  paginatedList.forEach(k => {
    const arrKode = String(k.kode_siswa || '').split(',');
    const isKel = (k.jenis?.toLowerCase().includes('kelompok')) || arrKode.length > 1;
    
    const el = document.createElement('div');
    el.className = 'karya-card';
    el.innerHTML = `
      ${k.gambar
        ? `<img class="karya-img" src="${escH(k.gambar)}" alt="${escH(k.judul || '')}">`
        : `<div class="karya-nopic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`}
      <div class="karya-body">
        <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:99px;${isKel?'background:#dcfce7;color:#15803d;':'background:#dbeafe;color:#1e40af;'}">${isKel ? 'Kelompok' : 'Individu'}</span>
        <div class="karya-title" style="margin-top:5px;">${escH(k.judul || '–')}</div>
        ${k.tanggal ? `<div style="font-size:10px;color:#9ca3af;">${fmtShort(k.tanggal)}</div>` : ''}
      </div>`;
    el.onclick = () => openKaryaModal(k);
    grid.appendChild(el);
  });

  // 5. Render Tombol Paginasi
  renderOrtuKaryaPagination(totalItems, totalPages);
}

function renderOrtuKaryaPagination(totalItems, totalPages) {
  const container = document.getElementById('ortu-karya-pagination');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  // ⬅️ UBAH: Tambahkan flex-wrap dan flex-shrink: 0
  let html = `<div style="display:flex; gap:6px; margin: 10px auto; flex-wrap:wrap; justify-content:center;">`;
  
  const prevDisabled = currentOrtuKaryaPage === 1 ? 'opacity:0.5; pointer-events:none;' : '';
  html += `<button onclick="changeOrtuKaryaPage(${currentOrtuKaryaPage - 1})" style="padding:6px 12px; border-radius:8px; border:1px solid #e5e7eb; background:white; font-size:11px; font-weight:700; color:#374151; cursor:pointer; flex-shrink:0; ${prevDisabled}">Prev</button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentOrtuKaryaPage - 1 && i <= currentOrtuKaryaPage + 1)) {
      const isActive = i === currentOrtuKaryaPage;
      const style = isActive 
          ? `background:#1040a0; color:white; border:1px solid #1040a0; pointer-events:none;` 
          : `background:white; color:#374151; border:1px solid #e5e7eb; cursor:pointer;`;
      html += `<button onclick="changeOrtuKaryaPage(${i})" style="padding:6px 10px; border-radius:8px; font-size:11px; font-weight:700; flex-shrink:0; ${style}">${i}</button>`;
    } else if (i === currentOrtuKaryaPage - 2 || i === currentOrtuKaryaPage + 2) {
      html += `<span style="padding:4px; font-size:11px; color:#9ca3af;">...</span>`;
    }
  }

  const nextDisabled = currentOrtuKaryaPage === totalPages ? 'opacity:0.5; pointer-events:none;' : '';
  html += `<button onclick="changeOrtuKaryaPage(${currentOrtuKaryaPage + 1})" style="padding:6px 12px; border-radius:8px; border:1px solid #e5e7eb; background:white; font-size:11px; font-weight:700; color:#374151; cursor:pointer; flex-shrink:0; ${nextDisabled}">Next</button>`;
  
  html += `</div>`;
  container.innerHTML = html;
}

function changeOrtuKaryaPage(page) {
  currentOrtuKaryaPage = page;
  renderKaryaUI();
}

/* ════ SKL ════ */
function renderSKL(skl) {
  const list = document.getElementById('skl-list');
  list.innerHTML = '';
  if (!skl.length) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;">Belum ada data SKL.</div>';
    return;
  }
  skl.forEach(item => {
    const isTer = (item.status || '').toLowerCase().includes('terpenuhi');
    const isCuk = (item.status || '').toLowerCase().includes('cukup');
    const cardCls  = isTer ? 'skl-t' : isCuk ? 'skl-c' : 'skl-b';
    const badgeCls = isTer ? 'skl-bt' : isCuk ? 'skl-bc' : 'skl-bb';
    const noteCls  = isTer ? 'skl-ct' : isCuk ? 'skl-cc' : 'skl-cb';
    const ic       = isTer ? '#22c55e' : isCuk ? '#f59e0b' : '#ef4444';

    const subs = item.sub_materi || [];
    let subHtml = '';
    if (subs.length) {
      const subItems = subs.map(sub => {
        const subOk  = ['dikuasai','selesai','terpenuhi'].some(w => (sub.status||'').toLowerCase().includes(w));
        const subMid = ['proses','cukup'].some(w => (sub.status||'').toLowerCase().includes(w));
        const subDot   = subOk ? '#22c55e' : subMid ? '#f59e0b' : '#ef4444';
        const subColor = subOk ? '#15803d' : subMid ? '#b45309' : '#b91c1c';
        return `<div class="skl-sub-item">
          <div class="skl-sub-dot" style="background:${subDot};"></div>
          <span class="skl-sub-name">${sub.nama_sub_materi || '–'}</span>
          <span class="skl-sub-status" style="color:${subColor};">${sub.status || '–'}</span>
        </div>${sub.catatan ? `<div class="skl-sub-catatan">${sub.catatan}</div>` : ''}`;
      }).join('');
      subHtml = `<div class="skl-sub-divider"></div><div class="skl-sub-title">Sub Kompetensi</div><div class="skl-sub-list">${subItems}</div>`;
    }

    const el = document.createElement('div');
    el.className = `skl-card ${cardCls}`;
    el.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="width:36px;height:36px;border-radius:10px;background:white;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${ic}" stroke-width="2.2">
            <circle cx="12" cy="12" r="10"/>
            ${isTer ? '<path d="M8 12l3 3 5-5"/>' : `<path d="M12 8v4"/><circle cx="12" cy="16" r="1" fill="${ic}"/>`}
          </svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div class="skl-name">${item.mata_kompetensi || '–'}</div>
          ${item.deskripsi ? `<div class="skl-desc">${item.deskripsi}</div>` : ''}
          <span class="skl-badge ${badgeCls}">${isTer ? '🏅' : isCuk ? '🏅' : '⏸'} ${item.status || 'Belum'}</span>
        </div>
      </div>
      ${item.catatan_guru ? `<div class="skl-catatan ${noteCls}" style="margin-top:10px;"><strong>Catatan:</strong> ${item.catatan_guru}</div>` : ''}
      ${subHtml}`;
    list.appendChild(el);
  });
}

/* ════ MODAL: MATERI ════ */
function openMateriModal(m) {
  document.getElementById('mm-title').textContent = m.nama_materi || m.id_materi || 'Detail';

  const vu = ytEmbed(m.video || '');
  if (vu) {
    document.getElementById('mm-video-wrap').classList.add('hidden');
    document.getElementById('mm-video-frame').classList.remove('hidden');
    document.getElementById('mm-iframe').src = vu;
  } else {
    document.getElementById('mm-video-wrap').classList.remove('hidden');
    document.getElementById('mm-video-frame').classList.add('hidden');
    document.getElementById('mm-iframe').src = '';
  }

  const sb = document.getElementById('mm-status-block');
  const n  = ns(m.status || '');
  if (m.status) {
    sb.classList.remove('hidden');
    const map = {
      selesai: ['#f0fdf4','#22c55e','#15803d','✅ Selesai'],
      proses:  ['#fffbeb','#f59e0b','#92400e','⏳ Dalam Proses'],
      belum:   ['#fff5f5','#ef4444','#991b1b','⏸ Belum Dikerjakan'],
    };
    const [bg, bc, tc, lbl] = map[n];
    sb.style.cssText = `background:${bg};border:1.5px solid ${bc};border-radius:12px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;`;
    sb.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${bc}" stroke-width="2.2">
      <circle cx="12" cy="12" r="10"/>
      ${n==='selesai'?'<path d="M8 12l3 3 5-5"/>':n==='proses'?'<polyline points="12 6 12 12 16 14"/>':`<path d="M12 8v4"/><circle cx="12" cy="16" r="1" fill="${bc}"/>`}
    </svg><span style="font-size:13px;font-weight:700;color:${tc};">${lbl}</span>`;
  } else {
    sb.classList.add('hidden');
  }

  document.getElementById('mm-desc').textContent = m.deskripsi || `Materi: ${escH(m.nama_materi || m.id_materi)}`;

  const given = m.tanggal_mulai || m.tanggal_diberi;
  const dEl   = document.getElementById('mm-dates');
  if (given || m.deadline) {
    dEl.classList.remove('hidden');
    document.getElementById('mm-given').textContent = fmtShort(given);
    document.getElementById('mm-due').textContent   = fmtShort(m.deadline);
  } else dEl.classList.add('hidden');

  const pEl = document.getElementById('mm-poin-block');
  // Menampilkan Nilai jika ada
  const nEl_nilai = document.getElementById('mm-nilai-block');
  if (nEl_nilai) {
    if (m.nilai && m.nilai.toString().trim() !== '') {
      nEl_nilai.classList.remove('hidden');
      document.getElementById('mm-nilai').textContent = m.nilai;
    } else {
      nEl_nilai.classList.add('hidden');
    }
  }

  if (m._isPoin && m.poin !== undefined && m.poin !== '') {
    pEl.classList.remove('hidden');
    document.getElementById('mm-poin').textContent = m.poin + ' pts';
  } else pEl.classList.add('hidden');

  const nEl = document.getElementById('mm-note');
  if (m.catatan_guru && m.catatan_guru.trim()) {
    nEl.classList.remove('hidden');
    document.getElementById('mm-note-text').textContent = m.catatan_guru;
  } else nEl.classList.add('hidden');

  // 1. Logika Tombol Google Slide (Muncul jika ada link di database)
  const slideLink = document.getElementById('mm-slide-link');
  if (m.slide && String(m.slide).trim() !== '') {
    slideLink.classList.remove('hidden');
    // ⬅️ MENGGUNAKAN JEMBATAN KODULAR
    slideLink.href = "javascript:void(0);";
    slideLink.onclick = () => bukaLinkEksternal(m.slide);
  } else {
    slideLink.classList.add('hidden');
  }

  // 2. Logika Tombol Lihat File 
  const fileLink = document.getElementById('mm-file-link');
  const fu = m.file || m.link_file || m.link_tugas;
  
  if (fu && n === 'selesai') { 
    fileLink.classList.remove('hidden');
    // ⬅️ MENGGUNAKAN JEMBATAN KODULAR JUGA
    fileLink.href = "javascript:void(0);";
    fileLink.onclick = () => bukaLinkEksternal(fu);
  } else {
    fileLink.classList.add('hidden');
  }

  document.getElementById('modal-materi').classList.remove('hidden');
}

function openWeeklyModal(tg) {
  const judul = tg.judul_tugas || tg.judul || tg.nama_tugas || '–';
  openMateriModal({
    nama_materi:  judul,
    status:       tg.status,
    deskripsi:    tg.deskripsi || `Kategori: ${tg.kategori || '–'} · ${tg.minggu || ''}`,
    catatan_guru: tg.catatan_guru || null,
    tanggal_mulai:tg.tanggal_diberi || null,
    deadline:     tg.deadline || null,
    video:        tg.link_youtube || tg.video || null,
    // ⬅️ LOGIKA BARU: Ambil link_hasil agar ortu bisa melihat karya yang dikumpulkan
    link_tugas:   tg.link_hasil || tg.link_tugas || null, 
    poin:         tg.poin,
    _isPoin:      true,
  });
}

/* ════ MODAL: KARYA ════ */
function openKaryaModal(k) {
  document.getElementById('km-title').textContent = k.judul || '–';
  const img = document.getElementById('km-img');
  if (k.gambar) { img.src = k.gambar; img.classList.remove('hidden'); }
  else img.classList.add('hidden');

  // 3. Terapkan Logika Pintar di Modal juga
  const arrKode = String(k.kode_siswa || '').split(',');
  const isKel = (k.jenis?.toLowerCase().includes('kelompok')) || arrKode.length > 1;

  document.getElementById('km-tags').innerHTML = `
    <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;${isKel?'background:#dcfce7;color:#15803d;':'background:#dbeafe;color:#1e40af;'}">${isKel?'👥 Kelompok':'👤 Individu'}</span>
    ${k.kategori ? `<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:#f3f4f6;color:#6b7280;font-weight:600;">${escH(k.kategori)}</span>` : ''}
    ${k.tanggal  ? `<span style="font-size:11px;color:#9ca3af;">📅 ${fmtShort(k.tanggal)}</span>` : ''}`;

  const db = document.getElementById('km-desc-block');
  if (k.deskripsi) { db.classList.remove('hidden'); document.getElementById('km-desc').textContent = k.deskripsi; }
  else db.classList.add('hidden');

  const lb    = document.getElementById('km-links');
  const links = k.links || [];
  if (k.link_karya && !links.length) links.push({ label: 'Lihat Karya', url: k.link_karya });
  if (links.length) {
    lb.innerHTML = `<div style="font-size:11px;font-weight:700;color:#9ca3af;margin-bottom:6px;">LINK KARYA</div>` +
      links.map(l => `<a href="javascript:void(0);" onclick="bukaLinkEksternal('${escH(l.url)}')" class="karya-link-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        <span class="karya-link-text">${escH(l.label || 'Lihat')}</span>
      </a>`).join('');
  } else lb.innerHTML = '';

  document.getElementById('modal-karya').classList.remove('hidden');
}

/* ════ MODAL CLOSE ════ */
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (id === 'modal-materi') document.getElementById('mm-iframe').src = '';
}
document.getElementById('modal-materi').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('modal-materi'); });
document.getElementById('modal-karya').addEventListener('click',  e => { if (e.target === e.currentTarget) closeModal('modal-karya'); });

/* ════ PAGE SWITCH ════ */
function switchPage(name) {
  // Pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');

  // Bottom nav (mobile)
  document.querySelectorAll('.bn-btn').forEach(b => {
    const active = b.dataset.page === name;
    b.classList.toggle('active', active);
    const svg = b.querySelector('svg');
    if (svg) svg.style.stroke = active ? '#1040a0' : '#9ca3af';
  });

  // Sidebar nav (desktop)
  ['beranda','tugas','mingguan','karya','skl'].forEach(pg => {
    const btn = document.getElementById('sbn-' + pg);
    if (btn) btn.classList.toggle('active', pg === name);
  });

  // Reset tugas sub-view
  if (name === 'tugas') {
    document.getElementById('view-bab-page').classList.remove('hidden');
    document.getElementById('view-materi-page').classList.add('hidden');
  }

  // Scroll to top
  const ca = document.querySelector('.content-area');
  if (ca) ca.scrollTop = 0;
  else window.scrollTo(0, 0);
}

/* ════ RESPONSIVE: Fix profile-screen display on resize ════ */
window.addEventListener('resize', () => {
  const ps = document.getElementById('profile-screen');
  if (!ps.classList.contains('is-visible')) return;
  if (window.innerWidth >= 768) ps.style.display = '';
  else ps.style.display = 'block';
});

/* ════ JADWAL PELAJARAN ════ */
function renderJadwal(jadwalList, kelasSiswa) {
  document.getElementById('jadwal-kelas-label').textContent = kelasSiswa || '';
  const container = document.getElementById('jadwal-list');
  container.innerHTML = '';
  
  const daftarHari = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  if (!jadwalList || jadwalList.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; font-size:12px; color:#9ca3af;">Belum ada jadwal pelajaran yang diatur untuk kelas ini.</div>';
    return;
  }

  daftarHari.forEach(hari => {
    // Ambil jadwal khusus untuk hari tersebut
    const items = jadwalList.filter(x => (x.hari || '').toLowerCase() === hari.toLowerCase());
    
    // Urutkan berdasarkan waktu secara otomatis (A-Z)
    items.sort((a, b) => (a.waktu || '').localeCompare(b.waktu || ''));
    
    let itemsHtml = '';
    if (items.length === 0) {
      itemsHtml = `<div style="padding:12px 16px; font-size:11px; color:#9ca3af; font-style:italic;">Libur / Tidak ada mata pelajaran</div>`;
    } else {
      itemsHtml = items.map(i => `
        <div class="j-item">
          <div class="j-time">${i.waktu || '–'}</div>
          <div style="flex:1;">
            <div class="j-detail-title">${i.mapel || 'Istirahat / Jam Kosong'}</div>
            ${i.guru ? `<div class="j-detail-loc"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${i.guru}</div>` : ''}
          </div>
        </div>
      `).join('');
    }

    // Gabungkan Header Hari dengan Daftar Mapel
    const groupHtml = `
      <div class="day-group">
        <div class="day-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e40af" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${hari}
        </div>
        ${itemsHtml}
      </div>
    `;
    container.innerHTML += groupHtml;
  });
}

function bukaLinkEksternal(url) {
  // Cek apakah web sedang dibuka di dalam aplikasi Kodular/AppInventor
  if (typeof window.AppInventor !== 'undefined') {
    // Kirim pesan rahasia ke Kodular berisi URL
    window.AppInventor.setWebViewString("BUKA_BROWSER:" + url);
  } else {
    // Jika dibuka di browser laptop/Chrome biasa, buka tab baru seperti biasa
    window.open(url, '_blank');
  }
}

document.addEventListener('DOMContentLoaded', initApp);