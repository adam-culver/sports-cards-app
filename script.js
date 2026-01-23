// ===============================
// CONFIG — CHANGE THESE
// ===============================
const OPENAI_PROXY_URL = "YOUR_APPS_SCRIPT_PROXY_URL";
const SHEET_APPEND_URL = "YOUR_APPS_SCRIPT_APPEND_URL";
const SHEET_ID = "https://docs.google.com/spreadsheets/d/1Z6JEC3_n5C2ODaYEngJmNqo7mPXThqpJeoSF6UBzIBg/edit#gid=0";

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
uploadBtn.onclick = async () => {
  const file = imageInput.files[0];
  if (!file) return alert("Select an image");

  statusEl.textContent = "Evaluating card...";

  const formData = new FormData();
  formData.append("image", file);

  // 1️⃣ AI evaluation
  const aiRes = await fetch(OPENAI_PROXY_URL, {
    method: "POST",
    body: formData
  });

  const csvRow = await aiRes.text();

  // 2️⃣ Append to Google Sheet
  await fetch(SHEET_APPEND_URL, {
    method: "POST",
    body: csvRow
  });

  statusEl.textContent = "Card added!";
  loadSheet();
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
