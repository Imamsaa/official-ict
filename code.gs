function output(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// FUNGSI BARU: Mengambil data sheet biasa
function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

// FUNGSI BARU: Mengambil data Master menggunakan Server RAM (Sangat Cepat!)
function getMasterDataWithCache(ss, sheetName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "MASTER_DATA_" + sheetName;
  
  // Coba ambil dari Cache dulu
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Jika tidak ada di cache, baru ambil dari Sheet
  const data = getSheetData(ss, sheetName);
  cache.put(cacheKey, JSON.stringify(data), 300); // Simpan selama 5 menit
  
  return data;
}

function doGet(e) {
  // Tangkap callback paling awal agar selalu bisa merespons
  const callback = e.parameter.callback;
  
  try {
    const action = e.parameter.action;
    const kode = e.parameter.kode;
    const token = e.parameter.token;

    if (action === 'get_public_data') {
      return handlePublicData(e);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("Spreadsheet tidak terdeteksi. Script harus terikat ke file Excel.");

    const cache = CacheService.getScriptCache();
    let currentKode = null;
    let siswaRow = null; 

    // 1. Validasi Token / Kode
    if (token) {
      currentKode = cache.get(token);
      if (!currentKode) return output({ success: false, message: "Sesi berakhir. Silakan login kembali.", expired: true }, callback);
      
      const siswaData = getSheetData(ss, "siswa");
      siswaRow = siswaData.find(r => String(r.kode_siswa).trim().toUpperCase() === String(currentKode).trim().toUpperCase());
      
      if (!siswaRow) return output({ success: false, message: "Data Siswa tidak ditemukan di database." }, callback);
      
    } else if (kode) {
      const password = e.parameter.password || ""; 
      const role = e.parameter.role || ""; 

      const siswaData = getSheetData(ss, "siswa");
      siswaRow = siswaData.find(r => String(r.kode_siswa).trim().toUpperCase() === String(kode).trim().toUpperCase());
      
      if (!siswaRow) return output({ success: false, message: "Kode Siswa (NIS) tidak ditemukan!" }, callback);
      
      // LOGIKA ORTU: Jika BUKAN ortu, wajib cek password
      if (String(role).trim().toLowerCase() !== 'ortu') {
        const dbPassword = siswaRow.password ? String(siswaRow.password).trim() : "123456";
        if (String(password).trim() !== dbPassword) {
           return output({ success: false, message: "Password salah!" }, callback);
        }
      }
      currentKode = String(kode).trim().toUpperCase();
    } else {
      return output({ success: false, message: "Akses ditolak. Parameter tidak lengkap." }, callback);
    }

    // 3. Ambil Data Master DARI CACHE
    let babAll = getMasterDataWithCache(ss, "bab");
    let materiAll = getMasterDataWithCache(ss, "materi"); // ⬅️ Ubah const menjadi let
    
    // FILTER: Hanya kirimkan Bab yang sesuai dengan kelas siswa
    babAll = babAll.filter(b => {
      if (!b.kelas_target || String(b.kelas_target).trim() === '') return true; 
      const targetArr = String(b.kelas_target).toUpperCase().split(',').map(s => s.trim());
      return targetArr.includes(String(siswaRow.kelas).trim().toUpperCase());
    });
    
    // ⬅️ TAMBAHAN BARU: FILTER MATERI LINTAS KELAS
    // Hanya kirimkan materi yang id_bab-nya ada di dalam daftar bab milik siswa
    const babIds = babAll.map(b => String(b.id_bab).trim());
    materiAll = materiAll.filter(m => babIds.includes(String(m.id_bab).trim()));
    
    const tugasMingguanAll = getMasterDataWithCache(ss, "tugas_mingguan");
    const linkKaryaAll     = getMasterDataWithCache(ss, "link_karya");
    const sklSubAll        = getMasterDataWithCache(ss, "skl_sub");
    const jadwalAll        = getMasterDataWithCache(ss, "jadwal");

    // 4. Ambil Data Transaksional DARI SHEET
    const progresSheetData = getSheetData(ss, "progres_materi");
    const progMinggData    = getSheetData(ss, "progres_tugas_mingguan");
    const karyaData        = getSheetData(ss, "karya");
    const sklData          = getSheetData(ss, "skl");

    // 5. Mapping Data
    const progres = progresSheetData
      .filter(x => String(x.kode_siswa).trim() === currentKode)
      .map(p => {
        const mat = materiAll.find(m => m.id_materi === p.id_materi) || {};
        return { 
          ...p, 
          nama_materi: mat.nama_materi || p.id_materi, 
          id_bab: mat.id_bab || '', 
          deskripsi: mat.deskripsi || '', 
          video: mat.video || '',        
          slide: mat.slide || '',        
          file: mat.file || '',          
          link_form: mat.link_form || '' 
        };
      });

    const tugasMingguan = tugasMingguanAll.map(tg => {
      const p = progMinggData.find(x => 
        String(x.id_tugas).trim() === String(tg.id_tugas).trim() && 
        String(x.kode_siswa).trim() === currentKode
      ) || {};
      
      return { 
        ...tg, 
        status: p.status || 'Belum',
        poin: p.poin || 0,
        link_hasil: p.link_hasil || '',
        buka_kelas_master: tg.buka_kelas || 'Ya', 
        judul: tg.judul || tg.id_tugas,
        minggu: tg.minggu || '',
        kategori: tg.kategori || '',
        poin_maksimal: tg.poin_maksimal || 0,
        deskripsi: tg.deskripsi || '',        
        link_youtube: tg.link_youtube || '',
        link_form: tg.link_form || ''
      };
    });

    const karya = karyaData
      .filter(x => {
         const anggotaArr = String(x.kode_siswa).split(',').map(s => s.trim().toUpperCase());
         return anggotaArr.includes(currentKode);
      })
      .map(k => ({ ...k, links: linkKaryaAll.filter(l => String(l.id_karya).trim() === String(k.id_karya).trim()) }));

    const skl = sklData
      .filter(x => String(x.kode_siswa).trim() === currentKode)
      .map(item => ({ ...item, sub_materi: sklSubAll.filter(s => s.id_skl === item.id_skl) }));

    const jadwalSiswa = jadwalAll.filter(j => 
      String(j.kelas).trim().toUpperCase() === String(siswaRow.kelas).trim().toUpperCase()
    );

    let responseToken = token;
    if (kode && !token) {
      responseToken = Utilities.getUuid();
      cache.put(responseToken, currentKode, 21600);
    }

    return output({
      success: true,
      token: responseToken,
      siswa: {
        kode : siswaRow.kode_siswa,
        nama : siswaRow.nama_siswa,
        kelas: siswaRow.kelas,
        foto : siswaRow.foto,
        ortu : siswaRow.nama_ortu,
        hp   : siswaRow.no_hp,
      },
      bab    : babAll,
      materi : materiAll,
      progres,
      tugasMingguan,
      karya,
      skl,
      jadwal : jadwalSiswa,
    }, callback);

  } catch (error) {
    // INI KUNCI UTAMANYA: Mengirim pesan error Google langsung ke layar portal Anda!
    return output({ success: false, message: "System Error: " + error.message }, callback);
  }
}

// =========================================================================
// API DASHBOARD GURU (POST) - ROUTING & CRUD
// =========================================================================

// =========================================================================
// API DASHBOARD GURU (POST) - ROUTING & CRUD FINAL
// =========================================================================

function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("Tidak ada data");
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    // 1. AUTH & FETCH
    if (action === 'guru_login') return output.setContent(JSON.stringify(handleGuruLogin(body)));
    if (action === 'guru_get_all') return output.setContent(JSON.stringify(handleGuruGetAll()));

    // 2. ROUTING CRUD
    let res = { success: false, message: "Action tidak dikenali: " + action };

    switch (action) {
      case 'upsert_siswa': res = dbUpsert('siswa', ['kode_siswa'], body.data); break;
      case 'delete_siswa': res = dbDelete('siswa', 'kode_siswa', body.kode_siswa); break;
      case 'upsert_progres_materi': res = dbUpsert('progres_materi', ['kode_siswa', 'id_materi'], body.data); break;
      
      case 'upsert_bab': res = dbUpsert('bab', ['id_bab'], body.data); break;
      case 'delete_bab': res = dbDelete('bab', 'id_bab', body.id_bab); break;
      case 'upsert_materi': res = dbUpsert('materi', ['id_materi'], body.data); break;
      case 'delete_materi': res = dbDelete('materi', 'id_materi', body.id_materi); break;
      
      case 'upsert_tugas': res = dbUpsert('tugas_mingguan', ['id_tugas'], body.data); break;
      case 'delete_tugas': res = dbDelete('tugas_mingguan', 'id_tugas', body.id_tugas); break;
      case 'upsert_progres_tugas': res = dbUpsert('progres_tugas_mingguan', ['kode_siswa', 'id_tugas'], body.data); break;
      case 'upsert_pengaturan': res = dbUpsert('pengaturan', ['key'], body.data); break;
      case 'upsert_karya': 
        if (!body.data.id_karya) body.data.id_karya = 'KRY-' + Utilities.getUuid().split('-')[0];
        res = dbUpsert('karya', ['id_karya'], body.data); 
        break;
      case 'delete_karya': res = dbDelete('karya', 'id_karya', body.id_karya); break;
      
      case 'upsert_jadwal': res = dbUpsert('jadwal', ['kelas', 'hari', 'waktu'], body.data); break;
      case 'delete_jadwal': res = dbDelete('jadwal', 'waktu', body.waktu); break;

      case 'ubah_password_siswa': res = handleUbahPasswordSiswa(body); break;

      case 'reset_password_siswa': res = handleResetPasswordSiswa(body); break;

      case 'upsert_kurikulum': res = dbUpsert('kurikulum', ['judul'], body.data); break;
      case 'delete_kurikulum': res = dbDelete('kurikulum', 'judul', body.judul); break;

      case 'upsert_prestasi': res = dbUpsert('prestasi', ['judul'], body.data); break;
      case 'delete_prestasi': res = dbDelete('prestasi', 'judul', body.judul); break;

      case 'upsert_tim': res = dbUpsert('tim', ['nama'], body.data); break;
      case 'delete_tim': res = dbDelete('tim', 'nama', body.nama); break;

      // ---> INI ADALAH ROUTE UNTUK PENUGASAN YANG SERING TERLEWAT <---
      case 'assign_materi_kelas': res = handleAssignMateriKelas(body); break;
      case 'assign_tugas_kelas': res = handleAssignTugasKelas(body); break;

      case 'unassign_materi_kelas': res = handleUnassignMateriKelas(body); break;
      case 'assign_skl_kelas': res = handleAssignSKLKelas(body); break;
      // ═════ RUTE UNTUK SKL & SUB-SKL ═════
      case 'upsert_skl': 
        if (!body.data.id_skl) body.data.id_skl = 'SKL-' + new Date().getTime();
        res = dbUpsert('skl', ['id_skl'], body.data); 
        break;
      case 'delete_skl': res = dbDelete('skl', 'id_skl', body.id_skl); break;
      
      case 'upsert_skl_sub': 
        if (!body.data.id_sub) body.data.id_sub = 'SUB-' + new Date().getTime();
        res = dbUpsert('skl_sub', ['id_sub'], body.data); 
        break;
      case 'delete_skl_sub': res = dbDelete('skl_sub', 'id_sub', body.id_sub); break;
    }

    return output.setContent(JSON.stringify(res));
  } catch (error) {
    return output.setContent(JSON.stringify({ success: false, message: "Server Error: " + error.message }));
  }
}

// =========================================================================
// HELPER DATABASE: UNIVERSAL UPSERT & DELETE
// =========================================================================

/**
 * Universal Upsert (Update or Insert)
 * @param {string} sheetName - Nama tab di spreadsheet
 * @param {array} keyCols - Array nama kolom yang dijadikan acuan pencarian (Primary Key)
 * @param {object} dataObj - Data JSON dari frontend
 */
function dbUpsert(sheetName, keyCols, dataObj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { success: false, message: `Sheet '${sheetName}' tidak ditemukan` };

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const headers = values[0];
  
  let rowIndex = -1;

  // Cari apakah data sudah ada berdasarkan keyCols (misal: kode_siswa)
  if (values.length > 1) {
    for (let i = 1; i < values.length; i++) {
      let isMatch = true;
      for (let key of keyCols) {
        let colIdx = headers.indexOf(key);
        if (colIdx === -1 || String(values[i][colIdx]).trim() !== String(dataObj[key]).trim()) {
          isMatch = false; break;
        }
      }
      if (isMatch) { rowIndex = i + 1; break; } // +1 karena format baris Spreadsheet dimulai dari 1
    }
  }

  if (rowIndex > -1) {
    // JIKA DATA DITEMUKAN -> UPDATE BARIS TERSEBUT
    const existingRow = values[rowIndex - 1];
    const updatedRow = headers.map((h, i) => dataObj[h] !== undefined ? dataObj[h] : existingRow[i]);
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([updatedRow]);
  } else {
    // JIKA DATA TIDAK DITEMUKAN -> TAMBAH BARIS BARU (INSERT)
    const newRow = headers.map(h => dataObj[h] !== undefined ? dataObj[h] : "");
    sheet.appendRow(newRow);
  }

  // Hapus cache master data agar perubahannya langsung terbaca oleh frontend
  CacheService.getScriptCache().remove("MASTER_DATA_" + sheetName);
  
  return { success: true };
}

/**
 * Universal Delete
 * @param {string} sheetName - Nama tab di spreadsheet
 * @param {string} keyCol - Nama kolom acuan
 * @param {string} matchValue - Nilai yang mau dihapus
 */
function dbDelete(sheetName, keyCol, matchValue) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { success: false, message: `Sheet '${sheetName}' tidak ditemukan` };

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const colIdx = headers.indexOf(keyCol);
  
  if (colIdx === -1) return { success: false, message: "Kolom kunci tidak ditemukan" };

  // Cari baris dari bawah ke atas agar penghapusan baris tidak menggeser index yang sedang diloop
  let deleted = false;
  for (let i = values.length - 1; i > 0; i--) {
    if (String(values[i][colIdx]).trim() === String(matchValue).trim()) {
      sheet.deleteRow(i + 1);
      deleted = true;
      break; // Hapus break ini jika ingin menghapus semua duplikat
    }
  }

  CacheService.getScriptCache().remove("MASTER_DATA_" + sheetName);
  return deleted ? { success: true } : { success: false, message: "Data tidak ditemukan untuk dihapus" };
}

// -------------------------------------------------------------------------
// FUNGSI: Validasi Login dari Sheet 'guru'
// -------------------------------------------------------------------------
function handleGuruLogin(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Menggunakan fungsi getSheetData milik Anda yang sudah ada
  const guruData = getSheetData(ss, "guru"); 
  
  // Cari guru berdasarkan id_guru dan password
  const user = guruData.find(g => 
    String(g.id_guru).trim() === String(body.id_guru).trim() && 
    String(g.password) === String(body.password)
  );

  if (user) {
    return {
      success: true,
      token: Utilities.getUuid(), // Generate token sesi
      id_guru: user.id_guru,
      nama: user.nama_guru,
      kelas: user.kelas || "Semua Kelas"
    };
  }
  
  return { success: false, message: "ID Guru atau Password salah!" };
}

// -------------------------------------------------------------------------
// FUNGSI: Ambil Semua Data Master & Transaksional
// -------------------------------------------------------------------------
function handleGuruGetAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  return {
    success: true,
    siswa: getSheetData(ss, "siswa"),
    bab: getSheetData(ss, "bab"),
    materi: getSheetData(ss, "materi"),
    progres_materi: getSheetData(ss, "progres_materi"),
    tugas: getSheetData(ss, "tugas_mingguan"),
    progres_tugas: getSheetData(ss, "progres_tugas_mingguan"),
    karya: getSheetData(ss, "karya"),
    skl: getSheetData(ss, "skl"),
    skl_sub: getSheetData(ss, 'skl_sub'),
    jadwal: getSheetData(ss, "jadwal"),
    pengaturan: getSheetData(ss, "pengaturan"),
    kurikulum: getSheetData(ss, "kurikulum"),
    prestasi: getSheetData(ss, "prestasi"),
    tim: getSheetData(ss, "tim")
  };
}

// -------------------------------------------------------------------------
// CONTROLLER: PENUGASAN MATERI MASSAL OTOMATIS SESUAI TARGET BAB
// -------------------------------------------------------------------------
// -------------------------------------------------------------------------
// CONTROLLER: PENUGASAN MATERI (Bisa Tambah Baru & Bisa Update Deadline)
// -------------------------------------------------------------------------
function handleAssignMateriKelas(body) {
  const { id_materi, deadline } = body;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const materiData = getSheetData(ss, 'materi');
  const babData = getSheetData(ss, 'bab');
  const siswaData = getSheetData(ss, 'siswa');
  const progresSheet = ss.getSheetByName('progres_materi');
  
  if (!progresSheet) throw new Error("Sheet 'progres_materi' tidak ditemukan");
  
  const materi = materiData.find(m => String(m.id_materi).trim() === String(id_materi).trim());
  if (!materi) return { success: false, message: "Data materi tidak ditemukan di database." };

  const bab = babData.find(b => String(b.id_bab).trim() === String(materi.id_bab).trim());
  
  let targetSiswa = siswaData;
  if (bab && bab.kelas_target && String(bab.kelas_target).trim() !== '') {
    const targetArr = String(bab.kelas_target).toUpperCase().split(',').map(s => s.trim());
    targetSiswa = siswaData.filter(s => targetArr.includes(String(s.kelas).trim().toUpperCase()));
  }

  if (targetSiswa.length === 0) return { success: false, message: "Tidak ada siswa di kelas target." };

  // Baca baris data asli dari sheet progres_materi untuk melacak indeks baris
  const pRange = progresSheet.getDataRange();
  const pValues = pRange.getValues();
  const pHeaders = pRange.getValues()[0].map(h => String(h).trim().toLowerCase());
  
  const ksIdx = pHeaders.indexOf('kode_siswa');
  const imIdx = pHeaders.indexOf('id_materi');
  const dlIdx = pHeaders.indexOf('deadline');

  const rowsToInsert = [];
  let updateCount = 0;
  let insertCount = 0;

  targetSiswa.forEach(s => {
    // Cari apakah siswa sudah ada di baris progres_materi ke berapa
    let existingRowIdx = -1;
    for (let i = 1; i < pValues.length; i++) {
      if (String(pValues[i][ksIdx]).trim().toUpperCase() === String(s.kode_siswa).trim().toUpperCase() && 
          String(pValues[i][imIdx]).trim().toUpperCase() === String(id_materi).trim().toUpperCase()) {
        existingRowIdx = i;
        break;
      }
    }

    if (existingRowIdx > -1) {
      // KONDISI 1: JIKA SUDAH ADA -> UPDATE DEADLINE-NYA
      // Baris asli di spreadsheet adalah (indeks array + 1)
      progresSheet.getRange(existingRowIdx + 1, dlIdx + 1).setValue(deadline || '');
      updateCount++;
    } else {
      // KONDISI 2: JIKA BELUM ADA -> SIAPKAN UNTUK DI-INSERT BARU
      const newRow = pHeaders.map(h => {
        if (h === 'kode_siswa') return String(s.kode_siswa);
        if (h === 'id_materi') return String(id_materi);
        if (h === 'status') return 'Belum Dikerjakan';
        if (h === 'deadline') return deadline || '';
        return '';
      });
      rowsToInsert.push(newRow);
      insertCount++;
    }
  });

  // Suntikkan data siswa baru secara masal jika ada
  if (rowsToInsert.length > 0) {
    const colA = progresSheet.getRange("A:A").getValues();
    let realLastRow = 0;
    for (let i = colA.length - 1; i >= 0; i--) {
      if (String(colA[i][0]).trim() !== "") { realLastRow = i + 1; break; }
    }
    if (realLastRow === 0) realLastRow = 1;
    progresSheet.getRange(realLastRow + 1, 1, rowsToInsert.length, pHeaders.length).setValues(rowsToInsert);
  }

  CacheService.getScriptCache().remove("MASTER_DATA_progres_materi");
  const labelKelas = bab && bab.kelas_target ? bab.kelas_target : "Semua Kelas";
  
  return { 
    success: true, 
    message: `Berhasil memproses kelas ${labelKelas}! ${insertCount} siswa baru ditambahkan, dan ${updateCount} deadline siswa diperbarui.` 
  };
}

// -------------------------------------------------------------------------
// CONTROLLER: PENUGASAN TUGAS MINGGUAN (MERATA KE SELURUH SISWA)
// -------------------------------------------------------------------------
function handleAssignTugasKelas(body) {
  const { id_tugas } = body;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const tugasData = getSheetData(ss, 'tugas_mingguan');
  const siswaData = getSheetData(ss, 'siswa');
  const progresSheet = ss.getSheetByName('progres_tugas_mingguan');
  
  if (!progresSheet) throw new Error("Sheet 'progres_tugas_mingguan' tidak ditemukan");
  
  const tugas = tugasData.find(t => String(t.id_tugas).trim() === String(id_tugas).trim());
  if (!tugas) return { success: false, message: "Data tugas tidak ditemukan." };

  // ⬅️ LOGIKA BARU: Langsung ambil semua siswa tanpa filter kelas
  let targetSiswa = siswaData;

  if (targetSiswa.length === 0) return { success: false, message: "Database siswa kosong." };

  const pRange = progresSheet.getDataRange();
  const pValues = pRange.getValues();
  const pHeaders = pRange.getValues()[0].map(h => String(h).trim().toLowerCase());
  
  const ksIdx = pHeaders.indexOf('kode_siswa');
  const itIdx = pHeaders.indexOf('id_tugas');

  const rowsToInsert = [];
  let skipCount = 0;

  targetSiswa.forEach(s => {
    const existing = pValues.some(row => 
      String(row[ksIdx]).trim().toUpperCase() === String(s.kode_siswa).trim().toUpperCase() && 
      String(row[itIdx]).trim().toUpperCase() === String(id_tugas).trim().toUpperCase()
    );

    if (existing) {
      skipCount++; 
    } else {
      const newRow = pHeaders.map(h => {
        if (h === 'kode_siswa') return String(s.kode_siswa);
        if (h === 'id_tugas') return String(id_tugas);
        if (h === 'status') return 'Belum';
        return '';
      });
      rowsToInsert.push(newRow);
    }
  });

  if (rowsToInsert.length > 0) {
    const colA = progresSheet.getRange("A:A").getValues();
    let realLastRow = 0;
    for (let i = colA.length - 1; i >= 0; i--) {
      if (String(colA[i][0]).trim() !== "") { realLastRow = i + 1; break; }
    }
    if (realLastRow === 0) realLastRow = 1;
    progresSheet.getRange(realLastRow + 1, 1, rowsToInsert.length, pHeaders.length).setValues(rowsToInsert);
  }

  CacheService.getScriptCache().remove("MASTER_DATA_progres_tugas_mingguan");
  return { success: true, message: `Sukses didistribusikan ke seluruh ${rowsToInsert.length} siswa ICT. (${skipCount} siswa dilewati karena sudah ada)` };
}

// -------------------------------------------------------------------------
// CONTROLLER: DISTRIBUSI SKL MASAL PER KELAS
// -------------------------------------------------------------------------
function handleAssignSKLKelas(body) {
  const { kelas, mata_kompetensi, deskripsi } = body;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const siswaData = getSheetData(ss, 'siswa');
  const sklData = getSheetData(ss, 'skl');
  const sklSheet = ss.getSheetByName('skl');
  
  if (!sklSheet) throw new Error("Sheet 'skl' tidak ditemukan");
  
  // Ambil siswa yang ada di kelas terpilih
  let targetSiswa = siswaData.filter(s => String(s.kelas).trim().toUpperCase() === String(kelas).trim().toUpperCase());
  if (targetSiswa.length === 0) return { success: false, message: "Tidak ada siswa di kelas ini." };

  const rawHeaders = sklSheet.getDataRange().getValues()[0];
  const pHeaders = rawHeaders.map(h => String(h).trim().toLowerCase());
  
  const rowsToInsert = [];
  let skipCount = 0;
  const timestamp = new Date().getTime(); // Untuk ID Unik

  targetSiswa.forEach((s, idx) => {
    // Cek Anti-Duplikat: Jika siswa sudah punya SKL dengan judul yang sama
    const existing = sklData.find(x => 
      String(x.kode_siswa).trim() === String(s.kode_siswa).trim() && 
      String(x.mata_kompetensi).trim().toUpperCase() === String(mata_kompetensi).trim().toUpperCase()
    );

    if (existing) {
      skipCount++; 
    } else {
      const newRow = pHeaders.map(h => {
        if (h === 'id_skl') return 'SKL-' + timestamp + '-' + (idx + 1);
        if (h === 'kode_siswa') return String(s.kode_siswa);
        if (h === 'mata_kompetensi') return mata_kompetensi;
        if (h === 'deskripsi') return deskripsi || '';
        if (h === 'status') return 'Belum Terpenuhi';
        if (h === 'catatan_guru') return '';
        return '';
      });
      rowsToInsert.push(newRow);
    }
  });

  if (rowsToInsert.length > 0) {
    const colA = sklSheet.getRange("A:A").getValues();
    let realLastRow = 0;
    for (let i = colA.length - 1; i >= 0; i--) {
      if (String(colA[i][0]).trim() !== "") { realLastRow = i + 1; break; }
    }
    if (realLastRow === 0) realLastRow = 1;
    sklSheet.getRange(realLastRow + 1, 1, rowsToInsert.length, rawHeaders.length).setValues(rowsToInsert);
  }

  CacheService.getScriptCache().remove("MASTER_DATA_skl");
  
  if (rowsToInsert.length === 0) {
    return { success: true, message: `Peringatan: SKL ini sudah ada di seluruh siswa kelas ${kelas} (${skipCount} dilewati).` };
  }
  return { success: true, message: `Sukses! Format SKL didistribusikan ke ${rowsToInsert.length} siswa di kelas ${kelas}.` };
}

// ============================================================================
// FUNGSI KHUSUS WEBSITE PROMOSI (PUBLIC SPA)
// ============================================================================
function handlePublicData(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callback = e.parameter.callback;

  try {
    const karyaData = getMasterDataWithCache(ss, 'karya');
    const siswaData = getMasterDataWithCache(ss, 'siswa');
    
    let prestasiData = [];
    try { prestasiData = getMasterDataWithCache(ss, 'prestasi'); } catch(err) {}
    
    let timData = [];
    try { timData = getMasterDataWithCache(ss, 'tim'); } catch(err) {}

    let kurikulumData = []; // ⬅️ TAMBAHAN: Tarik data kurikulum
    try { kurikulumData = getMasterDataWithCache(ss, 'kurikulum'); } catch(err) {}

    let pengaturanData = [];
    try { pengaturanData = getMasterDataWithCache(ss, 'pengaturan'); } catch(err) {}

    let linkKaryaData = [];
    try { linkKaryaData = getMasterDataWithCache(ss, 'link_karya'); } catch(err) {}
    
    const publicKarya = karyaData
      .filter(k => String(k.is_public).toLowerCase().trim() === 'ya')
      .map(k => {
         const siswa = siswaData.find(s => String(s.kode_siswa).trim() === String(k.kode_siswa).trim()) || {};
         // Cari semua link yang id_karya-nya cocok
         const links = linkKaryaData.filter(l => String(l.id_karya).trim() === String(k.id_karya).trim());
         return {
           ...k,
           nama_siswa: siswa.nama_siswa || k.kode_siswa,
           links: links // ⬅️ Menyisipkan link ke dalam response API
         };
      });

    const publicPrestasi = prestasiData.filter(p => String(p.is_public).toLowerCase().trim() === 'ya');
    const publicTim = timData.filter(t => String(t.is_public).toLowerCase().trim() === 'ya');
    
    // ⬅️ TAMBAHAN: Filter Kurikulum
    const publicKurikulum = kurikulumData.filter(c => String(c.is_public).toLowerCase().trim() === 'ya');

    // Hitung jumlah data
    const totalSiswa = siswaData.length;
    const totalKarya = publicKarya.length;
    const totalPrestasi = publicPrestasi.length;

    let tugasData = [];
    try { 
      const allTugas = getMasterDataWithCache(ss, 'tugas_mingguan');
      // HANYA kirimkan ke web publik jika is_public bernilai "Ya" atau "ya"
      tugasData = allTugas.filter(t => String(t.is_public).toLowerCase().trim() === 'ya');
    } catch(err) {}

    let rankData = [];
    try { rankData = getMasterDataWithCache(ss, 'rank_challenge'); } catch(err) {}

    let progresTugasAll = [];
    try { progresTugasAll = getMasterDataWithCache(ss, 'progres_tugas_mingguan'); } catch(err) {}

    let babData = [];
    try { babData = getMasterDataWithCache(ss, 'bab'); } catch(err) {}

    let materiData = [];
    try { materiData = getMasterDataWithCache(ss, 'materi'); } catch(err) {}

    // 2. KALKULASI TOTAL POIN (XP) SISWA ICT
    let ictRank = [];
    // (Catatan: variabel siswaData sudah ada di bagian paling atas fungsi ini)
    if (siswaData && siswaData.length > 0) {
      siswaData.forEach(s => {
        // Jumlahkan semua poin dari tugas yang pernah dikerjakan siswa ini
        const totalPoin = progresTugasAll
          .filter(p => String(p.kode_siswa).trim() === String(s.kode_siswa).trim())
          .reduce((sum, p) => sum + (parseInt(p.poin) || 0), 0);
          
        if (totalPoin > 0) {
          ictRank.push({
            nama: s.nama_siswa,
            kelas: s.kelas,
            poin: totalPoin,
            is_ict: true // ⬅️ Penanda rahasia bahwa ini adalah anak ICT
          });
        }
      });
    }

    // 3. GABUNGKAN RANKING UMUM & ICT
    const combinedRank = [...rankData, ...ictRank];

    const result = {
      success: true,
      karya: publicKarya,
      prestasi: publicPrestasi,
      tim: publicTim,
      kurikulum: publicKurikulum,
      pengaturan: pengaturanData,
      tugas: tugasData,
      rank_challenge: combinedRank,
      bab: babData,       
      materi: materiData,
      stats: { // ⬅️ Ini wajib ada agar website menerima angkanya
        siswa: totalSiswa,
        karya: totalKarya,
        prestasi: totalPrestasi
      }
    };

    return output(result, callback);

  } catch (error) {
    return output({ success: false, message: "Gagal mengambil data publik: " + error.message }, callback);
  }
}

// -------------------------------------------------------------------------
// CONTROLLER: UBAH PASSWORD SISWA
// -------------------------------------------------------------------------
function handleUbahPasswordSiswa(body) {
  const { kode_siswa, old_pass, new_pass } = body.data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('siswa');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const kodeIdx = headers.indexOf('kode_siswa');
  const passIdx = headers.indexOf('password');
  
  if (passIdx === -1) return {success: false, message: "Sistem error: Kolom 'password' belum dibuat di sheet siswa."};
  
  for (let i = 1; i < data.length; i++) {
     if (String(data[i][kodeIdx]).trim().toUpperCase() === String(kode_siswa).trim().toUpperCase()) {
        const currentPass = data[i][passIdx] ? String(data[i][passIdx]).trim() : "123456";
        
        if (currentPass !== String(old_pass).trim()) {
           return {success: false, message: "Password Lama salah!"};
        }
        
        sheet.getRange(i + 1, passIdx + 1).setValue(new_pass);
        CacheService.getScriptCache().remove("MASTER_DATA_siswa");
        return {success: true, message: "Password berhasil diubah!"};
     }
  }
  return {success: false, message: "Data siswa tidak ditemukan."};
}

// -------------------------------------------------------------------------
// CONTROLLER: RESET PASSWORD SISWA DARI DASHBOARD GURU
// -------------------------------------------------------------------------
function handleResetPasswordSiswa(body) {
  const { kode_siswa } = body;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('siswa');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const kodeIdx = headers.indexOf('kode_siswa');
  const passIdx = headers.indexOf('password');
  
  if (passIdx === -1) return {success: false, message: "Sistem error: Kolom 'password' belum dibuat di sheet siswa."};
  
  for (let i = 1; i < data.length; i++) {
     if (String(data[i][kodeIdx]).trim().toUpperCase() === String(kode_siswa).trim().toUpperCase()) {
        // Timpa password yang ada dengan password default
        sheet.getRange(i + 1, passIdx + 1).setValue("123456");
        CacheService.getScriptCache().remove("MASTER_DATA_siswa");
        return {success: true, message: "Password berhasil direset!"};
     }
  }
  return {success: false, message: "Data siswa tidak ditemukan."};
}

function handleUnassignMateriKelas(body) {
  const { id_materi } = body;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const progresSheet = ss.getSheetByName('progres_materi');
  
  if (!progresSheet) return { success: false, message: "Sheet progres_materi tidak ditemukan" };
  
  const values = progresSheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim().toLowerCase());
  const imIdx = headers.indexOf('id_materi');
  
  let deletedCount = 0;
  
  // Hapus dari bawah ke atas agar indeks baris tidak bergeser saat loop berjalan
  for (let i = values.length - 1; i > 0; i--) {
    if (String(values[i][imIdx]).trim().toUpperCase() === String(id_materi).trim().toUpperCase()) {
      progresSheet.deleteRow(i + 1);
      deletedCount++;
    }
  }
  
  CacheService.getScriptCache().remove("MASTER_DATA_progres_materi");
  return { success: true, message: `Berhasil membatalkan penugasan. Tugas ditarik dari ${deletedCount} siswa.` };
}