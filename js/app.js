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
document.getElementById("saveBtn")?.addEventListener("click", () => saveAll());
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

modeSeg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

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
});

/* ================= boot — wipe first, then open or create ================= */
(async function boot() {
  /* 1 · nothing of any previous session survives this line */
  await wipeIndexedDB();
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
  snapBtn.classList.toggle("on", !!state.ui.snap);
  if (state.ui.barPinned === undefined) state.ui.barPinned = true;
  setBarPinned(!!state.ui.barPinned);
  if (state.ui.selStyle) setSelStyle(state.ui.selStyle, false);
  if (state.ui.setsqPos) setSq = state.ui.setsqPos;
  if (state.ui.compassPos) cmp = state.ui.compassPos;
  penOnly = !!state.ui.penOnly;
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
  statusPaint();
}
