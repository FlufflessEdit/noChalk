/*  noCHalk
      by Fluffless
      core.js
*/

"use strict";
/* ================= helpers ================= */
const $ = (s) => document.querySelector(s);
function el(t, c, h) {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (h != null) n.innerHTML = h;
  return n;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : b > 1024 ? Math.round(b / 1024) + " KB" : b + " B");
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
function selectIn(node) {
  const r = document.createRange();
  r.selectNodeContents(node);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

const CDN = {
  pdfjs: "lib/pdf.mini.js",
  pdfworker: "lib/pdf.worker.mini.js",
  mammoth: "lib/mammoth.browser.min.js",
  xlsx: "lib/xlsx.full.min.js",
  jszip: "lib/jszip.min.js",
};
const libLoaded = {};
function loadLib(k) {
  if (libLoaded[k]) return libLoaded[k];
  libLoaded[k] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = CDN[k];
    s.onload = res;
    s.onerror = () => {
      libLoaded[k] = null;
      rej(new Error("Could not load " + k));
    };
    document.head.appendChild(s);
  });
  return libLoaded[k];
}

/* ================= DOM refs ================= */
const titleEl = $("#title"),
  pgMeta = $("#pgMeta"),
  mediaplane = $("#mediaplane"),
  plane = $("#plane"),
  pgHead = $(".pg-head"),
  viewport = $("#viewport"),
  inkC = $("#ink"),
  inkCtx = inkC.getContext("2d"),
  shapesL = $("#shapes"),
  tabsRow = $("#tabsRow"),
  addSecBtn = $("#addSec"),
  pageList = $("#pageList"),
  toastBox = $("#toasts"),
  fileInput = $("#fileInput"),
  toolbar = $("#toolbar"),
  tblbar = $("#tblbar"),
  coverCountEl = $("#coverCount"),
  themeBtn = $("#themeBtn"),
  modeSeg = $("#modeSeg"),
  sizeIn = $("#sizeIn"),
  snapBtn = $("#snapBtn"),
  fsBtn = $("#fsBtn"),
  barBtn = $("#barBtn");

/* ================= constants ================= */
const SEC_COLORS = ["#b3492f", "#c07a2a", "#9a8b2d", "#4a7c46", "#2f7d74", "#31567f", "#5b6470", "#8a6d3b"];
const PAGECOLORS = [
  ["#faf5ea", "Cream"],
  ["#2b2f36", "Slate (dark)"],
  ["#191b1f", "Ink (dark)"],
  ["#2e3b31", "Chalkboard"],
];
const COVERS = ["#4e6cf2", "#f073ca", "#b3492f", "#3f7a3a", "#2f7d74", "#d0c046", "#3a3f47", "#f7f7f2"];
const TXCOLORS = ["#e2e2e2", "#262626", "#57534e", "#b3271d", "#c2610f", "#b58a00", "#2f6b34", "#0f766e", "#1c56b0", "#9d174d", "#7c4a21"];
const HLCOLORS = ["#296e66", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e5e7eb", "none"];
const SIZES = [10, 11, 12, 14, 16, 18, 21, 24, 30, 36, 48, 60, 72];
const ERASERS = [{ k: "line" }, { k: "point", r: 9 }, { k: "point", r: 20 }, { k: "point", r: 40 }];
const SYMS = [
  ["Math", ["≠", "≈", "±", "≤", "≥", "∞", "∝", "‰", "·", "÷", "∑", "∏", "∫", "ℝ", "ℕ", "ℤ", "ℚ"]],
  ["Arrows", ["→", "←", "↓", "↑", "↔", "⇒", "⇔", "↦", "⟶", "↷", "⇌", "«", "»"]],
  ["Chemistry", ["⁺", "⁻", "°", , "→Δ"]],
  ["Greek", ["α", "β", "γ", "δ", "ε", "θ", "λ", "μ", "π", "ρ", "σ", "φ", "ω", "Δ", "Ω", "Φ"]],
  ["Spanish", ["¿", "¡", "ñ", "Ñ", "á", "é", "í", "ó", "ú", "ü", "Á", "É", "Í", "Ó", "Ú", "Ü", "ª", "º"]],
  ["French", ["à", "â", "æ", "ç", "è", "ê", "ë", "î", "ï", "ô", "œ", "ù", "û", "ÿ"]],
  ["Sets & logic", ["∈", "∉", "⊂", "⊆", "∪", "∩", "∅", "∀", "∃", "¬", "∴", "∵"]],
];
const MINZ = 0.25,
  MAXZ = 4,
  DEFVIEW = { x: 24, y: 18, z: 1 },
  GS = 24;
const DEFTEXTW = 200,
  DEFMEDIAW = 768;
const TABSTEP = 48;

/* ================= state ================= */
let db = null,
  state = null,
  dirty = false,
  saveT = null;
let mode = "select",
  drawTool = "pen",
  penOnly = false,
  coverColor = COVERS[0];
let activePen = null,
  activeHl = null;
let cur = { nb: null, sec: null, pg: null };
let domPageId = null,
  activeCont = null,
  openSeq = 0;
let savedRange = null,
  drawing = null,
  erasing = false,
  activeShape = null,
  curTable = null,
  curCell = null;
let urlCache = new Map();
let clickGuard = 0;
let barPinned = false;

let VP = { x: DEFVIEW.x, y: DEFVIEW.y, z: 1 },
  vpW = 0,
  vpH = 0,
  dprNow = 1;
let viewPend = false;

const APP_VERSION = "1.7.5"; /* keep in sync with tauri.conf.json */

/* ================= global undo =================
   Every mutating gesture pushes {undo, redo}. Ctrl+Z / the undo button
   walks it — box moves, resizes, deletions, creations, covers, ink. */
let undoStack = [],
  redoStack = [];
function pushUndo(undo, redo) {
  undoStack.push({ undo, redo });
  if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
}
async function doUndo() {
  const e = undoStack.pop();
  if (!e) {
    toast("Nothing to undo");
    return;
  }
  try {
    await e.undo();
  } catch (err) {}
  redoStack.push(e);
}
async function doRedo() {
  const e = redoStack.pop();
  if (!e) {
    toast("Nothing to redo");
    return;
  }
  try {
    await e.redo();
  } catch (err) {}
  undoStack.push(e);
}

/* ================= IndexedDB — volatile session cache ================= */
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("noChalk", 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      if (!d.objectStoreNames.contains("assets")) d.createObjectStore("assets", { keyPath: "id" });
      if (!d.objectStoreNames.contains("pages")) d.createObjectStore("pages", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => {
      /* extremely unlikely now that wipe closes first; retry once after a beat */
      setTimeout(() => {
        const r2 = indexedDB.open("noChalk", 2);
        r2.onupgradeneeded = r.onupgradeneeded;
        r2.onsuccess = () => res(r2.result);
        r2.onerror = () => rej(r2.error);
      }, 250);
    };
  });
}
function idbPut(store, val, key) {
  return new Promise((res, rej) => {
    if (!db) return res();
    const t = db.transaction(store, "readwrite");
    key == null ? t.objectStore(store).put(val) : t.objectStore(store).put(val, key);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}
function idbGet(store, key) {
  return new Promise((res) => {
    if (!db) return res(undefined);
    const t = db.transaction(store, "readonly");
    const q = t.objectStore(store).get(key);
    q.onsuccess = () => res(q.result);
    q.onerror = () => res(undefined);
  });
}
function idbDel(store, key) {
  return new Promise((res) => {
    if (!db) return res();
    const t = db.transaction(store, "readwrite");
    t.objectStore(store).delete(key);
    t.oncomplete = res;
    t.onerror = res;
  });
}
async function addAsset(blob, name, type) {
  const id = "a" + uid();
  await idbPut("assets", { id, name: name || "file", type: type || blob.type || "application/octet-stream", size: blob.size, blob });
  return id;
}
function getAsset(id) {
  return idbGet("assets", id);
}
function putPage(rec) {
  return idbPut("pages", rec);
}

function queueSave() {
  dirty = true;
  if (typeof statusTouch === "function") statusTouch();
  clearTimeout(saveT);
  saveT = setTimeout(flushSave, 1100);
}
async function flushSave() {
  if (!db || !state || !dirty) return;
  try {
    capturePage();
    if (cur.pg) await putPage(cur.pg);
    await idbPut("kv", state, "state");
    dirty = false;
  } catch (e) {}
}
setInterval(() => {
  if (dirty) flushSave();
}, 12000);
addEventListener("beforeunload", () => {
  /* the close-save safety net lives in filesys.js's closeSession —
     this handler only flushes the volatile cache so the zip builder
     sees the newest page record */
  try {
    capturePage();
    flushSave();
  } catch (e) {}
});

addEventListener("pagehide", () => {
  /* iOS/Safari: pagehide is the close signal there — flush the cache best-effort */
  try {
    capturePage();
    flushSave();
  } catch (e) {}
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    flushSave();
    /* Android: pausing (home button, app switch) IS the close — write the
       file while we still have the process. saveToFile serializes via
       saveChain, so concurrent saves queue instead of colliding. */
    if (IS_ANDROID && typeof saveToFile === "function") saveToFile();
  }
});
