# Persiapan Firebase — Official ICT

Project: `monitoring-ict-smpit`  
Backend target: Firebase Authentication + Cloud Firestore + Cloud Functions  
Firestore `(default)`: `nam5` (multi-region Amerika Serikat bagian tengah)  
Cloud Functions region: `us-central1` (Iowa), mengikuti rekomendasi Firebase untuk Firestore `nam5`  
Functions runtime: Node.js 22

## Status yang dilaporkan pemilik

- Billing Blaze aktif.
- Akun memiliki hak Owner.
- Pemilik telah mengonfirmasi database Cloud Firestore `(default)` sudah ada. Jangan membuat database baru; lokasi database masih perlu dilihat pada daftar database.
- Firebase Web API Key dan konfigurasi Web App telah tersedia pada `firebase/client.js`.
- Status Email/Password Authentication belum diverifikasi.

## 1. Periksa Firestore sebelum membuat database

Buka https://console.firebase.google.com/project/monitoring-ict-smpit/firestore lalu pilih Databases & Storage > Firestore > Data. Pada daftar database, baca kolom **Location** pada baris `(default)`. Dokumentasi resmi: https://firebase.google.com/docs/firestore/locations#view-location.

- Database `(default)` telah dikonfirmasi oleh pemilik dengan lokasi `nam5`. Jangan membuat ulang atau menghapus database tersebut.
- `nam5` adalah lokasi multi-region Amerika Serikat bagian tengah. Untuk Cloud Functions, Firebase merekomendasikan `us-central1` sebagai region terdekat.
- Lokasi database tidak dapat diubah. Pertahankan database `(default)` dan selaraskan Functions di `us-central1`.

Jangan gunakan Test mode untuk data siswa. Rules di repositori bersifat deny-by-default dan API server menggunakan Firebase Admin SDK.

## 2. Aktifkan Authentication

Buka https://console.firebase.google.com/project/monitoring-ict-smpit/authentication. Pastikan Firebase Authentication sudah diaktifkan, lalu pada Sign-in method aktifkan Email/Password.

Siswa dan guru akan menggunakan alias email internal yang dibentuk dari kode/NIS/ID guru; mereka tidak perlu memiliki alamat email sekolah masing-masing. Orang tua memakai PIN unik yang diverifikasi server kemudian ditukar menjadi Firebase custom token.

Jangan membuat akun massal secara manual; importer yang akan membuat akun siswa/guru saat data migrasi dijalankan.

## 3. Billing dan biaya

Billing Blaze dilaporkan aktif. Cloud Functions deployment memerlukan Blaze. Buat budget alerts pada Google Cloud Billing, misalnya notifikasi saat 50%, 80%, dan 100% dari budget. Budget alert adalah notifikasi untuk memantau penggunaan, bukan jaminan biaya maksimum.

## 4. Kredensial

- Jangan kirim API key Firebase Web; sudah ada di repositori dan memang digunakan klien.
- Jangan commit Firebase service-account JSON atau private key.
- Cloud Functions akan menggunakan service identity/Application Default Credentials di server.
- Firebase project config bukan pengganti Security Rules atau role verification.

## 5. Ekspor data lama

Spreadsheet sumber harus tetap menjadi sumber kebenaran sampai verifikasi cutover selesai. Jalankan fungsi Apps Script `exportIctSheetsToDriveJson()` dari proyek Apps Script yang terikat ke spreadsheet ICT. File JSON hasil ekspor berisi data pribadi dan password lama: simpan privat, jangan kirim melalui chat dan jangan letakkan di repositori.

## 6. Import dan verifikasi

Jalankan importer dari lingkungan admin yang terautentikasi ke project Firebase. Simpan `parent-invites.csv`, `account-reset.csv`, dan `migration-report.json` di luar repositori. Verifikasi total record pada setiap sheet, akun Auth, relasi karya/SKL/progres, dan akses per peran.

## 7. Deployment bertahap

Jangan mengubah `firebase/runtime-config.js` menjadi `firebase` dulu. Portal siswa, orang tua, guru, dan website publik harus selesai dipindah serta lulus pengujian regresi.

**Peringatan khusus dashboard guru:** implementasi saat ini membaca Firestore langsung melalui SDK web. Aturan Firestore deny-by-default akan menghentikan akses dashboard tersebut. Migrasikan dashboard ke Firebase Authentication + Cloud Functions API sebelum menerapkan rules ke produksi.

## Rujukan resmi

- Firestore: https://firebase.google.com/docs/firestore/quickstart
- Firestore locations: https://firebase.google.com/docs/firestore/locations
- Password Authentication: https://firebase.google.com/docs/auth/web/password-auth
- Cloud Functions: https://firebase.google.com/docs/functions/get-started
- API keys: https://firebase.google.com/docs/projects/api-keys


## Firestore sudah ada: langkah berikutnya

Pemilik project mengonfirmasi bahwa database Cloud Firestore \`(default)\` sudah ada. Jangan membuat database kedua. ID, lokasi, edition/mode, dan aturan yang sedang berlaku tetap harus diperiksa sebelum import atau deployment. Lokasi database tidak dapat diubah setelah provisioning.

### Pemeriksaan read-only satu perintah

Setelah Google Cloud CLI (gcloud) terpasang dan login sebagai akun Owner:

\`\`\`powershell
node scripts/firebase-project-preflight.js
\`\`\`

Pemeriksaan ini hanya membaca status project:
- akun Google Cloud yang sedang login;
- project aktif dan kecocokannya dengan \`monitoring-ict-smpit\`;
- status billing;
- database Firestore \`(default)\`, termasuk location dan edition/type bila dilaporkan;
- API Google Cloud yang sudah aktif;
- versi Firebase CLI dan Node.js lokal.

Script ini tidak membuat database, mengaktifkan API, mengubah billing, mengubah Security Rules, atau men-deploy Cloud Functions. Bila gcloud belum tersedia, ikuti link Firebase/Google Cloud Console di atas dan jangan mengirim kredensial privat.

### Pemeriksaan manual Authentication

Buka https://console.firebase.google.com/project/monitoring-ict-smpit/authentication lalu periksa Sign-in method. Provider Email/Password harus aktif untuk akun siswa dan guru. Jangan membuat akun massal secara manual; importer akan mengurus akun setelah skema dan sumber data diverifikasi.

### Instal dependensi importer dan verifier

\`\`\`powershell
cd scripts
npm install
npm run preflight
\`\`\`

Perintah preflight bisa dijalankan dari root dengan \`node scripts/firebase-project-preflight.js\`; tidak membutuhkan npm package. Dependensi \`firebase-admin\` pada folder scripts dibutuhkan untuk import/verifikasi saja.

Setelah ekspor privat tersedia:
\`\`\`powershell
npm run import -- C:\\path\\private\\legacy-export.json
npm run verify -- C:\\path\\private\\legacy-export.json
\`\`\`

Jalankan dari folder \`scripts\`. File ekspor, \`parent-invites.csv\`, \`account-reset.csv\`, dan \`migration-report.json\` harus tetap privat dan tidak boleh di-commit.

### Hasil yang perlu dicatat sebelum deployment

1. Database ID (harus tetap \`(default)\` untuk konfigurasi sekarang).
2. Database location: \`nam5\` (multi-region Amerika Serikat bagian tengah).
3. Database edition/type dan apakah collections sudah digunakan aplikasi lain.
4. Apakah Authentication Email/Password aktif.
5. API yang belum aktif dari hasil preflight.

Jangan deploy \`firestore.rules\` ke project produksi sampai dashboard guru lama yang membaca Firestore langsung telah dimigrasikan ke Cloud Functions API.


## Development lokal dan hosting eksternal

Frontend Official ICT tidak wajib di-host di Firebase Hosting. Frontend dapat di-deploy di layanan hosting statis lain; Firebase tetap menjadi backend untuk Authentication, Firestore, dan Cloud Functions. Hosting eksternal tidak mengubah Firebase project yang digunakan aplikasi.

### Menjalankan frontend dari komputer developer

1. Jalankan web melalui local development server (jangan membuka file HTML langsung dengan \`file://\`). Contoh origin: \`http://localhost:5173\`, \`http://localhost:5500\`, atau \`http://127.0.0.1:5500\`.
2. Halaman harus memuat \`firebase/runtime-config.js\` sebelum \`firebase/client.js\`.
3. \`firebase/client.js\` menggunakan project Web App config yang sama dan membaca \`window.ICT_RUNTIME_CONFIG.apiUrl\` sebagai endpoint API. Dengan demikian API dapat diarahkan ke Cloud Functions yang sudah di-deploy atau ke Functions Emulator.
4. Cloud Functions API mengizinkan \`localhost\` dan \`127.0.0.1\` di port development mana pun. Origin produksi tetap harus dimasukkan secara spesifik ke variabel \`ALLOWED_ORIGINS\` pada environment Functions.

### Firebase Authentication authorized domains

Buka Authentication > Settings > Authorized domains. Tambahkan \`localhost\` untuk development lokal bila belum tercantum. Tambahkan domain produksi setelah nama domain hosting diputuskan. Firebase Auth memvalidasi domain ini untuk alur autentikasi; ini berbeda dengan aturan CORS Cloud Functions. Pada project baru setelah 28 April 2025, localhost mungkin tidak otomatis terdaftar.

### Hosting eksternal

Setelah hosting dipilih, masukkan origin tepatnya (misalnya \`https://ict.example.sch.id\`) ke \`ALLOWED_ORIGINS\` Functions dan tambahkan hostname yang sama pada Authorized domains Firebase Authentication. Jangan gunakan wildcard untuk mengizinkan semua origin.

### Pilihan aman untuk development

Jangan menguji fitur tulis/hapus dengan data asli siswa. Pilihan yang disarankan adalah Firebase Emulator Suite atau Firebase project development terpisah. Bila sementara memakai project produksi, batasi uji coba ke akun dan data uji yang memang disiapkan khusus. Jangan menaruh Service Account key di frontend atau repositori.


## Deployment frontend ke Shared Hosting / cPanel

Official ICT memakai arsitektur **static frontend + Firebase backend**. cPanel hanya menyajikan HTML, CSS, JavaScript, dan aset. Firebase Authentication, Cloud Firestore, dan Cloud Functions tetap berjalan di project Firebase \`monitoring-ict-smpit\`. Tidak dibutuhkan Node.js, PHP, database MySQL, atau Firebase Hosting di cPanel untuk frontend ini.

### Struktur URL

- \`https://DOMAIN/\` — website publik (isi \`web_public/\` dipasang pada document root).
- \`https://DOMAIN/siswa/\` — portal siswa.
- \`https://DOMAIN/ortu/\` — portal orang tua.
- \`https://DOMAIN/guru/\` — dashboard guru.
- \`https://DOMAIN/firebase/\` — hanya file browser-side Firebase yang dibutuhkan frontend.

### Buat paket frontend yang aman

Dari root repository, jalankan:

\`\`\`bash
node scripts/build-cpanel.js
\`\`\`

Paket dibuat di \`dist-cpanel/\`. Script menyalin situs publik ke root, mempertahankan folder portal, menyalin aset bersama yang digunakan portal orang tua, dan menyesuaikan path konfigurasi Firebase pada homepage. Script **tidak** memasukkan \`functions/\`, \`scripts/\`, \`code.gs\`, file spreadsheet, atau kredensial Admin.

### Upload ke cPanel

1. Pastikan domain/subdomain sudah diarahkan ke akun hosting dan document root-nya benar.
2. Buka cPanel > File Manager > document root domain (umumnya \`public_html/\` untuk domain utama).
3. Upload isi folder \`dist-cpanel/\` ke document root; jangan upload folder \`dist-cpanel\` sebagai subfolder.
4. Pastikan \`index.html\` berada langsung di document root dan folder \`siswa\`, \`ortu\`, \`guru\`, serta \`firebase\` berada di sampingnya.
5. Aktifkan SSL/HTTPS pada domain hosting melalui AutoSSL/fitur SSL penyedia hosting, lalu uji semua URL di atas.

Jangan upload seluruh root repository ke \`public_html\`. Folder Functions, file migrasi, source Apps Script, dan konfigurasi pengembangan tidak diperlukan atau tidak boleh dipublikasikan.

### Sambungkan domain cPanel ke Firebase

Setelah domain final diketahui:

1. Firebase Console > Authentication > Settings > Authorized domains: tambahkan hostname yang digunakan, misalnya \`ict.contoh.sch.id\`. Masukkan hostname saja, tanpa \`https://\` atau path. Tambahkan \`www\` secara terpisah apabila memang dipakai.
2. Atur daftar CORS Cloud Functions melalui file lokal yang tidak di-commit, yaitu \`functions/.env.monitoring-ict-smpit\`:

\`\`\`dotenv
ALLOWED_ORIGINS=https://ict.contoh.sch.id
\`\`\`

Untuk dua hostname:
\`\`\`dotenv
ALLOWED_ORIGINS=https://ict.contoh.sch.id,https://www.ict.contoh.sch.id
\`\`\`

3. Setelah region Firestore diperiksa, API dan aturan keamanan selesai diuji, deploy Cloud Functions dari komputer developer dengan Firebase CLI. CORS hanya mengatur browser origin; autentikasi dan pemeriksaan role di backend tetap wajib untuk setiap operasi privat.

Domain produksi belum diketahui, jadi jangan mengisi contoh domain di atas sebagai konfigurasi sungguhan.

### Development lokal

Frontend dapat dijalankan pada \`localhost\` dan menggunakan project Firebase yang sama melalui browser-side config serta Cloud Functions API. Jalankan server lokal dari paket hasil build agar struktur path sama dengan production:

\`\`\`bash
node scripts/build-cpanel.js
cd dist-cpanel
python -m http.server 5500
\`\`\`

Buka:
- \`http://localhost:5500/\`
- \`http://localhost:5500/siswa/\`
- \`http://localhost:5500/ortu/\`
- \`http://localhost:5500/guru/\`

Di Firebase Authentication > Settings > Authorized domains, tambahkan \`localhost\` untuk pengujian lokal apabila belum tercantum. CORS backend sudah mengizinkan origin \`localhost\` dan \`127.0.0.1\` pada port development apa pun. Jangan menggunakan \`file://\` untuk membuka HTML secara langsung.

**Penting:** konfigurasi default tetap menggunakan endpoint Cloud Functions project yang sama. Pengujian tulis/hapus dari localhost karenanya dapat mengubah data cloud yang sama. Gunakan akun serta data uji, atau siapkan Firebase Emulator / project development terpisah sebelum pengujian yang mengubah data.

### Batas status saat ini

Paket cPanel hanya menyiapkan distribusi file frontend. Ini tidak berarti semua portal sudah berpindah ke Firebase. Jangan mengubah \`backend: "legacy"\` pada \`firebase/runtime-config.js\` dan jangan menganggap dashboard orang tua/guru siap untuk Firebase sampai integrasi portal, data import, role authorization, dan regression test dinyatakan lulus.


## Konsekuensi lokasi Firestore \`nam5\`

Pemilik telah mengonfirmasi bahwa Firestore \`(default)\` berada di \`nam5\`, yaitu multi-region Amerika Serikat bagian tengah. Lokasi multi-region ini mereplikasi data pada region baca/tulis \`us-central1\` (Iowa) dan \`us-central2\` (Oklahoma—region Google Cloud privat), dengan witness \`us-east1\` (South Carolina). Lokasi ini tidak dapat diubah setelah database diprovisikan.

Firebase merekomendasikan Cloud Functions \`us-central1\` untuk Firestore \`nam5\`. Karena itu konfigurasi Functions, endpoint browser API, dan pemeriksaan preflight repositori menggunakan \`us-central1\`. Jangan deploy fungsi baru di \`asia-southeast2\` untuk database ini; lokasi berbeda dapat meningkatkan latensi dan biaya.

Catatan arsitektur: pengguna utama berada di Indonesia, sehingga akses ke database multi-region AS berpotensi memiliki latensi lebih tinggi dibanding database regional Asia. Namun jangan mencoba mengubah database default atau membuat named database baru secara spontan. Dukungan akses database bernama pada sebagian API SDK masih diberi status preview; opsi tersebut perlu evaluasi terpisah sebelum digunakan untuk produksi.
