# FIRESTORE SHARED DATABASE POLICY — OFFICIAL ICT

Project: \`monitoring-ict-smpit\`  
Database: \`(default)\`  
Location: \`nam5\`  
Status: **SHARED — DO NOT DELETE, RESET, OR RECREATE**

## Non-negotiable safeguards

The existing Firestore database is used by another application. Official ICT must coexist with that application. The following actions are prohibited:

- Delete or recreate the \`(default)\` Firestore database.
- Wipe, reset, recursively delete, or mass-delete existing collections/documents.
- Delete collections because their purpose or owner is unclear.
- Deploy this repository's \`firestore.rules\` directly to the shared project.
- Run a broad Firebase deployment that unintentionally deploys database-wide rules.
- Reuse an existing collection path without confirming that it belongs to Official ICT.

## Why the current rules file is dangerous

The current \`firestore.rules\` contains a catch-all rule:

\`\`\`text
match /{document=**} {
  allow read, write: if false;
}
\`\`\`

Firestore Security Rules apply at the database level, not independently per application. Deploying this rule as-is would deny direct client reads and writes for other applications in the same database. It would not delete their stored documents, but could make their features fail. The rules file is a draft only until all applications' requirements are reviewed and merged.

## Current importer write scope

The current importer writes only inside one Official ICT namespace:

- \`officialIct_v1/data/{sheet}/{docId}\`
- \`officialIct_v1/access/parentAccess/{studentCode}\`
- Ownership marker: \`officialIct_v1/_meta\`

The generic root-level paths \`legacyData\` and \`parentAccess\` are explicitly left untouched. The importer requires an explicit namespace confirmation, refuses an unknown namespace, and checks Firebase Authentication alias/UID conflicts before writing. The read-only audit script counts generic paths only; it never changes their records.

Cloud Functions CRUD/delete operations are scoped through the Official ICT namespace helper. Do not broaden those paths to any top-level collection.

## Mandatory preflight before any write

1. Run \`node scripts/audit-shared-firestore.js\` to list top-level collection names and document counts without exposing document values.
2. Confirm \`officialIct_v1\` is empty or has the expected Official ICT ownership marker.
3. Confirm the namespace is not used by another application.
4. Create and verify a backup/export of the shared database before the first import.
5. Run the importer only with \`--confirm-namespace=officialIct_v1\`.
6. Verify imported data and test the other application after the change.

If the namespace has unknown documents or its ownership cannot be proven, **do not import yet**. Never solve a collision by deleting or overwriting another application's data.

## Safe deployment scope

- A Functions-only deployment may be considered after function code and collection paths are audited.
- Do not deploy Firestore rules or indexes as part of an all-in-one deployment unless they have been reviewed for every application sharing this database.
- Avoid broad commands such as \`firebase deploy\` for this project.
- Do not run reset, cleanup, recursive delete, database deletion, or database recreation commands.

## Current status

No Firestore database has been deleted, recreated, or reset by this preparation work. No live data import has been performed. The existing database remains the source of truth for all applications until a safe, isolated migration plan is approved.
