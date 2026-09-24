/*  noCHalk
      by Fluffless
      filesys.js
*/
"use strict";

let nbFileRef = null; /* { path?, handle?, name } — whatever the picker returned */

async function clearSessionCache() {
  if (!db) return;
  await new Promise((res) => {
    const t = db.transaction(["pages", "assets"], "readwrite");
    t.objectStore("pages").clear();
    t.objectStore("assets").clear();
    t.oncomplete = t.onerror = t.onabort = res;
  });
}

/* ---------- startup: the wipe runs in app.js's boot BEFORE openDB; this only prompts ---------- */
async function bootSession() {
  await sessionPrompt();
}

/* ---------- the open-or-create prompt (modal — everything else dimmed) ---------- */
async function sessionPrompt() {
  if (!IS_TAURI && !window.showOpenFilePicker) {
    await sessionOpenLegacy();
    return;
  }
  const ov = el("div", "dlg-ov");
  ov.style.zIndex = "140";
  document.body.append(ov);
  const done = () => ov.remove();

  const n = el("div", "pop-preset");
  n.style.minWidth = "300px";
  n.append(el("div", "pop-h", "noChalk"));
  n.append(el("div", "pi-r", "Open a notebook file, or create a new one."));
  const row = el("div", "dlg-b");
  const open = el("button", "btn go", "Open notebook…");
  const create = el("button", "btn", "New notebook…");
  const tut = el("button", "btn", "Tutorial");
  row.append(create, open, tut);
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
  tut.onclick = () => {
    done();
    closePop();
    startTutorial();
  };
  openPop(document.body, n);
  if (popEl) {
    popEl.style.left = Math.round((innerWidth - 300) / 2) + "px";
    popEl.style.top = "30vh";
  }
}
async function startTutorial() {
  if (!cur.nb) {
    /* an in-memory scratch notebook — no file, no save dialog, nothing to lose */
    await clearSessionCache();
    state = seedState();
    state.notebooks = [{ id: uid(), name: "Tutorial", sections: [await newSection("My section", SEC_COLORS[0], 1)] }];
    cur.nb = state.notebooks[0];
    cur.sec = cur.nb.sections[0];
    nbFileRef = null;
    resetSaveWriter();
    await idbPut("kv", state, "state");
    renderAll();
    await openPage(cur.sec.pages[0].id);
    statusSaved();
  }
  if (typeof startTour === "function") startTour();
}
async function sessionOpen() {
  const ref = await Platform.pickOpen();
  if (ref && (ref.path || ref.handle)) return loadNotebookRef(ref);
  if (ref === null && !window.showOpenFilePicker && !IS_TAURI) return sessionOpenLegacy(); /* Firefox etc. */
  await sessionPrompt(); /* cancelled in the shell / Chromium */
}
async function sessionCreate() {
  let ref = null;
  if (IS_TAURI || window.showSaveFilePicker) {
    ref = await Platform.pickSave("notebook.noChalk");
    if (!ref) {
      await sessionPrompt(); /* cancelled — choose again */
      return;
    }
  }
  await clearSessionCache();
  state = seedState();
  state.notebooks = [
    { id: uid(), name: ref ? ref.name.replace(/\.noChalk$/i, "") : "My Notebook", sections: [await newSection("Section 1", SEC_COLORS[0], 1)] },
  ];
  state.ui = state.ui || {};
  if (typeof applyUiDefaults === "function") applyUiDefaults();
  cur.nb = state.notebooks[0];
  cur.sec = cur.nb.sections[0];
  nbFileRef = ref;
  resetSaveWriter();
  await idbPut("kv", state, "state");
  renderAll();
  await openPage(cur.sec.pages[0].id);
  statusSaved();
  await saveToFile(); /* links the file in the shell / Chromium; downloads elsewhere */
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
      await clearSessionCache();
      state = seedState();
      state.notebooks = [{ id: uid(), name: "My Notebook", sections: [await newSection("Section 1", SEC_COLORS[0], 1)] }];
      cur.nb = state.notebooks[0];
      cur.sec = cur.nb.sections[0];
      nbFileRef = null;
      await idbPut("kv", state, "state");
      renderAll();
      await openPage(cur.sec.pages[0].id);
      res();
    };
    inp.click();
  });
}

/* ---------- load a notebook file into a clean cache ---------- */
/* legacy + drag-drop entry: a File (and optionally a browser handle) becomes a ref */
async function loadNotebookFile(f, handle) {
  return loadNotebookRef(handle ? { handle, name: f.name } : { name: f.name, file: f });
}
async function loadNotebookRef(ref) {
  resetSaveWriter();
  nbFileRef = null; /* a failed load must not leave the old file linked */
  const t = progToast("Opening " + ref.name + "…");
  try {
    await clearSessionCache(); /* the previous notebook leaves the cache */
    if (!db) db = await openDB();
    const bytes = await Platform.readAll(ref);
    await loadLib("jszip");
    const zip = await JSZip.loadAsync(bytes);
    const manStr = await zip.file("manifest.json").async("string");
    const man = JSON.parse(manStr);
    if (!man || !man.notebook) throw new Error("not a noChalk notebook file");
    if (man.app && man.app !== "noChalk" && man.app !== "Chalkbook")
      console.warn("Notebook from a different app version:", man.app, "— loading anyway");

    /* assets keep their file ids — the save writer maps them straight back
       onto their bytes in the file, so the first save stays small */
    for (const [id, meta] of Object.entries(man.assets || {})) {
      const file = zip.file("assets/" + id);
      if (!file) {
        if (meta.ext === 2) await idbPut("assets", { id, name: meta.name, type: meta.type, size: meta.size, ext: 2, rel: meta.rel });
        continue;
      }
      const blob = await file.async("blob");
      await idbPut("assets", { id, name: meta.name, type: meta.type, size: meta.size, blob });
      t.set("Loading files… " + esc(meta.name));
    }

    /* pages and sections keep their ids too — no remapping anywhere */
    const nb = man.notebook;
    for (const s of nb.sections) {
      for (const p of s.pages) await putPage(p);
      s.pages = s.pages.map(stubOf);
    }
    state = { v: 1, ui: man.ui || {}, notebooks: [nb] };
    if (!state.ui.theme) state.ui.theme = "dark";
    nbFileRef = ref;
    cur.nb = nb;
    cur.sec = nb.sections[0];
    await idbPut("kv", state, "state");
    setTheme(state.ui.theme);
    applyUiState();
    renderAll();
    await openPage(cur.sec.pages[0].id);
    statusSaved();
    warmSaveWriter(bytes, man, manStr); /* first Ctrl+S now writes only the tail */
    t.done("“" + nb.name + "” loaded");
    if (typeof maybeAskOffload === "function") maybeAskOffload();
  } catch (e) {
    const msg = typeof e === "string" ? e : (e && e.message) || "";
    if (/central directory|corrupted zip/i.test(msg)) {
      const want = await dialog({
        title: "Damaged notebook",
        msg: "The file's index is broken — most likely a save that got interrupted while the app was closing. noChalk can scan it for the last complete state. Try?",
        ok: "Scan and recover",
      });
      if (want) {
        const ok = await attemptRecovery(ref, t);
        if (ok) {
          t.done("“" + cur.nb.name + "” recovered — Ctrl+S now rewrites the file cleanly");
          return;
        }
        await sessionPrompt();
        return;
      }
    }
    t.fail("Could not open " + ref.name + ": " + msg);
    await sessionPrompt();
  }
}

/* ---------- save: the file is the storage ---------- */
let saveChain = Promise.resolve();
function serializeSave(fn) {
  const run = saveChain.then(fn, fn);
  saveChain = run.then(
    () => {},
    () => {},
  );
  return run;
}
async function saveToFile() {
  if (!cur.nb) return false;
  return serializeSave(async () => {
    try {
      const ref = nbFileRef;
      if (ref && (ref.path || ref.handle)) {
        await saveNotebookToRef(ref);
        statusSaved();
        return true;
      }
      await Platform.writeFull({ name: cur.nb.name }, await fsBuildBlob());
      statusSaved();
      return true;
    } catch (e) {
      const msg = typeof e === "string" ? e : e && e.message ? e.message : "error";
      toast("Save failed: " + msg, { icon: "i-x" });
      return false;
    }
  });
}

/* ---------- the save button: three ways to save ---------- */
function saveOptionsDialog() {
  return new Promise((res) => {
    const ov = el("div", "dlg-ov"),
      card = el("div", "dlg");
    card.innerHTML = '<div class="dlg-t">Save</div><div class="dlg-m">“' + esc(nbFileRef.name) + "”</div>";
    const btns = el("div", "dlg-b");
    const mk = (label, val, go, tip) => {
      const b = el("button", "btn" + (go ? " go" : ""), label);
      if (tip) b.title = tip;
      b.onclick = () => {
        ov.remove();
        res(val);
      };
      btns.append(b);
    };
    mk(
      "Save a copy…",
      "copy",
      false,
      "Packs this notebook into a new .noChalk file — the original file stays untouched. The copy is the one to hand to a colleague.",
    );
    mk(
      "Save for sharing",
      "share",
      false,
      "Packs the notebook AND every offloaded video into one complete file — the file to give away or open on another computer.",
    );
    mk("Save", "save", true, "Writes your changes into this notebook's .noChalk file — Ctrl+S.");
    card.append(btns);
    ov.append(card);
    document.body.append(ov);
    ov.addEventListener("pointerdown", (e) => {
      if (e.target === ov) {
        ov.remove();
        res(null);
      }
    });
  });
}
async function saveDialogFlow() {
  await flushSave();
  if (!cur.nb) return false;
  if (!nbFileRef || !(nbFileRef.path || nbFileRef.handle)) return saveAll(); /* unfiled session */
  const r = await saveOptionsDialog();
  if (r === "save") return saveAll();
  if (r === "copy") return saveCopy();
  if (r === "share") return saveForSharing();
  return false;
}
async function saveForSharing() {
  const name = (cur.nb.name.replace(/[^\w\- ]+/g, "").trim() || "notebook") + "_forSharing";
  const ref = await Platform.pickSave(name + ".noChalk");
  if (!ref || !(ref.path || ref.handle)) return false;
  const t = progToast("Building the shareable file — packing linked videos…");
  try {
    await writeNotebookFull(ref, false, true);
    t.done("“" + name + ".noChalk” saved — everything inside, ready to hand over");
    return true;
  } catch (e) {
    t.fail("Save failed: " + (typeof e === "string" ? e : (e && e.message) || "error"));
    return false;
  }
}

/* ---------- Ctrl+S / save button ---------- */
async function saveAll() {
  await flushSave();
  const ok = await saveToFile();
  if (ok && nbFileRef) toast("Saved — " + nbFileRef.name);
  else if (ok) toast("Exported — save it over the old file to keep one copy");
  return ok;
}

/* ---------- close: silent safety net ---------- */
async function closeSession() {
  try {
    capturePage();
    await flushSave();
    await saveToFile();
  } catch (e) {}
}
addEventListener("beforeunload", () => {
  closeSession();
});

/* ---------- switching files: the only "switch" flow ---------- */
async function loadOtherNotebook() {
  if (!IS_TAURI && !window.showOpenFilePicker) {
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
  const ref = await Platform.pickOpen();
  if (ref && (ref.path || ref.handle)) await loadNotebookRef(ref);
  /* cancelled — stay on current */
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
  row.className = "strow" + (statusDirtySince && (Date.now() - statusDirtySince) / 60000 >= 5 ? " bad" : "");
  let t = row.querySelector(".st-t"),
    f = row.querySelector(".st-f");
  if (!t) {
    row.innerHTML = '<span class="st-t"></span><span class="st-f"></span><span id="stClock"></span>';
    t = row.querySelector(".st-t");
    f = row.querySelector(".st-f");
  }
  t.textContent = txt;
  f.textContent = nbFileRef ? nbFileRef.name : cur.nb ? cur.nb.name : "";
}
setInterval(statusPaint, 15000);

async function inflateRawBytes(u8) {
  const ab = await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
  return new Uint8Array(ab);
}
/* scan a damaged .noChalk for the last complete state and import it */
async function attemptRecovery(ref, t) {
  t.set("Scanning the damaged file…");
  await nextFrame();
  const u8 = await Platform.readAll(ref);
  if (!u8.length) {
    t.fail("The file is empty — nothing left to recover");
    return false;
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const dec = new TextDecoder();
  const ents = [];
  for (let i = 0; i + 30 <= u8.length; i++) {
    if (u8[i] !== 0x50 || u8[i + 1] !== 0x4b || u8[i + 2] !== 0x03 || u8[i + 3] !== 0x04) continue;
    const nlen = dv.getUint16(i + 26, true),
      elen = dv.getUint16(i + 28, true);
    if (i + 30 + nlen + elen > u8.length) continue;
    const csize = dv.getUint32(i + 18, true);
    const dataOff = i + 30 + nlen + elen;
    if (dataOff + csize > u8.length) continue;
    ents.push({ name: dec.decode(u8.subarray(i + 30, i + 30 + nlen)), method: dv.getUint16(i + 8, true), csize, off: dataOff });
  }
  let man = null;
  for (let k = ents.length - 1; k >= 0; k--) {
    const e = ents[k];
    if (e.name !== "manifest.json") continue;
    t.set("Trying a saved state…");
    try {
      const raw = e.method === 8 ? await inflateRawBytes(u8.subarray(e.off, e.off + e.csize)) : u8.subarray(e.off, e.off + e.csize);
      const m = JSON.parse(dec.decode(raw));
      if (m && m.notebook && m.notebook.sections) {
        man = m;
        break;
      }
    } catch (err) {}
  }
  if (!man) {
    t.fail("No complete state survived — recovery is not possible");
    return false;
  }
  const byName = new Map();
  ents.forEach((e) => byName.set(e.name, e)); /* later entries win — newest write */
  const idmap = {};
  for (const [id, meta] of Object.entries(man.assets || {})) {
    const e = byName.get("assets/" + id);
    if (!e) continue;
    let blob;
    if (e.method === 0) blob = new Blob([u8.subarray(e.off, e.off + e.csize)], { type: meta.type });
    else {
      t.set("Loading files… " + esc(meta.name));
      blob = new Blob([await inflateRawBytes(u8.subarray(e.off, e.off + e.csize))], { type: meta.type });
    }
    const nid = "a" + uid();
    await idbPut("assets", { id: nid, name: meta.name, type: meta.type, size: blob.size, blob });
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
  state = { v: 1, ui: man.ui || {}, notebooks: [nb] };
  if (!state.ui.theme) state.ui.theme = "dark";
  nbFileRef = ref;
  cur.nb = nb;
  cur.sec = nb.sections[0];
  await idbPut("kv", state, "state");
  setTheme(state.ui.theme);
  applyUiState();
  renderAll();
  await openPage(cur.sec.pages[0].id);
  statusSaved();
  return true;
}
