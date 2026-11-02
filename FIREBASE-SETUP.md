# Persiapan Firebase — Official ICT

Project: `monitoring-ict-smpit`  
Backend target: Firebase Authentication + Cloud Firestore + Cloud Functions  
Function region: `asia-southeast2` (Jakarta)  
Functions runtime: Node.js 22

## Status yang dilaporkan pemilik

- Billing Blaze aktif.
- Akun memiliki hak Owner.
- Keberadaan database Firestore belum diketahui.
- Firebase Web API Key dan konfigurasi Web App telah tersedia pada `firebase/client.js`.
- Status Email/Password Authentication belum diverifikasi.

## 1. Periksa Firestore sebelum membuat database

Buka https://console.firebase.google.com/project/monitoring-ict-smpit/firestore lalu pilih Databases & Storage > Firestore > Data.

- Jika database `(default)` sudah ada: catat Database ID dan lokasi. Jangan membuat database baru. Periksa apakah ada data yang sudah dipakai aplikasi/prototype.
- Jika belum ada: buat Cloud Firestore Standard Edition, Database ID `(default)`, Production mode, lokasi `asia-southeast2` (Jakarta) jika tersedia.
- Database location tidak dapat diganti setelah dibuat. Jika console menawarkan lokasi yang berbeda karena default Google Cloud resource sudah dikunci, berhenti dan catat lokasi aktual sebelum deployment.

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
2. Database location (misalnya \`asia-southeast2\`, atau lokasi aktual yang ditampilkan).
3. Database edition/type dan apakah collections sudah digunakan aplikasi lain.
4. Apakah Authentication Email/Password aktif.
5. API yang belum aktif dari hasil preflight.

Jangan deploy \`firestore.rules\` ke project produksi sampai dashboard guru lama yang membaca Firestore langsung telah dimigrasikan ke Cloud Functions API.
