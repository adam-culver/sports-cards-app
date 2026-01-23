// ===============================
// CONFIG — CHANGE THESE
// ===============================
const OPENAI_PROXY_URL =
  "https://script.google.com/macros/s/AKfycbz0mQu6EYhZqIccIlbVskmM_32N3YaGiAwzRofG87eGqz4SQPC54up0FNMK3xXP87eI/exec";
const SHEET_ID = "1SYM9bU00-EkKelZTiWis8xlsl46ByhDSxt7kDlLyenM";

// ===============================
// ELEMENTS
// ===============================
const uploadBtn = document.getElementById("uploadBtn");
const imageInput = document.getElementById("imageInput");
const statusEl = document.getElementById("status");

const searchInput = document.getElementById("searchInput");
const exportBtn = document.getElementById("exportCsvBtn");

// ===============================
// STATE
// ===============================
let currentData = []; // array of objects for Tabulator

// ===============================
// UI HELPERS
// ===============================
function setStatus(msg, type = "info") {
  statusEl.textContent = msg || "";
  statusEl.dataset.type = type; // styled in CSS via [data-type]
}

// ===============================
// FILE → BASE64
// ===============================
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1]; // strip data:...;base64,
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===============================
// UPLOAD → AI INGEST → REFRESH
// ===============================
uploadBtn.onclick = async () => {
  const file = imageInput.files[0];
  if (!file) return alert("Select an image");

  uploadBtn.disabled = true;
  setStatus("Evaluating & saving...", "info");

  try {
    const base64 = await fileToBase64(file);

    const res = await fetch(`${OPENAI_PROXY_URL}?action=ingest`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: base64,
    });

    const text = await res.text();

    if (!res.ok || text.startsWith("ERROR")) {
      setStatus(text, "error");
      return;
    }

    setStatus(`Saved! ${text}`, "success");

    // Refresh results shortly after save
    setTimeout(loadSheet, 750);
  } catch (err) {
    setStatus("ERROR: " + (err?.message || String(err)), "error");
  } finally {
    uploadBtn.disabled = false;
  }
};

// =============================
