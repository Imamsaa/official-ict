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

The migration importer does not contain a database deletion command, but it does write to these top-level paths:

- \`legacyData/{sheet}/rows/{docId}\`: uses deterministic document IDs and \`batch.set()\`. Re-running it can overwrite a document at the same ID.
- \`parentAccess/{studentCode}\`: creates a PIN record only when the target document does not exist.

Those path names must be inspected before any import. Do not assume they are unused just because the collection names look specific. If either path belongs to another application, stop and design an Official ICT-only namespace, then update the importer, API, and verifier consistently.

Cloud Functions also exposes delete operations for selected Official ICT records. Those operations must remain restricted to verified Official ICT paths and must never target unrelated collections.

## Mandatory preflight before any write

1. List all existing top-level collections and subcollections; record which application owns each one.
2. Inspect the existing document counts and path structure for \`legacyData\` and \`parentAccess\`.
3. Confirm whether any other application uses those paths or relies on direct Firestore client access.
4. Create a verified backup/export of all existing application data using the owners' approved method.
5. Confirm that the import destination is isolated from every other application's paths.
6. Run import only after the above checks are documented and approved.
7. Verify both Official ICT and the other application after every change.

If the destination paths cannot be proven safe, **do not import yet**. Build an isolated Official ICT namespace first. Never solve a collision by deleting or overwriting another application's data.

## Safe deployment scope

- A Functions-only deployment may be considered after function code and collection paths are audited.
- Do not deploy Firestore rules or indexes as part of an all-in-one deployment unless they have been reviewed for every application sharing this database.
- Avoid broad commands such as \`firebase deploy\` for this project.
- Do not run reset, cleanup, recursive delete, database deletion, or database recreation commands.

## Current status

No Firestore database has been deleted, recreated, or reset by this preparation work. No live data import has been performed. The existing database remains the source of truth for all applications until a safe, isolated migration plan is approved.
