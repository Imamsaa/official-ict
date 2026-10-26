/**
 * SISTEM MONITORING ICT - DASHBOARD GURU
 * Menggunakan Firebase Firestore SDK v10 (Modular)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. KONFIGURASI FIREBASE (WAJIB DIISI)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAJEC8FHc2J6vYqFOuYwScmSrMdYUfrqGI",
  authDomain: "monitoring-ict-smpit.firebaseapp.com",
  projectId: "monitoring-ict-smpit",
  storageBucket: "monitoring-ict-smpit.firebasestorage.app",
  messagingSenderId: "732245888299",
  appId: "1:732245888299:web:d10fa6cfc1a9c67118496e",
  measurementId: "G-QYRR78CHXS"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Identitas Guru Pengampu (Bisa disesuaikan dengan sesi login nanti)
const namaGuru = "Pak Imam Syafi";

// ==========================================
// 2. LOGIKA NAVIGASI SPA
// ==========================================
function navigasiKe(idHalaman) {
  // Sembunyikan semua halaman dengan class 'page-section'
  document.querySelectorAll('.page-section').forEach(page => {
    page.classList.add('hidden');
  });
  
  // Tampilkan halaman yang dipilih
  const halamanTujuan = document.getElementById(idHalaman);
  if (halamanTujuan) {
    halamanTujuan.classList.remove('hidden');
  }
}

// ==========================================
// 3. READ: MENGAMBIL DATA SECARA REAL-TIME
// ==========================================

// A. Menampilkan Daftar Siswa
function muatDaftarSiswa() {
  const referensiSiswa = collection(db, "siswa");
  
  // onSnapshot membuat data langsung berubah di layar jika ada update di database
  onSnapshot(referensiSiswa, (snapshot) => {
    const tabelBody = document.getElementById("tabel-siswa-body");
    if (!tabelBody) return;
    
    tabelBody.innerHTML = ""; // Bersihkan tabel
    
    snapshot.forEach((dokumen) => {
      const dataSiswa = dokumen.data();
      const idSiswa = dokumen.id;
      
      tabelBody.innerHTML += `
        <tr class="border-b hover:bg-gray-50 transition">
          <td class="p-3">${idSiswa}</td>
          <td class="p-3 font-semibold">${dataSiswa.nama || '-'}</td>
          <td class="p-3">${dataSiswa.kelas || '-'}</td>
          <td class="p-3">
            <button onclick="bukaModalNilai('${idSiswa}', '${dataSiswa.nama}')" class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
              Beri Nilai
            </button>
          </td>
        </tr>
      `;
    });
  }, (error) => {
    console.error("Gagal memuat data siswa:", error);
  });
}

// B. Menampilkan Progres Tugas Keseluruhan
function muatProgresTugas() {
  const referensiProgres = collection(db, "progres_tugas_mingguan");
  
  onSnapshot(referensiProgres, (snapshot) => {
    const tabelProgres = document.getElementById("tabel-progres-body");
    if (!tabelProgres) return;
    
    tabelProgres.innerHTML = "";
    
    snapshot.forEach((dokumen) => {
      const progres = dokumen.data();
      tabelProgres.innerHTML += `
        <tr class="border-b">
          <td class="p-3">${progres.id_siswa || '-'}</td>
          <td class="p-3">${progres.id_tugas || '-'}</td>
          <td class="p-3">
            <span class="px-2 py-1 bg-green-100 text-green-800 rounded font-bold">
              ${progres.nilai || '0'}
            </span>
          </td>
          <td class="p-3 text-sm text-gray-500">${progres.dinilai_oleh || '-'}</td>
        </tr>
      `;
    });
  });
}

// ==========================================
// 4. WRITE: MENYIMPAN ATAU MENGUBAH DATA
// ==========================================

// Fungsi saat tombol simpan nilai ditekan
async function simpanNilaiTugas(idSiswa, idTugas, nilaiInput) {
  // Buat ID Dokumen unik, contoh: "S001_TUGAS-HTML"
  const docId = `${idSiswa}_${idTugas}`; 
  const referensiDokumen = doc(db, "progres_tugas_mingguan", docId);
  
  // Tampilkan loading di UI (Opsional)
  const tombolSimpan = document.getElementById("btn-simpan-nilai");
  if(tombolSimpan) tombolSimpan.innerText = "Menyimpan...";

  try {
    // setDoc dengan merge: true akan menimpa data lama atau membuat baru jika belum ada
    await setDoc(referensiDokumen, {
      id_siswa: idSiswa,
      id_tugas: idTugas,
      nilai: parseInt(nilaiInput),
      dinilai_oleh: namaGuru,
      waktu_update: new Date().toISOString()
    }, { merge: true });

    alert("Nilai berhasil disimpan!");
    
    // Tutup modal (sesuaikan dengan ID modal HTML Anda)
    document.getElementById("modal-nilai").classList.add("hidden");
    
  } catch (error) {
    console.error("Error menyimpan nilai:", error);
    alert("Gagal menyimpan nilai. Cek koneksi atau rules Firestore.");
  } finally {
    if(tombolSimpan) tombolSimpan.innerText = "Simpan Nilai";
  }
}

// Fungsi pembantu untuk membuka modal input nilai
function bukaModalNilai(idSiswa, namaSiswa) {
  document.getElementById("modal-nilai").classList.remove("hidden");
  document.getElementById("modal-nama-siswa").innerText = namaSiswa;
  document.getElementById("input-id-siswa").value = idSiswa; // Input hidden di form
}

// ==========================================
// 5. INISIALISASI & GLOBAL BINDING
// ==========================================
// Karena menggunakan type="module", fungsi tidak bisa dipanggil langsung dari HTML via onclick=""
// Kita harus mendaftarkannya ke object 'window' agar dikenali oleh HTML.

window.navigasiKe = navigasiKe;
window.bukaModalNilai = bukaModalNilai;
window.simpanNilaiTugas = simpanNilaiTugas;

// Panggil fungsi muat data saat halaman pertama kali dibuka
document.addEventListener("DOMContentLoaded", () => {
  muatDaftarSiswa();
  muatProgresTugas();
});