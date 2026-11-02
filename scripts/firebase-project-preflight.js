#!/usr/bin/env node
"use strict";

/**
 * Read-only Firebase / Google Cloud project preflight.
 * It does not create databases, enable APIs, deploy functions, or change billing.
 *
 * Run from the repository root:
 *   node scripts/firebase-project-preflight.js
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const EXPECTED_PROJECT = "monitoring-ict-smpit";
const EXPECTED_FUNCTION_REGION = "us-central1";
const REQUIRED_SERVICES = [
  "cloudfunctions.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "run.googleapis.com",
  "eventarc.googleapis.com",
  "secretmanager.googleapis.com",
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "firebase.googleapis.com",
  "serviceusage.googleapis.com"
];

function run(command, args) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 45000,
        windowsHide: true
      }).trim()
    };
  } catch (error) {
    return {
      ok: false,
      code: error.code || "COMMAND_FAILED",
      stderr: String(error.stderr || error.message || "").trim()
    };
  }
}
function parseJson(result, label) {
  if (!result.ok) {
    console.log("  NOT AVAILABLE:", label, result.code);
    if (result.stderr) console.log("  Detail:", result.stderr.split(/\r?\n/)[0].slice(0, 220));
    return null;
  }
  try { return JSON.parse(result.stdout); }
  catch (_) {
    console.log("  ERROR: output from", label, "was not valid JSON.");
    return null;
  }
}
function status(label, ok, detail) {
  console.log((ok ? "[OK] " : "[CHECK] ") + label + (detail ? " — " + detail : ""));
}

console.log("Official ICT — Firebase project preflight");
console.log("Read-only check. No Firebase or Google Cloud resources will be changed.");
console.log("SHARED DATABASE SAFETY: do not delete/reset the existing (default) database.");
console.log("Do not deploy this repository's firestore.rules until all apps' rules have been audited.");
console.log("Audit collection ownership and backup before running any importer.");

console.log("Expected project:", EXPECTED_PROJECT);
console.log("");

const runtimePath = path.join(ROOT, "firebase", "runtime-config.js");
const firebaseRcPath = path.join(ROOT, ".firebaserc");
let configuredProject = null;
let runtimeBackend = "unknown";

try {
  const firebaseRc = JSON.parse(fs.readFileSync(firebaseRcPath, "utf8"));
  configuredProject = firebaseRc.projects && firebaseRc.projects.default;
} catch (_) {}
try {
  const runtime = fs.readFileSync(runtimePath, "utf8");
  const match = runtime.match(/backend:\s*["']([^"']+)["']/);
  if (match) runtimeBackend = match[1];
} catch (_) {}

status(".firebaserc project matches target", configuredProject === EXPECTED_PROJECT, configuredProject || "not found");
status("Frontend backend switch", runtimeBackend === "legacy", "current value: " + runtimeBackend + "; keep legacy until all portals pass migration tests");

const nodeMajor = Number(process.versions.node.split(".")[0]);
status("Local Node.js runtime", nodeMajor === 22, "current " + process.versions.node + "; Functions runtime in repository is Node.js 22");

const firebaseVersion = run("firebase", ["--version"]);
status("Firebase CLI installed", firebaseVersion.ok, firebaseVersion.ok ? "version " + firebaseVersion.stdout : "install Firebase CLI before deployment");
const gcloudVersion = run("gcloud", ["--version"]);
status("Google Cloud CLI installed", gcloudVersion.ok, gcloudVersion.ok ? gcloudVersion.stdout.split(/\r?\n/)[0] : "gcloud is required for project inspection");

if (!gcloudVersion.ok) {
  console.log("");
  console.log("STOP: Google Cloud CLI is not available in this terminal.");
  console.log("Install Google Cloud CLI, sign in with the project Owner account,");
  console.log("then run this script again. This script does not request or store a key file.");
  process.exitCode = 2;
  return;
}

const accounts = parseJson(run("gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=json"]), "gcloud auth list");
const activeAccounts = Array.isArray(accounts) ? accounts.filter((item) => item.status === "ACTIVE").map((item) => item.account) : [];
status("Google Cloud account signed in", activeAccounts.length > 0, activeAccounts.length ? activeAccounts.join(", ") : "run gcloud auth login");

const currentProject = run("gcloud", ["config", "get-value", "project"]);
status("gcloud default project", currentProject.ok && currentProject.stdout === EXPECTED_PROJECT, currentProject.ok ? currentProject.stdout : "not configured; script still passes explicit project ID to inspection commands");

console.log("");
console.log("Billing:");
const billing = parseJson(run("gcloud", ["billing", "projects", "describe", EXPECTED_PROJECT, "--format=json"]), "Cloud Billing project description");
if (billing) {
  status("Billing enabled", billing.billingEnabled === true, billing.billingEnabled === true ? "confirmed by Google Cloud API" : "billing is not enabled or access is restricted");
}

console.log("");
console.log("Firestore database (default):");
const database = parseJson(run("gcloud", ["firestore", "databases", "describe", "--database=(default)", "--project=" + EXPECTED_PROJECT, "--format=json"]), "Firestore database description");
if (database) {
  const location = database.locationId || "unknown";
  const type = database.type || "unknown";
  const edition = database.databaseEdition || database.edition || "not reported";
  status("Database exists", true, database.name || "(default)");
  console.log("  Database ID:", database.name ? database.name.split("/").pop() : "(default)");
  console.log("  Location:", location);
  console.log("  Type:", type);
  console.log("  Edition:", edition);
  console.log("  Delete protection:", database.deleteProtectionState || "not reported");
  const recommendedFunctionRegions = {
    nam5: "us-central1",
    "us-central": "us-central1",
    eur3: "europe-west1",
    "europe-west": "europe-west1"
  };
  const recommendedRegion = recommendedFunctionRegions[location] || location;
  if (recommendedRegion === EXPECTED_FUNCTION_REGION) {
    status("Function / database region alignment", true,
      "Firestore " + location + " -> Functions " + EXPECTED_FUNCTION_REGION);
  } else {
    status("Function / database region alignment", false,
      "Firestore " + location + " recommends Functions " + recommendedRegion +
      "; configured target is " + EXPECTED_FUNCTION_REGION);
  }
}

console.log("");
console.log("Required Google Cloud APIs:");
const services = parseJson(run("gcloud", [
  "services", "list", "--enabled", "--project=" + EXPECTED_PROJECT, "--format=json"
]), "enabled API services");
if (Array.isArray(services)) {
  const enabled = new Set(services.map((item) => item.config && item.config.name).filter(Boolean));
  const missing = REQUIRED_SERVICES.filter((name) => !enabled.has(name));
  console.log("  Enabled required APIs:", REQUIRED_SERVICES.length - missing.length + "/" + REQUIRED_SERVICES.length);
  for (const name of REQUIRED_SERVICES) status(name, enabled.has(name), enabled.has(name) ? "enabled" : "not enabled");
  if (missing.length) {
    console.log("  Missing APIs are reported only; this script does not enable them.");
  }
}

console.log("");
console.log("Manual Firebase Console checks still required:");
console.log("  1. Authentication > Sign-in method > Email/Password is enabled.");
console.log("  2. Confirm the existing Firestore database is Native mode / Standard edition.");
console.log("  3. Review the database location before deciding the Functions region.");
console.log("  4. Review existing collections before any rules deployment.");
console.log("  5. Do not deploy deny-by-default Firestore rules while the old teacher portal reads Firestore directly.");
console.log("");
console.log("No resources were changed.");
