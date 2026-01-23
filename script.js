// ===============================
// CONFIG
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
const exportBtn = document.getElementById("exportCsvBtn");

// Optional (index.html already wires these)
const searchInput = document.getElementById("searchInput");

// ===============================
// STATE
// ===============================
let currentData = [];

// ===============================
// UI HELPERS
// ===============================
function setStatus(msg, type = "info") {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.dataset.type = type;
}

// ===============================
// FILE → BASE64
// ===============================
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===============================
// UPLOAD → INGEST → REFRESH
// ===============================
if (uploadBtn) {
  uploadBtn.onclick = async () => {
    const file = imageInput?.files?.[0];
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

      // refresh results after save
      setTimeout(loadSheet, 750);
    } catch (err) {
      setStatus("ERROR: " + (err?.message || String(err)), "error");
    } finally {
      uploadBtn.disabled = false;
    }
  };
}

// ===============================
// GVIZ PARSER (your original working method)
// ===============================
function parseGvizResponse(text) {
  // Expected format: google.visualization.Query.setResponse({...});
  // Your prior working code used substring(47).slice(0, -2)
  const payload = text.substring(47).slice(0, -2);

  // If auth/permissions ever returned HTML, this catches it
  const trimmed = (payload || "").trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(
      "Sheet fetch returned HTML (permissions/auth wall). Ensure the sheet is public via link or published."
    );
  }

  return JSON.parse(payload);
}

function safeFieldKey(label, idx) {
  const clean = (label || "").trim();
  if (!clean) return `col${idx + 1}`;
  return clean
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

function gvizToObjects(gviz) {
  const colsRaw = (gviz.table?.cols || []).map((c) => c.label || "");
  const rowsRaw = gviz.table?.rows || [];
  const fields = colsRaw.map((label, idx) => safeFieldKey(label, idx));

  const data = rowsRaw.map((r, rowIdx) => {
    const cells = r.c || [];
    const obj = { id: rowIdx };

    fields.forEach((field, i) => {
      const cell = cells[i];
      obj[field] = cell ? cell.v : "";
    });

    // try coercions
    if (obj.year !== "" && obj.year != null && !Number.isNaN(Number(obj.year))) obj.year = Number(obj.year);
    if (obj.low !== "" && obj.low != null && !Number.isNaN(Number(obj.low))) obj.low = Number(obj.low);
    if (obj.high !== "" && obj.high != null && !Number.isNaN(Number(obj.high))) obj.high = Number(obj.high);

    return obj;
  });

  return { data };
}

function normalizeForTabulator(row) {
  return {
    id: row.id,
    cardType: row.cardType ?? row.card ?? row.set ?? row.product ?? "",
    athlete: row.athlete ?? row.player ?? row.name ?? "",
    sport: row.sport ?? "",
    year: row.year ?? "",
    low: row.low ?? row.lowEnd ?? row.min ?? "",
    high: row.high ?? row.highEnd ?? row.max ?? "",
    source: row.source ?? row.market ?? "",
    ...row,
  };
}

// ===============================
// LOAD SHEET → TABULATOR
// ===============================
async function loadSheet() {
  console.log("[loadSheet] starting…");

  try {
    setStatus("Loading results from sheet...", "info");

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
    console.log("[loadSheet] fetching:", url);

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    console.log("[loadSheet] response head:", text.slice(0, 90));

    const gviz = parseGvizResponse(text);
    const { data } = gvizToObjects(gviz);

    currentData = data.map(normalizeForTabulator);

    // Ensure Tabulator exists (index.html should create window.cardsTable)
    if (!window.cardsTable) {
      throw new Error("Tabulator not initialized yet (window.cardsTable missing).");
    }

    await Promise.resolve(window.cardsTable.setData(currentData));

    if (typeof window.refreshFilterOptions === "function") {
      window.refreshFilterOptions(currentData);
    }
    if (typeof window.applyFilters === "function") {
      window.applyFilters();
    }

    if (exportBtn) exportBtn.disabled = currentData.length === 0;

    setStatus(
      currentData.length ? `Loaded ${currentData.length} row(s).` : "No rows found yet.",
      currentData.length ? "success" : "info"
    );

    console.log("[loadSheet] loaded rows:", currentData.length, "sample:", currentData[0]);
  } catch (err) {
    console.error("[loadSheet] error:", err);
    setStatus("ERROR loading sheet: " + (err?.message || String(err)), "error");
  }
}

// ===============================
// GUARANTEED INIT (wait for DOM + Tabulator)
// ===============================
function init() {
  console.log("[init] script running");

  // If Tabulator isn't ready yet, retry a few times (covers script-order/caching weirdness)
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;

    if (window.cardsTable) {
      clearInterval(timer);
      console.log("[init] Tabulator found, loading sheet…");
      loadSheet();
      return;
    }

    if (attempts >= 20) {
      clearInterval(timer);
      console.warn("[init] Tabulator not found after retries.");
      setStatus("ERROR: Table component didn’t initialize. Check index.html script order.", "error");
    }
  }, 100);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Optional: keep search wired even if index wiring changes
if (searchInput && typeof window.applyFilters === "function") {
  searchInput.addEventListener("input", window.applyFilters);
}
