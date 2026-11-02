# Official ICT — Roadmap Migrasi Google Apps Script ke Firebase

## Target arsitektur

- Firebase Authentication untuk identitas siswa dan guru.
- PIN undangan orang tua yang diverifikasi server, dengan pembatasan percobaan dan Firebase custom token.
- Cloud Functions (Node.js 22, region Jakarta / asia-southeast2) untuk logika bisnis server-side.
- Cloud Firestore sebagai penyimpanan data utama.
- Firebase Hosting atau hosting statis yang ada untuk frontend, setelah tiap portal menggunakan Firebase API.
- Google Apps Script dihentikan setelah verifikasi data dan cutover selesai.

Project ID default mengikuti konfigurasi Firebase yang sudah ada di kode dashboard guru: monitoring-ict-smpit. Pastikan project tersebut memang tujuan migrasi sebelum deployment.

## Prioritas audit yang dicatat

**Prioritas P0 — file database di repositori publik:** file DATABASE ICT SMPIT AL FIRDAUS.xlsx telah dikeluarkan dari snapshot `main` dan ditambahkan ke `.gitignore` karena dapat berisi data pribadi/password. Penghapusan pada commit terbaru tidak menghapus blob pada riwayat Git lama. Jangan menganggap data yang pernah ter-commit sudah aman; lakukan audit/pembersihan riwayat secara terencana dan rotasi password lama yang mungkin terekspos.


1. Amankan jalur orang tua. Kode siswa saja tidak boleh cukup untuk melihat data anak.
2. Lindungi setiap operasi API dengan autentikasi server dan otorisasi berbasis role.
3. Satukan backend dashboard guru dengan sumber data utama.
4. Selaraskan HTML dan JavaScript dashboard guru, termasuk login, tabel, dan modal.
5. Optimalkan operasi data, cegah duplikasi, gunakan batch dan transaksi jika sesuai.
6. Audit render HTML, encoding, URL eksternal, dan risiko XSS.
7. Periksa SEO, Open Graph, metadata berbagi, serta responsif portal publik.
8. Uji seluruh alur siswa, guru, orang tua, materi, tugas, karya, SKL, dan jadwal.
9. Verifikasi hasil migrasi, siapkan rencana rollback, lalu hentikan Apps Script.

## Status tahapan

- [x] Tahap 0 — Audit statis awal repositori dan pencatatan risiko prioritas.
- [x] Tahap 1 — Tambahkan fondasi backend Firebase, aturan Firestore deny-by-default, konfigurasi CLI, dan alat ekspor/impor.
- [ ] Tahap 2 — Jalankan ekspor privat dari spreadsheet produksi dan validasi jumlah baris/kolom.
- [ ] Tahap 3 — Konfirmasi project Firebase, aktifkan kebutuhan billing/layanan, deploy API dan aturan dalam lingkungan uji.
- [ ] Tahap 4 — Import data dan akun ke Firebase; verifikasi jumlah record dan relasi.
- [ ] Tahap 5 — Migrasikan portal siswa ke Firebase Authentication dan API baru.
- [ ] Tahap 6 — Migrasikan portal orang tua dari akses kode saja ke PIN undangan dan Firebase custom token.
- [ ] Tahap 7 — Migrasikan integrasi dashboard guru ke Firebase API, mempertahankan tampilan dan fitur yang sudah disepakati.
- [ ] Tahap 8 — Migrasikan website publik ke endpoint Firebase dengan daftar data publik eksplisit.
- [ ] Tahap 9 — Pengujian regresi, cutover terkontrol, periode rollback, lalu penghentian Apps Script.

## Struktur data sementara

Data dari sheet disimpan sebagai dokumen di koleksi legacyData, dengan subkoleksi rows dan field record. ID dokumen dibuat deterministik untuk baris dengan kunci yang diketahui. Setelah portal berjalan stabil, koleksi sementara dapat dinormalisasi jika manfaatnya jelas.

Password tidak ditulis ke dokumen Firestore. Skrip impor memindahkan akun siswa/guru ke Firebase Authentication dan menghapus kolom password dari record. PIN orang tua disimpan sebagai hash scrypt dan salt, bukan PIN mentah. File undangan privat hanya dibuat di mesin admin dan tidak boleh di-commit ke GitHub.

## Ekspor data lama

1. Buka Apps Script yang masih terikat pada spreadsheet ICT.
2. Salin fungsi scripts/export-appscript-data.gs ke proyek Apps Script tersebut.
3. Jalankan exportIctSheetsToDriveJson() secara manual dari akun admin.
4. Unduh file JSON privat dari Google Drive ke mesin admin dan simpan di luar repositori.
5. Jangan menempelkan ekspor berisi password atau data siswa ke chat, issue, atau commit GitHub.

## Persiapan impor

1. Pastikan project Firebase tujuan benar dan Firestore serta Authentication tersedia.
2. Gunakan Node.js 22.
3. Login pada mesin admin dengan Application Default Credentials yang memiliki izin Firebase Authentication dan Firestore.
4. Jalankan node scripts/import-firestore.js PATH_FILE_EKSPOR.
5. Simpan parent-invites.csv, account-reset.csv, dan laporan impor secara privat. Distribusikan PIN orang tua melalui kanal sekolah yang aman.
6. Verifikasi jumlah data setiap sheet, login akun uji, akses role, dan progres sebelum memigrasikan frontend.

## Peringatan deployment

Frontend lama masih memanggil Apps Script. Commit fondasi Firebase ini belum berarti website live sudah pindah backend. Jangan menghapus atau menonaktifkan Apps Script dan jangan melakukan cutover frontend sebelum migrasi dan pengujian selesai.

Aturan Firestore dalam repositori sengaja menolak akses langsung klien. Cloud Functions menggunakan Admin SDK dan melakukan pemeriksaan token/role. Dashboard guru lama yang membaca Firestore langsung perlu dimigrasikan ke API sebelum aturan tersebut diterapkan ke project produksi.

## Batasan tahap saat ini

Perubahan repositori menyiapkan server, aturan, dan tooling; belum mengekspor data produksi, belum melakukan deployment Firebase, dan belum mengganti semua URL Apps Script di portal live. Ketiganya harus diverifikasi untuk menyelesaikan migrasi secara penuh.

## Status project dari pemilik (2 November 2026)

- Project ID dikonfirmasi: `monitoring-ict-smpit`.
- Pemilik melaporkan billing Blaze aktif.
- Pemilik melaporkan akun memiliki akses Owner.
- Keberadaan database Cloud Firestore belum diketahui; periksa melalui Firebase Console sebelum membuat database apa pun.
- Firebase Web API Key dan project config sudah ada di `firebase/client.js`; tidak perlu meminta API key baru dari pemilik. Firebase Web API Key bukan kredensial admin.
- Firebase Authentication Email/Password belum diverifikasi aktif.

## Checklist persiapan project

1. Buka [Firestore Console](https://console.firebase.google.com/project/monitoring-ict-smpit/firestore) dan cek apakah database `(default)` sudah ada. Bila ada, catat lokasi dan jangan membuat database kedua.
2. Bila belum ada, buat Cloud Firestore Standard Edition dengan ID `(default)`, Production mode, dan lokasi `asia-southeast2` (Jakarta) bila tersedia. Lokasi database tidak dapat diganti sesudah provisioning. Jika lokasi default Google Cloud sudah ditetapkan, console dapat membatasi pilihan lokasi.
3. Di [Authentication Console](https://console.firebase.google.com/project/monitoring-ict-smpit/authentication), aktifkan Email/Password untuk login siswa dan guru. Orang tua memakai custom token setelah validasi PIN.
4. Pastikan Functions API, Cloud Build, Artifact Registry, dan layanan pendukung deployment dapat diaktifkan. Billing Blaze sudah dilaporkan aktif; buat budget alerts untuk memantau biaya.
5. Deploy Functions dan Firestore Rules hanya setelah uji emulator/staging. Rules saat ini deny-by-default dan akan memutus akses dashboard guru lama yang membaca Firestore langsung.
6. Ekspor data dari spreadsheet ICT sumber secara privat menggunakan `scripts/export-appscript-data.gs`. Jangan upload ekspor, password siswa/guru, PIN, atau service-account key ke GitHub maupun chat.
7. Import ke Firestore melalui `scripts/import-firestore.js`, lalu verifikasi jumlah record, relasi, akun, dan login setiap peran.
8. Migrasikan portal siswa, orang tua, guru, dan website publik sebelum mengubah `firebase/runtime-config.js` dari `legacy` ke `firebase`.

## Fakta implementasi yang perlu diingat

- `firebase/runtime-config.js` masih menggunakan `backend: "legacy"`; ini disengaja agar portal aktif tidak terputus.
- Portal siswa sudah memiliki jalur login/data Firebase parsial.
- Portal orang tua masih memakai JSONP Apps Script; halaman ini belum boleh dialihkan sebelum PIN invitation dan custom-token flow selesai diuji.
- Website publik sudah punya cabang fetch JSON saat runtime Firebase, tetapi tetap perlu pengujian endpoint dan field mapping.
- Dashboard guru masih berupa prototype Firestore langsung dan belum menggunakan autentikasi Firebase bersama/API Cloud Functions. Jangan deploy Firestore Rules deny-by-default ke project produksi sebelum dashboard guru dipindahkan ke API.
- Cloud Functions perlu dijalankan di Node.js 22 sesuai konfigurasi repositori dan dukungan Firebase saat ini.

