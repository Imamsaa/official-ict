/* ── KONFIGURASI API ── */
// PENTING: Ganti dengan URL Web App Google Apps Script Anda yang paling baru!
const LEGACY_API_URL = "https://script.google.com/macros/s/AKfycbwrqUAnU4MTq_ANvXADI2SW6jJ9MAc1aT7XYAQ-iIkZKx9m_Folqhy2AIQ6Z2KULr2x/exec";
const USE_FIREBASE_BACKEND = window.ICT_RUNTIME_CONFIG?.backend === "firebase";
const API_URL = USE_FIREBASE_BACKEND ? window.ICT_RUNTIME_CONFIG.apiUrl : LEGACY_API_URL; 

/* ── TEMPAT PENYIMPANAN DATA SEMENTARA ── */
let galleryData = [];
let achievements = [];
let team = [];
let kurikulumData = [];
let challengeData = [];
let rankChallengeData = [];
let currentChallengePage = 1;
const CHALLENGES_PER_PAGE = 6;
let currentGalleryPage = 1;
const GALLERY_PER_PAGE = 6; // Menampilkan 6 karya per halaman
let currentGalleryFilter = 'semua';
let babData = [];
let materiData = [];
let leaderboardMode = 'global'; // Menyimpan status mode ('global' atau 'split')
let currentLbTab = 'ict';

/* ── FUNGSI PENGAMBIL DATA (FETCH API MODERN) ── */
function fetchJSONP(url, cbName) {
  // Transition helper: Firebase returns JSON; the legacy API returns JSONP.
  if (USE_FIREBASE_BACKEND) {
    return fetch(url, { cache: "no-store" }).then(async (response) => {
      let data;
      try { data = await response.json(); }
      catch (_) { throw new Error("Respons API tidak valid."); }
      if (!response.ok || data.success === false) {
        throw new Error(data.message || "Gagal memuat data.");
      }
      return data;
    });
  }

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error('Koneksi lambat (Timeout)')); }, 15000);
    const script = document.createElement('script');
    const cleanup = () => {
      clearTimeout(t);
      delete window[cbName];
      if (script.parentNode) script.remove();
    };
    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.src = url + '&callback=' + cbName;
    script.onerror = () => { cleanup(); reject(new Error('Gagal memuat data')); };
    document.head.appendChild(script);
  });
}

/* ── INISIALISASI DATA DARI SPREADSHEET ── */
async function initData() {
  try {
    const res = await fetchJSONP(`${API_URL}?action=get_public_data&_=${Date.now()}`, 'cb_public_' + Date.now());
    
    if (res.success) {
      // 1. Mapping Data Karya
      galleryData = (res.karya || []).map(k => ({
        id: k.id_karya || Math.random(),
        cat: String(k.kategori || 'web').toLowerCase(),
        emoji: '🎨', 
        gambar: k.gambar || '', // Tarik URL gambar dari spreadsheet
        badge: k.kategori || 'Karya',
        title: k.judul || 'Tanpa Judul',
        author: k.nama_siswa || k.kode_siswa || 'Siswa ICT',
        init: String(k.nama_siswa || k.kode_siswa || 'SI').substring(0,2).toUpperCase(),
        desc: k.deskripsi || 'Tidak ada deskripsi.',
        links: k.links || []
      }));

      // 2. Mapping Data Prestasi
      achievements = (res.prestasi || []).map(p => ({
        year: p.tahun || new Date().getFullYear(),
        icon: p.icon || p.ikon || '🏆',
        title: p.judul || '',
        sub: p.sub_judul || ''
      }));

      // 3. Mapping Data Tim Pengajar
      team = (res.tim || []).map(t => ({
        name: t.nama || '',
        role: t.peran || '',
        foto: t.foto || '', // Tarik URL foto jika ada
        init: String(t.nama || 'T').substring(0,2).toUpperCase()
      }));

      kurikulumData = (res.kurikulum || []).map(k => ({
        icon: k.icon || '📘',
        title: k.judul || '',
        desc: k.deskripsi || '',
        tags: k.tags ? String(k.tags).split(',').map(t => t.trim()) : [] // Pecah teks koma jadi array tag
      }));

      challengeData = res.tugas || [];
      rankChallengeData = res.rank_challenge || [];
      babData = res.bab || [];
      materiData = res.materi || [];

      if (res.pengaturan) {
        const waSetting = res.pengaturan.find(p => String(p.key).toLowerCase() === 'whatsapp');
        if (waSetting && document.getElementById('cta-wa')) {
          const waNumber = String(waSetting.value).replace(/\D/g, ''); 
          document.getElementById('cta-wa').href = `https://wa.me/${waNumber}?text=Halo%2C%20saya%20ingin%20informasi%20pendaftaran%20Program%20ICT%20SMPIT%20Al%20Firdaus`;
        }

        const modeSetting = res.pengaturan.find(p => String(p.key).toLowerCase() === 'leaderboard_mode');
        if (modeSetting) {
           leaderboardMode = modeSetting.value.toLowerCase();
        }
      }
      // Render ulang layar dengan data asli!
      renderCourse();
      renderGalleryFilters();
      renderGallery('semua');
      renderAchievements();
      renderTeam();
      renderKurikulum();
      renderChallenge();
      renderLeaderboard();

      if (res.stats) {
        updateStat('stat-siswa', res.stats.siswa);
        updateStat('stat-karya', res.stats.karya);
        updateStat('stat-prestasi', res.stats.prestasi);
      }

      // KALKULASI OTOMATIS TAHUN BERDIRI (Mulai Juli 2024)
      const today = new Date();
      let tahunBerdiri = today.getFullYear() - 2024;
      // Jika bulan saat ini adalah Juli (bulan ke-6 di JavaScript) atau lebih, tambah 1 tahun
      if (today.getMonth() >= 6) {
        tahunBerdiri += 1;
      }
      updateStat('stat-tahun', tahunBerdiri);

      observeReveal();
      
      // ⬅️ FALLBACK ANTI-BLANK MOBILE: 
      // Jika sensor scroll di HP macet, paksa munculkan semua data setelah 2 detik!
      setTimeout(() => {
        document.querySelectorAll('.reveal:not(.visible)').forEach(el => el.classList.add('visible'));
      }, 2000);

    } else {
      console.error("Gagal dari server:", res.message);
    }
  } catch (e) {
    console.error("Gagal memuat data dari server:", e);
    // ⬅️ UX PERBAIKAN: Jika koneksi HP terputus, munculkan pesan error di layar (bukan blank putih)
    const grids = ['challengeGrid', 'galleryGrid', 'achieveGrid', 'teamGrid', 'kurikulumGrid', 'aboutKurikulumGrid', 'courseContainer'];
    grids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="w-full text-center py-10 text-[#FF0000] text-[.85rem]">Gagal memuat data (Jaringan terputus). Silakan <button onclick="window.location.reload()" class="underline font-bold">Muat Ulang Halaman</button>.</div>`;
    });
  }
}


/* ── SPA NAVIGATION ── */
function showPage(pageId, scrollTo) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (scrollTo) {
    setTimeout(() => {
      const el = document.getElementById(scrollTo);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  }
  observeReveal();
}

/* ── DARK / LIGHT TOGGLE ── */
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('ict-theme', next);
}
(function() {
  const saved = localStorage.getItem('ict-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();

/* ── FUNGSI RENDER KARYA (DENGAN FILTER & PAGINATION) ── */
function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  const pagination = document.getElementById('galleryPagination');
  if(!grid) return;

  // 1. Saring Data Berdasarkan Kategori Dulu
  const items = currentGalleryFilter === 'semua' 
    ? galleryData 
    : galleryData.filter(d => d.cat === currentGalleryFilter);

  if(items.length === 0) {
    grid.innerHTML = `<div class="w-full text-center py-10 text-muted">Belum ada karya untuk kategori ini.</div>`;
    if(pagination) pagination.innerHTML = '';
    return;
  }

  // 2. Potong Data (Pagination)
  const totalPages = Math.ceil(items.length / GALLERY_PER_PAGE);
  if(currentGalleryPage > totalPages) currentGalleryPage = totalPages;

  const start = (currentGalleryPage - 1) * GALLERY_PER_PAGE;
  const paginatedData = items.slice(start, start + GALLERY_PER_PAGE);

  // 3. Render Kartu
  grid.innerHTML = paginatedData.map(d => `
    <div class="gallery-card w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] reveal opacity-0 translate-y-7 transition-all duration-700 [&.visible]:opacity-100 [&.visible]:translate-y-0 rounded-[14px] overflow-hidden border border-brd bg-card cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-[0_8px_40px_rgba(0,200,255,0.2)] flex flex-col" onclick="openModal('${d.id}')">
      <div class="aspect-[16/10] bg-[color:var(--thumb-bg)] flex items-center justify-center text-[3rem] relative overflow-hidden flex-shrink-0">
        ${d.gambar ? `<img src="${d.gambar}" class="w-full h-full object-cover">` : `<span>${d.emoji}</span>`}
        <span class="absolute top-[10px] left-[10px] font-jet text-[.65rem] text-cyan bg-[color:var(--nav-bg)] px-[.6rem] py-[.2rem] rounded border border-brd tracking-wide shadow-md">${d.badge}</span>
      </div>
      <div class="px-5 py-5 flex-grow bg-card">
        <h4 class="text-[1rem] font-bold mb-2 text-ink line-clamp-2">${d.title}</h4>
        <div class="flex items-center gap-2 text-[.8rem] text-muted">
          <div class="w-7 h-7 rounded-full bg-gradient-to-br from-cyan to-blue flex items-center justify-center text-[.6rem] text-white font-bold flex-shrink-0">${d.init}</div>
          <span class="truncate font-medium">${d.author}</span>
        </div>
      </div>
    </div>
  `).join('');

  setTimeout(() => observeReveal(), 50);

  // 4. Render Tombol Paginasi
  renderGalleryPagination(totalPages);
}

function renderAchievements() {
  const grid = document.getElementById('achieveGrid');
  if(achievements.length === 0) {
    grid.innerHTML = `<div class="w-full text-center py-10 text-muted">Belum ada data prestasi.</div>`;
    return;
  }
  
  // ⬅️ PERUBAHAN: Menambahkan class w-full, sm:w-[calc(...)], dan lg:w-[calc(...)] pada kartu prestasi
  grid.innerHTML = achievements.map(a => `
    <div class="achieve-card w-full sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)] reveal opacity-0 translate-y-7 transition-all duration-700 [&.visible]:opacity-100 [&.visible]:translate-y-0 p-7 bg-card border border-brd rounded-[14px] flex gap-4 items-start transition-colors hover:border-cyan/40">
      <div class="w-12 h-12 rounded-xl flex-shrink-0 bg-gradient-to-br from-cyan/20 to-blue/10 border border-brd flex items-center justify-center text-[1.4rem]">${a.icon}</div>
      <div>
        <div class="font-jet text-[.7rem] text-cyan tracking-[.1em] mb-1">${a.year}</div>
        <div class="text-[.9rem] font-semibold leading-[1.4]">${a.title}</div>
        <div class="text-[.78rem] text-muted mt-1">${a.sub}</div>
      </div>
    </div>
  `).join('');
  observeReveal();
}

function renderTeam() {
  const grid = document.getElementById('teamGrid');
  grid.innerHTML = team.map(t => `
    <div class="team-card reveal opacity-0 translate-y-7 transition-all duration-700 [&.visible]:opacity-100 [&.visible]:translate-y-0 w-[200px] bg-card border border-brd rounded-[14px] px-6 py-8 transition-all hover:-translate-y-1.5 hover:border-cyan/40 hover:shadow-glow text-center">
      <div class="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-cyan to-blue flex items-center justify-center font-orbitron text-[1.4rem] font-bold text-white mx-auto mb-4 overflow-hidden border-2 border-brd">
        ${t.foto ? `<img src="${t.foto}" class="w-full h-full object-cover">` : t.init}
      </div>
      <div class="text-[.92rem] font-semibold mb-1">${t.name}</div>
      <div class="text-[.75rem] text-cyan font-jet tracking-wide">${t.role}</div>
    </div>
  `).join('');
  observeReveal();
}

function renderKurikulum() {
  const gridLengkap = document.getElementById('kurikulumGrid');
  const gridSingkat = document.getElementById('aboutKurikulumGrid');
  
  if(kurikulumData.length === 0) {
    if(gridLengkap) gridLengkap.innerHTML = `<div class="w-full text-center py-10 text-muted">Belum ada data kurikulum.</div>`;
    if(gridSingkat) gridSingkat.innerHTML = '';
    return;
  }

  // 1. Render untuk bagian "Apa yang Kamu Pelajari" (Kotak Besar)
  if(gridLengkap) {
    // ⬅️ PERUBAHAN: Menambahkan class w-full, sm:w-[calc(...)], dan lg:w-[calc(...)] pada kartu kurikulum
    gridLengkap.innerHTML = kurikulumData.map(d => `
      <div class="reveal w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] opacity-0 translate-y-7 transition-all duration-700 [&.visible]:opacity-100 [&.visible]:translate-y-0 group bg-card border border-brd rounded-[14px] p-8 relative overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-cyan/40 hover:shadow-glow">
        <span class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
        <span class="text-[2rem] mb-5 block">${d.icon}</span>
        <div class="font-orbitron text-[1rem] font-bold mb-3">${d.title}</div>
        <div class="text-[.88rem] text-muted leading-[1.7]">${d.desc}</div>
        <div class="mt-5 flex flex-wrap gap-1.5">
          ${d.tags.map(t => `<span class="text-[.68rem] px-[.65rem] py-1 rounded-full bg-cyan/10 border border-cyan/20 text-cyan tracking-wide">${t}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  // 2. Render untuk bagian "Tentang Program" (Kotak Kecil di About)
  if(gridSingkat) {
    gridSingkat.innerHTML = kurikulumData.map(d => `
      <div class="reveal w-full sm:w-[calc(50%-8px)] opacity-0 translate-y-7 transition-all duration-700 [&.visible]:opacity-100 [&.visible]:translate-y-0 flex items-center gap-[.7rem] px-4 py-[.8rem] bg-card border border-brd rounded-lg text-[.85rem] font-medium transition-all hover:border-cyan hover:-translate-y-0.5">
        <div class="w-8 h-8 rounded-lg bg-cyan/[.12] flex items-center justify-center text-base flex-shrink-0">${d.icon}</div>${d.title}
      </div>
    `).join('');
  }

  // Pastikan animasi scroll (reveal) jalan
  observeReveal();
}

function filterGallery(cat, btn) {
  if (btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  currentGalleryFilter = cat;
  currentGalleryPage = 1; // Jika kategori diganti, selalu kembali ke halaman 1
  renderGallery();
}

/* ── FUNGSI GENERATE TOMBOL FILTER OTOMATIS ── */
function renderGalleryFilters() {
  const container = document.getElementById('karyaFilterContainer');
  if (!container) return;

  // 1. Ekstrak kategori unik dari database (hilangkan duplikat)
  const uniqueCategories = [...new Set(galleryData.map(d => d.cat))].filter(Boolean);

  // 2. Buat tombol default "Semua Karya"
  let html = `<button class="filter-btn active px-6 py-[.6rem] rounded-full cursor-pointer text-[.85rem] font-medium border border-brd bg-transparent text-muted transition-all hover:border-cyan hover:text-cyan hover:bg-cyan/[.08] [&.active]:border-cyan [&.active]:text-cyan [&.active]:bg-cyan/[.15]" onclick="filterGallery('semua', this)">Semua Karya</button>`;

  // 3. Looping untuk membuat tombol sesuai data dari Spreadsheet
  uniqueCategories.forEach(cat => {
    // Ubah huruf pertama jadi kapital agar rapi (misal: "web" jadi "Web")
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    
    html += `<button class="filter-btn px-6 py-[.6rem] rounded-full cursor-pointer text-[.85rem] font-medium border border-brd bg-transparent text-muted transition-all hover:border-cyan hover:text-cyan hover:bg-cyan/[.08] [&.active]:border-cyan [&.active]:text-cyan [&.active]:bg-cyan/[.15]" onclick="filterGallery('${cat}', this)">${label}</button>`;
  });

  container.innerHTML = html;
}

/* ── FUNGSI MODAL KARYA ── */
function openModal(id) {
  const d = galleryData.find(x => String(x.id) === String(id));
  if(!d) return;
  
  document.getElementById('modalThumb').innerHTML = d.gambar ? `<img src="${d.gambar}" class="w-full h-full object-cover">` : `<span>${d.emoji}</span>`;
  document.getElementById('modalBadge').textContent = d.badge + ' · ' + d.author;
  document.getElementById('modalTitle').textContent = d.title;
  document.getElementById('modalDesc').textContent = d.desc;
  
  // ⬅️ LOGIKA RENDER TOMBOL LINK EXTERNAL
  const linksContainer = document.getElementById('modalLinks');
  if (d.links && d.links.length > 0) {
    linksContainer.style.display = 'flex';
    linksContainer.innerHTML = d.links.map(l => {
      // Ikon dinamis menyesuaikan nama label atau isi URL
      let icon = '🔗';
      const labelLow = String(l.label).toLowerCase();
      const urlLow = String(l.url).toLowerCase();
      if(labelLow.includes('youtube') || urlLow.includes('youtube')) icon = '▶️';
      if(labelLow.includes('github') || urlLow.includes('github')) icon = '💻';
      if(labelLow.includes('demo') || labelLow.includes('web')) icon = '🌐';
      if(labelLow.includes('figma')) icon = '🎨';
      if(labelLow.includes('drive') || labelLow.includes('file')) icon = '📁';
      
      return `<a href="${l.url}" target="_blank" class="inline-flex items-center gap-[6px] px-5 py-2.5 rounded-full bg-cyan/10 border border-cyan/30 text-cyan hover:bg-cyan hover:text-navy hover:shadow-[0_0_15px_rgba(0,200,255,0.4)] font-bold text-[.8rem] transition-all duration-300">${icon} ${l.label || 'Kunjungi Link'}</a>`;
    }).join('');
  } else {
    // Sembunyikan garis dan tombol jika siswa tidak menyertakan link
    linksContainer.style.display = 'none';
    linksContainer.innerHTML = '';
  }
  
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function animateCounter(el) {
  if (!el || el.dataset.animated) return;
  el.dataset.animated = '1';
  const target = parseInt(el.dataset.target) || 0; // Pastikan jadi angka
  const duration = 1600; 
  const step = 16;
  const increment = target / (duration / step);
  let current = 0;
  
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      // Tampilkan angka + simbol '+'
      el.textContent = Math.floor(target) + (target > 0 ? '+' : ''); 
      clearInterval(timer);
    } else {
      el.textContent = Math.floor(current);
    }
  }, step);
}

/* ── REVEAL ON SCROLL ── */
function observeReveal() {
  const els = document.querySelectorAll('.reveal:not(.visible)');
  const io = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => {
          e.target.classList.add('visible');
          const num = e.target.querySelector('.stat-num');
          if (num && !num.dataset.animated) animateCounter(num);
          if (e.target.classList.contains('stat-item')) {
            const n2 = e.target.querySelector('.stat-num');
            if (n2) animateCounter(n2);
          }
        }, i * 80);
        io.unobserve(e.target);
      }
    });
  }, { threshold: .12 });
  els.forEach(el => io.observe(el));
}

/* ── NAVBAR SCROLL ── */
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 40);
  const sections = ['about','program','gallery','achievement','team','cta'];
  const scrollY = window.scrollY + 100;
  sections.forEach(id => {
    const sec = document.getElementById(id);
    if (!sec) return;
    const link = document.querySelector(`.nav-link[href="#${id}"]`);
    if (!link) return;
    if (scrollY >= sec.offsetTop && scrollY < sec.offsetTop + sec.offsetHeight) link.classList.add('active');
    else link.classList.remove('active');
  });
});

/* ── HAMBURGER ── */
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');
hamburger.addEventListener('click', () => {
  const isOpen = mobileNav.classList.toggle('open');
  hamburger.children[0].style.transform = isOpen ? 'translateY(7px) rotate(45deg)' : '';
  hamburger.children[1].style.opacity   = isOpen ? '0' : '1';
  hamburger.children[2].style.transform = isOpen ? 'translateY(-7px) rotate(-45deg)' : '';
  document.body.style.overflow = isOpen ? 'hidden' : '';
});
function closeMobileNav() {
  mobileNav.classList.remove('open');
  hamburger.children[0].style.transform = '';
  hamburger.children[1].style.opacity   = '1';
  hamburger.children[2].style.transform = '';
  document.body.style.overflow = '';
}

/* ── HERO CANVAS ── */
(function() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, stripes = [];

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    initStripes();
  }
  function randBetween(a, b) { return a + Math.random() * (b - a); }
  function initStripes() {
    stripes = [];
    const count = Math.floor(W / 38);
    for (let i = 0; i < count; i++) {
      stripes.push({
        x: randBetween(-80, W + 80), y: randBetween(-80, H + 80),
        len: randBetween(60, 160),   speed: randBetween(.18, .55),
        opacity: randBetween(.04, .18), width: randBetween(2, 7),
        hue: randBetween(190, 220),
      });
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    stripes.forEach(s => {
      const angle = -Math.PI / 4;
      const dx = Math.cos(angle) * s.len / 2, dy = Math.sin(angle) * s.len / 2;
      const grad = ctx.createLinearGradient(s.x - dx, s.y - dy, s.x + dx, s.y + dy);
      grad.addColorStop(0, `hsla(${s.hue},100%,60%,0)`);
      grad.addColorStop(.5, `hsla(${s.hue},100%,60%,${s.opacity})`);
      grad.addColorStop(1, `hsla(${s.hue},100%,60%,0)`);
      ctx.beginPath();
      ctx.moveTo(s.x - dx, s.y - dy);
      ctx.lineTo(s.x + dx, s.y + dy);
      ctx.strokeStyle = grad; ctx.lineWidth = s.width; ctx.lineCap = 'round';
      ctx.stroke();
      s.x += s.speed; s.y += s.speed;
      if (s.x > W + 100 || s.y > H + 100) {
        s.x = randBetween(-80, W / 2); s.y = randBetween(-80, H / 2);
      }
    });
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', resize);
  resize(); draw();
})();

/* ── JALANKAN SAAT HALAMAN DIBUKA ── */
initData();
observeReveal();

/* ── FUNGSI BANTUAN UPDATE STATISTIK ── */
function updateStat(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.dataset.target = value || 0;
    el.dataset.animated = ''; // Reset status animasi
    el.textContent = '0';     // Tampilkan 0 sebelum mulai menggulir
    animateCounter(el);
  }
}

/* ── COUNTER ANIMATION ── */
function animateCounter(el) {
  if (el.dataset.animated === '1') return;
  el.dataset.animated = '1';
  
  const target = parseInt(el.dataset.target) || 0;
  if (target === 0) return; // Jika datanya 0, tidak perlu dianimasi

  const duration = 1600; 
  const step = 16;
  const increment = target / (duration / step);
  let current = 0;
  
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      // Hanya tampilkan angkanya di HTML, plus tanda '+' di akhir
      el.textContent = Math.floor(target) + '+'; 
      clearInterval(timer);
    } else {
      el.textContent = Math.floor(current);
    }
  }, step);
}
/* ── FUNGSI RENDER ICT CHALLENGE (DENGAN PAGINATION) ── */
function renderChallenge() {
  const grid = document.getElementById('challengeGrid');
  const paginationContainer = document.getElementById('challengePagination');
  if (!grid) return;

  if (challengeData.length === 0) {
    grid.innerHTML = '<div class="w-full text-center text-muted col-span-full py-10">Belum ada misi challenge yang tersedia saat ini.</div>';
    if(paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  // 1. Urutkan Data (Terbaru ke Terlama)
  const sortedData = [...challengeData].sort((a, b) => {
    const numA = parseInt(String(a.minggu).replace(/\D/g, '')) || 0;
    const numB = parseInt(String(b.minggu).replace(/\D/g, '')) || 0;
    return numB - numA;
  });

  // 2. Logika Pemotongan Data (Pagination)
  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / CHALLENGES_PER_PAGE);
  
  if (currentChallengePage > totalPages) currentChallengePage = totalPages;
  if (currentChallengePage < 1) currentChallengePage = 1;

  const startIndex = (currentChallengePage - 1) * CHALLENGES_PER_PAGE;
  const endIndex = startIndex + CHALLENGES_PER_PAGE;
  const paginatedData = sortedData.slice(startIndex, endIndex);

  // 3. Render Kartu Tugas untuk Halaman Aktif
  grid.innerHTML = paginatedData.map((d) => {
    let icon = '🚀';
    const cat = String(d.kategori || '').toLowerCase();
    if(cat.includes('web') || cat.includes('html')) icon = '🌐';
    if(cat.includes('desain') || cat.includes('design')) icon = '🎨';
    if(cat.includes('logika') || cat.includes('python')) icon = '🐍';

    return `
      <div id="${d.id_tugas}" class="bg-card border border-brd rounded-[14px] p-6 reveal opacity-0 translate-y-7 transition-all duration-700 [&.visible]:opacity-100 [&.visible]:translate-y-0 hover:border-cyan hover:shadow-glow flex flex-col h-full cursor-pointer group" onclick="openChallengeModal('${d.id_tugas}')">
        <div class="flex justify-between items-start mb-4">
          <div class="w-10 h-10 rounded-lg bg-cyan/[.12] flex items-center justify-center text-[1.2rem] flex-shrink-0 group-hover:bg-cyan group-hover:text-bg transition-colors">${icon}</div>
          <span class="font-jet text-[.65rem] text-cyan bg-cyan/10 px-2 py-1 rounded border border-cyan/20 uppercase tracking-wider">${d.minggu || 'Mingguan'}</span>
        </div>
        <h3 class="font-orbitron text-[1.1rem] font-bold mb-2 text-ink group-hover:text-cyan transition-colors">${d.judul || 'Misi Tanpa Judul'}</h3>
        <div class="font-jet text-[.75rem] text-muted mb-6 flex-grow">
          <div class="mb-1"><span class="text-cyan">Kategori:</span> ${d.kategori || 'Umum'}</div>
          <div><span class="text-cyan">Reward:</span> ${d.poin_maksimal || 0} XP</div>
        </div>
        <div class="w-full text-center text-[.8rem] py-[.65rem] rounded-lg border border-brd bg-bg group-hover:bg-cyan/10 group-hover:border-cyan transition-all text-muted group-hover:text-cyan font-semibold">
          ▶ Mulai Belajar
        </div>
      </div>
    `;
  }).join('');
  
  setTimeout(() => observeReveal(), 50);

  // 4. Panggil Fungsi Pembuat Tombol Angka
  renderChallengePagination(totalPages);
}

/* ── AUTO-OPEN UNTUK QR CODE CHALLENGE ── */
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const taskID = urlParams.get('task');
  const page = urlParams.get('page');

  if (page === 'challenge') {
    showPage('challenge');
    
    // Tunggu sampai data dari Google Sheets selesai di-fetch
    const checkDataReady = setInterval(() => {
      if (challengeData.length > 0) {
        clearInterval(checkDataReady);
        if (taskID) {
          openChallengeModal(taskID);
        }
      }
    }, 500); // Mengecek setiap setengah detik
  }
});

/* ── HELPER: UBAH LINK YOUTUBE JADI EMBED ── */
function getYouTubeEmbedUrl(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}?autoplay=0&rel=0` : '';
}

/* ── FUNGSI BUKA & TUTUP MODAL CHALLENGE ── */
function openChallengeModal(id) {
  const d = challengeData.find(x => String(x.id_tugas) === String(id));
  if (!d) return;

  // 1. Set Judul & Info
  document.getElementById('challengeTitle').textContent = d.judul || 'Misi Tanpa Judul';
  document.getElementById('challengeMeta').textContent = `Kategori: ${d.kategori || 'Umum'}  •  ${d.minggu || ''}`;

  // 2. Set Video
  const videoContainer = document.getElementById('challengeVideoContainer');
  const embedUrl = getYouTubeEmbedUrl(d.link_youtube);
  if (embedUrl) {
    videoContainer.innerHTML = `<iframe class="w-full h-full absolute inset-0" src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    videoContainer.innerHTML = `<div class="w-full h-full flex flex-col items-center justify-center text-muted bg-bg3"><span class="text-[3rem] mb-2">🚫</span><p>Video materi tidak dilampirkan</p></div>`;
  }

  // 3. Set Tombol Kumpulkan (Link Form)
  const formBtn = document.getElementById('challengeFormBtn');
  if (d.link_form) {
    formBtn.href = d.link_form;
    formBtn.style.display = 'inline-flex'; // Munculkan tombol jika link ada
  } else {
    formBtn.style.display = 'none'; // Sembunyikan jika link kosong
  }

  // 4. Set Deskripsi Dinamis dari Database
  const descContainer = document.getElementById('challengeDesc');
  
  // Jika Anda menambahkan kolom 'deskripsi' di sheet tugas_mingguan, teksnya masuk ke sini
  let customDesc = d.deskripsi ? `<p class="mb-5 text-ink leading-relaxed">${d.deskripsi}</p>` : '';
  
  descContainer.innerHTML = `
    ${customDesc}
    <p class="mb-4">Selesaikan misi ini untuk mendapatkan <strong><span class="text-cyan">${d.poin_maksimal || 0} XP</span></strong>. Ini adalah tantangan terbuka untuk mengasah keahlian digitalmu!</p>
    <p class="font-semibold text-ink mb-2">Instruksi Pengerjaan:</p>
    <ol class="list-decimal pl-5 space-y-1.5">
      <li>Tonton video materi di atas dari awal hingga selesai untuk memahami konsepnya.</li>
      <li>Praktikkan sesuai panduan menggunakan perangkat masing-masing.</li>
      <li>Jika tugas sudah selesai, klik tombol <strong>Kumpulkan Tugas</strong> di atas untuk mengirimkan buktinya melalui formulir.</li>
      <!-- ⬅️ TAMBAHAN INSTRUKSI KE-4 -->
      <li>Tugas yang dikumpulkan akan dievaluasi oleh instruktur terlebih dahulu sebelum poin (XP) divalidasi dan ditambahkan ke Leaderboard.</li>
    </ol>
  `;

  // 5. Tampilkan Modal
  document.getElementById('challengeModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeChallengeModal() {
  document.getElementById('challengeModal').classList.remove('open');
  document.body.style.overflow = '';
  // Kosongkan HTML video agar video berhenti berputar saat modal ditutup
  document.getElementById('challengeVideoContainer').innerHTML = '';
}

/* ── FUNGSI RENDER LEADERBOARD CHALLENGE (ADAPTIF & AKUMULATIF) ── */
function renderLeaderboard() {
  const container = document.getElementById('leaderboardContainer');
  const badgeMode = document.getElementById('lb-badge-mode');
  const tabs = document.getElementById('lb-tabs');
  if (!container) return;

  if (rankChallengeData.length === 0) {
    container.innerHTML = '<div class="text-muted text-center py-6 text-[.85rem]">Belum ada data peringkat. Jadilah yang pertama!</div>';
    return;
  }

  // 1. SISTEM PENGGABUNG & PENJUMLAH POIN (AKUMULATOR)
  const mapAkumulasi = {};
  
  rankChallengeData.forEach(r => {
    const key = String(r.nama).trim().toLowerCase();
    
    if (!mapAkumulasi[key]) {
      // Wadah baru untuk nama ini
      mapAkumulasi[key] = {
        nama: r.nama,
        kelas: r.kelas,
        poin: 0,
        is_ict: !!r.is_ict, // Pastikan boolean
        tugasCount: 0 // Penghitung berapa kali misi dikerjakan
      };
    }
    // Tambahkan poinnya
    mapAkumulasi[key].poin += (parseInt(r.poin) || 0);
    mapAkumulasi[key].tugasCount += 1;
  });
  
  // Ubah kembali data dari keranjang menjadi daftar array biasa
  const dataTerakumulasi = Object.values(mapAkumulasi);

  let displayData = [];

  // 2. CEK MODE DARI DASHBOARD GURU
  if (leaderboardMode === 'split') {
    if(badgeMode) badgeMode.classList.add('hidden');
    if(tabs) tabs.classList.remove('hidden');
    
    // Saring data menggunakan data yang sudah dijumlahkan
    if (currentLbTab === 'ict') {
       displayData = dataTerakumulasi.filter(r => r.is_ict);
    } else {
       displayData = dataTerakumulasi.filter(r => !r.is_ict);
    }
  } else {
    if(badgeMode) badgeMode.classList.remove('hidden');
    if(tabs) tabs.classList.add('hidden');
    displayData = [...dataTerakumulasi]; 
  }

  // 3. URUTKAN DARI POIN TERTINGGI KE TERENDAH
  const sortedRank = displayData.sort((a, b) => {
    const poinA = parseInt(a.poin) || 0;
    const poinB = parseInt(b.poin) || 0;
    return poinB - poinA; 
  });

  if (sortedRank.length === 0) {
      container.innerHTML = '<div class="text-muted text-center py-6 text-[.85rem]">Belum ada poin terkumpul di kategori ini.</div>';
      return;
  }

  // 4. RENDER KE HTML
  container.innerHTML = sortedRank.slice(0, 10).map((r, index) => {
    let badge = `<div class="w-7 h-7 rounded-full bg-bg3 text-muted border border-brd flex items-center justify-center text-[.75rem] font-bold flex-shrink-0">${index + 1}</div>`;
    if(index === 0) badge = `<div class="w-7 h-7 rounded-full bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/50 flex items-center justify-center text-[1rem] flex-shrink-0 shadow-[0_0_10px_rgba(255,215,0,0.3)]">🥇</div>`;
    if(index === 1) badge = `<div class="w-7 h-7 rounded-full bg-[#C0C0C0]/20 text-[#C0C0C0] border border-[#C0C0C0]/50 flex items-center justify-center text-[1rem] flex-shrink-0">🥈</div>`;
    if(index === 2) badge = `<div class="w-7 h-7 rounded-full bg-[#CD7F32]/20 text-[#CD7F32] border border-[#CD7F32]/50 flex items-center justify-center text-[1rem] flex-shrink-0">🥉</div>`;

    const badgeICT = (leaderboardMode === 'global' && r.is_ict) 
        ? `<span class="bg-blue/20 text-blue border border-blue/30 px-1.5 py-[0.1rem] rounded-[4px] text-[.55rem] font-jet tracking-wider ml-2 translate-y-[-1px]">ICT</span>` 
        : '';
        
    // Subteks Dinamis: Menampilkan info "Siswa ICT" atau jumlah misi
    let subTextInfo = "";
    if (r.is_ict) {
        subTextInfo = "Siswa ICT";
    } else {
        // Jika tugasCount > 1, tunjukkan akumulasinya. Jika 1, tulis "1 Misi".
        subTextInfo = `Menyelesaikan ${r.tugasCount} Misi`;
    }

    return `
      <div class="flex items-center justify-between p-3 rounded-lg border border-brd bg-bg transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan hover:bg-cyan/[.04]">
         <div class="flex items-center gap-3 overflow-hidden">
            ${badge}
            <div class="truncate">
               <div class="text-[.85rem] font-bold text-ink truncate capitalize flex items-center">${escH(r.nama || 'Anonim')} ${badgeICT}</div>
               <div class="text-[.65rem] font-jet text-muted truncate uppercase">${escH(r.kelas || 'Umum')} • ${subTextInfo}</div>
            </div>
         </div>
         <div class="font-orbitron font-bold text-cyan text-[.9rem] ml-2 flex-shrink-0">${r.poin || 0} <span class="text-[.6rem] text-muted">XP</span></div>
      </div>
    `;
  }).join('');
}

/* ── FUNGSI KLIK GANTI TAB LEADERBOARD ── */
function switchLbTab(tab) {
   currentLbTab = tab;
   
   const btnIct = document.getElementById('btn-tab-ict');
   const btnReg = document.getElementById('btn-tab-reg');
   
   if(tab === 'ict') {
      btnIct.className = "flex-1 py-1.5 text-[.8rem] font-bold rounded-md bg-cyan text-bg transition-colors";
      btnReg.className = "flex-1 py-1.5 text-[.8rem] font-bold rounded-md border border-brd text-muted hover:border-cyan hover:text-cyan transition-colors";
   } else {
      btnReg.className = "flex-1 py-1.5 text-[.8rem] font-bold rounded-md bg-cyan text-bg transition-colors";
      btnIct.className = "flex-1 py-1.5 text-[.8rem] font-bold rounded-md border border-brd text-muted hover:border-cyan hover:text-cyan transition-colors";
   }
   
   renderLeaderboard();
}

/* ── HELPER KEAMANAN TEKS (Jika belum ada di script_4) ── */
function escH(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── FUNGSI PEMBUAT TOMBOL PAGINATION ── */
function renderChallengePagination(totalPages) {
  const container = document.getElementById('challengePagination');
  if (!container) return;

  // Jika halamannya hanya 1 (atau tugasnya sedikit), sembunyikan pagination
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  // Tombol Sebelumnya (Prev)
  const prevDisabled = currentChallengePage === 1 ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'hover:border-cyan hover:text-cyan hover:bg-cyan/[.1]';
  html += `<button onclick="changeChallengePage(${currentChallengePage - 1})" class="w-10 h-10 rounded-lg border border-brd bg-card flex items-center justify-center text-muted font-bold transition-all ${prevDisabled}">&laquo;</button>`;

  // Tombol Angka 1, 2, 3...
  for (let i = 1; i <= totalPages; i++) {
    const activeClass = i === currentChallengePage 
        ? 'border-cyan bg-cyan/[.15] text-cyan font-bold shadow-[0_0_10px_rgba(0,200,255,0.2)] pointer-events-none' 
        : 'border-brd bg-card text-muted hover:border-cyan hover:text-cyan hover:bg-cyan/[.1]';
    html += `<button onclick="changeChallengePage(${i})" class="w-10 h-10 rounded-lg border transition-all ${activeClass}">${i}</button>`;
  }

  // Tombol Selanjutnya (Next)
  const nextDisabled = currentChallengePage === totalPages ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'hover:border-cyan hover:text-cyan hover:bg-cyan/[.1]';
  html += `<button onclick="changeChallengePage(${currentChallengePage + 1})" class="w-10 h-10 rounded-lg border border-brd bg-card flex items-center justify-center text-muted font-bold transition-all ${nextDisabled}">&raquo;</button>`;

  container.innerHTML = html;
}

/* ── FUNGSI KLIK PINDAH HALAMAN ── */
function changeChallengePage(page) {
  currentChallengePage = page;
  renderChallenge();
  
  // Efek geser (scroll) halus ke bagian atas kotak tugas saat ganti halaman
  const target = document.getElementById('challengeGrid');
  if(target) {
     const y = target.getBoundingClientRect().top + window.scrollY - 150; // -150 agar tidak tertutup navbar
     window.scrollTo({top: y, behavior: 'smooth'});
  }
}

/* ── FUNGSI PEMBUAT TOMBOL PAGINATION KARYA ── */
function renderGalleryPagination(totalPages) {
  const container = document.getElementById('galleryPagination');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  
  // Tombol Prev
  const prevDisabled = currentGalleryPage === 1 ? 'opacity-30 pointer-events-none' : 'hover:border-cyan hover:text-cyan hover:bg-cyan/[.1]';
  html += `<button onclick="changeGalleryPage(${currentGalleryPage - 1})" class="w-10 h-10 rounded-lg border border-brd bg-card flex items-center justify-center text-muted font-bold transition-all ${prevDisabled}">&laquo;</button>`;

  // Tombol Angka
  for (let i = 1; i <= totalPages; i++) {
    const act = i === currentGalleryPage ? 'border-cyan bg-cyan/[.15] text-cyan font-bold pointer-events-none shadow-[0_0_10px_rgba(0,200,255,0.2)]' : 'border-brd bg-card text-muted hover:border-cyan hover:text-cyan hover:bg-cyan/[.1]';
    html += `<button onclick="changeGalleryPage(${i})" class="w-10 h-10 rounded-lg border transition-all ${act}">${i}</button>`;
  }

  // Tombol Next
  const nextDisabled = currentGalleryPage === totalPages ? 'opacity-30 pointer-events-none' : 'hover:border-cyan hover:text-cyan hover:bg-cyan/[.1]';
  html += `<button onclick="changeGalleryPage(${currentGalleryPage + 1})" class="w-10 h-10 rounded-lg border border-brd bg-card flex items-center justify-center text-muted font-bold transition-all ${nextDisabled}">&raquo;</button>`;

  container.innerHTML = html;
}

/* ── FUNGSI KLIK PINDAH HALAMAN KARYA ── */
function changeGalleryPage(page) {
  currentGalleryPage = page;
  renderGallery();
  
  // Efek geser (scroll) halus ke atas filter
  const target = document.getElementById('page-karya');
  if(target) {
     const y = target.offsetTop; 
     window.scrollTo({top: y, behavior: 'smooth'});
  }
}

/* ── FUNGSI RENDER COURSE (TIMELINE & CARD STYLE) ── */
function renderCourse() {
  const container = document.getElementById('courseContainer');
  if(!container) return;

  if (babData.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-10">Belum ada materi pembelajaran.</div>';
    return;
  }

  // 1. Kelompokkan Data Bab berdasarkan LEVEL (Ekstrak angka dari kelas_target)
  const groupedBab = {};
  babData.forEach(b => {
     // Ambil teks aslinya (misal "8A" atau "8B")
     let rawClass = (b.kelas_target && String(b.kelas_target).trim() !== '') ? String(b.kelas_target).trim() : 'Umum';
     
     // Ekstrak hanya angkanya saja (misal "8A" akan menjadi "8")
     let level = rawClass;
     const match = rawClass.match(/\d+/);
     if (match) {
         level = match[0]; 
     }

     if (!groupedBab[level]) groupedBab[level] = [];
     groupedBab[level].push(b); // Masukkan ke wadah level yang sama
  });

  // Urutkan nama level (misal: 7, 8, 9, Umum)
  const sortedLevels = Object.keys(groupedBab).sort();

  let html = '';
  
  // 2. Render Timeline untuk Setiap Level
  sortedLevels.forEach((levelStr, groupIndex) => {
     const babs = groupedBab[levelStr];
     const stepNumber = groupIndex + 1; // Angka di dalam lingkaran
     
     // Buat Grid Kartu Bab
     const cardsHtml = babs.map(b => {
        // Hitung ada berapa materi di dalam bab ini
        const childMateri = materiData.filter(m => String(m.id_bab).trim() === String(b.id_bab).trim());
        const isBabLocked = b.status_akses && String(b.status_akses).trim() !== '';
        
        return `
           <div class="bg-card border ${isBabLocked ? 'border-[#FFD700]/30' : 'border-brd'} rounded-xl overflow-hidden hover:border-cyan hover:shadow-[0_0_15px_rgba(0,200,255,0.15)] transition-all cursor-pointer flex flex-col group relative" onclick="openBabModal('${b.id_bab}', ${isBabLocked})">
              
              <!-- Gambar Thumbnail -->
              <div class="h-[140px] overflow-hidden relative border-b border-brd bg-bg2">
                 ${b.thumbnail ? `<img src="${b.thumbnail}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">` : `<div class="w-full h-full flex items-center justify-center text-4xl">📚</div>`}
                 
                 <!-- Badge Premium -->
                 ${isBabLocked ? `<div class="absolute top-3 right-3 bg-gradient-to-r from-[#FFD700] to-[#F5A623] text-black text-[.65rem] font-bold px-2.5 py-1 rounded uppercase tracking-wider shadow-md">Premium</div>` : ''}
              </div>
              
              <!-- Konten Teks -->
              <div class="p-5 flex-grow flex flex-col">
                 <h3 class="font-orbitron font-bold text-[1.05rem] text-ink group-hover:text-cyan transition-colors mb-2 line-clamp-1">${b.judul_bab || 'Bab Belajar'}</h3>
                 <p class="text-[.8rem] text-muted line-clamp-2 mb-4 leading-relaxed">${b.deskripsi || 'Materi pembelajaran ICT'}</p>
                 
                 <!-- Footer Kartu (Info Durasi/Materi) -->
                 <div class="mt-auto pt-3 border-t border-brd flex items-center justify-between text-[.75rem] font-medium">
                    <span class="flex items-center gap-1.5 text-muted">
                      <svg class="w-3.5 h-3.5 text-cyan" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"></path></svg> 
                      ${childMateri.length} Materi
                    </span>
                    ${isBabLocked ? `<span class="text-[#FFD700] flex items-center gap-1">🔒 ICT Only</span>` : `<span class="text-cyan">Free Access</span>`}
                 </div>
              </div>
           </div>
        `;
     }).join('');

     // Tentukan teks Judul (Jika isinya bukan angka seperti "Umum", hilangkan kata "Level")
     const titleText = isNaN(levelStr) ? `Materi <span class="text-cyan">${levelStr}</span>` : `Materi Level <span class="text-cyan">${levelStr}</span>`;

     // Render Baris Garis Waktu (Garis Kiri)
     html += `
        <div class="relative pl-8 md:pl-12 border-l-2 border-brd ml-4 md:ml-6 mb-16 reveal opacity-0 translate-y-7 transition-all duration-700 [&.visible]:opacity-100 [&.visible]:translate-y-0">
           
           <!-- Lingkaran Angka -->
           <div class="absolute w-8 h-8 md:w-10 md:h-10 bg-bg border-2 border-cyan rounded-full -left-[17px] md:-left-[21px] top-0 flex items-center justify-center text-cyan font-bold font-orbitron text-sm md:text-base shadow-[0_0_10px_rgba(0,200,255,0.3)]">${stepNumber}</div>
           
           <!-- Judul Section -->
           <h2 class="text-xl md:text-2xl font-orbitron font-bold text-ink mb-6 mt-1 tracking-wide">
              ${titleText}
           </h2>
           
           <!-- Container Grid untuk Kartu -->
           <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              ${cardsHtml}
           </div>
           
        </div>
     `;
  });

  container.innerHTML = html;
  setTimeout(() => observeReveal(), 50);
}

/* ── FUNGSI MEMBUKA MODAL LIST MATERI ATAU CTA PREMIUM ── */
function openBabModal(id_bab, isBabLocked) {
  const b = babData.find(x => String(x.id_bab) === String(id_bab));
  if (!b) return;

  const videoContainer = document.getElementById('courseVideoContainer');
  const descEl = document.getElementById('courseDesc');

  // 🔴 1. JIKA BAB TERKUNCI (PREMIUM)
  if (isBabLocked) {
    document.getElementById('courseTitle').textContent = b.judul_bab || 'Bab Eksklusif';
    
    // ⬅️ PERBAIKAN: Hilangkan bg-black, tambahkan 'flex flex-col'
    videoContainer.className = "w-full min-h-[380px] md:min-h-0 md:aspect-video relative flex-shrink-0 flex flex-col";
    
    // ⬅️ PERBAIKAN: Tambahkan 'flex-1' agar background biru/gradien merentang penuh
    videoContainer.innerHTML = `
      <div class="w-full flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-bg3 to-bg text-center p-6 md:p-8 border-b border-brd overflow-hidden">
        <div class="text-[3.5rem] md:text-[4rem] mb-2 md:mb-4 drop-shadow-[0_0_20px_rgba(255,215,0,0.4)] animate-pulse">🔒</div>
        <h3 class="font-orbitron text-xl md:text-3xl font-bold text-[#FFD700] mb-2 md:mb-3">Bab Eksklusif ICT</h3>
        <p class="text-muted max-w-sm md:max-w-lg text-[.8rem] md:text-[.9rem] leading-[1.6] md:leading-[1.8] mb-5 md:mb-6">Modul <strong>"${b.judul_bab}"</strong> ini dirancang khusus dan eksklusif untuk siswa Program Unggulan ICT.</p>
        <a href="#cta" onclick="closeCourseModal(); showPage('home','cta');" class="px-6 py-2.5 md:px-8 md:py-3 text-[.85rem] md:text-base bg-gradient-to-r from-[#FFD700] to-[#F5A623] text-black font-bold rounded-full shadow-[0_0_20px_rgba(255,215,0,0.3)] transition-transform hover:scale-105">Daftar Sekarang</a>
      </div>
    `;
    descEl.innerHTML = `<div class="p-4 border border-[#FFD700]/20 bg-[#FFD700]/5 rounded-lg text-center text-[.85rem] md:text-[.9rem] text-muted">Dapatkan akses ke ratusan materi premium, pendampingan mentor, dan sertifikasi.</div>`;
    
    document.getElementById('courseModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    return;
  }

  // 🟢 2. JIKA BAB GRATIS
  document.getElementById('babModalTitle').textContent = b.judul_bab || 'Materi Belajar';
  document.getElementById('babModalDesc').textContent = b.deskripsi || '';
  document.getElementById('babModalThumb').innerHTML = b.thumbnail ? `<img src="${b.thumbnail}" class="w-full h-full object-cover">` : `<div class="w-full h-full bg-cyan/10 flex items-center justify-center text-3xl">📚</div>`;

  const listContainer = document.getElementById('babModalMateriList');
  const childMateri = materiData.filter(m => String(m.id_bab).trim() === String(b.id_bab).trim());

  if (childMateri.length === 0) {
     listContainer.innerHTML = '<div class="text-center text-muted py-8 text-[.9rem] border border-brd border-dashed rounded-xl">Belum ada modul di bab ini.</div>';
  } else {
     listContainer.innerHTML = childMateri.map((m, idx) => {
        const isLocked = m.status_akses && String(m.status_akses).trim() !== '';
        const icon = isLocked ? '🔒' : '▶️';
        const colorClass = isLocked ? 'text-[#FFD700]' : 'text-cyan group-hover:text-cyan-dim';
        const bgHover = isLocked ? 'hover:bg-[#FFD700]/[0.05]' : 'hover:bg-cyan/[.05]';

        return `
           <div class="group flex items-center justify-between p-4 border border-brd bg-bg2 ${bgHover} cursor-pointer transition-colors rounded-xl mb-3" onclick="closeBabModal(); openCourseModal('${m.id_materi}', ${isLocked})">
             <div class="flex items-center gap-4">
               <div class="w-10 h-10 rounded-full bg-card border border-brd flex items-center justify-center text-[.9rem] flex-shrink-0 transition-colors shadow-sm ${colorClass}">${icon}</div>
               <div class="text-[.95rem] font-bold ${isLocked ? 'text-muted' : 'text-ink group-hover:text-cyan transition-colors'}">${idx + 1}. ${m.nama_materi}</div>
             </div>
             ${isLocked 
               ? `<span class="text-[.6rem] bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 px-2.5 py-1 rounded-full tracking-widest font-jet uppercase hidden sm:block">ICT Only</span>` 
               : `<span class="text-[.6rem] bg-cyan/10 text-cyan border border-cyan/30 px-2.5 py-1 rounded-full tracking-widest font-jet uppercase hidden sm:block">Free</span>`}
           </div>
         `;
     }).join('');
  }

  document.getElementById('babModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBabModal() {
   document.getElementById('babModal').classList.remove('open');
   document.body.style.overflow = '';
}


/* ── FUNGSI MODAL COURSE (DETAIL MATERI/VIDEO) ── */
function openCourseModal(id, isLocked) {
  const m = materiData.find(x => String(x.id_materi) === String(id));
  if(!m) return;

  document.getElementById('courseTitle').textContent = m.nama_materi || 'Materi Belajar';
  const videoContainer = document.getElementById('courseVideoContainer');
  const descEl = document.getElementById('courseDesc');

  if (isLocked) {
    // ⬅️ PERBAIKAN: Hilangkan bg-black, tambahkan 'flex flex-col'
    videoContainer.className = "w-full min-h-[380px] md:min-h-0 md:aspect-video relative flex-shrink-0 flex flex-col";
    
    // ⬅️ PERBAIKAN: Tambahkan 'flex-1'
    videoContainer.innerHTML = `
      <div class="w-full flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-bg3 to-bg text-center p-6 md:p-8 border-b border-brd overflow-hidden">
        <div class="text-[3.5rem] md:text-[4rem] mb-2 md:mb-4 drop-shadow-[0_0_20px_rgba(255,215,0,0.4)] animate-pulse">🔒</div>
        <h3 class="font-orbitron text-xl md:text-3xl font-bold text-[#FFD700] mb-2 md:mb-3">Materi Eksklusif ICT</h3>
        <p class="text-muted max-w-sm md:max-w-lg text-[.8rem] md:text-[.9rem] leading-[1.6] md:leading-[1.8] mb-5 md:mb-6">Materi <strong>"${m.nama_materi}"</strong> ini dirancang khusus dan eksklusif untuk siswa Program Unggulan ICT.</p>
        <a href="#cta" onclick="closeCourseModal(); showPage('home','cta');" class="px-6 py-2.5 md:px-8 md:py-3 text-[.85rem] md:text-base bg-gradient-to-r from-[#FFD700] to-[#F5A623] text-black font-bold rounded-full shadow-[0_0_20px_rgba(255,215,0,0.3)] transition-transform hover:scale-105">Daftar Sekarang</a>
      </div>
    `;
    descEl.innerHTML = `<div class="p-4 border border-[#FFD700]/20 bg-[#FFD700]/5 rounded-lg text-center text-[.85rem] md:text-[.9rem] text-muted">Dapatkan akses ke ratusan materi premium, pendampingan mentor, dan sertifikasi.</div>`;
  } else {
    // ⬅️ JIKA GRATIS (VIDEO YOUTUBE): Kembalikan bg-black agar pinggiran video tidak belang
    videoContainer.className = "w-full aspect-video bg-black relative flex-shrink-0";
    
    const embedUrl = typeof getYouTubeEmbedUrl === 'function' ? getYouTubeEmbedUrl(m.video) : m.video;
    
    if (embedUrl) {
      videoContainer.innerHTML = `<iframe class="w-full h-full absolute inset-0" src="${embedUrl}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else {
      videoContainer.innerHTML = `<div class="w-full h-full flex flex-col items-center justify-center text-muted bg-bg3"><span class="text-[3rem] mb-2">🚫</span><p>Video tidak dilampirkan</p></div>`;
    }
    
    const slideBtn = m.slide ? `<a href="${m.slide}" target="_blank" class="inline-flex items-center gap-2 px-5 py-2.5 bg-card border border-brd rounded-lg text-cyan hover:bg-cyan/10 transition-colors text-[.85rem] font-semibold">📄 Lihat Slide</a>` : '';
    const fileBtn = m.file ? `<a href="${m.file}" target="_blank" class="inline-flex items-center gap-2 px-5 py-2.5 bg-card border border-brd rounded-lg text-cyan hover:bg-cyan/10 transition-colors text-[.85rem] font-semibold">💾 Unduh Asset</a>` : '';
    
    descEl.innerHTML = `
      ${m.deskripsi ? `<p class="mb-5 text-ink leading-relaxed">${m.deskripsi}</p>` : ''}
      <div class="flex flex-wrap gap-3 mt-4">
        ${slideBtn} ${fileBtn}
      </div>
    `;
  }
  
  document.getElementById('courseModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

/* ── FUNGSI TUTUP MODAL COURSE ── */
function closeCourseModal() {
  document.getElementById('courseModal').classList.remove('open');
  document.body.style.overflow = '';
  // Kosongkan kontainer video agar suara YouTube tidak terus berjalan di background
  document.getElementById('courseVideoContainer').innerHTML = '';
}