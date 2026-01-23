(() => {
  const OPENAI_PROXY_URL =
    "https://script.google.com/macros/s/AKfycbz0mQu6EYhZqIccIlbVskmM_32N3YaGiAwzRofG87eGqz4SQPC54up0FNMK3xXP87eI/exec";
  const SHEET_ID = "1SYM9bU00-EkKelZTiWis8xlsl46ByhDSxt7kDlLyenM";

  const uploadBtn = document.getElementById("uploadBtn");
  const imageInput = document.getElementById("imageInput");
  const statusEl = document.getElementById("status");
  const exportBtn = document.getElementById("exportCsvBtn");

  // Only show "Loaded X row(s)" after a user-initiated upload
  let showLoadCount = false;

  function setStatus(msg, type = "info") {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.dataset.type = type;
  }

  function clearStatus() {
    setStatus("", "info");
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      const file = imageInput?.files?.[0];
      if (!file) return alert("Select an image");

      uploadBtn.disabled = true;
      showLoadCount = true;
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

        setStatus("Saved. Refreshing results…", "success");
        setTimeout(() => loadSheet({ fromUpload: true }), 750);
      } catch (err) {
        setStatus("ERROR: " + (err?.message || String(err)), "error");
      } finally {
        uploadBtn.disabled = false;
      }
    });
  }

  function parseGvizResponse(text) {
    const payload = text.substring(47).slice(0, -2);
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

      if (obj.year !== "" && obj.year != null && !Number.isNaN(Number(obj.year))) obj.year = Number(obj.year);
      if (obj.lowPrice !== "" && obj.lowPrice != null && !Number.isNaN(Number(obj.lowPrice))) obj.lowPrice = Number(obj.lowPrice);
      if (obj.highPrice !== "" && obj.highPrice != null && !Number.isNaN(Number(obj.highPrice))) obj.highPrice = Number(obj.highPrice);
      if (obj.quantity !== "" && obj.quantity != null && !Number.isNaN(Number(obj.quantity))) obj.quantity = Number(obj.quantity);

      return obj;
    });

    return data;
  }

  function normalizeRow(row) {
    return {
      id: row.id,
      sport: row.sport ?? "",
      league: row.league ?? "",
      year: row.year ?? "",
      cardSet: row.cardSet ?? "",
      athlete: row.athlete ?? "",
      team: row.team ?? "",
      lowPrice: row.lowPrice ?? "",
      highPrice: row.highPrice ?? "",
      quantity: row.quantity ?? "",
      ...row,
    };
  }

  async function loadSheet({ fromUpload = false } = {}) {
    try {
      if (fromUpload) setStatus("Loading updated results…", "info");
      else clearStatus(); // silent on initial load

      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();

      const gviz = parseGvizResponse(text);
      const rows = gvizToObjects(gviz).map(normalizeRow);

      if (!window.cardsTable) {
        throw new Error("Table not initialized (window.cardsTable missing).");
      }

      await Promise.resolve(window.cardsTable.setData(rows));

      if (typeof window.applyAllFilters === "function") window.applyAllFilters();
      if (exportBtn) exportBtn.disabled = rows.length === 0;

      if (fromUpload && showLoadCount) {
        setStatus(`Loaded ${rows.length} row(s).`, "success");
        setTimeout(() => clearStatus(), 3000);
      }
    } catch (err) {
      console.error(err);
      setStatus("ERROR loading sheet: " + (err?.message || String(err)), "error");
    }
  }

  function init() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (window.cardsTable) {
        clearInterval(timer);
        loadSheet({ fromUpload: false }); // initial load: silent
        return;
      }
      if (attempts >= 30) {
        clearInterval(timer);
        setStatus("ERROR: table didn’t initialize. Check Tabulator script tag.", "error");
      }
    }, 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
