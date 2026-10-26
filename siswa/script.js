/* ════ CONFIG ════ */
const API_URL = "https://script.google.com/macros/s/AKfycbwrqUAnU4MTq_ANvXADI2SW6jJ9MAc1aT7XYAQ-iIkZKx9m_Folqhy2AIQ6Z2KULr2x/exec";
const TOKEN_KEY = 'ict_siswa_token';
const CACHE_KEY = 'ict_siswa_cache';

let DATA = null;
let KODE_SISWA = null;
let CURRENT_BAB_ID = null; // ⬅️ Menyimpan ID bab yang sedang dibuka
let CURRENT_MATERI_ID = null; // ⬅️ TAMBAHKAN BARIS INI
let todoMateriData = [];
let todoTugasData = [];
let currentTodoMateriPage = 1;
let currentTodoTugasPage = 1;
const TODO_PER_PAGE = 5;
let allKaryaData = [];
let currentKaryaPage = 1;
const KARYA_PER_PAGE = 6;

/* ════ INIT & AUTH ════ */
document.addEventListener('DOMContentLoaded', () => {
  const savedToken = localStorage.getItem(TOKEN_KEY);
  const cachedDataStr = localStorage.getItem(CACHE_KEY);

  if (savedToken && cachedDataStr) {
    try {
      DATA = JSON.parse(cachedDataStr);
      KODE_SISWA = DATA.siswa.kode;
      showDashboard();
      renderAll(DATA);
      refreshDataInBackground(savedToken);
    } catch (e) { doLogout(); }
  }
});

async function doLogin() {
  const kode = document.getElementById('inp-kode').value.trim().toUpperCase();
  const pass = document.getElementById('inp-pass').value.trim(); // ⬅️ Ambil password
  
  if (!kode || !pass) {
     const errEl = document.getElementById('login-err');
     errEl.textContent = "NIS dan Password wajib diisi.";
     errEl.classList.remove('hidden');
     return;
  }
  
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Memverifikasi...';
  document.getElementById('login-err').classList.add('hidden');
  
  try {
    // ⬅️ Kirim password via URL
    const json = await fetchJSONP(`${API_URL}?kode=${kode}&password=${encodeURIComponent(pass)}`, 'cb_' + Date.now());
    if (!json.success) { 
      const errEl = document.getElementById('login-err');
      errEl.textContent = json.message || "Gagal masuk.";
      errEl.classList.remove('hidden');
      return; 
    }
    
    localStorage.setItem(TOKEN_KEY, json.token);
    localStorage.setItem(CACHE_KEY, JSON.stringify(json));
    DATA = json;
    KODE_SISWA = DATA.siswa.kode;
    
    document.getElementById('inp-pass').value = ''; // Bersihkan input password
    showDashboard();
    renderAll(json);
  } catch (e) {
    alert('Gagal terhubung ke server.');
  } finally {
    btn.disabled = false; btn.textContent = 'Mulai Belajar';
  }
}

function doLogout() {
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CACHE_KEY);
  DATA = null; KODE_SISWA = null;
  const ps = document.getElementById('profile-screen');
  ps.classList.remove('is-visible');
  ps.classList.add('hidden');
  ps.style.display = '';
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('inp-kode').value = '';
}

// Fungsi Refresh Data Manual
async function manualRefresh() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  // 1. Putar semua ikon refresh di layar
  const btnIcons = document.querySelectorAll('.refresh-icon');
  btnIcons.forEach(icon => icon.classList.add('is-spinning'));

  // 2. Tarik data secara transparan dari server
  try {
    await refreshDataInBackground(token);
    toast('Data berhasil diperbarui! ✨', 'success');
  } catch (e) {
    toast('Gagal menyegarkan data. Cek koneksi.', 'error');
  } finally {
    // 3. Hentikan putaran ikon setelah data selesai ditarik
    setTimeout(() => {
      btnIcons.forEach(icon => icon.classList.remove('is-spinning'));
    }, 500); // Jeda kecil agar animasinya terasa mulus
  }
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  const ps = document.getElementById('profile-screen');
  ps.classList.remove('hidden');
  ps.classList.add('is-visible');
  // Atur display flex/block berdasarkan ukuran layar
  if (window.innerWidth < 768) ps.style.display = 'block';
  else ps.style.display = '';
  switchPage('beranda');
}

/* ════ SERVER COMMUNICATION ════ */
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

async function refreshDataInBackground(token) {
  try {
    const json = await fetchJSONP(`${API_URL}?token=${token}`, 'cb_bg_' + Date.now());
    if (json.success) {
      DATA = json;
      localStorage.setItem(CACHE_KEY, JSON.stringify(json));
      renderAll(json);
    } else if (json.expired) {
      doLogout();
    }
  } catch (e) { console.log("Offline mode."); }
}

// Fungsi POST untuk mengirim data "Tandai Selesai" ke Dasbor Guru
async function postAPI(body) {
  body.token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(API_URL, {
    method : 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body   : JSON.stringify(body),
  });
  return await res.json();
}

function renderAll(json) {
  document.getElementById('s-nama').textContent = json.siswa.nama;
  document.getElementById('s-kelas').textContent = 'Kelas ' + json.siswa.kelas;
  
  // Update Desktop Sidebar
  const sbNama = document.getElementById('sb-nama');
  if(sbNama) sbNama.textContent = json.siswa.nama;
  const sbKelas = document.getElementById('sb-kelas');
  if(sbKelas) sbKelas.textContent = 'Kelas ' + json.siswa.kelas;
  const pNama = document.getElementById('profil-nama-lengkap');
  if (pNama) pNama.textContent = json.siswa.nama;
  const pNis = document.getElementById('profil-nis-lengkap');
  if (pNis) pNis.textContent = 'NIS: ' + json.siswa.kode;
  const pKelas = document.getElementById('profil-kelas-lengkap');
  if (pKelas) pKelas.textContent = 'Kelas: ' + json.siswa.kelas;
  
  // Hitung Total Poin
  const poinTugas = (json.tugasMingguan || [])
    .filter(t => ns(t.status) === 'selesai')
    .reduce((sum, t) => sum + (parseFloat(t.poin) || 0), 0);
  document.getElementById('s-poin').textContent = poinTugas;
  
  const sbPoin = document.getElementById('sb-poin');
  if(sbPoin) sbPoin.textContent = poinTugas;

  renderBeranda(json);
  renderMateri(json);
  renderTugas(json);
  renderKarya(json);
  renderJadwal(json);
  
  // ════ BAGIAN BARU: Refresh otomatis List Materi jika halamannya sedang dibuka ════
  const vMat = document.getElementById('view-materi-page');
  if (vMat && !vMat.classList.contains('hidden') && CURRENT_BAB_ID) {
    showMateriListByBab(CURRENT_BAB_ID);
  }
}

// 1. BERANDA (DASHBOARD PINTAR DENGAN PEMISAHAN MATERI & TUGAS)
function renderBeranda(json) {
  // A. KALKULASI SKOR
  const skorEl = document.getElementById('beranda-skor');
  const totalPoin = (json.tugasMingguan || [])
    .filter(t => ns(t.status) === 'selesai')
    .reduce((sum, t) => sum + (parseFloat(t.poin) || 0), 0);
  if(skorEl) {
    skorEl.innerHTML = `
      <div style="margin-bottom:16px; padding: 0 14px;">
         <div style="background:linear-gradient(135deg, #1e3a8a, #3b82f6); border-radius:16px; padding:24px; color:white; box-shadow:0 8px 20px rgba(37, 99, 235, 0.25); text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; overflow:hidden;">
            <div style="position:absolute; width:150px; height:150px; background:rgba(255,255,255,0.05); border-radius:50%; top:-50px; right:-50px;"></div>
            <div style="position:absolute; width:100px; height:100px; background:rgba(255,255,255,0.05); border-radius:50%; bottom:-20px; left:-20px;"></div>
            <div style="font-size:11px; font-weight:800; opacity:0.85; text-transform:uppercase; margin-bottom:4px; letter-spacing:1px; z-index:2;">🏆 Skor Tugas Praktik</div>
            <div style="font-size:46px; font-weight:800; line-height:1; letter-spacing:-1px; z-index:2; text-shadow:0 4px 10px rgba(0,0,0,0.2);">${totalPoin}</div>
         </div>
      </div>`;
  }

  // B. PENGUMPULAN DATA MATERI
  todoMateriData = [];
  (json.materi || []).forEach(m => {
    const p = (json.progres || []).find(x => x.id_materi === m.id_materi) || {};
    const bukaKelas = (m.buka_kelas || '').toLowerCase();
    
    if (ns(p.status) !== 'selesai' && bukaKelas !== 'kunci' && bukaKelas !== 'sembunyikan') {
      const isTugasMateri = (m.link_form && m.link_form.trim() !== '');
      todoMateriData.push({
        tipe: isTugasMateri ? 'tugas_materi' : 'materi',
        data: m,
        judul: m.nama_materi,
        kategori: isTugasMateri ? 'Tugas Modul' : 'Materi Belajar',
        deadline: p.deadline || m.deadline || '',
        status: ns(p.status)
      });
    }
  });

  // Urutkan materi berdasarkan deadline
  todoMateriData.sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1; 
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  // C. PENGUMPULAN DATA TUGAS MINGGUAN
  todoTugasData = [];
  (json.tugasMingguan || []).forEach(t => {
    const bukaKelas = (t.buka_kelas_master || '').toLowerCase(); // ⬅️ LOGIKA BARU
    
    // Jangan tampilkan di Beranda jika statusnya Selesai, Kunci, atau Sembunyikan
    if (ns(t.status) !== 'selesai' && bukaKelas !== 'kunci' && bukaKelas !== 'sembunyikan') {
      todoTugasData.push({
        tipe: 'tugas_mingguan',
        data: t,
        judul: t.judul,
        kategori: t.kategori || 'Tugas Praktik',
        deadline: t.deadline || '',
        status: ns(t.status)
      });
    }
  });

  // Urutkan tugas berdasarkan deadline
  todoTugasData.sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1; 
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  // Reset page ke halaman pertama dan jalankan render awal
  currentTodoMateriPage = 1;
  currentTodoTugasPage = 1;
  
  filterTodoMateri();
  filterTodoTugas();
}

/* ── FUNGSI PENCARIAN & PAGINATION BERANDA ── */
function filterTodoMateri() {
  currentTodoMateriPage = 1;
  renderTodoMateriUI();
}

function filterTodoTugas() {
  currentTodoTugasPage = 1;
  renderTodoTugasUI();
}

function renderTodoMateriUI() {
  const listEl = document.getElementById('todo-materi-list');
  const searchQ = (document.getElementById('search-materi')?.value || '').toLowerCase();
  const paginationEl = document.getElementById('todo-materi-pagination');
  if (!listEl) return;
  
  let filtered = todoMateriData;
  if (searchQ) {
    filtered = filtered.filter(item => item.judul.toLowerCase().includes(searchQ) || item.kategori.toLowerCase().includes(searchQ));
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:20px; background:white; border-radius:12px; border:1px solid #e5e7eb; font-size:13px; color:#6b7280;">🎉 Yeaay! Tidak ada tanggungan materi saat ini.</div>`;
    if(paginationEl) paginationEl.innerHTML = '';
    return;
  }

  // LOGIKA PAGINASI BARU: Jika halaman 1 dan tidak ada search, item ke-0 jadi Prioritas
  const isPriorityPage = currentTodoMateriPage === 1 && !searchQ;
  const itemsPerPage = isPriorityPage ? (TODO_PER_PAGE + 1) : TODO_PER_PAGE;
  const totalPages = Math.ceil(filtered.length / TODO_PER_PAGE); // Tetap hitung berdasarkan page standar
  
  const start = (currentTodoMateriPage - 1) * TODO_PER_PAGE;
  const paginated = filtered.slice(start, start + itemsPerPage);
  
  listEl.innerHTML = '';
  paginated.forEach((item, index) => {
    // Jika halaman 1, item pertama adalah prioritas, sisanya adalah daftar standar
    const isHighlight = isPriorityPage && index === 0;
    listEl.innerHTML += generateTodoCardHTML(item, isHighlight);
  });
  
  renderTodoPagination('materi', totalPages, currentTodoMateriPage, paginationEl);
}

function renderTodoTugasUI() {
  const listEl = document.getElementById('todo-tugas-list');
  const searchQ = (document.getElementById('search-tugas')?.value || '').toLowerCase();
  const paginationEl = document.getElementById('todo-tugas-pagination');
  if (!listEl) return;
  
  let filtered = todoTugasData;
  if (searchQ) {
    filtered = filtered.filter(item => item.judul.toLowerCase().includes(searchQ) || item.kategori.toLowerCase().includes(searchQ));
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:20px; background:white; border-radius:12px; border:1px solid #e5e7eb; font-size:13px; color:#6b7280;">🎉 Yeaay! Tidak ada tugas praktik yang belum selesai.</div>`;
    if(paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / TODO_PER_PAGE);
  if (currentTodoTugasPage > totalPages) currentTodoTugasPage = totalPages;
  
  const start = (currentTodoTugasPage - 1) * TODO_PER_PAGE;
  const paginated = filtered.slice(start, start + TODO_PER_PAGE);
  
  listEl.innerHTML = '';
  paginated.forEach((item, index) => {
    const isHighlight = index === 0 && currentTodoTugasPage === 1 && !searchQ; 
    listEl.innerHTML += generateTodoCardHTML(item, isHighlight);
  });
  
  renderTodoPagination('tugas', totalPages, currentTodoTugasPage, paginationEl);
}

/* ── GENERATOR DESAIN KARTU ── */
function generateTodoCardHTML(item, isHighlight) {
  const isProses = item.status === 'proses';
  const dStr = JSON.stringify(item.data).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  let bgGradient, iconHtml, badgeText, textColor, fnClick;
  
  if (item.tipe === 'tugas_mingguan') {
      fnClick = `openModalTugas(${dStr})`;
      bgGradient = isProses ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #ef4444, #dc2626)';
      badgeText = isProses ? '⏳ Menunggu Nilai' : '🚨 Wajib Kumpul';
      iconHtml = isProses ? '🚀' : '📝';
      textColor = isProses ? '#d97706' : '#dc2626';
  } else if (item.tipe === 'tugas_materi') {
      // ⬅️ UBAH BARIS INI
      fnClick = `openMateriFromBeranda('${item.data.id_bab}', '${item.data.id_materi}')`;
      bgGradient = isProses ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
      badgeText = isProses ? '⏳ Dicek Guru' : '📋 Tugas Modul';
      iconHtml = '✍️';
      textColor = isProses ? '#d97706' : '#7c3aed';
  } else {
      // ⬅️ UBAH BARIS INI JUGA
      fnClick = `openMateriFromBeranda('${item.data.id_bab}', '${item.data.id_materi}')`;
      bgGradient = isProses ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'linear-gradient(135deg, #0ea5e9, #0284c7)';
      badgeText = isProses ? '⏳ Cek Materi' : '📖 Baca Modul';
      iconHtml = '📚';
      textColor = isProses ? '#2563eb' : '#0284c7';
  }

  let dateHtml = '';
  if (item.deadline) {
     const d = new Date(item.deadline);
     if (!isNaN(d)) {
       const tgl = d.toLocaleDateString('id-ID', { day:'numeric', month:'short' });
       dateHtml = `<div style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#ef4444; background:#fee2e2; padding:2px 6px; border-radius:4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${tgl}</div>`;
     }
  }

  // Jika item berada di urutan pertama (Highlight Card Besar)
  if (isHighlight) {
     return `
      <div style="background:white; border-radius:16px; padding:16px; border:2px solid ${textColor}; box-shadow:0 8px 25px rgba(0,0,0,0.06); cursor:pointer; position:relative; overflow:hidden;" onclick="${fnClick}">
        <div style="position:absolute; top:0; right:16px; background:${textColor}; color:white; font-size:10px; font-weight:800; padding:6px 12px; border-bottom-left-radius:8px; border-bottom-right-radius:8px; letter-spacing:0.5px;">PRIORITAS UTAMA</div>
        <div style="display:flex; gap:14px; align-items:center; margin-top:8px;">
          <div style="width:52px; height:52px; border-radius:14px; background:${bgGradient}; color:white; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:24px; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
            ${iconHtml}
          </div>
          <div style="flex:1;">
            <div style="font-size:10px; font-weight:800; color:${textColor}; text-transform:uppercase; margin-bottom:4px;">
              ${badgeText}
            </div>
            <div style="font-size:16px; font-weight:800; color:#0f172a; line-height:1.2; margin-bottom:6px;">
              ${escH(item.judul)}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
               <div style="font-size:11px; color:#64748b; font-weight:600;">${escH(item.kategori)}</div>
               ${dateHtml}
            </div>
          </div>
        </div>
      </div>`;
  } else {
     // Card Standar (Baris Kecil)
     let listDateHtml = '';
     if (item.deadline) {
        const d = new Date(item.deadline);
        if (!isNaN(d)) listDateHtml = `<div style="font-size:10px; font-weight:700; color:#ef4444; margin-left:8px;">• ${d.toLocaleDateString('id-ID', { day:'numeric', month:'short' })}</div>`;
     }

     return `
      <div style="background:white; border-radius:14px; padding:14px; border:1px solid #f1f5f9; box-shadow:0 2px 8px rgba(0,0,0,0.02); display:flex; gap:12px; align-items:center; cursor:pointer;" onclick="${fnClick}">
        <div style="width:40px; height:40px; border-radius:10px; background:#f8fafc; border:1px solid #e2e8f0; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:18px;">
          ${iconHtml}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:10px; font-weight:800; color:${textColor}; text-transform:uppercase; margin-bottom:2px;">
            ${badgeText}
          </div>
          <div style="font-size:14px; font-weight:700; color:#1e293b; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px;">
            ${escH(item.judul)}
          </div>
          <div style="display:flex; align-items:center;">
              <div style="font-size:10px; color:#94a3b8; font-weight:600;">${escH(item.kategori)}</div>
              ${listDateHtml}
          </div>
        </div>
        <div style="color:#cbd5e1;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></div>
      </div>`;
  }
}

/* ── GENERATOR TOMBOL PAGINATION PINTAR (ANTI-TERPOTONG DI HP) ── */
function renderTodoPagination(type, totalPages, currentPg, container) {
  if (!container) return;
  if (totalPages <= 1) {
      container.innerHTML = '';
      return;
  }

  // 1. Paksa container pembungkus agar bisa turun baris jika layarnya sempit
  container.style.flexWrap = 'wrap';

  let html = '';
  const funcName = type === 'materi' ? 'changePageMateri' : 'changePageTugas';
  
  const prevDisabled = currentPg === 1 ? 'opacity:0.5; pointer-events:none;' : '';
  html += `<button onclick="${funcName}(${currentPg - 1})" style="padding:6px 12px; border-radius:8px; border:1px solid #e5e7eb; background:white; font-size:12px; font-weight:700; color:#374151; cursor:pointer; flex-shrink:0; ${prevDisabled}">Prev</button>`;

  // LOGIKA SMART PAGINATION (Maksimal menampilkan 3 angka di tengah)
  let startPage = Math.max(1, currentPg - 1);
  let endPage = Math.min(totalPages, currentPg + 1);

  if (currentPg === 1) endPage = Math.min(3, totalPages);
  if (currentPg === totalPages) startPage = Math.max(1, totalPages - 2);

  // Tombol Halaman 1
  if (startPage > 1) {
      html += `<button onclick="${funcName}(1)" style="padding:6px 12px; border-radius:8px; background:white; color:#374151; border:1px solid #e5e7eb; cursor:pointer; font-size:12px; font-weight:700; flex-shrink:0;">1</button>`;
      if (startPage > 2) html += `<span style="font-size:12px; color:#9ca3af; padding:0 2px;">...</span>`;
  }

  // Tombol Halaman Tengah (Aktif)
  for (let i = startPage; i <= endPage; i++) {
      const isActive = i === currentPg;
      const style = isActive 
          ? `background:#2563eb; color:white; border:1px solid #2563eb; pointer-events:none;` 
          : `background:white; color:#374151; border:1px solid #e5e7eb; cursor:pointer;`;
      html += `<button onclick="${funcName}(${i})" style="padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; flex-shrink:0; ${style}">${i}</button>`;
  }

  // Tombol Halaman Terakhir
  if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span style="font-size:12px; color:#9ca3af; padding:0 2px;">...</span>`;
      html += `<button onclick="${funcName}(${totalPages})" style="padding:6px 12px; border-radius:8px; background:white; color:#374151; border:1px solid #e5e7eb; cursor:pointer; font-size:12px; font-weight:700; flex-shrink:0;">${totalPages}</button>`;
  }

  const nextDisabled = currentPg === totalPages ? 'opacity:0.5; pointer-events:none;' : '';
  html += `<button onclick="${funcName}(${currentPg + 1})" style="padding:6px 12px; border-radius:8px; border:1px solid #e5e7eb; background:white; font-size:12px; font-weight:700; color:#374151; cursor:pointer; flex-shrink:0; ${nextDisabled}">Next</button>`;

  container.innerHTML = html;
}

function changePageMateri(page) {
  currentTodoMateriPage = page;
  renderTodoMateriUI();
}

function changePageTugas(page) {
  currentTodoTugasPage = page;
  renderTodoTugasUI();
}

// 2. MATERI LIST (Menampilkan Grid Bab)
function renderMateri(json) {
  const gridEl = document.getElementById('bab-grid');
  if (!gridEl) return;
  gridEl.innerHTML = '';
  
  // ⬅️ LOGIKA BARU: Saring Bab yang disembunyikan
  const babAktif = (json.bab || []).filter(b => (b.buka_kelas || '').toLowerCase() !== 'sembunyikan');
  
  if (babAktif.length === 0) {
    gridEl.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:24px; background:white; border-radius:12px; border:1px solid #e5e7eb; margin:0 14px;">Belum ada Bab pembelajaran.</div>`;
    return;
  }

  babAktif.forEach(b => {
    // ⬅️ LOGIKA BARU: Hanya hitung materi yang tidak disembunyikan
    const materiInBab = (json.materi || []).filter(m => m.id_bab === b.id_bab && (m.buka_kelas || '').toLowerCase() !== 'sembunyikan');
    let total = materiInBab.length;
    let selesai = 0;
    
    materiInBab.forEach(m => {
      const p = (json.progres || []).find(x => x.id_materi === m.id_materi) || {};
      if (ns(p.status) === 'selesai') selesai++;
    });
    
    const pct = total === 0 ? 0 : Math.round((selesai / total) * 100);
    // ⬅️ LOGIKA BARU: Kunci Bab jika status buka_kelas adalah "Kunci"
    const isLocked = (b.buka_kelas || '').toLowerCase() === 'kunci';
    const thumb = b.thumbnail || 'https://via.placeholder.com/300x150?text=No+Image';
    
    gridEl.innerHTML += `
      <div class="bab-card ${isLocked ? 'locked-card' : ''}" ${isLocked ? '' : `onclick="showMateriListByBab('${escH(b.id_bab)}')"`}>
        ${isLocked ? `<div class="locked-badge">🔒 Terkunci</div>` : ''}
        <div class="bab-thumb">
          <img src="${escH(thumb)}" class="bab-thumb-img" onerror="this.src='https://via.placeholder.com/300x150?text=Bab'">
        </div>
        <div class="bab-body">
          <div class="bab-title text-truncate">${escH(b.judul_bab)}</div>
          <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
          <div class="prog-pct">${pct}% (${selesai}/${total})</div>
        </div>
      </div>`;
  });
}

// Fungsi Kembali ke Grid Bab
function backToBab() {
  CURRENT_BAB_ID = null; // ⬅️ Reset memori saat siswa keluar dari bab
  document.getElementById('view-materi-page').classList.add('hidden');
  document.getElementById('view-bab-page').classList.remove('hidden');
}

// 3. TUGAS LIST (Layout Ala Udemy)
function renderTugas(json) {
  const sidebarEl = document.getElementById('tugas-list-sidebar');
  const contentEl = document.getElementById('tugas-content-panel');
  if (!sidebarEl) return;
  
  // ⬅️ LOGIKA BARU: Saring tugas yang "sembunyikan" agar hilang dari sidebar
  let tugasList = (json.tugasMingguan || []).filter(t => (t.buka_kelas_master || '').toLowerCase() !== 'sembunyikan');

  const headerKanan = document.getElementById('tugas-right-header');
  if (headerKanan) headerKanan.textContent = `Daftar Tugas (${tugasList.length})`;

  if (tugasList.length === 0) {
    contentEl.innerHTML = `
      <div style="text-align:center; padding:60px 20px; background:white; border-radius:16px; border:1px dashed #cbd5e1;">
        <div style="font-size:36px; margin-bottom:12px;">🎯</div>
        <div style="font-size:16px; font-weight:800; color:#334155;">Belum Ada Tugas</div>
        <div style="font-size:13px; color:#64748b; margin-top:4px;">Saat ini tidak ada tugas praktik yang ditugaskan.</div>
      </div>`;
    sidebarEl.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8; font-size:12px;">Kosong</div>';
    return;
  }

  // Sorting: Prioritaskan yang "Belum" & "Proses" di atas
  tugasList.sort((a, b) => {
    const statA = ns(a.status);
    const statB = ns(b.status);
    const scoreA = (statA === 'selesai') ? 1 : 0; 
    const scoreB = (statB === 'selesai') ? 1 : 0;
    if (scoreA !== scoreB) return scoreA - scoreB;
    return String(a.id_tugas).localeCompare(String(b.id_tugas));
  });

  sidebarEl.innerHTML = '';

  tugasList.forEach((t) => {
    const isLocked = (t.buka_kelas_master || '').toLowerCase() === 'kunci'; // ⬅️ LOGIKA BARU
    const n = isLocked ? 'terkunci' : ns(t.status);
    let iconHtml, statusColor, statusText;

    if (n === 'selesai') { 
      statusColor = '#15803d'; iconHtml = '✅'; statusText = 'Selesai';
    } else if (n === 'proses') { 
      statusColor = '#b45309'; iconHtml = '⏳'; statusText = 'Menunggu Nilai';
    } else if (n === 'terkunci') {
      statusColor = '#94a3b8'; iconHtml = '🔒'; statusText = 'Terkunci';
    } else {
      statusColor = '#64748b'; iconHtml = '📝'; statusText = 'Belum Dikerjakan';
    }

    const tString = JSON.stringify(t).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    // Desain item di sidebar kanan
    sidebarEl.innerHTML += `
      <div id="tugas-item-${t.id_tugas}" class="tugas-sidebar-item" 
           ${isLocked 
             ? `style="opacity:0.6; cursor:not-allowed; padding:14px 16px; border-bottom:1px solid #f1f5f9; display:flex; gap:12px;"` 
             : `onclick="selectTugas(${tString})" style="padding:14px 16px; border-bottom:1px solid #f1f5f9; cursor:pointer; display:flex; gap:12px; transition:background 0.2s;"`}>
         <div style="font-size:14px; margin-top:2px;">${iconHtml}</div>
         <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:800; color:#0f172a; line-height:1.4; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escH(t.judul)}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#64748b;">
               <span>${escH(t.minggu)}</span>
               <span style="color:${statusColor}; font-weight:700;">${statusText}</span>
            </div>
         </div>
      </div>
    `;
  });

  // Otomatis tekan/load tugas pertama yang TIDAK terkunci saat halaman dibuka
  if (tugasList.length > 0) {
     const firstUnlocked = tugasList.find(x => (x.buka_kelas_master || '').toLowerCase() !== 'kunci');
     if (firstUnlocked) {
         selectTugas(firstUnlocked);
     } else {
         contentEl.innerHTML = `<div style="text-align:center; padding: 60px 20px; background:white; border-radius:16px; border:1px dashed #cbd5e1; color:#64748b;">Semua tugas sedang dikunci oleh Guru.</div>`;
     }
  }
}

// ── FUNGSI BARU: Untuk Mengisi Panel Kiri Saat Tugas Dipilih ──
function selectTugas(t) {
   // 1. Beri efek "Aktif/Terpilih" pada Sidebar
   document.querySelectorAll('.tugas-sidebar-item').forEach(el => {
      el.style.background = 'white';
      el.style.borderLeft = 'none';
   });
   const activeEl = document.getElementById('tugas-item-' + t.id_tugas);
   if (activeEl) {
      activeEl.style.background = '#f8fafc';
      activeEl.style.borderLeft = '4px solid #2563eb';
   }

   const contentEl = document.getElementById('tugas-content-panel');
   const isDone = ns(t.status) === 'selesai';
   const isProses = ns(t.status) === 'proses';
   
   // 2. Siapkan Video
   let embedVideo = getYoutubeEmbedUrl(t.link_youtube);
   let htmlVideo = embedVideo 
      ? `<div style="border-radius:16px; overflow:hidden; aspect-ratio:16/9; background:#000; margin-bottom:24px; box-shadow:0 10px 30px rgba(0,0,0,0.1);"><iframe src="${embedVideo}" style="width:100%; height:100%; border:none;" allowfullscreen></iframe></div>` 
      : `<div style="border-radius:16px; aspect-ratio:21/9; background:#f1f5f9; color:#94a3b8; display:flex; flex-direction:column; align-items:center; justify-content:center; margin-bottom:24px; font-size:13px; border:1px dashed #cbd5e1;"><span style="font-size:24px; margin-bottom:8px;">🎥</span>Video materi tidak dilampirkan</div>`;

   // 3. Siapkan Tombol Pengumpulan
   let actionArea = '';
   if (isDone) {
     let btnHasil = (t.link_hasil && String(t.link_hasil).trim() !== '') 
   ? `<button onclick="bukaLinkEksternal('${t.link_hasil}')" class="btn-action-lg" style="cursor:pointer; font-family:inherit; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; margin-top:12px; font-size:13px; max-width:250px; margin:12px auto 0;">🔍 Lihat Hasil Karyamu</button>` : '';
     actionArea = `
       <div style="text-align:center;padding:20px;background:#dcfce7;color:#15803d;border-radius:12px;font-weight:700; border:1px solid #bbf7d0;">
         🎉 Tugas telah dinilai! (Poin XP: ${t.poin})
         ${btnHasil}
       </div>`;
   } else if (isProses) {
     actionArea = `
       <div style="text-align:center;padding:24px;background:#fef3c7;border:1px solid #fde68a;border-radius:12px;">
         <div style="font-weight:800;color:#b45309;margin-bottom:8px;font-size:15px;">⏳ Menunggu penilaian dari Guru...</div>
         <div style="font-size:12px;color:#92400e;margin-bottom:16px;">Jika ada kesalahan link/file, batalkan sekarang sebelum dinilai oleh Guru.</div>
         <button onclick="submitAksi('tugas', '${t.id_tugas}', true)" style="background:white; color:#dc2626; border:1px solid #fca5a5; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; transition:0.2s;">
           ❌ Batalkan Pengumpulan
         </button>
       </div>`;
   } else {
     if (t.link_form && t.link_form.trim() !== '') {
       actionArea = `
         <div style="background:#eff6ff;padding:24px;border-radius:16px;border:1px dashed #bfdbfe;">
           <div style="font-size:13px;font-weight:800;color:#1e40af;margin-bottom:8px;">🚀 LANGKAH PENGUMPULAN:</div>
           <div style="font-size:13px;color:#475569;margin-bottom:20px;line-height:1.6;">
             1. Buka formulir dan kumpulkan hasil karyamu di sana.<br>
             2. Jika <strong>sudah benar-benar terkirim</strong>, klik tombol "Tandai Selesai".
           </div>
           
           <div style="display:flex; gap:12px; flex-wrap:wrap;">
             <button onclick="bukaLinkEksternal('${t.link_form}')" style="cursor:pointer; font-family:inherit; border:none; flex:1; background:#2563eb; color:white; padding:14px; border-radius:12px; font-weight:700; font-size:13px; display:flex; justify-content:center; align-items:center; gap:8px;">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Buka Form Pengumpulan
              </button>
             <button onclick="submitAksi('tugas', '${t.id_tugas}')" style="background:#16a34a; color:white; border:none; padding:14px 24px; border-radius:12px; font-weight:800; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px;">
               <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Tandai Selesai
             </button>
           </div>
         </div>`;
     } else {
       actionArea = `
         <div style="background:#f8fafc;padding:24px;border-radius:12px;text-align:center;border:1px dashed #cbd5e1;">
           <div style="font-size:32px;margin-bottom:12px;">🏫</div>
           <div style="font-weight:800;color:#334155;font-size:15px;">Tugas Praktik Langsung di Kelas</div>
           <div style="font-size:13px;color:#64748b;margin-top:4px;">Tugas ini dinilai langsung oleh Guru melalui tatap muka.</div>
         </div>`;
     }
   }

   // 4. Render Seluruh Panel Kiri
   contentEl.innerHTML = `
      <div style="margin-bottom:20px;">
         <div style="display:flex; gap:10px; font-size:11px; font-weight:800; margin-bottom:10px;">
            <span style="background:#e2e8f0; color:#475569; padding:4px 8px; border-radius:6px; text-transform:uppercase; letter-spacing:0.5px;">${escH(t.minggu || 'Minggu -')}</span>
            <span style="background:#f1f5f9; color:#64748b; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0; text-transform:uppercase;">${escH(t.kategori || 'Umum')}</span>
         </div>
         <h2 style="font-size:26px; font-weight:800; color:#0f172a; line-height:1.2;">${escH(t.judul)}</h2>
      </div>
      
      ${htmlVideo}
      
      <div style="margin-bottom: 24px;">
         <h3 style="font-size:16px; font-weight:800; color:#1e293b; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Instruksi Tugas
         </h3>
         <div style="font-size:14px; color:#334155; line-height:1.7; background:white; padding:20px; border-radius:12px; border:1px solid #e2e8f0;">
            ${escH(t.deskripsi || 'Ikuti arahan guru untuk menyelesaikan tugas ini.')}
         </div>
      </div>

      ${actionArea}
   `;
   
   // Di HP: Gulung otomatis ke atas (ke arah video) setelah tugas diklik
   if (window.innerWidth < 960) {
       window.scrollTo({ top: contentEl.offsetTop - 80, behavior: 'smooth' });
   }
}


/* ════ RENDER KARYA PINTAR ════ */
function renderKarya(json) {
  allKaryaData = json.karya || [];
  currentKaryaPage = 1;
  renderKaryaUI();
}

function filterKarya() {
  currentKaryaPage = 1;
  renderKaryaUI();
}

function renderKaryaUI() {
  const listEl = document.getElementById('karya-list');
  const searchQ = (document.getElementById('search-karya')?.value || '').toLowerCase();
  const paginationEl = document.getElementById('karya-pagination');
  
  // 1. Filter Data
  let filtered = allKaryaData;
  if (searchQ) {
    filtered = filtered.filter(k => 
      (k.judul || '').toLowerCase().includes(searchQ) || 
      (k.kategori || '').toLowerCase().includes(searchQ)
    );
  }

  // 2. Tampilkan pesan jika kosong
  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:24px; background:white; border-radius:12px; border:1px solid #e5e7eb; margin:0 14px; font-size:12px; color:#9ca3af;">Tidak ada karya ditemukan.</div>`;
    paginationEl.innerHTML = '';
    return;
  }

  // 3. Logika Pagination
  const totalPages = Math.ceil(filtered.length / KARYA_PER_PAGE);
  if (currentKaryaPage > totalPages) currentKaryaPage = totalPages;
  const start = (currentKaryaPage - 1) * KARYA_PER_PAGE;
  const paginated = filtered.slice(start, start + KARYA_PER_PAGE);

  // 4. Render Grid
  listEl.innerHTML = '';
  paginated.forEach(k => {
    const arrKode = String(k.kode_siswa || '').split(',');
    const isKel = (k.jenis?.toLowerCase().includes('kelompok')) || arrKode.length > 1;
    const kString = JSON.stringify(k).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    listEl.innerHTML += `
      <div class="karya-card" onclick="openModalKarya(${kString})">
        ${k.gambar ? `<img src="${escH(k.gambar)}" class="karya-img">` : `<div class="karya-nopic">🎨</div>`}
        <div class="karya-body">
          <span style="font-size:9px; font-weight:700; padding:2px 6px; border-radius:99px; ${isKel?'background:#dcfce7;color:#15803d;':'background:#dbeafe;color:#1e40af;'}; display:inline-block; margin-bottom:4px;">${isKel ? '👥 Kelompok' : '👤 Individu'}</span>
          <div class="karya-title">${escH(k.judul)}</div>
          <div style="font-size:10px; color:#6b7280; font-weight:600;">${escH(k.kategori || '-')}</div>
        </div>
      </div>`;
  });

  // 5. Render Paginasi
  renderKaryaPagination(totalPages, paginationEl);
}

function renderKaryaPagination(totalPages, container) {
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  // Tambahkan flex-wrap di sini
  let html = `<div style="display:flex; gap:6px; margin: 10px auto; flex-wrap:wrap; justify-content:center; align-items:center;">`;
  const prevDisabled = currentKaryaPage === 1 ? 'opacity:0.5; pointer-events:none;' : '';
  
  html += `<button onclick="changeKaryaPage(${currentKaryaPage - 1})" style="padding:6px 12px; border-radius:8px; border:1px solid #e5e7eb; background:white; font-size:12px; font-weight:700; cursor:pointer; ${prevDisabled}">Prev</button>`;

  // SMART PAGINATION UNTUK KARYA
  let startPage = Math.max(1, currentKaryaPage - 1);
  let endPage = Math.min(totalPages, currentKaryaPage + 1);

  if (currentKaryaPage === 1) endPage = Math.min(3, totalPages);
  if (currentKaryaPage === totalPages) startPage = Math.max(1, totalPages - 2);

  if (startPage > 1) {
      html += `<button onclick="changeKaryaPage(1)" style="padding:6px 12px; border-radius:8px; background:white; color:#374151; border:1px solid #e5e7eb; cursor:pointer; font-size:12px; font-weight:700;">1</button>`;
      if (startPage > 2) html += `<span style="font-size:12px; color:#9ca3af; padding:0 2px;">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    const isActive = i === currentKaryaPage;
    const style = isActive ? `background:#2563eb; color:white; border:1px solid #2563eb; pointer-events:none;` : `background:white; color:#374151; border:1px solid #e5e7eb; cursor:pointer;`;
    html += `<button onclick="changeKaryaPage(${i})" style="padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; ${style}">${i}</button>`;
  }

  if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span style="font-size:12px; color:#9ca3af; padding:0 2px;">...</span>`;
      html += `<button onclick="changeKaryaPage(${totalPages})" style="padding:6px 12px; border-radius:8px; background:white; color:#374151; border:1px solid #e5e7eb; cursor:pointer; font-size:12px; font-weight:700;">${totalPages}</button>`;
  }

  const nextDisabled = currentKaryaPage === totalPages ? 'opacity:0.5; pointer-events:none;' : '';
  html += `<button onclick="changeKaryaPage(${currentKaryaPage + 1})" style="padding:6px 12px; border-radius:8px; border:1px solid #e5e7eb; background:white; font-size:12px; font-weight:700; cursor:pointer; ${nextDisabled}">Next</button>`;
  
  html += `</div>`;
  container.innerHTML = html;
}

function changeKaryaPage(page) {
  currentKaryaPage = page;
  renderKaryaUI();
}

// 5. JADWAL KELAS
function renderJadwal(json) {
  const listEl = document.getElementById('jadwal-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  
  const jList = json.jadwal || [];
  if (jList.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:24px; background:white; border-radius:12px; border:1px dashed #cbd5e1; margin:0 14px; font-size:13px; color:#64748b;">Belum ada jadwal kelas.</div>`;
    return;
  }

  // Urutkan berdasarkan hari (Senin - Minggu)
  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const grouped = {};
  
  jList.forEach(j => {
    const h = String(j.hari || 'Lainnya').trim();
    // Memastikan huruf depan kapital (misal 'senin' jadi 'Senin')
    const cleanDay = h.charAt(0).toUpperCase() + h.slice(1).toLowerCase();
    
    if (!grouped[cleanDay]) grouped[cleanDay] = [];
    grouped[cleanDay].push(j);
  });
  
  const sortedDays = Object.keys(grouped).sort((a,b) => {
    let ia = days.findIndex(x => x.toLowerCase() === a.toLowerCase());
    let ib = days.findIndex(x => x.toLowerCase() === b.toLowerCase());
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  
  sortedDays.forEach(hari => {
    let itemsHtml = '';
    // Urutkan berdasarkan waktu/jam
    grouped[hari].sort((a,b) => String(a.waktu).localeCompare(String(b.waktu))).forEach(j => {
      itemsHtml += `
        <div class="j-item">
          <div class="j-time">${escH(j.waktu)}</div>
          <div>
            <div class="j-detail-title">${escH(j.mapel || 'Mata Pelajaran')}</div>
            
            <div class="j-detail-loc">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${escH(j.guru || 'Guru Pengampu')}
            </div>
          </div>
        </div>
      `;
    });
    
    listEl.innerHTML += `
      <div class="day-group">
        <div class="day-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${hari}
        </div>
        ${itemsHtml}
      </div>
    `;
  });
}

// ── 1. FUNGSI JEMBATAN DARI BERANDA KE MATERI ──
function openMateriFromBeranda(id_bab, id_materi) {
   switchPage('materi');
   CURRENT_MATERI_ID = id_materi; // Rekam materi yang mau dibuka
   showMateriListByBab(id_bab);   // Buka halamannya
}

// ── 2. MENAMPILKAN DAFTAR MATERI (SIDEBAR KANAN) ──
function showMateriListByBab(id_bab) {
  CURRENT_BAB_ID = id_bab; 

  const b = (DATA.bab || []).find(x => x.id_bab === id_bab);
  if (!b) return;

  // Ubah judul & Transisi Halaman
  document.getElementById('materi-bab-title').textContent = b.judul_bab;
  document.getElementById('view-bab-page').classList.add('hidden');
  document.getElementById('view-materi-page').classList.remove('hidden');

  const sidebarEl = document.getElementById('materi-list-sidebar');
  const contentEl = document.getElementById('materi-content-panel');
  sidebarEl.innerHTML = '';

  const materiInBab = (DATA.materi || []).filter(m => m.id_bab === id_bab && (m.buka_kelas || '').toLowerCase() !== 'sembunyikan');
  
  const materiCountEl = document.getElementById('materi-count-header');
  if (materiCountEl) materiCountEl.textContent = materiInBab.length;

  if (materiInBab.length === 0) {
    contentEl.innerHTML = `<div style="text-align:center; padding: 60px 20px; background:white; border-radius:16px; border:1px dashed #cbd5e1; color:#64748b;">Belum ada materi di bab ini.</div>`;
    sidebarEl.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8; font-size:12px;">Kosong</div>';
    return;
  }

  materiInBab.forEach((m, index) => {
    const isLocked = (m.buka_kelas || '').toLowerCase() === 'kunci';
    const p = (DATA.progres || []).find(x => x.id_materi === m.id_materi) || {};
    const n = isLocked ? 'terkunci' : ns(p.status);
    
    let iconHtml, statusColor, statusText;
    if (n === 'selesai') { 
      statusColor = '#15803d'; iconHtml = '✅'; statusText = 'Selesai';
    } else if (n === 'proses') { 
      statusColor = '#b45309'; iconHtml = '⏳'; statusText = 'Sedang Diproses';
    } else if (n === 'terkunci') { 
      statusColor = '#94a3b8'; iconHtml = '🔒'; statusText = 'Terkunci';
    } else {
      statusColor = '#64748b'; iconHtml = '📖'; statusText = 'Belum Dipelajari';
    }

    const mString = JSON.stringify(m).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    // Desain item list di sebelah kanan
    sidebarEl.innerHTML += `
      <div id="materi-item-${m.id_materi}" class="materi-sidebar-item" 
           ${isLocked ? `style="opacity:0.6; cursor:not-allowed; padding:14px 16px; border-bottom:1px solid #f1f5f9; display:flex; gap:12px;"` : `onclick="selectMateri(${mString})" style="padding:14px 16px; border-bottom:1px solid #f1f5f9; cursor:pointer; display:flex; gap:12px; transition:background 0.2s;"`}>
         <div style="font-size:14px; margin-top:2px;">${iconHtml}</div>
         <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:800; color:#0f172a; line-height:1.4; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${index + 1}. ${escH(m.nama_materi)}</div>
            <div style="font-size:11px; color:${statusColor}; font-weight:700;">${statusText}</div>
         </div>
      </div>
    `;
  });

  // Logika Autoplay/Auto-select: Pilih materi yang sedang aktif atau yang pertama
  let targetMateri = materiInBab[0];
  if (CURRENT_MATERI_ID) {
     const found = materiInBab.find(x => x.id_materi === CURRENT_MATERI_ID);
     if (found && (found.buka_kelas || '').toLowerCase() !== 'kunci') targetMateri = found;
  } else {
     const firstUnlocked = materiInBab.find(x => (x.buka_kelas || '').toLowerCase() !== 'kunci');
     if(firstUnlocked) targetMateri = firstUnlocked;
  }
  
  if ((targetMateri.buka_kelas || '').toLowerCase() !== 'kunci') {
     selectMateri(targetMateri);
  } else {
     contentEl.innerHTML = `<div style="text-align:center; padding: 60px 20px; background:white; border-radius:16px; border:1px dashed #cbd5e1; color:#64748b;">Materi ini sedang dikunci oleh Guru.</div>`;
  }
}

// ── 3. MENAMPILKAN KONTEN MATERI (PANEL KIRI) ──
function selectMateri(m) {
   CURRENT_MATERI_ID = m.id_materi; // Ingat materi ini
   
   // A. Warnai abu-abu list di sebelah kanan agar ketahuan sedang aktif
   document.querySelectorAll('.materi-sidebar-item').forEach(el => {
      el.style.background = 'white'; el.style.borderLeft = 'none';
   });
   const activeEl = document.getElementById('materi-item-' + m.id_materi);
   if (activeEl) {
      activeEl.style.background = '#f8fafc'; activeEl.style.borderLeft = '4px solid #2563eb';
   }

   const contentEl = document.getElementById('materi-content-panel');
   const p = (DATA.progres || []).find(x => x.id_materi === m.id_materi) || {};
   const isDone = ns(p.status) === 'selesai';
   const isProses = ns(p.status) === 'proses';
   
   // B. Render Video
   let embedVideo = getYoutubeEmbedUrl(m.video);
   let htmlVideo = embedVideo ? `<div style="border-radius:16px; overflow:hidden; aspect-ratio:16/9; background:#000; margin-bottom:24px; box-shadow:0 10px 30px rgba(0,0,0,0.1);"><iframe src="${embedVideo}" style="width:100%; height:100%; border:none;" allowfullscreen></iframe></div>` : `<div style="border-radius:16px; aspect-ratio:21/9; background:#f1f5f9; color:#94a3b8; display:flex; flex-direction:column; align-items:center; justify-content:center; margin-bottom:24px; font-size:13px; border:1px dashed #cbd5e1;"><span style="font-size:24px; margin-bottom:8px;">🎥</span>Video materi tidak dilampirkan</div>`;

   // C. Render Tombol Asset (Slide/File)
   let tombolEkstra = '';
   // GANTI BAGIAN INI:
    if (m.slide && m.slide.trim() !== '') {
      tombolEkstra += `<button onclick="bukaLinkEksternal('${m.slide}')" style="cursor:pointer; font-family:inherit; flex:1; background:#fff7ed; color:#ea580c; border:1px solid #fed7aa; padding:12px; border-radius:12px; font-size:13px; font-weight:700; display:flex; justify-content:center; align-items:center; gap:8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/></svg> Buka Google Slide</button>`;
    }
    if (m.file && m.file.trim() !== '') {
      tombolEkstra += `<button onclick="bukaLinkEksternal('${m.file}')" style="cursor:pointer; font-family:inherit; flex:1; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:12px; border-radius:12px; font-size:13px; font-weight:700; display:flex; justify-content:center; align-items:center; gap:8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Unduh File / Asset</button>`;
    }
   let tombolWrapper = tombolEkstra ? `<div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px;">${tombolEkstra}</div>` : '';

   // D. Render Tombol Aksi (Tugas / Selesai)
   let actionArea = '';
   if (isDone) {
     let btnHasil = (p.link_hasil && String(p.link_hasil).trim() !== '') 
   ? `<br><button onclick="bukaLinkEksternal('${p.link_hasil}')" style="cursor:pointer; font-family:inherit; display:inline-block; background:white; color:#15803d; border:1px solid #bbf7d0; margin-top:12px; padding:10px 20px; border-radius:10px; font-size:13px; font-weight:700;">🔍 Lihat Hasil Praktikmu</button>` : '';
     actionArea = `
       <div style="text-align:center;padding:20px;background:#dcfce7;color:#15803d;border-radius:12px;font-weight:700; border:1px solid #bbf7d0;">
         ✅ Kamu sudah menyelesaikan materi ini.
         ${btnHasil}
       </div>`;
   } else if (isProses) {
     actionArea = `
       <div style="text-align:center;padding:24px;background:#fef3c7;border:1px solid #fde68a;border-radius:12px;">
         <div style="font-weight:800;color:#b45309;margin-bottom:8px;font-size:15px;">⏳ Sedang menunggu pengecekan dari Guru.</div>
         <div style="font-size:12px;color:#92400e;margin-bottom:16px;">Jika ada kesalahan form yang dikirim, kamu bisa membatalkannya.</div>
         <button onclick="submitAksi('materi', '${m.id_materi}', true)" style="background:white; color:#dc2626; border:1px solid #fca5a5; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; transition:0.2s;">
           ❌ Batalkan
         </button>
       </div>`;
   } else {
     if (m.link_form && m.link_form.trim() !== '') {
       actionArea = `
         <div style="background:#eff6ff;padding:24px;border-radius:16px;border:1px dashed #bfdbfe;">
           <div style="font-size:13px;font-weight:800;color:#1e40af;margin-bottom:8px;">🚀 LANGKAH PENGUMPULAN TUGAS MODUL:</div>
           <div style="font-size:13px;color:#475569;margin-bottom:20px;line-height:1.6;">
             1. Buka form dan kumpulkan hasil praktikmu di sana.<br>
             2. Jika <strong>sudah benar-benar selesai</strong>, klik tombol "Tandai Selesai".
           </div>
           <div style="display:flex; gap:12px; flex-wrap:wrap;">
             <button onclick="bukaLinkEksternal('${m.link_form}')" style="cursor:pointer; font-family:inherit; border:none; flex:1; background:#2563eb; color:white; padding:14px; border-radius:12px; font-weight:700; font-size:13px; display:flex; justify-content:center; align-items:center; gap:8px;">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Buka Form
            </button>
             <button onclick="submitAksi('materi', '${m.id_materi}')" style="background:#16a34a; color:white; border:none; padding:14px 24px; border-radius:12px; font-weight:800; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px;">
               <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Tandai Selesai
             </button>
           </div>
         </div>`;
     } else {
       actionArea = `
         <button onclick="submitAksi('materi', '${m.id_materi}', false, true)" style="width:100%; background:#16a34a; color:white; border:none; padding:16px; border-radius:12px; font-weight:800; font-size:14px; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:8px; box-shadow:0 4px 10px rgba(22,163,74,0.2);">
           <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Tandai Sudah Selesai Dibaca
         </button>`;
     }
   }

   // E. Render Semua Konten ke Layar
   contentEl.innerHTML = `
      <div style="margin-bottom:20px;">
         <h2 style="font-size:26px; font-weight:800; color:#0f172a; line-height:1.2; margin-bottom:8px;">${escH(m.nama_materi)}</h2>
      </div>
      ${htmlVideo}
      ${tombolWrapper}
      <div style="margin-bottom: 24px;">
         <h3 style="font-size:16px; font-weight:800; color:#1e293b; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Instruksi Guru
         </h3>
         <div style="font-size:14px; color:#334155; line-height:1.7; background:white; padding:20px; border-radius:12px; border:1px solid #e2e8f0;">
            ${escH(m.deskripsi || 'Silakan pelajari materi ini dengan baik.')}
         </div>
      </div>
      ${actionArea}
   `;

   // Di HP: Gulung otomatis layar ke area Video
   if (window.innerWidth < 960) window.scrollTo({ top: contentEl.offsetTop - 80, behavior: 'smooth' });
}

function backToBab() {
  CURRENT_BAB_ID = null; CURRENT_MATERI_ID = null;
  document.getElementById('view-materi-page').classList.add('hidden');
  document.getElementById('view-bab-page').classList.remove('hidden');
}

function openModalTugas(t) {
  const isDone = ns(t.status) === 'selesai';
  const isProses = ns(t.status) === 'proses';
  
  let embedVideo = getYoutubeEmbedUrl(t.link_youtube);
  let htmlVideo = embedVideo ? `<div style="border-radius:12px; overflow:hidden; aspect-ratio:16/9; background:#f3f4f6; margin-bottom:16px; display:flex; align-items:center; justify-content:center;"><iframe src="${embedVideo}" style="width:100%; height:100%; border:none;" allowfullscreen></iframe></div>` : '';

  let actionArea = '';
  
  if (isDone) {
    let btnHasil = '';
    // Jika guru sudah memasukkan link di database, munculkan tombol
    if (t.link_hasil && String(t.link_hasil).trim() !== '') {
      btnHasil = `<button onclick="bukaLinkEksternal('${t.link_hasil}')" class="btn-action-lg" style="cursor:pointer; font-family:inherit; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; margin-top:12px; font-size:13px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Lihat Hasil Karyamu</button>`;
    }
    
    actionArea = `
      <div style="text-align:center;padding:12px;background:#dcfce7;color:#15803d;border-radius:12px;font-weight:700;">🎉 Tugas telah dinilai! (Poin: ${t.poin})</div>
      ${btnHasil}
    `;
  } else if (isProses) {
    // ⬅️ TAMPILAN BARU UNTUK TOMBOL BATALKAN
    actionArea = `
      <div style="text-align:center;padding:16px;background:#fef3c7;border:1px solid #fde68a;border-radius:12px;">
        <div style="font-weight:800;color:#b45309;margin-bottom:8px;font-size:14px;">⏳ Menunggu penilaian dari Guru.</div>
        <div style="font-size:11px;color:#92400e;margin-bottom:12px;">Jika ada kesalahan file/link yang dikirim, kamu bisa membatalkannya sebelum dinilai oleh Guru.</div>
        <button class="btn-action-lg" onclick="submitAksi('tugas', '${t.id_tugas}', true)" style="background:white;color:#dc2626;border:1px solid #fca5a5;padding:10px;font-size:12px;">
          ❌ Batalkan Pengumpulan
        </button>
      </div>`;
  } else {
    if (t.link_form && t.link_form.trim() !== '') {
      actionArea = `
        <div style="background:#eff6ff;padding:16px;border-radius:12px;border:1px dashed #bfdbfe;">
          <div style="font-size:12px;font-weight:800;color:#1e40af;margin-bottom:8px;">LANGKAH PENGUMPULAN:</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:16px;line-height:1.4;">
            1. Buka form dan upload karyamu di sana.<br>
            2. Jika <strong>sudah benar-benar selesai</strong>, klik ikon centang.
          </div>
          
          <div style="display:flex; gap:8px; align-items:stretch;">
            <button onclick="bukaLinkEksternal('${t.link_form}')" class="btn-action-lg btn-form" style="cursor:pointer; font-family:inherit; border:none; flex:1; margin:0; display:flex; justify-content:center; align-items:center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Buka Form
            </button>
            <button class="btn-submit" onclick="submitAksi('tugas', '${t.id_tugas}')" style="width:auto; padding:0 16px; border-radius:12px; border:none; font-size:11px; font-weight:800; color:white; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; flex-shrink:0; box-shadow:0 4px 10px rgba(22,163,74,0.3);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              Selesai
            </button>
          </div>
        </div>`;
    } else {
      actionArea = `
        <div style="background:#f3f4f6;padding:16px;border-radius:12px;text-align:center;border:1px dashed #d1d5db;">
          <div style="font-size:24px;margin-bottom:8px;">🏫</div>
          <div style="font-weight:700;color:#374151;font-size:14px;">Tugas Praktik Langsung</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Tugas ini dipraktikkan & dinilai langsung oleh Guru di kelas.</div>
        </div>`;
    }
  }

  openModal('Tugas: ' + escH(t.judul), `
    ${htmlVideo}
    <div style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:24px;background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #f0f0f0;">
      <strong>Instruksi Tugas:</strong><br>${escH(t.deskripsi || 'Ikuti arahan guru untuk menyelesaikan tugas ini.')}
    </div>
    ${actionArea}
  `);
}

// Menampilkan Detail Karya di dalam Modal
function openModalKarya(k) {
  // ⬅️ LOGIKA KARYA PINTAR DI MODAL
  const arrKode = String(k.kode_siswa || '').split(',');
  const isKel = (k.jenis?.toLowerCase().includes('kelompok')) || arrKode.length > 1;
  const badgeHtml = `<span style="font-size:10px; font-weight:700; padding:3px 8px; border-radius:99px; ${isKel?'background:#dcfce7;color:#15803d;':'background:#dbeafe;color:#1e40af;'}; display:inline-block; margin-bottom:8px;">${isKel ? '👥 Karya Kelompok' : '👤 Karya Individu'}</span>`;

  let imgHtml = k.gambar 
    ? `<img src="${escH(k.gambar)}" style="width:100%; border-radius:12px; margin-bottom:16px; max-height:220px; object-fit:cover;">` 
    : `<div style="width:100%; height:140px; background:#f3f4f6; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:40px; margin-bottom:16px;">🎨</div>`;
  
  let linksHtml = '';
  if (k.links && k.links.length > 0) {
    linksHtml = `<div style="margin-top:20px;">
      <div style="font-size:11px; font-weight:800; color:#9ca3af; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.5px;">Tautan Eksternal</div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${k.links.map(l => `
          <button onclick="bukaLinkEksternal('${escH(l.url)}')" class="btn-action-lg" style="cursor:pointer; font-family:inherit; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:13px;">
            🔗 Buka ${escH(l.label)}
          </button>
        `).join('')}
              </div>
    </div>`;
  }

  openModal('Detail Karya', `
    ${imgHtml}
    ${badgeHtml}
    <div style="font-size:18px; font-weight:800; color:#111827; margin-bottom:4px; line-height:1.3;">${escH(k.judul)}</div>
    <div style="font-size:12px; color:#6b7280; font-weight:600; margin-bottom:16px;">Kategori: ${escH(k.kategori || '-')}</div>
    
    <div style="font-size:13px; color:#374151; line-height:1.6; background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #f0f0f0;">
      ${escH(k.deskripsi || 'Tidak ada deskripsi untuk karya ini.')}
    </div>
    
    ${linksHtml}
  `);
}

// ════ FUNGSI PENGIRIMAN DATA (POST) KE SPREADSHEET ════
// Tambahan parameter "isCancel" untuk membedakan kirim & batal
// ════ FUNGSI PENGIRIMAN DATA (POST) KE SPREADSHEET ════
async function submitAksi(tipe, id, isCancel = false, isDirectDone = false) {
  const msgConfirm = isCancel 
    ? 'Yakin ingin membatalkan pengiriman ini?' 
    : 'Apakah kamu yakin ingin menandai ini selesai?';
    
  if (!confirm(msgConfirm)) return;
  
  showLoading(true);
  
  const action = (tipe === 'materi') ? 'upsert_progres_materi' : 'upsert_progres_tugas';
  const data = { kode_siswa: KODE_SISWA };
  
  // LOGIKA PINTAR: Jika isDirectDone true, langsung berikan status "Selesai" tanpa perlu dinilai guru
  if (tipe === 'materi') {
    data.id_materi = id;
    data.status = isCancel ? 'Belum Mulai' : (isDirectDone ? 'Selesai' : 'Proses'); 
  } else if (tipe === 'tugas') {
    data.id_tugas = id;
    data.status = isCancel ? 'Belum' : (isDirectDone ? 'Selesai' : 'Proses'); 
  }

  try {
    const res = await postAPI({ action, data });
    if (res.success) {
      toast(isCancel ? 'Berhasil dibatalkan.' : 'Berhasil dikirim! ⏳');
      closeModal();
      await refreshDataInBackground(localStorage.getItem(TOKEN_KEY)); 
    } else {
      toast(res.message, 'error');
    }
  } catch (e) {
    toast('Gagal mengirim data. Cek koneksi internetmu.', 'error');
  } finally {
    showLoading(false);
  }
}

/* ════ UI HELPERS ════ */
function openModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-wrap').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal-wrap').classList.add('hidden'); }
function closeModalWrap(e) { if (e.target.id === 'modal-wrap') closeModal(); }
function showLoading(b) { document.getElementById('loading-overlay').classList.toggle('hidden', !b); }

function toast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast toast-${type}`; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}
function escH(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function ns(v = '') {
  v = v.toLowerCase().trim();
  if (v.includes('selesai')) return 'selesai';
  if (v.includes('proses') || v.includes('dikerjakan')) return 'proses';
  return 'belum';
}

function getYoutubeEmbedUrl(url) {
  if (!url) return null;
  let videoId = '';
  if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split('?')[0];
  else if (url.includes('youtube.com/watch?v=')) videoId = url.split('v=')[1].split('&')[0];
  else if (url.includes('youtube.com/embed/')) return url;
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

function switchPage(name) {
  // Sembunyikan semua page, tampilkan yang aktif
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  
  // Update Bottom Nav (Mobile)
  document.querySelectorAll('.bn-btn').forEach(b => {
    const active = b.dataset.page === name;
    b.classList.toggle('active', active);
    b.querySelector('svg').style.stroke = active ? '#4f46e5' : '#9ca3af';
    b.querySelector('span').style.color = active ? '#4f46e5' : '#9ca3af';
  });

  // Update Sidebar Nav (Desktop)
  ['beranda','materi','tugas','jadwal','portofolio','profil'].forEach(pg => {
    const btn = document.getElementById('sbn-' + pg);
    if (btn) btn.classList.toggle('active', pg === name);
  });
  
  const ca = document.querySelector('.content-area');
  if (ca) ca.scrollTop = 0;
  else window.scrollTo(0, 0);
}

// (OPSIONAL) Tambahkan kode ini di baris paling bawah siswa.js 
// agar responsif saat browser PC dibesarkecilkan
window.addEventListener('resize', () => {
  const ps = document.getElementById('profile-screen');
  if (!ps || !ps.classList.contains('is-visible')) return;
  if (window.innerWidth >= 768) ps.style.display = '';
  else ps.style.display = 'block';
});

// ════ FUNGSI GANTI PASSWORD SISWA ════
async function ubahPassword() {
   const oldPass = document.getElementById('inp-old-pass').value;
   const newPass = document.getElementById('inp-new-pass').value;
   
   if (!oldPass || !newPass) return toast('Harap isi password lama dan baru!', 'error');
   if (newPass.length < 5) return toast('Password baru minimal 5 karakter!', 'error');
   
   showLoading(true);
   try {
      const res = await postAPI({
         action: 'ubah_password_siswa',
         data: { kode_siswa: KODE_SISWA, old_pass: oldPass, new_pass: newPass }
      });
      
      if (res.success) {
         toast('Password berhasil diperbarui! 🔐');
         document.getElementById('inp-old-pass').value = '';
         document.getElementById('inp-new-pass').value = '';
      } else {
         toast(res.message, 'error');
      }
   } catch (e) {
      toast('Gagal terhubung ke server.', 'error');
   } finally {
      showLoading(false);
   }
}

/* ════ FUNGSI PENJEMBATAN KE KODULAR ════ */
function bukaLinkEksternal(url) {
  if (!url) return;
  
  toast("Membuka tautan eksternal...");

  // Deteksi apakah sedang dibuka di dalam WebView Kodular
  if (window.AppInventor) {
    // KUNCI PERBAIKANNYA DI SINI: Tambahkan "BUKA_BROWSER:" di depan URL
    window.AppInventor.setWebViewString("BUKA_BROWSER:" + url);
  } else {
    // Jika dibuka di browser PC/HP biasa
    window.open(url, '_blank');
  }
}