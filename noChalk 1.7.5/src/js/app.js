/*  noCHalk
      by Fluffless
      app.js
*/
"use strict";
/* ================= misc wiring ================= */
$("#addSec").addEventListener("click", async () => {
  const r = await dialog({
    title: "New section",
    field: "",
    ph: "e.g. Chemistry — Class 8b",
    ok: "Add section",
    swatches: SEC_COLORS,
    color: SEC_COLORS[Math.floor(Math.random() * SEC_COLORS.length)],
  });
  if (r && r.name) {
    const s = await newSection(r.name, r.color, cur.nb.sections.length + 1);
    cur.nb.sections.push(s);
    await openSection(s);
    flushSave();
  }
});
$("#addPageBtn").addEventListener("click", async () => {
  const rec = blankPage();
  await putPage(rec);
  cur.sec.pages.push(stubOf(rec));
  renderPages();
  await openPage(rec.id);
  queueSave();
  setTimeout(() => titleEl.focus(), 50);
});
$("#paneBtn").addEventListener("click", () => document.body.classList.toggle("hide-pages"));
$("#paneBtn2").addEventListener("click", () => document.body.classList.toggle("hide-pages"));

/* ---- page-list button: parks in the topbar while the list is shown,
           moves into the toolbar (left of the Text button) while it is hidden ---- */
(function () {
  const btn = document.getElementById("paneBtn2");
  const slot = document.getElementById("paneSlot");
  const home = document.getElementById("paneHome");
  if (!btn || !slot || !home) return;
  const place = () => {
    const target = document.body.classList.contains("hide-pages") ? slot : home;
    if (btn.parentElement !== target) target.appendChild(btn);
  };
  place();
  new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ["class"] });
})();

/* ---- file session buttons: save, load, new ---- */
document.getElementById("saveBtn")?.addEventListener("click", () => saveDialogFlow());
document.getElementById("loadBtn")?.addEventListener("click", () => loadOtherNotebook());
document.getElementById("newNbBtn")?.addEventListener("click", () => createOtherNotebook());

$("#themeBtn").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
function setTheme(t) {
  state.ui.theme = t;
  state.ui.themed = 1;
  document.documentElement.dataset.theme = t;
  themeBtn.innerHTML = `<svg class="ic" style="width:17px;height:17px"><use href="#${t === "dark" ? "i-sun" : "i-moon"}"/></svg>`;
  queueSave();
}

modeSeg.querySelectorAll("button").forEach((b) =>
  b.addEventListener("click", () => {
    const m = b.dataset.mode;
    if (m !== mode) {
      setMode(m);
      return;
    }
    /* already active */
    if (m === "draw") {
      /* click-while-active toggles pen-only: fingers pan instead of draw */
      penOnly = !penOnly;
      state.ui.penOnly = penOnly;
      queueSave();
      if (typeof syncDrawIcon === "function") syncDrawIcon();
      toast(penOnly ? "Pen only — fingers pan instead of drawing" : "Fingers draw again");
    } else if (m === "shape") {
      setMode("select");
    }
  }),
);

addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "c") {
    if (isTyping()) {
      /* native text copy inside a box — our object clip is stale from now on */
      const sel = getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount && plane.contains(sel.anchorNode)) setClip(null);
      /* no preventDefault: the native copy proceeds */
    } else {
      e.preventDefault();
      doClipCopy();
    }
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "v" && clip) {
    /* only the caret case is intercepted here: the text of a copied box
       goes to the caret, its media to own boxes. Everything else is
       decided by the document paste handler in page.js */
    const ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains("cont") && ae.isConnected && clip.kind === "cont" && !clip.rec.ro) {
      e.preventDefault();
      doClipPaste();
    }
  }
});

$("#pagePasteBtn")?.addEventListener("click", () => pastePage());

addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePop();
    if (activeShape) {
      activeShape = null;
      shapesL.querySelectorAll(".sel").forEach((n) => n.classList.remove("sel"));
    }
  }
  if ((e.key === "Delete" || e.key === "Backspace") && activeShape) {
    const a = document.activeElement;
    if (!a || !(a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName))) {
      e.preventDefault();
      const sh = cur.pg.shapes.find((s) => s.id === activeShape);
      deleteShape(sh);
    }
  }
  if ((e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    saveAll();
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z" && !isTyping()) {
    e.preventDefault();
    if (e.shiftKey) doRedo();
    else doUndo();
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "y" && !isTyping()) {
    e.preventDefault();
    doRedo();
  }
});

/* ================= boot — wipe first, then open or create ================= */
(async function boot() {
  if (IS_ANDROID) {
    let granted = false;
    try {
      granted = await Platform.invoke("probe_storage");
    } catch (e) {}
    if (!granted)
      await dialog({
        title: "One-time setup",
        msg: "noChalk needs access to this board's files and your USB stick. Open Android Settings → Apps → noChalk → Permissions → All files access, allow it, then start noChalk again. (Once per board.)",
        ok: "OK",
      });
  }
  try {
    db = await openDB();
  } catch (e) {
    toast("Local storage is unavailable (private mode?) — file saving still works, but the session cache does not.", { dur: 10000 });
  }
  /* 2 · default state — the file (if opened) brings its own ui settings */
  state = seedState();
  state.ui = state.ui || {};
  applyUiDefaults();
  setTheme(state.ui.theme || "dark");
  renderPresets();
  renderSymFavs();
  statusPaint();
  syncPasteBtn();
  /* 3 · the prompt: open a notebook file or create a new one */
  await bootSession(); /* loads/creates, sets cur.nb/sec, opens first page, paints status */
})();

/* ---------- ui defaults (used when no file supplies settings) ---------- */
function applyUiDefaults() {
  /* eight prefilled pen presets: small/large black & white, four mid colors */
  if (!state.ui.penPresets || !state.ui.penPresets.length)
    state.ui.penPresets = [
      { c: "#201d1a", w: 1.2 },
      { c: "#201d1a", w: 4 },
      { c: "#ffffff", w: 1.2 },
      { c: "#ffffff", w: 4 },
      { c: "#b3271d", w: 2.4 },
      { c: "#1c56b0", w: 2.4 },
      { c: "#1f6b38", w: 2.4 },
      { c: "#c07a2a", w: 2.4 },
    ];
  /* eight prefilled marker presets: eight colors, size growing smallest → biggest */
  if (!state.ui.hlPresets || !state.ui.hlPresets.length)
    state.ui.hlPresets = [
      { c: "#f7dd4f", w: 6 },
      { c: "#b9e26a", w: 8 },
      { c: "#a9d6f2", w: 10 },
      { c: "#f3b3cf", w: 12 },
      { c: "#fde68a", w: 14 },
      { c: "#bbf7d0", w: 16 },
      { c: "#fbcfe8", w: 18 },
      { c: "#c9d7e8", w: 20 },
    ];
  if (!state.ui.coverPresets || !state.ui.coverPresets.length) state.ui.coverPresets = COVERS.map((c) => ({ c }));
  coverColor = state.ui.coverColor || COVERS[0];
  syncCovDot();
  if (state.ui.eraserIdx == null) state.ui.eraserIdx = state.ui.eraserMode === "point" ? 1 : 0;
  activePen = state.ui.penPresets[0];
  activeHl = state.ui.hlPresets[0];
  if (state.ui.penIdx != null && state.ui.penPresets && state.ui.penPresets[state.ui.penIdx]) activePen = state.ui.penPresets[state.ui.penIdx];
  if (state.ui.hlIdx != null && state.ui.hlPresets && state.ui.hlPresets[state.ui.hlIdx]) activeHl = state.ui.hlPresets[state.ui.hlIdx];
  snapBtn.classList.toggle("on", !!state.ui.snap);
  if (state.ui.barPinned === undefined) state.ui.barPinned = true;
  setBarPinned(!!state.ui.barPinned);
  if (state.ui.selStyle) setSelStyle(state.ui.selStyle, false);
  if (state.ui.setsqPos) setSq = state.ui.setsqPos;
  if (state.ui.compassPos) cmp = state.ui.compassPos;
  penOnly = !!state.ui.penOnly;
  syncDrawIcon();
}

/* ---------- file's ui section applied after load — the FULL set ---------- */
function applyUiState() {
  applyUiDefaults(); /* fills anything the file omits */
  setTheme(state.ui.theme || "dark");
  renderPresets();
  renderSymFavs();
  snapBtn.classList.toggle("on", !!state.ui.snap);
  if (state.ui.selStyle) setSelStyle(state.ui.selStyle, false);
  if (state.ui.setsqPos) setSq = state.ui.setsqPos;
  if (state.ui.compassPos) cmp = state.ui.compassPos;
  penOnly = !!state.ui.penOnly;
  /* cover colour + active presets follow the file */
  coverColor = state.ui.coverColor || COVERS[0];
  if (state.ui.penPresets && state.ui.penPresets.length) activePen = state.ui.penPresets[0];
  if (state.ui.hlPresets && state.ui.hlPresets.length) activeHl = state.ui.hlPresets[0];
  if (state.ui.penIdx != null && state.ui.penPresets && state.ui.penPresets[state.ui.penIdx]) activePen = state.ui.penPresets[state.ui.penIdx];
  if (state.ui.hlIdx != null && state.ui.hlPresets && state.ui.hlPresets[state.ui.hlIdx]) activeHl = state.ui.hlPresets[state.ui.hlIdx];
  statusPaint();
  syncDrawIcon();
}

document.getElementById("undoBtn")?.addEventListener("click", () => doUndo());

(function wireCloseSave() {
  if (!IS_TAURI || !window.__TAURI__ || !window.__TAURI__.window) return;
  const win = window.__TAURI__.window.getCurrentWindow();
  let closing = false;
  win.onCloseRequested(async (e) => {
    if (closing) return;
    e.preventDefault(); /* hold the window open… */
    closing = true;
    try {
      capturePage();
      await flushSave();
      await saveToFile(); /* …until the save has finished */
    } catch (err) {}
    try {
      await win.destroy(); /* now close for real */
    } catch (err) {}
  });
})();
