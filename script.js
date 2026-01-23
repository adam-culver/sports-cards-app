// ===============================
// CONFIG — CHANGE THESE
// ===============================
const OPENAI_PROXY_URL = "https://script.google.com/macros/s/AKfycbzzI9GhYNVVg04QkGfUKY2KKqmjcEMNuc8Yc2-HyKvxX5c9qnyjIVr94y74rrc1p5A5/exec";
const SHEET_APPEND_URL = "https://script.google.com/macros/s/AKfycbzzI9GhYNVVg04QkGfUKY2KKqmjcEMNuc8Yc2-HyKvxX5c9qnyjIVr94y74rrc1p5A5/exec";
const SHEET_ID = "1SYM9bU00-EkKelZTiWis8xlsl46ByhDSxt7kDlLyenM";

// ===============================
// ELEMENTS
// ===============================
const uploadBtn = document.getElementById("uploadBtn");
const imageInput = document.getElementById("imageInput");
const statusEl = document.getElementById("status");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const searchInput = document.getElementById("searchInput");

// ===============================
// IMAGE → AI → CSV → SHEET
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

uploadBtn.onclick = async () => {
  const file = imageInput.files[0];
  if (!file) return alert("Select an image");

  statusEl.textContent = "Evaluating & saving...";

  const base64 = await fileToBase64(file);

  try {
    const res = await fetch(`${OPENAI_PROXY_URL}?action=ingest`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: base64
    });

    const text = await res.text();

    // Show errors directly
    if (!res.ok || text.startsWith("ERROR")) {
      statusEl.textContent = text;
      console.error(text);
      return;
    }

    statusEl.textContent = "Saved! Refreshing table...";
    setTimeout(loadSheet, 2000);

  } catch (err) {
    statusEl.textContent = `Fetch failed: ${err}`;
    console.error(err);
  }
};


// ===============================
// LOAD GOOGLE SHEET
// ===============================
let currentRows = [];
let currentColumns = [];
let sortDirection = 1;

async function loadSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
  const res = await fetch(url);
  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));

  currentColumns = json.table.cols.map(c => c.label);
  currentRows = json.table.rows.map(r => r.c.map(c => c ? c.v : ""));

  renderTable();
}

// ===============================
// RENDER TABLE
// ===============================
function renderTable() {
  tableHead.innerHTML = "";
  tableBody.innerHTML = "";

  const headerRow = document.createElement("tr");
  currentColumns.forEach((col, index) => {
    const th = document.createElement("th");
    th.textContent = col;
    th.onclick = () => sortTable(index);
    headerRow.appendChild(th);
  });
  tableHead.appendChild(headerRow);

  currentRows.forEach(row => {
    const tr = document.createElement("tr");
    row.forEach(cell => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });
}

// ===============================
// SORTING
// ===============================
function sortTable(colIndex) {
  sortDirection *= -1;

  currentRows.sort((a, b) => {
    if (a[colIndex] > b[colIndex]) return sortDirection;
    if (a[colIndex] < b[colIndex]) return -sortDirection;
    return 0;
  });

  renderTable();
}

// ===============================
// SEARCH / FILTER
// ===============================
searchInput.addEventListener("input", () => {
  const term = searchInput.value.toLowerCase();

  [...tableBody.rows].forEach(row => {
    row.style.display = row.innerText.toLowerCase().includes(term)
      ? ""
      : "none";
  });
});

// ===============================
// INITIAL LOAD
// ===============================
loadSheet();
