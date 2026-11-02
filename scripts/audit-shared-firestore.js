#!/usr/bin/env node
"use strict";

/**
 * READ-ONLY inventory for a shared Firestore database.
 * Prints collection/document COUNTS and namespace metadata only.
 * Does not print document values, student names, IDs, passwords or PINs.
 * Does not create, update, or delete anything.
 *
 * Run:
 *   node scripts/audit-shared-firestore.js
 */

const { initializeApp, applicationDefault, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "monitoring-ict-smpit";
const DATA_NAMESPACE = "officialIct_v1";
const EXPECTED_SHEETS = [
  "siswa", "guru", "bab", "materi", "progres_materi", "tugas_mingguan",
  "progres_tugas_mingguan", "karya", "link_karya", "skl", "skl_sub",
  "jadwal", "pengaturan", "kurikulum", "prestasi", "tim", "rank_challenge"
];

async function countDocs(ref) {
  const result = await ref.count().get();
  return result.data().count;
}
async function main() {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();
  const top = await db.listCollections();
  const topRows = [];
  for (const collection of top) {
    topRows.push({ collection: collection.id, documents: await countDocs(collection) });
  }

  const oldLegacyCount = await countDocs(db.collection("legacyData"));
  const oldParentCount = await countDocs(db.collection("parentAccess"));
  const namespaceRef = db.collection(DATA_NAMESPACE);
  const rootDocs = await namespaceRef.listDocuments();
  const meta = await namespaceRef.doc("_meta").get();
  const namespaceStatus = meta.exists
    ? (meta.get("owner") === "official-ict" && meta.get("namespace") === DATA_NAMESPACE && meta.get("schemaVersion") === 1
      ? "OWNED_BY_OFFICIAL_ICT"
      : "STOP_METADATA_CONFLICT")
    : (rootDocs.length === 0 ? "EMPTY_NAMESPACE_CANDIDATE" : "STOP_NAMESPACE_ALREADY_HAS_DOCUMENTS");

  const sheets = [];
  const dataDoc = namespaceRef.doc("data");
  const childCollections = await dataDoc.listCollections();
  const childNames = new Set(childCollections.map((item) => item.id));
  for (const name of EXPECTED_SHEETS) {
    const exists = childNames.has(name);
    const documents = exists ? await countDocs(dataDoc.collection(name)) : 0;
    sheets.push({ sheet: name, exists, documents });
  }
  const accessRef = namespaceRef.doc("access").collection("parentAccess");
  const accessCount = await countDocs(accessRef);

  console.log("Official ICT — shared Firestore audit (READ ONLY)");
  console.log("Project:", PROJECT_ID);
  console.log("Database: (default)");
  console.log("Existing top-level collection inventory:", JSON.stringify(topRows));
  console.log("Generic legacyData documents (left untouched):", oldLegacyCount);
  console.log("Generic parentAccess documents (left untouched):", oldParentCount);
  console.log("Official ICT namespace:", DATA_NAMESPACE);
  console.log("Namespace state:", namespaceStatus);
  console.log("Namespace root document IDs:", JSON.stringify(rootDocs.map((ref) => ref.id)));
  console.log("Official ICT sheet collections:", JSON.stringify(sheets));
  console.log("Official ICT parent access records:", accessCount);
  console.log("No data was written or deleted.");

  if (namespaceStatus.startsWith("STOP_")) {
    console.log("RESULT: STOP — namespace collision or unknown ownership must be reviewed.");
    process.exitCode = 1;
  } else {
    console.log("RESULT: READ-ONLY AUDIT COMPLETE. Verify collection ownership with the other app owner before import.");
  }
}
main().catch((error) => {
  console.error("Audit failed:", error.message);
  process.exitCode = 1;
});
