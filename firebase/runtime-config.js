// Runtime switch for the gradual Apps Script -> Firebase migration.
// Keep "legacy" until data import and Firebase deployment are verified.
// Change to "firebase" only when the Cloud Function endpoint is deployed.
window.ICT_RUNTIME_CONFIG = Object.freeze({
  backend: "legacy",
  apiUrl: "https://us-central1-monitoring-ict-smpit.cloudfunctions.net/api"
});
