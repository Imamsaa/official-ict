#!/usr/bin/env node
"use strict";

/**
 * Verify Firestore import totals using the same private Apps Script export JSON.
 * This script prints only collection/account counts and security findings.
 * It never prints student names, codes, passwords, PINs, or export contents.
 *
 * Run from scripts/ after npm install:
 *   node verify-firestore-import.js <private-export.json>
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { initializeApp, applicationDefault, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "monitoring-ict-smpit";

function norm(value) {
  return String(value == null ? "" : value).trim();
}
function normCode(value) {
  return norm(value).toUpperCase();
}
function alias(role, id) {
  const slug = normCode(id).toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  return role + "-" + slug + "@accounts.ict.alfirdaus.sch.id";
}
function expectedDocId(sheet, row, index, keyFields) {
  const fields = keyFields[sheet] || [];
  const values = fields.map((key) => norm(row[key]));
  const keyed = fields.length > 0 && values.every(Boolean);
  const seed = keyed ? JSON.stringify([sheet, values]) : JSON.stringify([sheet, index, row]);
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 40);
}
function hasSensitiveField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasSensitiveField);
  return Object.entries(value).some(([key, child]) => {
    if (["password", "password_hash", "pinhash", "pin", "salt"].includes(key.toLowerCase())) return true;
    return hasSensitiveField(child);
  });
}
async function countDocs(query) {
  const aggregate = await query.count().get();
  return aggregate.data().count;
}
async function checkAccounts(auth, records, role, idField, expectedClaimsField) {
  let checked = 0;
  let missing = 0;
  let invalidClaims = 0;
  const ids = records.map((row) => normCode(row[idField])).filter(Boolean);
  for (let offset = 0; offset < ids.length; offset += 100) {
    const slice = ids.slice(offset, offset + 100);
    const users = await auth.getUsers(slice.map((id) => ({ email: alias(role, id) })));
    const found = new Map(users.users.map((user) => [user.email, user]));
    for (const id of slice) {
      checked += 1;
      const user = found.get(alias(role, id));
      if (!user) {
        missing += 1;
      } else if (user.customClaims && (user.customClaims.role !== role || user.customClaims[expectedClaimsField] !== id)) {
        invalidClaims += 1;
      }
    }
  }
  return { checked, missing, invalidClaims };
}
async function main() {
  const input = process.argv[2];
  if (!input || !fs.existsSync(input)) {
    console.error("Usage: node verify-firestore-import.js <private-export.json>");
    process.exitCode = 2;
    return;
  }
  const payload = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));
  if (payload.format !== "official-ict-appscript-export-v1" || !payload.sheets) {
    throw new Error("Unrecognized export format.");
  }

  const keyFields = {
    siswa: ["kode_siswa"], guru: ["id_guru"], bab: ["id_bab"], materi: ["id_materi"],
    progres_materi: ["kode_siswa", "id_materi"], tugas_mingguan: ["id_tugas"],
    progres_tugas_mingguan: ["kode_siswa", "id_tugas"], karya: ["id_karya"],
    link_karya: ["id_link"], skl: ["id_skl"], skl_sub: ["id_sub"],
    jadwal: ["kelas", "hari", "waktu"], pengaturan: ["key"], kurikulum: ["judul"],
    prestasi: ["judul"], tim: ["nama"], rank_challenge: ["id_rank"]
  };

  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();
  const auth = getAuth();

  let totalExpected = 0;
  let totalActual = 0;
  let collectionsWithMismatch = 0;
  let recordsWithSecrets = 0;
  let deterministicIdMismatches = 0;
  const report = [];

  for (const sheet of Object.keys(payload.sheets).sort()) {
    const rows = Array.isArray(payload.sheets[sheet]) ? payload.sheets[sheet] : [];
    const snapshot = await db.collection("legacyData").doc(sheet).collection("rows").get();
    const expectedIds = new Set(rows.map((row, index) => expectedDocId(sheet, row, index, keyFields)));
    const actualIds = new Set(snapshot.docs.map((doc) => doc.id));
    const secrets = snapshot.docs.filter((doc) => hasSensitiveField(doc.data().record)).length;
    const missingIds = [...expectedIds].filter((id) => !actualIds.has(id)).length;
    const extraIds = [...actualIds].filter((id) => !expectedIds.has(id)).length;

    totalExpected += rows.length;
    totalActual += snapshot.size;
    recordsWithSecrets += secrets;
    deterministicIdMismatches += missingIds + extraIds;
    if (rows.length !== snapshot.size || missingIds || extraIds || secrets) collectionsWithMismatch += 1;
    report.push({ sheet, expected: rows.length, actual: snapshot.size, missingIds, extraIds, sensitiveRecords: secrets });
  }

  const students = Array.isArray(payload.sheets.siswa) ? payload.sheets.siswa : [];
  const teachers = Array.isArray(payload.sheets.guru) ? payload.sheets.guru : [];
  const uniqueStudents = new Map(students.map((row) => [normCode(row.kode_siswa), row]));
  uniqueStudents.delete("");
  const parentAccessCount = await countDocs(db.collection("parentAccess"));
  const studentAccounts = await checkAccounts(auth, [...uniqueStudents.values()], "student", "kode_siswa", "studentCode");
  const teacherAccounts = await checkAccounts(auth, teachers, "teacher", "id_guru", "teacherId");

  console.log("Official ICT — Firestore import verification");
  console.log("Project:", PROJECT_ID);
  console.log("Collections checked:", report.length);
  console.log("Expected records:", totalExpected);
  console.log("Actual records:", totalActual);
  console.log("Collections with mismatches:", collectionsWithMismatch);
  console.log("Records containing sensitive fields:", recordsWithSecrets);
  console.log("Parent access records:", parentAccessCount, "(expected at least " + uniqueStudents.size + ")");
  console.log("Student Auth accounts:", JSON.stringify(studentAccounts));
  console.log("Teacher Auth accounts:", JSON.stringify(teacherAccounts));
  console.log("Per-collection report:", JSON.stringify(report));

  const ok =
    collectionsWithMismatch === 0 &&
    recordsWithSecrets === 0 &&
    parentAccessCount >= uniqueStudents.size &&
    studentAccounts.missing === 0 &&
    studentAccounts.invalidClaims === 0 &&
    teacherAccounts.missing === 0 &&
    teacherAccounts.invalidClaims === 0;

  console.log(ok ? "RESULT: PASS" : "RESULT: REVIEW REQUIRED");
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Verification failed:", error.message);
  process.exitCode = 1;
});
