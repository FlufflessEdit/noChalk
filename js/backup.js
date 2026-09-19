/*  noCHalk
      by Fluffless
      backups.js
*/
"use strict";
/* ================= notebook file build + legacy import ================= */

/* build the .noChalk zip for the current notebook — used by file save and save-a-copy */
async function fsBuildBlob() {
  await loadLib("jszip");
  await savePageNow();
  const zip = new JSZip();
  const nbx = JSON.parse(JSON.stringify(cur.nb));
  for (const s of nbx.sections) {
    for (let i = 0; i < s.pages.length; i++) {
      const st = s.pages[i];
      let rec = cur.pg && cur.pg.id === st.id ? cur.pg : await idbGet("pages", st.id);
      if (!rec) rec = st;
      s.pages[i] = JSON.parse(JSON.stringify(rec));
    }
  }
  const ids = new Set();
  for (const s of nbx.sections)
    for (const p of s.pages) {
      (p.html || "").replace(/data-asset="([^"]+)"/g, (m, id) => {
        ids.add(id);
        return m;
      });
      (p.conts || []).forEach((c) =>
        (c.html || "").replace(/data-asset="([^"]+)"/g, (m, id) => {
          ids.add(id);
          return m;
        }),
      );
    }
  const assets = {};
  for (const id of ids) {
    const a = await getAsset(id);
    if (!a) continue;
    assets[id] = { name: a.name, type: a.type, size: a.size };
    const comp = /^(image|video|audio)\//.test(a.type || "") || /\.pdf$/i.test(a.name || "") ? "STORE" : "DEFLATE";
    zip.file("assets/" + id, a.blob, { compression: comp });
  }
  /* settings ride in the file — the ui section is the whole session state */
  zip.file(
    "manifest.json",
    JSON.stringify({ app: "noChalk", version: 2, exportedAt: new Date().toISOString(), ui: state.ui, notebook: nbx, assets }),
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/* save a copy under a new name — the hand-a-file-to-a-colleague path */
async function saveCopy() {
  if (!cur.nb) return;
  const t = progToast("Packing “" + cur.nb.name + "”…");
  try {
    const blob = await fsBuildBlob();
    await saveNbBlob(blob, (cur.nb.name.replace(/[^\w\- ]+/g, "").trim() || "notebook") + ".noChalk");
    t.done("Copy saved — " + fmtSize(blob.size));
  } catch (e) {
    t.fail("Save failed: " + (e.message || "library could not load"));
  }
}
async function saveNbBlob(blob, name) {
  if (window.showSaveFilePicker) {
    try {
      const h = await showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "noChalk notebook", accept: { "application/octet-stream": [".noChalk"] } }],
      });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch (e) {
      if (e.name === "AbortError") return; /* fall through to download */
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/* legacy importer — used only when filesys.js's loadNotebookFile is unavailable
   (Firefox fallback). Imports into the session as the current notebook. */
async function importLnote(f) {
  const t = progToast("Reading notebook…");
  try {
    await loadLib("jszip");
    const zip = await JSZip.loadAsync(await f.arrayBuffer());
    const man = JSON.parse(await zip.file("manifest.json").async("string"));
    if (!man || !man.notebook) throw new Error("not a noChalk notebook file — no notebook in the archive");
    if (man.app && man.app !== "noChalk" && man.app !== "Chalkbook")
      console.warn("Notebook from a different app version:", man.app, "— importing anyway");
    const idmap = {};
    for (const [id, meta] of Object.entries(man.assets || {})) {
      const file = zip.file("assets/" + id);
      if (!file) continue;
      const blob = await file.async("blob");
      const nid = "a" + uid();
      await idbPut("assets", { id: nid, name: meta.name, type: meta.type, size: meta.size, blob });
      idmap[id] = nid;
    }
    const remap = (h) => (h || "").replace(/data-asset="([^"]+)"/g, (m, id) => (idmap[id] ? `data-asset="${idmap[id]}"` : m));
    const nb = man.notebook;
    nb.id = uid();
    for (const s of nb.sections) {
      s.id = uid();
      for (const p of s.pages) {
        p.id = uid();
        p.html = remap(p.html || "");
        (p.conts || []).forEach((c) => {
          c.id = uid();
          c.html = remap(c.html || "");
        });
        await putPage(p);
      }
      s.pages = s.pages.map(stubOf);
    }
    /* in the one-notebook session this *is* the session's notebook */
    state = { v: 1, ui: man.ui || {}, notebooks: [nb] };
    if (!state.ui.theme) state.ui.theme = "dark";
    cur.nb = nb;
    cur.sec = nb.sections[0];
    if (!cur.sec.pages.length) {
      const rec = blankPage();
      await putPage(rec);
      cur.sec.pages.push(stubOf(rec));
    }
    await idbPut("kv", state, "state");
    if (typeof applyUiState === "function") applyUiState();
    renderAll();
    await openPage(cur.sec.pages[0].id);
    statusSaved();
    t.done("Notebook “" + nb.name + "” loaded");
  } catch (e) {
    t.fail("Import failed: " + (e.message || "not a valid backup"));
  }
}
