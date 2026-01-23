(() => {
  const SHEET_ID = "1SYM9bU00-EkKelZTiWis8xlsl46ByhDSxt7kDlLyenM";
  const API = "https://script.google.com/macros/s/AKfycbz0mQu6EYhZqIccIlbVskmM_32N3YaGiAwzRofG87eGqz4SQPC54up0FNMK3xXP87eI/exec";

  const uploadBtn=document.getElementById("uploadBtn");
  const imageInput=document.getElementById("imageInput");
  const status=document.getElementById("status");
  let uploaded=false;

  function setStatus(t){ status.textContent=t||""; }

  function b64(file){
    return new Promise(r=>{
      const fr=new FileReader();
      fr.onload=()=>r(fr.result.split(",")[1]);
      fr.readAsDataURL(file);
    });
  }

  uploadBtn.onclick=async()=>{
    if(!imageInput.files[0]) return alert("Select an image");
    uploaded=true;
    uploadBtn.disabled=true;
    setStatus("Evaluating & saving...");
    const res=await fetch(API+"?action=ingest",{method:"POST",body:await b64(imageInput.files[0])});
    if(!res.ok) return setStatus("Upload failed");
    setStatus("Saved. Refreshing…");
    setTimeout(loadSheet,800);
    uploadBtn.disabled=false;
  };

  async function loadSheet(){
    const r=await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`);
    const t=await r.text();
    const j=JSON.parse(t.substring(47).slice(0,-2));
    const cols=j.table.cols.map(c=>c.label);
    const rows=j.table.rows.map((r,i)=>{
      const o={id:i};
      r.c.forEach((c,idx)=>o[cols[idx].toLowerCase().replace(/\s+/g,"")]=c?c.v:"");
      return o;
    });
    cardsTable.setData(rows);
    applyAllFilters();
    if(uploaded) setStatus(`Loaded ${rows.length} row(s).`);
  }

  loadSheet();
})();
