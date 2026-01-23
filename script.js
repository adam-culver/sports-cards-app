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

// NOTE: We no longer use tableHead/tableBody. Tabulator is mounted in index.html as:
//   <div id="cardsTable"></div>
const searchInput = document.getElementById("searchInput");
const exportBtn = document.getElementById("exportCsvBtn");

// ===============================
// STATE
// ===============================
let currentData = []; // array of objects for Tabulator

// ===============================
// HELPERS
// ===============================
function setStatus(msg, type = "info") {
  statusEl.textContent = msg || "";
  statusEl.dataset.type = type; // optional: style via CSS using [data-type]
}

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

/**
 * Google Visualization JSON comes back as: "google.visualization.Query.setResponse({...});"
 * This extracts the {...} safely.
 */
function parseGvizResponse(text) {
  // Find the first "{" and last "}" and parse what's inside.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Unexpected sheet response format.");
  return JSON.parse(text.substring(start, end + 1));
}

/**
 * Turns GViz table into array of objects:
 *  - columns: ["Card Type", "Athlete", ...]
 *  - rows: [{cardType: "...", athlete: "...", ...}, ...]
 */
function gvizToObjects(gviz) {
  const cols = (gviz.table?.cols || []).map((c) => (c.label || "").trim());
  const rows = gviz.table?.rows || [];

  // Build stable field keys that match Tabulator column fields if possible
  // Preferred mapping if your sheet uses these labels:
  // Card Type -> cardType, Athlete -> athlete, Sport -> sport, Year -> year, Low -> low, High -> high, Source -> source
  const normalizedKey = (label) =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join("");

  const labelToField = {};
  cols.forEach((label) => {
    labelToField[label] = normalizedKey(label);
  });

  const data = rows.map((r, idx) => {
    const cells = r.c || [];
    const obj = { id: idx };

    cols.forEach((label, i) => {
      const field = labelToField[label];
      const cell = cells[i];
      let val = cell ? cell.v : "";

      // Coerce known numeric-ish fields
      if (field === "year") val = val === "" ? "" : Number(val);
      if (field === "low" || field === "high") val = val === "" ? "" : Number(val);

      obj[field] = val;
    });

    return obj;
  });

  return { cols, labelToField, data };
}

/**
 * OPTIONAL: If your sheet labels don't match Tabulator fields,
 * map fallback fields into the ones Tabulator expects.
 */
function normalizeForTabulator(row) {
  // Tabulator columns in index.html expect:
  // cardType, athlete, sport, year, low, high, source
  // If your GViz normalized keys differ, update here.
  return {
    id: row.id,
    cardType: row.cardType ?? row.card ?? row.set ?? row.product ?? "",
    athlete: row.athlete ?? row.player ?? row.name ?? "",
    sport: row.sport ?? "",
    year: row.year ?? "",
    low: row.low ?? row.lowEnd ?? row.min ?? "",
    high: row.high ?? row.highEnd ?? row.max ?? "",
    source: row.source ?? row.market ?? "",
    // keep everything else too (doesn't hurt)
    ...row,
  };
}

// ===============================
// IMAGE → AI → SAVE → REFRESH
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

    // refresh results shortly after save
    setTimeout(loadSheet, 750);
  } catch (err) {
    setStatus("ERROR: " + (err?.message || String(err)), "error");
  } finally {
    uploadBtn.disabled = false;
  }
};

// ===============================
// LOAD GOOGLE SHEET → TABULATOR
// ===============================
async function loadSheet() {
  try {
    setStatus("Loading results from sheet...", "info");

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
    const res = await fetch(url);
    const text = await res.text();

    const gviz = parseGvizResponse(text);
    const { data } = gvizToObjects(gviz);

    // Normalize rows so Tabulator sees expected fields
    currentData = data.map(normalizeForTabulator);

    // Push to Tabulator (created in index.html as window.cardsTable)
    if (!window.cardsTable) {
      throw new Error("Tabulator table is not initialized. Check index.html script order.");
    }

    window.cardsTable.setData(currentData);

    // Populate Sport/Year filters (defined in index.html)
    if (typeof window.refreshFilterOptions === "function") {
      window.refreshFilterOptions(currentData);
    }

    // Apply current UI filters + update hint/export state (defined in index.html)
    if (typeof window.applyFilters === "function") {
      window.applyFilters();
    }

    // Enable export button if there is data
    if (exportBtn) exportBtn.disabled = currentData.length === 0;

    setStatus(currentData.length ? `Loaded ${currentData.length} row(s).` : "No rows found yet.", "success");
  } catch (err) {
    setStatus("ERROR loading sheet: " + (err?.message || String(err)), "error");
  }
}

// ===============================
// OPTIONAL: if you still want Search to work even without index.html wiring
// (index.html already wires searchInput -> window.applyFilters via addEventListener).
// Keeping this guard is harmless.
// ===============================
if (searchInput && typeof window.applyFilters === "function") {
  searchInput.addEventListener("input", window.applyFilters);
}

// ===============================
// INITIAL LOAD
// ===============================
loadSheet();
