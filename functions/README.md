# Official ICT Firebase API

Cloud Functions menggunakan Firebase Admin SDK dan Firestore. Endpoint awal berada pada fungsi api di region asia-southeast2.

## Endpoint

- GET ?action=health — pemeriksaan kesehatan tanpa informasi sensitif.
- GET ?action=get_public_data — data website publik yang sudah difilter.
- POST body berisi action parent_login, kode_siswa, dan pin — validasi PIN undangan orang tua dan mengembalikan Firebase custom token.
- POST body berisi action student_get_data — memerlukan Firebase ID token dengan role student, parent, atau admin.
- POST body berisi action teacher_get_all — memerlukan Firebase ID token dengan role teacher atau admin.
- Operasi CRUD dan distribusi tugas memerlukan Firebase ID token role teacher atau admin.

Kirim token pada header Authorization: Bearer FIREBASE_ID_TOKEN. Jangan menaruh token atau password di query string. Endpoint baru tidak menyediakan JSONP untuk operasi terproteksi.

## Data Firestore

Data impor awal disimpan di legacyData/{sheet}/rows/{documentId}. Setiap dokumen memiliki field record dan updatedAt. Password dihapus sebelum disimpan. Firestore Security Rules menolak akses langsung klien; akses dilakukan lewat API yang memvalidasi role.

Untuk data publik, set is_public menjadi Ya secara eksplisit di sheet sumber sebelum ekspor. Leaderboard juga hanya dipublikasikan jika record-nya memiliki is_public: Ya.

## Deploy dan pengujian

Gunakan Node.js 22. Instal dependensi dari folder functions, lalu jalankan npm run lint. Untuk emulator gunakan Firebase CLI dan pastikan data uji tidak berisi data siswa nyata.

Sebelum deployment:
1. Pastikan .firebaserc menunjuk ke project yang benar.
2. Aktifkan Firebase Authentication dan Cloud Firestore.
3. Pastikan project dapat menggunakan Cloud Functions dan billing yang diwajibkan Firebase.
4. Uji fungsi di emulator atau project staging terlebih dahulu.
5. Jangan deploy aturan Firestore ke produksi sebelum portal guru lama yang membaca Firestore langsung juga dimigrasikan.

## Keterbatasan saat ini

Endpoint backend dan alat impor disiapkan, tetapi frontend yang ada masih memanggil Google Apps Script atau prototype Firestore. Semua portal harus diubah ke Firebase Authentication dan API baru sebelum Apps Script dapat dihentikan. Data produksi juga belum dipindahkan oleh commit ini.
