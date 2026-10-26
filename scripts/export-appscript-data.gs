/**
 * Jalankan secara manual dari Apps Script yang masih terikat ke spreadsheet ICT.
 * Fungsi ini membuat file JSON sementara di Google Drive untuk migrasi.
 *
 * PERINGATAN: ekspor dapat berisi data pribadi dan password lama siswa/guru.
 * Jangan kirim file ekspor ke GitHub. Batasi akses Drive dan hapus setelah migrasi.
 */
function exportIctSheetsToDriveJson() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Spreadsheet aktif tidak ditemukan.");

  const sheetNames = [
    "siswa", "guru", "bab", "materi", "progres_materi",
    "tugas_mingguan", "progres_tugas_mingguan", "karya", "link_karya",
    "skl", "skl_sub", "jadwal", "pengaturan", "kurikulum",
    "prestasi", "tim", "rank_challenge"
  ];
  const sheets = {};
  const exported = [];

  sheetNames.forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheets[name] = [];
      return;
    }
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) {
      sheets[name] = [];
      exported.push(name);
      return;
    }
    const headers = values[0].map(function(header) {
      return String(header == null ? "" : header).trim();
    });
    sheets[name] = values.slice(1).filter(function(row) {
      return row.some(function(value) { return value !== "" && value != null; });
    }).map(function(row) {
      const record = {};
      headers.forEach(function(header, index) {
        if (!header) return;
        const value = row[index];
        record[header] = value instanceof Date ? value.toISOString() : value;
      });
      return record;
    });
    exported.push(name);
  });

  const payload = {
    format: "official-ict-appscript-export-v1",
    exportedAt: new Date().toISOString(),
    spreadsheetId: spreadsheet.getId(),
    sheets: sheets
  };
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const filename = "official-ict-migration-export-" + timestamp + ".json";
  const file = DriveApp.createFile(filename, JSON.stringify(payload), MimeType.PLAIN_TEXT);

  Logger.log("Ekspor dibuat secara privat di Drive: " + file.getUrl());
  Logger.log("Sheet diproses: " + exported.join(", "));
  Logger.log("Pindahkan file secara aman ke komputer admin. Jangan commit file ekspor ke GitHub.");
  return file.getUrl();
}
