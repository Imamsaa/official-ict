// Shared Firebase client for the Official ICT portals.
// It is intentionally not loaded by the existing pages until their API calls
// are migrated and the Firebase backend has been deployed and verified.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  getIdTokenResult
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAJEC8FHc2J6vYqFOuYwScmSrMdYUfrqGI",
  authDomain: "monitoring-ict-smpit.firebaseapp.com",
  projectId: "monitoring-ict-smpit",
  storageBucket: "monitoring-ict-smpit.firebasestorage.app",
  messagingSenderId: "732245888299",
  appId: "1:732245888299:web:d10fa6cfc1a9c67118496e",
  measurementId: "G-QYRR78CHXS"
};

const app = initializeApp(firebaseConfig, "official-ict-client");
const auth = getAuth(app);
const API_URL = "https://asia-southeast2-monitoring-ict-smpit.cloudfunctions.net/api";

function normalizeCode(value) {
  return String(value == null ? "" : value).trim().toUpperCase();
}
function alias(role, code) {
  const slug = normalizeCode(code).toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  return role + "-" + slug + "@accounts.ict.alfirdaus.sch.id";
}
async function parseResponse(response) {
  let result;
  try { result = await response.json(); }
  catch (_) { throw new Error("Server Firebase mengirim respons yang tidak valid."); }
  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Permintaan ke Firebase gagal.");
  }
  return result;
}
async function api(action, payload) {
  const user = auth.currentUser;
  if (!user) throw new Error("Silakan login kembali.");
  const idToken = await user.getIdToken();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + idToken
    },
    body: JSON.stringify({ action: action, ...(payload || {}) })
  });
  return parseResponse(response);
}
async function getPublicData() {
  const response = await fetch(API_URL + "?action=get_public_data", { method: "GET", cache: "no-store" });
  return parseResponse(response);
}
async function loginStudent(kodeSiswa, password) {
  const credential = await signInWithEmailAndPassword(auth, alias("student", kodeSiswa), password);
  const token = await getIdTokenResult(credential.user, true);
  return {
    user: credential.user,
    claims: token.claims,
    mustChangePassword: token.claims.mustChangePassword === true
  };
}
async function loginTeacher(idGuru, password) {
  const credential = await signInWithEmailAndPassword(auth, alias("teacher", idGuru), password);
  const token = await getIdTokenResult(credential.user, true);
  const role = token.claims.role;
  if (role !== "teacher" && role !== "admin") {
    await signOut(auth);
    throw new Error("Akun ini tidak memiliki akses guru.");
  }
  return { user: credential.user, claims: token.claims };
}
async function loginParent(kodeSiswa, pin) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "parent_login", kode_siswa: normalizeCode(kodeSiswa), pin: String(pin || "").trim() })
  });
  const result = await parseResponse(response);
  const credential = await signInWithCustomToken(auth, result.customToken);
  const token = await getIdTokenResult(credential.user, true);
  return { user: credential.user, claims: token.claims };
}
async function getStudentData() {
  return api("student_get_data", {});
}
async function teacherGetAll() {
  return api("teacher_get_all", {});
}
async function changeCurrentPassword(oldPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("Silakan login kembali.");
  const credential = EmailAuthProvider.credential(user.email, oldPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
  try {
    await api("password_change_confirmed", {});
  } catch (error) {
    console.warn("Password changed, but account flags could not refresh.", error);
  }
}
async function logout() {
  await signOut(auth);
}
function onAuthChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

window.ICTFirebase = Object.freeze({
  app,
  auth,
  api,
  getPublicData,
  loginStudent,
  loginTeacher,
  loginParent,
  getStudentData,
  teacherGetAll,
  changeCurrentPassword,
  logout,
  onAuthChanged,
  API_URL
});
