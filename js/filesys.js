/*  noCHalk
      by Fluffless
      filesys.js
*/
"use strict";
/* ================= file-based session — one notebook, one file, nothing persisted =================
   IndexedDB is a volatile session cache: wiped on startup, wiped on close,
   wiped before loading another file. The .noChalk file on disk is the only storage. */

let nbFileHandle = null; /* the linked file for this session */

/* ---------- wipe: no forensic residue — BOTH database names ---------- */
async function wipeIndexedDB() {
  const del = (name) =>
    new Promise((res) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => res();
    });
  /* close OUR connection first — otherwise the delete blocks forever
     and the reopen behind it never runs */
  if (db) {
    try {
      db.close();
    } catch (e) {}
    db = null;
  }
  await del("noChalk");
  await del("chalkbook");
  /* give the browser a beat to release the handles */
  await new Promise((r) => setTimeout(r, 50));
}

/* ---------- startup: the wipe runs in app.js's boot BEFORE openDB; this only prompts ---------- */
async function bootSession() {
  await sessionPrompt();
}

/* ---------- the open-or-create prompt (modal — everything else dimmed) ---------- */
async function sessionPrompt() {
  if (!window.showOpenFilePicker) {
    await sessionOpenLegacy();
    return;
  }
  const ov = el("div", "dlg-ov");
  ov.style.zIndex = "140"; /* below the prompt popover (150), above the app */
  document.body.append(ov);
  const done = () => ov.remove();

  const n = el("div", "pop-preset");
  n.style.minWidth = "300px";
  n.append(el("div", "pop-h", "noChalk"));
  n.append(el("div", "pi-r", "Open a notebook file, or create a new one."));
  const row = el("div", "dlg-b");
  const open = el("button", "btn go", "Open notebook…");
  const create = el("button", "btn", "New notebook…");
  row.append(create, open);
  n.append(row);
  open.onclick = () => {
    done();
    closePop();
    sessionOpen();
  };
  create.onclick = () => {
    done();
    closePop();
    sessionCreate();
  };
  openPop(document.body, n);
  if (popEl) {
    popEl.style.left = Math.round((innerWidth - 300) / 2) + "px";
    popEl.style.top = "30vh";
  }
}

async function sessionOpen() {
  try {
    const [h] = await showOpenFilePicker({
      types: [{ description: "noChalk notebook", accept: { "application/octet-stream": [".noChalk", ".chalkbook"] } }],
      multiple: false,
    });
    const f = await h.getFile();
    await loadNotebookFile(f, h);
  } catch (e) {
    /* cancelled — prompt again */
    await sessionPrompt();
  }
}
async function sessionCreate() {
  try {
    const h = await showSaveFilePicker({
      suggestedName: "notebook.noChalk",
      types: [{ description: "noChalk notebook", accept: { "application/octet-stream": [".noChalk"] } }],
    });
    state = seedState();
    state.notebooks = [{ id: uid(), name: h.name.replace(/\.noChalk$/i, ""), sections: [await newSection("Section 1", SEC_COLORS[0], 1)] }];
    state.ui = state.ui || {};
    if (typeof applyUiDefaults === "function") applyUiDefaults();
    cur.nb = state.notebooks[0];
    cur.sec = cur.nb.sections[0];
    nbFileHandle = h;
    await idbPut("kv", state, "state");
    renderAll();
    await openPage(cur.sec.pages[0].id);
    statusSaved();
    await saveToFile();
  } catch (e) {
    /* cancelled — prompt again */
    await sessionPrompt();
  }
}
async function sessionOpenLegacy() {
  return new Promise((res) => {
    const inp = el("input");
    inp.type = "file";
    inp.accept = ".noChalk,.chalkbook";
    inp.onchange = async () => {
      const fs = [...inp.files];
      if (fs.length) {
        await loadNotebookFile(fs[0], null);
        res();
        return;
      }
      /* cancelled with nothing — create empty, unfiled (legacy fallback) */
      state = seedState();
      state.notebooks = [{ id: uid(), name: "My Notebook", sections: [await newSection("Section 1", SEC_COLORS[0], 1)] }];
      cur.nb = state.notebooks[0];
      cur.sec = cur.nb.sections[0];
      nbFileHandle = null;
      await idbPut("kv", state, "state");
      renderAll();
      await openPage(cur.sec.pages[0].id);
      res();
    };
    inp.click();
  });
}

/* ---------- load a notebook file into a clean cache ---------- */
async function loadNotebookFile(f, handle) {
  const t = progToast("Opening " + f.name + "…");
  try {
    await wipeIndexedDB(); /* nothing of the previous session survives */
    db = await openDB();
    await loadLib("jszip");
    const zip = await JSZip.loadAsync(await f.arrayBuffer());
    const man = JSON.parse(await zip.file("manifest.json").async("string"));
    if (!man || !man.notebook) throw new Error("not a noChalk notebook file");
    if (man.app && man.app !== "noChalk" && man.app !== "Chalkbook")
      console.warn("Notebook from a different app version:", man.app, "— loading anyway");

    /* re-import asset blobs into the fresh cache, build the id remap */
    const idmap = {};
    for (const [id, meta] of Object.entries(man.assets || {})) {
      const file = zip.file("assets/" + id);
      if (!file) continue;
      const blob = await file.async("blob");
      const nid = "a" + uid();
      await idbPut("assets", { id: nid, name: meta.name, type: meta.type, size: meta.size, blob });
      idmap[id] = nid;
      t.set("Loading files… " + esc(meta.name));
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
    /* settings ride in the file */
    state = { v: 1, ui: man.ui || {}, notebooks: [nb] };
    if (!state.ui.theme) state.ui.theme = "dark";
    nbFileHandle = handle;
    cur.nb = nb;
    cur.sec = nb.sections[0];
    await idbPut("kv", state, "state");
    setTheme(state.ui.theme);
    applyUiState(); /* presets, snap etc. from the file's ui section */
    renderAll();
    await openPage(cur.sec.pages[0].id);
    statusSaved();
    t.done("“" + nb.name + "” loaded");
  } catch (e) {
    t.fail("Could not open " + f.name + ": " + (e.message || "error"));
    /* failed load leaves a wiped cache — restart the session cleanly */
    await sessionPrompt();
  }
}

/* ---------- save: the file is the storage ---------- */
async function saveToFile() {
  if (!cur.nb) return false;
  try {
    await savePageNow();
    const blob = await fsBuildBlob();
    if (nbFileHandle) {
      const w = await nbFileHandle.createWritable();
      await w.write(blob);
      await w.close();
      statusSaved();
      return true;
    }
    /* no handle (legacy session or drag-drop import): download */
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (cur.nb.name.replace(/[^\w\- ]+/g, "").trim() || "notebook") + ".noChalk";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    statusSaved();
    return true;
  } catch (e) {
    toast("Save failed: " + (e.message || "error"), { icon: "i-x" });
    return false;
  }
}

/* ---------- Ctrl+S / save button ---------- */
async function saveAll() {
  await flushSave();
  const ok = await saveToFile();
  if (ok && nbFileHandle) toast("Saved — " + nbFileHandle.name);
  else if (ok) toast("Saved as download — link the file via drag-drop reimport");
  return ok;
}

/* ---------- close: silent safety net + wipe ---------- */
async function closeSession() {
  try {
    capturePage();
    await flushSave();
    await saveToFile();
  } catch (e) {}
  await wipeIndexedDB();
}
addEventListener("beforeunload", () => {
  /* synchronous kick-off; the wipe is the privacy guarantee, the save is best-effort */
  closeSession();
});

/* ---------- switching files: the only "switch" flow ---------- */
async function loadOtherNotebook() {
  if (!window.showOpenFilePicker) {
    await sessionOpenLegacy();
    return;
  }
  if (dirty || statusUnsavedFor() > 0) {
    const save = await dialog({
      title: "Save current notebook?",
      msg: "The current notebook has unsaved changes. Save to its file before loading another?",
      ok: "Save",
    });
    if (save) await saveAll();
  }
  try {
    const [h] = await showOpenFilePicker({
      types: [{ description: "noChalk notebook", accept: { "application/octet-stream": [".noChalk", ".chalkbook"] } }],
      multiple: false,
    });
    const f = await h.getFile();
    await loadNotebookFile(f, h);
  } catch (e) {
    /* cancelled — stay on current */
  }
}
async function createOtherNotebook() {
  if (dirty || statusUnsavedFor() > 0) {
    const save = await dialog({
      title: "Save current notebook?",
      msg: "The current notebook has unsaved changes. Save to its file before creating a new one?",
      ok: "Save",
    });
    if (save) await saveAll();
  }
  await sessionCreate();
}

/* ---------- the status strip ---------- */
let statusDirtySince = null;
function statusTouch() {
  /* called from queueSave — marks unsaved */
  if (!statusDirtySince) statusDirtySince = Date.now();
  statusPaint();
}
function statusSaved() {
  statusDirtySince = null;
  statusPaint();
}
function statusUnsavedFor() {
  return statusDirtySince ? (Date.now() - statusDirtySince) / 1000 : 0;
}
function statusPaint() {
  const row = document.getElementById("statusRow");
  if (!row) return;
  let cls = "ok",
    txt = "everything saved";
  if (statusDirtySince) {
    const mins = (Date.now() - statusDirtySince) / 60000;
    if (mins >= 5) {
      cls = "bad";
      txt = "unsaved changes for more than 5 minutes!";
    } else {
      cls = "wait";
      txt = "unsaved changes";
    }
  }
  row.className = "strow " + cls;
  const fname = nbFileHandle ? nbFileHandle.name : cur.nb ? cur.nb.name : "";
  row.innerHTML = '<span class="st-t">' + txt + '</span><span class="st-f">' + esc(fname) + "</span>";
}
setInterval(statusPaint, 15000); /* the red state arrives even without edits */
