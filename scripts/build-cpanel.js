#!/usr/bin/env node
"use strict";

/**
 * Build a safe, static deployment bundle for cPanel / Apache shared hosting.
 *
 * Output:
 *   dist-cpanel/
 *     index.html, script.js, assets/
 *     siswa/, ortu/, guru/
 *     firebase/ (public browser config only)
 *     .htaccess
 *
 * Deliberately excluded:
 *   functions/, scripts/, code.gs, .git/, Firebase Admin credentials,
 *   private spreadsheet exports, migration reports, and local environment files.
 *
 * Run from repository root:
 *   node scripts/build-cpanel.js
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "dist-cpanel");

function ensureSource(relativePath) {
  const source = path.join(ROOT, relativePath);
  if (!fs.existsSync(source)) {
    throw new Error("Required frontend path is missing: " + relativePath);
  }
  return source;
}
function copyDirectory(relativePath, destination) {
  fs.cpSync(ensureSource(relativePath), destination, {
    recursive: true,
    force: true,
    filter(source) {
      const name = path.basename(source);
      return name !== ".DS_Store" && name !== "Thumbs.db";
    }
  });
}
function copyFile(relativePath, destination) {
  fs.copyFileSync(ensureSource(relativePath), destination);
}

function main() {
  if (OUTPUT === ROOT || OUTPUT === path.dirname(ROOT)) {
    throw new Error("Unsafe output directory.");
  }
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });

  // The public site becomes the document root of the cPanel domain.
  copyDirectory("web_public", OUTPUT);
  const rootIndex = path.join(OUTPUT, "index.html");
  let html = fs.readFileSync(rootIndex, "utf8");
  html = html.replaceAll("../firebase/runtime-config.js", "firebase/runtime-config.js");
  if (html.includes("../firebase/runtime-config.js")) {
    throw new Error("Public homepage still contains an invalid relative Firebase path.");
  }
  fs.writeFileSync(rootIndex, html, "utf8");

  // Keep each portal at a stable URL: /siswa/, /ortu/, and /guru/.
  for (const portal of ["siswa", "ortu", "guru"]) {
    copyDirectory(portal, path.join(OUTPUT, portal));
  }

  // The parent portal references the shared logo/favicon through /ortu/assets/.
  // Reuse the same public visual assets as the main website.
  fs.mkdirSync(path.join(OUTPUT, "ortu", "assets"), { recursive: true });
  copyFile("web_public/assets/favicon.ico", path.join(OUTPUT, "ortu", "assets", "favicon.ico"));
  copyFile("web_public/assets/logo.png", path.join(OUTPUT, "ortu", "assets", "logo.png"));

  // Only browser-side Firebase configuration/client code is public.
  fs.mkdirSync(path.join(OUTPUT, "firebase"), { recursive: true });
  copyFile("firebase/runtime-config.js", path.join(OUTPUT, "firebase", "runtime-config.js"));
  copyFile("firebase/client.js", path.join(OUTPUT, "firebase", "client.js"));

  // Basic Apache hardening; keep this compatible with ordinary cPanel hosting.
  fs.writeFileSync(
    path.join(OUTPUT, ".htaccess"),
    "Options -Indexes\n\n" +
    "<FilesMatch \"^\\.(?!well-known)\">\n" +
    "  Require all denied\n" +
    "</FilesMatch>\n",
    "utf8"
  );

  const fileCount = [];
  function walk(directory, relative = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(absolute, child);
      else fileCount.push(child);
    }
  }
  walk(OUTPUT);

  const forbidden = fileCount.filter((file) =>
    /(^|\/)(functions|scripts|\.git)(\/|$)|(^|\/)code\.gs$|(\.env|service-account|legacy-export|migration-report|parent-invites|account-reset)/i.test(file)
  );
  if (forbidden.length) {
    fs.rmSync(OUTPUT, { recursive: true, force: true });
    throw new Error("Unsafe files found in cPanel bundle: " + forbidden.join(", "));
  }

  console.log("cPanel bundle ready:", path.relative(ROOT, OUTPUT));
  console.log("Files:", fileCount.length);
  console.log("Main site: index.html");
  console.log("Portals: siswa/, ortu/, guru/");
  console.log("Firebase browser files: firebase/runtime-config.js, firebase/client.js");
  console.log("Excluded: Functions backend, migration scripts, Apps Script source and private exports.");
  console.log("Upload the CONTENTS of dist-cpanel/ into the cPanel domain's document root (for example public_html/).");
}

try {
  main();
} catch (error) {
  console.error("cPanel build failed:", error.message);
  process.exitCode = 1;
}
