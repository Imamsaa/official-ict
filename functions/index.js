"use strict";

const crypto = require("node:crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();

const db = getFirestore();
const auth = getAuth();
const REGION = "asia-southeast2";
const SHEETS = [
  "siswa", "guru", "bab", "materi", "progres_materi",
  "tugas_mingguan", "progres_tugas_mingguan", "karya", "link_karya",
  "skl", "skl_sub", "jadwal", "pengaturan", "kurikulum",
  "prestasi", "tim", "rank_challenge"
];

const KEY_FIELDS = {
  siswa: ["kode_siswa"], guru: ["id_guru"], bab: ["id_bab"], materi: ["id_materi"],
  progres_materi: ["kode_siswa", "id_materi"], tugas_mingguan: ["id_tugas"],
  progres_tugas_mingguan: ["kode_siswa", "id_tugas"], karya: ["id_karya"],
  link_karya: ["id_link"], skl: ["id_skl"], skl_sub: ["id_sub"],
  jadwal: ["kelas", "hari", "waktu"], pengaturan: ["key"], kurikulum: ["judul"],
  prestasi: ["judul"], tim: ["nama"], rank_challenge: ["id_rank"]
};

const UPSERT_ACTIONS = {
  upsert_siswa: ["siswa", ["kode_siswa"]],
  upsert_progres_materi: ["progres_materi", ["kode_siswa", "id_materi"]],
  upsert_bab: ["bab", ["id_bab"]],
  upsert_materi: ["materi", ["id_materi"]],
  upsert_tugas: ["tugas_mingguan", ["id_tugas"]],
  upsert_progres_tugas: ["progres_tugas_mingguan", ["kode_siswa", "id_tugas"]],
  upsert_pengaturan: ["pengaturan", ["key"]],
  upsert_karya: ["karya", ["id_karya"]],
  upsert_jadwal: ["jadwal", ["kelas", "hari", "waktu"]],
  upsert_kurikulum: ["kurikulum", ["judul"]],
  upsert_prestasi: ["prestasi", ["judul"]],
  upsert_tim: ["tim", ["nama"]],
  upsert_skl: ["skl", ["id_skl"]],
  upsert_skl_sub: ["skl_sub", ["id_sub"]]
};

const DELETE_ACTIONS = {
  delete_siswa: ["siswa", "kode_siswa"],
  delete_bab: ["bab", "id_bab"],
  delete_materi: ["materi", "id_materi"],
  delete_tugas: ["tugas_mingguan", "id_tugas"],
  delete_karya: ["karya", "id_karya"],
  delete_jadwal: ["jadwal", "waktu"],
  delete_kurikulum: ["kurikulum", "judul"],
  delete_prestasi: ["prestasi", "judul"],
  delete_tim: ["tim", "nama"],
  delete_skl: ["skl", "id_skl"],
  delete_skl_sub: ["skl_sub", "id_sub"]
};

function normalize(value) {
  return String(value == null ? "" : value).trim();
}
function normalizeCode(value) {
  return normalize(value).toUpperCase();
}
function yes(value) {
  const s = normalize(value).toLowerCase();
  return s === "ya" || s === "yes" || s === "true" || s === "1";
}
function stripSensitive(record) {
  const copy = { ...record };
  delete copy.password;
  delete copy.password_hash;
  delete copy.pin;
  delete copy.pinHash;
  delete copy.salt;
  return copy;
}
function safeDocId(sheet, row, index) {
  const fields = KEY_FIELDS[sheet] || [];
  const keyValues = fields.map((key) => normalize(row[key]));
  const useKeys = fields.length > 0 && keyValues.every(Boolean);
  const seed = useKeys ? JSON.stringify([sheet, keyValues]) : JSON.stringify([sheet, index, row]);
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 40);
}
function sheetRowsRef(sheet) {
  if (!SHEETS.includes(sheet)) throw new Error("Sheet tidak dikenal: " + sheet);
  return db.collection("legacyData").doc(sheet).collection("rows");
}
async function readSheet(sheet) {
  if (!SHEETS.includes(sheet)) return [];
  const snap = await sheetRowsRef(sheet).get();
  return snap.docs.map((doc) => stripSensitive((doc.data() || {}).record || {}));
}
async function writeRow(sheet, keyFields, record) {
  if (!SHEETS.includes(sheet)) throw new Error("Koleksi tidak dikenal.");
  for (const key of keyFields) {
    if (!normalize(record[key])) throw new Error("Kolom kunci wajib diisi: " + key);
  }
  const cleaned = stripSensitive(record);
  const docId = safeDocId(sheet, record, 0);
  const ref = sheetRowsRef(sheet).doc(docId);
  const existing = await ref.get();
  const previousRecord = existing.exists && existing.data().record ? existing.data().record : {};
  await ref.set({
    record: { ...previousRecord, ...cleaned },
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { success: true };
}
async function deleteMatching(sheet, predicate) {
  const snap = await sheetRowsRef(sheet).get();
  const match = snap.docs.find((doc) => predicate(stripSensitive((doc.data() || {}).record || {})));
  if (!match) return { success: false, message: "Data tidak ditemukan untuk dihapus." };
  await match.ref.delete();
  return { success: true };
}
function safeAlias(role, id) {
  const slug = normalizeCode(id).toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  return role + "-" + slug + "@accounts.ict.alfirdaus.sch.id";
}
async function requireIdentity(req) {
  const header = normalize(req.get("authorization"));
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error("Token Firebase Authentication wajib disertakan.");
    err.status = 401;
    throw err;
  }
  try {
    return await auth.verifyIdToken(match[1]);
  } catch (_) {
    const err = new Error("Sesi tidak valid atau sudah berakhir. Silakan login kembali.");
    err.status = 401;
    throw err;
  }
}
function requireRole(identity, roles) {
  if (!roles.includes(identity.role)) {
    const err = new Error("Akses ditolak untuk peran akun ini.");
    err.status = 403;
    throw err;
  }
}
function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.rawBody.toString("utf8")); }
  catch (_) {
    const err = new Error("Body JSON tidak valid.");
    err.status = 400;
    throw err;
  }
}
function scrubStudent(student) {
  return {
    kode: student.kode_siswa || "",
    nama: student.nama_siswa || "",
    kelas: student.kelas || "",
    foto: student.foto || "",
    ortu: student.nama_ortu || "",
    hp: student.no_hp || ""
  };
}
function isClassTarget(chapter, kelas) {
  const target = normalize(chapter.kelas_target);
  if (!target) return true;
  return target.split(",").map((v) => normalizeCode(v)).includes(normalizeCode(kelas));
}

async function publicData() {
  const names = [
    "karya", "siswa", "prestasi", "tim", "kurikulum", "pengaturan",
    "link_karya", "tugas_mingguan", "rank_challenge", "bab", "materi"
  ];
  const data = {};
  await Promise.all(names.map(async (name) => { data[name] = await readSheet(name); }));
  const studentsByCode = new Map(data.siswa.map((s) => [normalizeCode(s.kode_siswa), s]));
  const publicWorks = data.karya.filter((k) => yes(k.is_public)).map((k) => {
    const members = normalize(k.kode_siswa).split(",").map(normalizeCode).filter(Boolean);
    const namesForWork = members.map((code) => studentsByCode.get(code)).filter(Boolean).map((s) => s.nama_siswa).filter(Boolean);
    return {
      id_karya: k.id_karya || "",
      kategori: k.kategori || "",
      gambar: k.gambar || "",
      judul: k.judul || "",
      deskripsi: k.deskripsi || "",
      nama_siswa: namesForWork.join(", ") || "Siswa ICT",
      is_public: "Ya",
      links: data.link_karya.filter((link) => normalize(link.id_karya) === normalize(k.id_karya))
        .map((link) => ({ judul: link.judul || link.nama || "", url: link.url || link.link || "", tipe: link.tipe || "" }))
    };
  });
  const publicRank = data.rank_challenge.filter((r) => yes(r.is_public)).map((r) => ({
    nama: r.nama || r.nama_siswa || "",
    kelas: r.kelas || "",
    poin: Number(r.poin || r.xp || 0),
    is_ict: Boolean(r.is_ict)
  }));
  const publicBab = data.bab.filter((b) => yes(b.is_public) && normalize(b.buka_kelas).toLowerCase() !== "sembunyikan")
    .map((b) => ({ id_bab: b.id_bab, judul_bab: b.judul_bab, deskripsi: b.deskripsi || "", thumbnail: b.thumbnail || "", kelas_target: b.kelas_target || "" }));
  const publicBabIds = new Set(publicBab.map((b) => normalize(b.id_bab)));
  const publicMaterials = data.materi.filter((m) => yes(m.is_public) && publicBabIds.has(normalize(m.id_bab)) && normalize(m.buka_kelas).toLowerCase() !== "sembunyikan")
    .map((m) => ({ id_materi: m.id_materi, id_bab: m.id_bab, nama_materi: m.nama_materi, deskripsi: m.deskripsi || "", video: m.video || "", slide: m.slide || "", file: m.file || "", link_form: m.link_form || "" }));
  const publicPrestasi = data.prestasi.filter((x) => yes(x.is_public));
  return {
    success: true,
    karya: publicWorks,
    prestasi: publicPrestasi.map((x) => ({ tahun: x.tahun || "", icon: x.icon || x.ikon || "🏆", judul: x.judul || "", sub_judul: x.sub_judul || "" })),
    tim: data.tim.filter((x) => yes(x.is_public)).map((x) => ({ nama: x.nama || "", peran: x.peran || "", foto: x.foto || "" })),
    kurikulum: data.kurikulum.filter((x) => yes(x.is_public)).map((x) => ({ judul: x.judul || "", deskripsi: x.deskripsi || "", tautan: x.tautan || x.link || "" })),
    pengaturan: data.pengaturan.filter((x) => yes(x.is_public)).map((x) => ({ key: x.key || "", value: x.value || "" })),
    tugas: data.tugas_mingguan.filter((x) => yes(x.is_public)).map((x) => ({
      id_tugas: x.id_tugas || "", judul: x.judul || "", deskripsi: x.deskripsi || "",
      kategori: x.kategori || "", minggu: x.minggu || "", link_youtube: x.link_youtube || "", link_form: x.link_form || ""
    })),
    rank_challenge: publicRank,
    bab: publicBab,
    materi: publicMaterials,
    stats: { siswa: data.siswa.length, karya: publicWorks.length, prestasi: publicPrestasi.length }
  };
}

async function studentData(identity) {
  requireRole(identity, ["student", "parent", "admin"]);
  const code = normalizeCode(identity.studentCode);
  if (!code) throw new Error("Akun belum terhubung ke kode siswa.");
  const sheets = ["siswa", "bab", "materi", "progres_materi", "tugas_mingguan", "progres_tugas_mingguan", "karya", "link_karya", "skl", "skl_sub", "jadwal"];
  const all = {};
  await Promise.all(sheets.map(async (name) => { all[name] = await readSheet(name); }));
  const student = all.siswa.find((row) => normalizeCode(row.kode_siswa) === code);
  if (!student) {
    const err = new Error("Data siswa tidak ditemukan.");
    err.status = 404;
    throw err;
  }
  const chapters = all.bab.filter((b) => isClassTarget(b, student.kelas));
  const chapterIds = new Set(chapters.map((b) => normalize(b.id_bab)));
  const materials = all.materi.filter((m) => chapterIds.has(normalize(m.id_bab)));
  const materialIds = new Set(materials.map((m) => normalize(m.id_materi)));
  const progress = all.progres_materi.filter((p) => normalizeCode(p.kode_siswa) === code && materialIds.has(normalize(p.id_materi))).map((p) => {
    const material = materials.find((m) => normalize(m.id_materi) === normalize(p.id_materi)) || {};
    return { ...p, nama_materi: material.nama_materi || p.id_materi, id_bab: material.id_bab || "", deskripsi: material.deskripsi || "", video: material.video || "", slide: material.slide || "", file: material.file || "", link_form: material.link_form || "" };
  });
  const weeklyTasks = all.tugas_mingguan.map((task) => {
    const p = all.progres_tugas_mingguan.find((x) => normalize(x.id_tugas) === normalize(task.id_tugas) && normalizeCode(x.kode_siswa) === code) || {};
    return { ...task, status: p.status || "Belum", poin: p.poin || 0, link_hasil: p.link_hasil || "", buka_kelas_master: task.buka_kelas || "Ya", judul: task.judul || task.id_tugas, minggu: task.minggu || "", kategori: task.kategori || "", poin_maksimal: task.poin_maksimal || 0, deskripsi: task.deskripsi || "", link_youtube: task.link_youtube || "", link_form: task.link_form || "" };
  });
  const works = all.karya.filter((k) => normalize(k.kode_siswa).split(",").map(normalizeCode).includes(code))
    .map((k) => ({ ...k, links: all.link_karya.filter((link) => normalize(link.id_karya) === normalize(k.id_karya)) }));
  const skl = all.skl.filter((x) => normalizeCode(x.kode_siswa) === code).map((x) => ({ ...x, sub_materi: all.skl_sub.filter((s) => normalize(s.id_skl) === normalize(x.id_skl)) }));
  return {
    success: true,
    siswa: scrubStudent(student),
    bab: chapters, materi: materials, progres: progress, tugasMingguan: weeklyTasks, karya: works, skl: skl,
    jadwal: all.jadwal.filter((x) => normalizeCode(x.kelas) === normalizeCode(student.kelas))
  };
}
async function teacherData() {
  const data = {};
  await Promise.all(SHEETS.map(async (sheet) => { data[sheet] = await readSheet(sheet); }));
  return {
    success: true, siswa: data.siswa, guru: data.guru, bab: data.bab, materi: data.materi,
    progres_materi: data.progres_materi, tugas: data.tugas_mingguan,
    progres_tugas: data.progres_tugas_mingguan, karya: data.karya, link_karya: data.link_karya,
    skl: data.skl, skl_sub: data.skl_sub, jadwal: data.jadwal, pengaturan: data.pengaturan,
    kurikulum: data.kurikulum, prestasi: data.prestasi, tim: data.tim, rank_challenge: data.rank_challenge
  };
}
async function teacherUpsert(action, body) {
  const config = UPSERT_ACTIONS[action];
  if (!config) throw new Error("Operasi simpan tidak dikenali.");
  if (!body.data || typeof body.data !== "object") throw new Error("Data yang disimpan tidak valid.");
  if (action === "upsert_skl" && !normalize(body.data.id_skl)) body.data.id_skl = "SKL-" + crypto.randomUUID();
  if (action === "upsert_skl_sub" && !normalize(body.data.id_sub)) body.data.id_sub = "SUB-" + crypto.randomUUID();
  if (action === "upsert_karya" && !normalize(body.data.id_karya)) body.data.id_karya = "KRY-" + crypto.randomUUID().slice(0, 8);
  if (action === "upsert_siswa") {
    await ensureAuthUser("student", body.data.kode_siswa, body.data.nama_siswa, body.data.password);
    delete body.data.password;
  }
  return writeRow(config[0], config[1], body.data);
}
async function ensureAuthUser(role, code, displayName, candidatePassword) {
  const normalized = normalizeCode(code);
  if (!normalized) return;
  const email = safeAlias(role, normalized);
  try {
    const existing = await auth.getUserByEmail(email);
    const claims = { ...(existing.customClaims || {}), role: role, ...(role === "student" ? { studentCode: normalized } : { teacherId: normalized }) };
    await auth.setCustomUserClaims(existing.uid, claims);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    const fallbackPassword = crypto.randomBytes(18).toString("base64url") + "Aa1!";
    const provided = normalize(candidatePassword);
    const user = await auth.createUser({
      email: email, password: provided.length >= 6 ? provided : fallbackPassword,
      displayName: normalize(displayName) || normalized, disabled: false
    });
    await auth.setCustomUserClaims(user.uid, {
      role: role,
      ...(role === "student" ? { studentCode: normalized } : { teacherId: normalized }),
      mustChangePassword: !provided || provided === "123456" || provided.length < 10
    });
  }
}
async function teacherDelete(sheet, key, value) {
  if (!normalize(value)) throw new Error("Nilai kunci wajib diisi.");
  return deleteMatching(sheet, (record) => normalize(record[key]) === normalize(value));
}
async function batchUpsert(items) {
  for (let offset = 0; offset < items.length; offset += 400) {
    const batch = db.batch();
    for (const item of items.slice(offset, offset + 400)) {
      const docId = safeDocId(item.sheet, item.row, 0);
      batch.set(sheetRowsRef(item.sheet).doc(docId), { record: stripSensitive(item.row), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
}
async function assignMaterial(body) {
  const idMaterial = normalize(body.id_materi);
  if (!idMaterial) throw new Error("ID materi wajib diisi.");
  const [students, materials, chapters, progress] = await Promise.all([readSheet("siswa"), readSheet("materi"), readSheet("bab"), readSheet("progres_materi")]);
  const material = materials.find((m) => normalize(m.id_materi) === idMaterial);
  if (!material) throw new Error("Materi tidak ditemukan.");
  const chapter = chapters.find((b) => normalize(b.id_bab) === normalize(material.id_bab)) || {};
  const targets = students.filter((s) => isClassTarget(chapter, s.kelas));
  const writes = targets.map((student) => {
    const exists = progress.find((p) => normalizeCode(p.kode_siswa) === normalizeCode(student.kode_siswa) && normalize(p.id_materi) === idMaterial);
    const row = exists ? { ...exists, deadline: body.deadline || "" } : { kode_siswa: student.kode_siswa, id_materi: idMaterial, status: "Belum Dikerjakan", deadline: body.deadline || "" };
    return { sheet: "progres_materi", row: row };
  });
  await batchUpsert(writes);
  return { success: true, message: "Materi ditugaskan kepada " + targets.length + " siswa." };
}
async function assignWeeklyTask(body) {
  const idTask = normalize(body.id_tugas);
  if (!idTask) throw new Error("ID tugas wajib diisi.");
  const [students, tasks, progresses] = await Promise.all([readSheet("siswa"), readSheet("tugas_mingguan"), readSheet("progres_tugas_mingguan")]);
  if (!tasks.some((t) => normalize(t.id_tugas) === idTask)) throw new Error("Tugas mingguan tidak ditemukan.");
  const existing = new Set(progresses.filter((p) => normalize(p.id_tugas) === idTask).map((p) => normalizeCode(p.kode_siswa)));
  const writes = students.filter((s) => !existing.has(normalizeCode(s.kode_siswa))).map((s) => ({
    sheet: "progres_tugas_mingguan", row: { kode_siswa: s.kode_siswa, id_tugas: idTask, status: "Belum" }
  }));
  await batchUpsert(writes);
  return { success: true, message: "Tugas didistribusikan ke " + writes.length + " siswa baru." };
}
async function assignSkl(body) {
  const kelas = normalizeCode(body.kelas);
  const [students, existing] = await Promise.all([readSheet("siswa"), readSheet("skl")]);
  const targets = students.filter((student) => !kelas || normalizeCode(student.kelas) === kelas);
  const writes = [];
  for (const student of targets) {
    const duplicate = existing.some((item) => normalizeCode(item.kode_siswa) === normalizeCode(student.kode_siswa) && normalize(item.mata_kompetensi) === normalize(body.mata_kompetensi));
    if (!duplicate) writes.push({
      sheet: "skl",
      row: { id_skl: "SKL-" + crypto.randomUUID(), kode_siswa: student.kode_siswa, mata_kompetensi: normalize(body.mata_kompetensi), deskripsi: normalize(body.deskripsi), status: "Belum" }
    });
  }
  await batchUpsert(writes);
  return { success: true, message: "SKL dibuat untuk " + writes.length + " siswa." };
}
async function removeAssignedMaterial(body) {
  const idMaterial = normalize(body.id_materi);
  const snap = await sheetRowsRef("progres_materi").get();
  const rows = snap.docs.filter((doc) => normalize((doc.data().record || {}).id_materi) === idMaterial);
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    rows.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  return { success: true, message: "Penugasan materi dihapus dari " + rows.length + " catatan progres." };
}
async function resetStudentPassword(code) {
  const email = safeAlias("student", normalizeCode(code));
  const temp = crypto.randomBytes(12).toString("base64url") + "A7!";
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password: temp });
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), mustChangePassword: true });
  return { success: true, message: "Password sementara dibuat. Sampaikan secara privat kepada siswa.", temporaryPassword: temp };
}
async function parentLogin(body) {
  const code = normalizeCode(body.kode_siswa);
  const pin = normalize(body.pin);
  if (!code || !/^\d{6,10}$/.test(pin)) {
    const err = new Error("Kode siswa atau PIN orang tua tidak valid.");
    err.status = 400;
    throw err;
  }
  const ref = db.collection("parentAccess").doc(code);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error("Kode siswa atau PIN orang tua tidak valid.");
    err.status = 401;
    throw err;
  }
  const access = snap.data();
  if (Number(access.lockedUntilMs || 0) > Date.now()) {
    const err = new Error("Terlalu banyak percobaan. Coba lagi beberapa menit lagi.");
    err.status = 429;
    throw err;
  }
  const actual = crypto.scryptSync(pin, access.salt, 64);
  const expected = Buffer.from(access.pinHash, "hex");
  const valid = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  if (!valid) {
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists) return;
      const attempt = Number(current.get("failedAttempts") || 0) + 1;
      tx.update(ref, {
        failedAttempts: attempt >= 5 ? 0 : attempt,
        lockedUntilMs: attempt >= 5 ? Date.now() + 15 * 60 * 1000 : Number(current.get("lockedUntilMs") || 0)
      });
    });
    const err = new Error("Kode siswa atau PIN orang tua tidak valid.");
    err.status = 401;
    throw err;
  }
  await ref.update({ failedAttempts: 0, lockedUntilMs: 0, lastLoginAt: FieldValue.serverTimestamp() });
  return { success: true, customToken: await auth.createCustomToken("parent-" + code, { role: "parent", studentCode: code }) };
}

exports.api = onRequest({ region: REGION, maxInstances: 10 }, async (req, res) => {
  const origin = normalize(req.get("origin"));
  const defaultOrigins = [
    "https://ict.alfirdaus.sch.id",
    "https://monitoring-ict-smpit.web.app",
    "https://monitoring-ict-smpit.firebaseapp.com",
    "https://imamsaa.github.io",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
  ];
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins.join(",")).split(",").map((v) => v.trim()).filter(Boolean);
  if (allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  res.set("Access-Control-Max-Age", "3600");
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (req.method === "GET" && req.query.action === "health") {
      return res.json({ success: true, service: "official-ict-firebase-api", region: REGION });
    }
    if (req.method === "GET" && req.query.action === "get_public_data") {
      return res.json(await publicData());
    }
    if (req.method === "POST") {
      const body = parseJsonBody(req);
      if (body.action === "parent_login") return res.json(await parentLogin(body));
      const identity = await requireIdentity(req);
      if (body.action === "student_get_data") return res.json(await studentData(identity));
      requireRole(identity, ["teacher", "admin"]);
      if (body.action === "teacher_get_all" || body.action === "guru_get_all") return res.json(await teacherData());
      if (UPSERT_ACTIONS[body.action]) return res.json(await teacherUpsert(body.action, body));
      if (DELETE_ACTIONS[body.action]) {
        const config = DELETE_ACTIONS[body.action];
        const value = body[config[1]] != null ? body[config[1]] : (body.data || {})[config[1]];
        return res.json(await teacherDelete(config[0], config[1], value));
      }
      if (body.action === "assign_materi_kelas") return res.json(await assignMaterial(body));
      if (body.action === "assign_tugas_kelas") return res.json(await assignWeeklyTask(body));
      if (body.action === "unassign_materi_kelas") return res.json(await removeAssignedMaterial(body));
      if (body.action === "assign_skl_kelas") return res.json(await assignSkl(body));
      if (body.action === "reset_password_siswa") return res.json(await resetStudentPassword(body.kode_siswa));
      if (body.action === "ubah_password_siswa") {
        const err = new Error("Ubah password harus dilakukan melalui Firebase Authentication dari sesi pengguna.");
        err.status = 400;
        throw err;
      }
      const err = new Error("Action tidak dikenali: " + normalize(body.action));
      err.status = 400;
      throw err;
    }
    const err = new Error("Metode HTTP tidak didukung.");
    err.status = 405;
    throw err;
  } catch (error) {
    const status = Number(error.status || 500);
    if (status >= 500) console.error("API failure", error);
    return res.status(status).json({
      success: false,
      message: status >= 500 ? "Terjadi kesalahan pada server." : error.message
    });
  }
});
