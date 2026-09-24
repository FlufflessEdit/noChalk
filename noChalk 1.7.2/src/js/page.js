/*  noCHalk
      by Fluffless
      page.js
*/
"use strict";
/* ================= page core ================= */
function boxIsEmpty(w) {
  const c = w.querySelector(".cont");
  if (!c) return false;
  if (c.querySelector("img,video,.embed,.attach,table,hr,.mfrac,.msqrt")) return false;
  return !c.textContent.replace(/[\s\u00A0\u200B\uFEFF]/g, "");
}
function capturePage() {
  if (!cur.pg || domPageId !== cur.pg.id) return;
  cur.pg.title = titleEl.textContent.replace(/\s+/g, " ").trim();
  cur.pg.modified = Date.now();
  const conts = [];
  [...plane.querySelectorAll(".tbox"), ...mediaplane.querySelectorAll(".tbox")].forEach((w) => {
    if (!w.classList.contains("ro") && boxIsEmpty(w)) return;
    const rec = (cur.pg.conts || []).find((c) => c.id === w.dataset.cid);
    const inner = w.querySelector(".cont") || w.querySelector(".tbox-ro");
    let html = "";
    if (inner) {
      /* the clone is what gets saved — the live DOM keeps its blob/file srcs.
         data-asset survives, so hydrateAssets re-points everything on reopen */
      const c = inner.cloneNode(true);
      c.querySelectorAll("[data-hydr]").forEach((n) => n.removeAttribute("data-hydr"));
      c.querySelectorAll("[data-asset]").forEach((n) => {
        if (/^(IMG|VIDEO)$/.test(n.tagName)) n.removeAttribute("src");
        else if (n.tagName === "A") {
          n.removeAttribute("href");
          n.removeAttribute("download");
        }
      });
      c.querySelectorAll(".sel").forEach((n) => n.classList.remove("sel"));
      c.querySelectorAll("video[data-needlink]").forEach((n) => {
        n.removeAttribute("data-needlink");
        n.removeAttribute("title");
      });
      html = c.innerHTML;
    }
    const x = parseFloat(w.style.left),
      y = parseFloat(w.style.top),
      wd = parseFloat(w.style.width);
    const h = parseFloat(w.dataset.h);
    const isRo = w.classList.contains("ro");
    conts.push({
      fit: (rec && rec.fit) || undefined,
      id: w.dataset.cid || uid(),
      x: isFinite(x) ? Math.round(x) : (rec && rec.x) || 0,
      y: isFinite(y) ? Math.round(y) : (rec && rec.y) || 0,
      w: isFinite(wd) ? Math.round(wd) : (rec && rec.w) || (isRo ? DEFMEDIAW : DEFTEXTW),
      h: isFinite(h) ? Math.round(h) : (rec && rec.h) || null,
      ro: isRo,
      pinned: w.classList.contains("pinned"),
      html: rec && rec.runHtml ? "" : html,
      runHtml: (rec && rec.runHtml) || undefined,
    });
  });
  cur.pg.conts = conts;
  cur.pg.html = "";
  const st = curStub();
  if (st) {
    st.title = cur.pg.title;
    st.modified = cur.pg.modified;
    st.sn = snippetFromRec(cur.pg);
  }
}
async function savePageNow() {
  capturePage();
  if (cur.pg) await putPage(cur.pg);
}

async function openPage(id) {
  if (cur.pg && cur.pg.id === id && domPageId === id) return;
  const my = ++openSeq;
  await savePageNow();
  if (my !== openSeq) return;
  const stub = findStubAnywhere(id);
  let rec = stub ? await idbGet("pages", id) : null;
  if (my !== openSeq) return;
  if (!rec) {
    rec = blankPage();
    rec.id = id;
  }
  cur.pg = rec;
  domPageId = rec.id;
  activeCont = null;
  clearTapped();
  state.ui.cur = { nb: cur.nb.id, sec: cur.sec.id, pg: rec.id };
  if (!rec.size) rec.size = { w: 880, h: 1150 };
  titleEl.textContent = rec.title || "";
  pgMeta.textContent = "Created " + fmtDate(rec.created);
  urlCache.forEach((u) => URL.revokeObjectURL(u));
  urlCache.clear();
  roConts.disconnect();
  [...plane.querySelectorAll(".tbox"), ...mediaplane.querySelectorAll(".tbox")].forEach((d) => {
    roConts.unobserve(d);
    d.remove();
  });
  paintPage();
  if (!rec.conts) {
    rec.conts = rec.html ? [{ id: uid(), x: 56, y: pgHead.offsetHeight + 6, w: 768, html: rec.html }] : [];
    rec.html = "";
  }
  rec.conts.forEach((c) => {
    if (c.w == null) c.w = c.ro ? DEFMEDIAW : 768;
  });
  if (!rec.mig) {
    const off = pgHead.offsetHeight;
    if (off > 0) {
      rec.ink.forEach((s) => s.pts.forEach((p) => (p[1] += off)));
      rec.shapes.forEach((s) => (s.y += off));
    }
    rec.mig = 1;
  }
  rec.conts.forEach(renderBox);
  renderShapes();
  VP = { ...(rec.view || DEFVIEW) };
  clampView();
  if (typeof undoStack !== "undefined") {
    undoStack = []; /* undo never crosses a page switch — its records point at the old page */
    redoStack = [];
  }

  hideTblbar();
  sizePaper();
  sizeCanvas();
  applyView();
  renderPages();
  updateCoverBadge();
  requestAnimationFrame(() => {
    if (typeof reflowAnchoredCovers === "function") reflowAnchoredCovers();
  });
}

function mediaDirOf() {
  if (typeof nbFileRef === "undefined" || !nbFileRef || !nbFileRef.path) return null;
  return nbFileRef.path.replace(/[\\/][^\\/]+$/, "") + "/media";
}

/* absolute path of a linked asset; md already ends in /media, so a
   legacy "media/" prefix in rel must never be added on top */
function mediaAssetPath(rec) {
  const md = mediaDirOf();
  if (!md || !rec || !rec.rel) return null;
  return md + "/" + rec.rel.replace(/^media[\\/]/, "");
}

function paintPage() {
  /* the paper's background is painted by the under-plane canvas (redrawUnder);
     only the dark/light text flags live on the plane element */
  const st = cur.pg.style;
  plane.dataset.dark = lum(st.color) < 0.42 ? "1" : "0";
  redrawInk();
}
function lum(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex);
  if (!m) return 1;
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* ---- boxes ---- */
const roConts = new ResizeObserver((es) => {
  es.forEach((en) => {
    const t = en.target;
    if (t.classList && t.classList.contains("tbox")) growPaperTo(t.offsetLeft + t.offsetWidth + 140, t.offsetTop + t.offsetHeight + 180);
  });
});
function snapVal(v) {
  return Math.round(state.ui.snap ? Math.round(v / GS) * GS : v);
}
function boxHeight(w) {
  const inner = w.querySelector(".cont") || w.querySelector(".tbox-ro");
  if (!inner) return 200;
  return Math.max(40, Math.round(inner.getBoundingClientRect().height / VP.z));
}
function applyBoxSize(w, rec) {
  rec.w = rec.w || (rec.ro ? DEFMEDIAW : DEFTEXTW);
  w.style.width = rec.w + "px";
  if (rec.runHtml) {
    /* HTML boxes carry an explicit height — the iframe fills it, and the
       north/south edges resize it directly (no aspect lock) */
    const st = w.querySelector(".tbox-ro");
    const h = rec.h != null && isFinite(rec.h) && rec.h > 0 ? Math.round(rec.h) : 480;
    rec.h = h;
    w.dataset.h = h;
    if (st) st.style.height = h + "px";
    return;
  }
  if (!rec.ro && rec.h != null && rec.h > 0) {
    /* only text boxes may carry a stored height; ro boxes size from content */
    w.dataset.h = rec.h;
    const inner = w.querySelector(".cont");
    if (inner) inner.style.minHeight = rec.h + "px";
    w.style.height = "";
  } else {
    delete w.dataset.h;
    w.style.height = "";
    if (!rec.ro) {
      const inner = w.querySelector(".cont");
      if (inner) inner.style.minHeight = "";
    }
  }
}

function renderBox(rec) {
  const w = el("div", "tbox" + (rec.ro ? " ro" : "") + (rec.pinned ? " pinned" : ""));
  w.dataset.cid = rec.id;
  w.style.left = rec.x + "px";
  w.style.top = rec.y + "px";

  const grip = el("div", "cont-grip", '<svg class="ic" style="width:12px;height:12px"><use href="#i-hand"/></svg>');
  grip.title = "Drag to move this box";
  const pin = el("button", "tbx-pin" + (rec.pinned ? " on" : ""), '<svg class="ic" style="width:11px;height:11px"><use href="#i-pin"/></svg>');
  pin.title = "Pin to the background — locked in place so you can write over it";
  const cp = el("button", "tbx-copy", '<svg class="ic" style="width:11px;height:11px"><use href="#i-copy"/></svg>');
  cp.title = "Copy this box — Ctrl+V pastes it";
  cp.addEventListener("click", (ev) => {
    ev.stopPropagation();
    doClipCopyCont(rec);
  });
  const del = el("button", "tbx-x", "×");
  del.title = "Delete this box";
  if (rec.runHtml) {
    /* the HTML editor button lives only on HTML boxes */
    const ed = el("button", "tbx-edit", '<svg class="ic" style="width:11px;height:11px"><use href="#i-code"/></svg>');
    ed.title = "Edit the HTML of this box";
    ed.addEventListener("click", (ev) => {
      ev.stopPropagation();
      editRunHtml(rec, w);
    });
    w.append(ed);
  }
  if (rec.ro) {
    const inner = el("div", "tbox-ro");
    inner.innerHTML = rec.runHtml ? "" : rec.html || "";
    /* strip legacy inline sizes — media must obey the box, not its old pixels */
    inner.querySelectorAll("img,video").forEach((n) => {
      n.style.removeProperty("height");
      n.style.removeProperty("width");
      n.style.removeProperty("max-height");
      n.style.removeProperty("max-width");
    });
    w.append(inner);
    if (rec.runHtml) {
      requestAnimationFrame(() => makeRunHtmlLive(w, rec));
    }
  } else {
    const c = el("div", "cont");
    c.contentEditable = "true";
    c.spellcheck = false;
    c.innerHTML = rec.html || "<p><br></p>";
    w.append(c);
    c.addEventListener("focusin", () => {
      activeCont = c;
    });
  }
  ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((d) => {
    const hd = el("div", "tbx-h " + d);
    hd.addEventListener("pointerdown", (e2) => boxEdgeDown(e2, w, rec, d));
    w.append(hd);
  });
  w.append(grip, cp, pin, del);
  grip.addEventListener("pointerdown", (e) => boxGripDown(e, w, rec, grip));
  pin.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const box = pin.closest(".tbox");
    const nowPinned = !box.classList.contains("pinned"); /* the DOM is the truth */
    rec.pinned = nowPinned;
    box.classList.toggle("pinned", nowPinned);
    pin.classList.toggle("on", nowPinned);
    (nowPinned ? mediaplane : plane).append(w);
    savePageNow();
    queueSave();
    toast(nowPinned ? "Pinned to the background — write on it" : "Unpinned");
  });
  del.addEventListener("click", () => deleteBox(rec, w));
  applyBoxSize(w, rec);
  if (rec.ro) {
    const reMeasure = () => measureContentBox(rec, w);
    const im = w.querySelector("img"),
      vd = w.querySelector("video");
    if (im) im.addEventListener("load", reMeasure, { once: true });
    if (vd) vd.addEventListener("loadedmetadata", reMeasure, { once: true });
    requestAnimationFrame(reMeasure); /* HTML boxes have content immediately */
  }
  (rec.ro ? mediaplane : plane).append(w);
  roConts.observe(w);
  return w;
}

/* covers anchored to this box follow it live while it is dragged */
function followAnchoredCovers(cid) {
  if (typeof reflowAnchoredCovers !== "function") return;
  if ((cur.pg.shapes || []).some((s) => s.anchor && s.anchor.cid === cid)) reflowAnchoredCovers();
}

/* ---- undo for single-box geometry changes ---- */
function pushMoveUndo(w, rec, s0) {
  const s1 = { x: rec.x, y: rec.y, w: rec.w, h: rec.h };
  if (s1.x === s0.x && s1.y === s0.y && s1.w === s0.w && s1.h === s0.h) return;
  const apply = (s) => {
    rec.x = s.x;
    rec.y = s.y;
    rec.w = s.w;
    rec.h = s.h;
    w.style.left = rec.x + "px";
    w.style.top = rec.y + "px";
    applyBoxSize(w, rec);
    if (typeof reflowAnchoredCovers === "function") reflowAnchoredCovers();
    queueSave();
  };
  pushUndo(
    () => apply(s0),
    () => apply(s1),
  );
}

function boxEdgeDown(e, w, rec, dir) {
  if (mode === "hand" || rec.pinned) return;
  e.preventDefault();
  e.stopPropagation();
  const h = e.target;
  try {
    h.setPointerCapture(e.pointerId);
  } catch (err) {}
  const s0 = { x: rec.x, y: rec.y, w: rec.w, h: rec.h };
  const sx = e.clientX,
    sy = e.clientY;
  const ox = rec.x,
    oy = rec.y;
  const ow = rec.w || (rec.ro ? DEFMEDIAW : DEFTEXTW);
  const oh = rec.h || boxHeight(w);
  const minw = rec.ro ? 120 : 60;
  const mv = (e2) => {
    if (navGest) {
      up();
      return;
    }
    clickGuard = Date.now();
    const dx = (e2.clientX - sx) / VP.z,
      dy = (e2.clientY - sy) / VP.z;
    if (rec.ro && !rec.runHtml) {
      /* content boxes scale uniformly — the aspect never changes */
      const ratio = rec.ch && rec.cw ? rec.ch / rec.cw : 0.75;
      const sh0 = ow * ratio || boxHeight(w);
      let s = ow;
      if (dir === "n" || dir === "s") {
        const hNow = Math.max(40, Math.round(sh0 + dy * (dir === "n" ? -1 : 1)));
        s = Math.max(minw, Math.round(hNow / ratio));
      } else {
        s = Math.max(minw, Math.round(dir.indexOf("w") >= 0 ? ow - dx : ow + dx));
      }
      rec.w = s;
      if (dir.indexOf("w") >= 0) rec.x = Math.round(ox + (ow - rec.w));
      if (dir === "n") {
        const nh = ratio * rec.w;
        rec.y = Math.max(14, Math.round(oy + (sh0 - nh)));
      }
    } else {
      /* text boxes and HTML boxes: free geometry — HTML boxes carry their
         own height, so north/south edges change it directly */
      if (dir.indexOf("e") >= 0) rec.w = Math.max(minw, Math.round(ow + dx));
      if (dir.indexOf("w") >= 0) {
        const nw = Math.max(minw, Math.round(ow - dx));
        rec.x = Math.round(ox + (ow - nw));
        rec.w = nw;
      }
      if (dir.indexOf("s") >= 0) rec.h = Math.max(40, Math.round(oh + dy));
      if (dir.indexOf("n") >= 0) {
        const nh = Math.max(40, Math.round(oh - dy));
        rec.y = Math.max(14, Math.round(oy + (oh - nh)));
        rec.h = nh;
      }
      if (state.ui.snap) rec.w = Math.round(rec.w / GS) * GS;
    }
    rec.x = snapVal(rec.x);
    rec.y = snapVal(rec.y);
    w.style.left = rec.x + "px";
    w.style.top = rec.y + "px";
    applyBoxSize(w, rec);
    growPaperTo(rec.x + rec.w + 140, rec.y + (rec.h || boxHeight(w)) + 180);
    followAnchoredCovers(rec.id);
  };
  const up = () => {
    h.removeEventListener("pointermove", mv);
    h.removeEventListener("pointerup", up);
    h.removeEventListener("pointercancel", up);
    savePageNow();
    if (typeof reflowAnchoredCovers === "function") reflowAnchoredCovers();
    rec.fit = 0; /* manually resized — no more auto-fitting to content */
    pushMoveUndo(w, rec, s0);
    queueSave();
  };
  h.addEventListener("pointermove", mv);
  h.addEventListener("pointerup", up);
  h.addEventListener("pointercancel", up);
}
function boxGripDown(e, w, rec, grip) {
  if (mode === "hand" || rec.pinned) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    grip.setPointerCapture(e.pointerId);
  } catch (err) {}
  const s0 = { x: rec.x, y: rec.y, w: rec.w, h: rec.h };
  const sx = e.clientX,
    sy = e.clientY,
    ox = rec.x,
    oy = rec.y;
  const mv = (e2) => {
    clickGuard = Date.now();
    if (navGest) {
      up();
      return;
    }
    rec.x = snapVal(ox + (e2.clientX - sx) / VP.z);
    rec.y = snapVal(oy + (e2.clientY - sy) / VP.z);
    w.style.left = rec.x + "px";
    w.style.top = rec.y + "px";
    growPaperTo(rec.x + w.offsetWidth + 140, rec.y + w.offsetHeight + 180);
    followAnchoredCovers(rec.id);
  };
  const up = () => {
    grip.removeEventListener("pointermove", mv);
    grip.removeEventListener("pointerup", up);
    grip.removeEventListener("pointercancel", up);
    savePageNow();
    if (typeof reflowAnchoredCovers === "function") reflowAnchoredCovers();
    pushMoveUndo(w, rec, s0);
    queueSave();
  };
  grip.addEventListener("pointermove", mv);
  grip.addEventListener("pointerup", up);
  grip.addEventListener("pointercancel", up);
}
/* touch: drag a tapped (selected) media box — plain move, undoable */
function startBoxMoveDrag(e, box, rec) {
  e.preventDefault();
  e.stopPropagation();
  const id = e.pointerId,
    sx = e.clientX,
    sy = e.clientY,
    ox = rec.x,
    oy = rec.y;
  const s0 = { x: rec.x, y: rec.y, w: rec.w, h: rec.h };
  let started = false;
  try {
    box.setPointerCapture(id);
  } catch (err) {}
  const mv = (e2) => {
    if (e2.pointerId !== id) return;
    if (navGest) {
      up();
      return;
    }
    if (!started) {
      if (Math.hypot(e2.clientX - sx, e2.clientY - sy) < 8) return;
      started = true;
      clickGuard = Date.now();
    }
    rec.x = Math.round(ox + (e2.clientX - sx) / VP.z);
    rec.y = Math.round(oy + (e2.clientY - sy) / VP.z);
    box.style.left = rec.x + "px";
    box.style.top = rec.y + "px";
    growPaperTo(rec.x + box.offsetWidth + 140, rec.y + box.offsetHeight + 180);
    followAnchoredCovers(rec.id);
  };
  const up = () => {
    box.removeEventListener("pointermove", mv);
    box.removeEventListener("pointerup", up);
    box.removeEventListener("pointercancel", up);
    if (started) {
      savePageNow();
      if (typeof reflowAnchoredCovers === "function") reflowAnchoredCovers();
      pushMoveUndo(box, rec, s0);
      queueSave();
    }
  };
  box.addEventListener("pointermove", mv);
  box.addEventListener("pointerup", up);
  box.addEventListener("pointercancel", up);
}
function deleteBox(rec, w) {
  const editable = w.querySelector(".cont");
  const hasContent = !!rec.ro || !!w.querySelector(".embed,.attach,img,video,table") || (editable && editable.textContent.trim());
  const doDel = () => {
    const i = cur.pg.conts.findIndex((c) => c.id === rec.id);
    if (i >= 0) cur.pg.conts.splice(i, 1);
    roConts.unobserve(w);
    w.remove();
    queueSave();
    pushUndo(
      () => {
        cur.pg.conts.push(rec);
        renderBox(rec);
        queueSave();
      },
      () => {
        const j = cur.pg.conts.findIndex((c) => c.id === rec.id);
        if (j >= 0) cur.pg.conts.splice(j, 1);
        const el2 = plane.querySelector('.tbox[data-cid="' + rec.id + '"]') || mediaplane.querySelector('.tbox[data-cid="' + rec.id + '"]');
        if (el2) el2.remove();
        queueSave();
      },
    );
    toast("Box deleted");
  };
  if (hasContent)
    dialog({ title: "Delete this box?", msg: "It still has content — this cannot be undone.", ok: "Delete", danger: true }).then((ok) => {
      if (ok) doDel();
    });
  else doDel();
}
function createTextAt(wx, wy) {
  const rec = { id: uid(), x: Math.max(0, snapVal(wx)), y: Math.max(pgHead.offsetHeight, snapVal(wy)), w: DEFTEXTW, ro: false, html: "" };
  cur.pg.conts.push(rec);
  growPaperTo(rec.x + DEFTEXTW + 160, rec.y + 500);
  const w = renderBox(rec);
  w.dataset.fresh = Date.now(); /* grace period for the empty-box cleanup */
  queueSave();
  pushUndo(
    () => {
      const i = cur.pg.conts.findIndex((c) => c.id === rec.id);
      if (i >= 0) cur.pg.conts.splice(i, 1);
      w.remove();
      queueSave();
    },
    () => {
      cur.pg.conts.push(rec);
      renderBox(rec);
      queueSave();
    },
  );
  const c = w.querySelector(".cont");
  if (c) placeCaretStart(c);
  return w;
}
function placeCaretStart(c) {
  c.focus();
  const r = document.createRange();
  const first = c.firstChild;
  if (first && first.nodeType === 1) r.setStart(first, 0);
  else r.setStart(c, 0);
  r.collapse(true);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}
plane.addEventListener("focusout", () => {
  setTimeout(() => {
    if (!cur.pg || domPageId !== cur.pg.id) return;
    const now = Date.now();
    [...plane.querySelectorAll(".tbox:not(.ro)"), ...mediaplane.querySelectorAll(".tbox:not(.ro)")].forEach((w) => {
      if (w.contains(document.activeElement)) return;
      if (+w.dataset.fresh > now - 2500) return; /* just created — give touch a moment to seat the caret */
      if (!boxIsEmpty(w)) return;
      const i = cur.pg.conts.findIndex((c) => c.id === w.dataset.cid);
      if (i >= 0) cur.pg.conts.splice(i, 1);
      roConts.unobserve(w);
      w.remove();
      queueSave();
    });
  }, 250);
});
let holdCreate = null;

/* ================= touch: tap-to-select, move-when-selected ================= */
let tappedBox = null;
function setTapped(box) {
  clearTapped();
  tappedBox = box;
  box.classList.add("tapped");
}
function clearTapped() {
  if (tappedBox) {
    tappedBox.classList.remove("tapped");
    tappedBox = null;
  }
}
function scrollableUnder(e, box) {
  for (let n = e.target; n && n !== box; n = n.parentElement) {
    if (n.nodeType !== 1 || n.tagName === "IFRAME") continue;
    if (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY + " " + cs.overflowX)) return n;
    }
  }
  return null;
}
/* one finger in text mode: tap selects media boxes, second tap + drag moves
   them; text boxes take the caret on the first tap */
viewport.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType !== "touch" || mode !== "text" || navGest) return;
    if (e.target.closest("a,button,input,textarea,select,video,iframe,.cont-grip,.tbx-h,.tbx-copy,.tbx-edit,.tbx-pin,.tbx-x")) {
      clearTapped();
      return;
    }
    const box = e.target.closest(".tbox");
    if (!box || box.classList.contains("pinned") || !box.classList.contains("ro")) {
      clearTapped(); /* text boxes: the native caret lands on the first tap; empty paper: hold-create */
      return;
    }
    const rec = cur.pg && cur.pg.conts.find((c) => c.id === box.dataset.cid);
    if (!rec) return;
    if (box !== tappedBox) {
      /* first tap on a media box: select only — no move */
      e.preventDefault();
      e.stopPropagation();
      const done = () => {
        window.removeEventListener("pointerup", done, true);
        window.removeEventListener("pointercancel", done, true);
        setTapped(box);
      };
      window.addEventListener("pointerup", done, true);
      window.addEventListener("pointercancel", done, true);
      return;
    }
    if (scrollableUnder(e, box)) return; /* scrollable media still scrolls */
    startBoxMoveDrag(e, box, rec); /* second tap + drag moves it */
  },
  { capture: true },
);

/* ---- interactions belong to select mode: arriving at a box control or a
   cover from another mode switches there first, then the real handler runs.
   (Draw mode is exempt by design — the ink layer sits on top.) ---- */
viewport.addEventListener(
  "pointerdown",
  (e) => {
    if (mode === "select") return;
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".cont-grip, .tbx-h, .tbx-x, .tbx-pin, .tbx-copy, .tbx-edit, .cover, .ecap .cv")) setMode("select");
  },
  true,
);
/* empty paper hit-tests to the viewport itself now (#plane is click-through) */
viewport.addEventListener("pointerdown", (e) => {
  if (e.target !== viewport) return;
  if (mode !== "text") return;
  /* the first tap dismisses whatever is selected — the next one acts */
  const hadSel = !!(tappedBox || activeShape || (typeof selActive === "function" && selActive()));
  clearTapped();
  if (typeof clearSel === "function") clearSel();
  if (activeShape) {
    activeShape = null;
    shapesL.querySelectorAll(".cover.sel").forEach((n) => n.classList.remove("sel"));
  }
  if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("cont")) document.activeElement.blur();
  if (hadSel) return;
  if (Date.now() - clickGuard < 600) return;
  if (e.pointerType !== "touch" && e.button !== 0) return; /* mouse: left button only */
  if (!cur.pg) return;
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  if (wy < pgHead.offsetHeight - 8) return;
  if (wx < 0 || wy < 0 || wx > cur.pg.size.w || wy > cur.pg.size.h) return; /* on the paper itself, not the gray area around it */
  /* cancel this gesture's compatibility mouse events — on touch and pen they
     fire at RELEASE time, land on the non-focusable viewport, and blur the
     freshly focused box (that is what deleted it) */
  e.preventDefault();
  try {
    viewport.setPointerCapture(e.pointerId); /* events keep coming to us even if the finger drifts */
  } catch (err) {}
  const sx = e.clientX,
    sy = e.clientY;
  let made = null; /* the box this gesture created, if any */
  let moved = false;
  const rm = () => {
    window.removeEventListener("pointermove", mv, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
  };
  holdCreate = {
    t: setTimeout(() => {
      holdCreate = null;
      rm();
      made = createTextAt(wx, wy);
    }, 450),
  };

  const t0 = Date.now();
  const mv = (e2) => {
    if (Date.now() - t0 < 80) return; /* touch-down wobble grace */
    if (Math.hypot(e2.clientX - sx, e2.clientY - sy) > 14) {
      moved = true;
      if (holdCreate) {
        clearTimeout(holdCreate.t);
        holdCreate = null;
      }
      rm();
      clickGuard = Date.now(); /* one finger never navigates — two fingers do */
    }
  };
  const up = (ev) => {
    if (holdCreate) {
      clearTimeout(holdCreate.t);
      holdCreate = null;
    }
    rm();
    /* a plain tap on empty paper in text mode creates the box at once
       (pointercancel — e.g. a second finger — does not) */
    if (!made && ev.type === "pointerup" && !moved && mode === "text") made = createTextAt(wx, wy);
    /* the release is a real user gesture — re-seat the caret here, so the
       focus (and the on-screen keyboard) stick */
    if (made) {
      const c = made.querySelector(".cont");
      if (c) placeCaretStart(c);
    }
  };
  window.addEventListener("pointermove", mv, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
});

function cancelHoldCreate() {
  if (holdCreate) {
    clearTimeout(holdCreate.t);
    holdCreate = null;
  }
}
/* ---- ro-box dragstart: images must not turn into OS drags ---- */
viewport.addEventListener("dragstart", (e) => {
  if (e.target.closest(".tbox.ro") || e.target.tagName === "IMG") e.preventDefault();
});
/* ---- media interiors: scroll what scrolls, nothing else — boxes move via
   grip, edges, or the tap-then-drag flow, never by dragging the content ---- */
viewport.addEventListener("pointerdown", (e) => {
  const box = e.target.closest(".tbox.ro");
  if (!box || e.target.closest("a,button,input,textarea,select,video,.cont-grip,.tbx-h")) return;
  e.preventDefault();
  const id = e.pointerId,
    sx = e.clientX,
    sy = e.clientY;
  let sc = null,
    sTop = 0,
    sLeft = 0;
  for (let n = e.target; n && n !== box; n = n.parentElement) {
    if (n.nodeType !== 1 || n.tagName === "IFRAME") continue;
    if (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY + " " + cs.overflowX)) {
        sc = n;
        sTop = n.scrollTop;
        sLeft = n.scrollLeft;
        break;
      }
    }
  }
  let live = false;
  const mv = (e2) => {
    if (e2.pointerId !== id) return;
    if (navGest) {
      up();
      return;
    }
    if (!live) {
      if (Math.hypot(e2.clientX - sx, e2.clientY - sy) < 8) return;
      live = true;
      clickGuard = Date.now();
      if (!sc) {
        up(); /* nothing scrollable under the finger — the gesture ends; no one-finger panning */
        return;
      }
    }
    if (sc) {
      sc.scrollTop = sTop - (e2.clientY - sy);
      sc.scrollLeft = sLeft - (e2.clientX - sx);
      e2.preventDefault();
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", mv);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };
  window.addEventListener("pointermove", mv);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
});

/* ---- assets hydration ---- */
function assetURL(id, blob) {
  if (urlCache.has(id)) return urlCache.get(id);
  const u = URL.createObjectURL(blob);
  urlCache.set(id, u);
  return u;
}
/* shrink a fit-flagged media box to its content once the content is known */
function fitMediaBox(n) {
  const box = n.closest(".tbox");
  if (!box) return;
  const rec = cur.pg && cur.pg.conts.find((c) => c.id === box.dataset.cid);
  if (!rec || !rec.fit) return; /* only boxes flagged fit-on-import */
  const natW = n.naturalWidth || n.videoWidth || 0;
  if (!natW) return;
  const pad = n.closest(".embed") ? 2 : 0;
  const w = Math.min(natW, 768) + pad;
  if (Math.abs((rec.w || 0) - w) < 2) return;
  rec.w = Math.round(w);
  box.style.width = rec.w + "px";
  measureContentBox(rec, box);
  growPaperTo(rec.x + rec.w + 140, rec.y + (rec.h || box.offsetHeight) + 180);
  queueSave();
}
/* natural content size of a read-only box — measured once, stored on the rec */
function measureContentBox(rec, box) {
  if (!rec.ro) return;
  const inner = box.querySelector(".tbox-ro");
  if (!inner) return;
  const img = inner.querySelector("img"),
    vid = inner.querySelector("video");
  if (img && (img.naturalWidth || img.clientWidth)) {
    rec.cw = img.naturalWidth || img.clientWidth;
    rec.ch = img.naturalHeight || img.clientHeight;
  } else if (vid && (vid.videoWidth || vid.clientWidth)) {
    rec.cw = vid.videoWidth || vid.clientWidth;
    rec.ch = vid.videoHeight || vid.clientHeight;
  } else {
    /* HTML/pdf boxes: measure what's rendered */
    rec.cw = inner.scrollWidth || rec.w || 400;
    rec.ch = inner.scrollHeight || rec.w * 0.75 || 300;
  }
  if (!rec.cw || !rec.ch) {
    delete rec.cw;
    delete rec.ch;
  }
}
function hydrateAssets() {
  [...plane.querySelectorAll("[data-asset]"), ...mediaplane.querySelectorAll("[data-asset]")].forEach(async (n) => {
    if (n.dataset.hydr) return;
    n.dataset.hydr = "1";
    const rec = await getAsset(n.dataset.asset);
    if (!rec) {
      n.classList.add("asset-missing");
      return;
    }
    if (rec.ext === 2) {
      /* linked video: streams straight from the media folder on disk */
      const u = mediaAssetPath(rec) ? fileSrc(mediaAssetPath(rec)) : null;
      if (u) {
        if (n.tagName === "IMG" || n.tagName === "VIDEO") {
          n.src = u;
          if (n.tagName === "IMG") n.addEventListener("load", () => fitMediaBox(n), { once: true });
          else n.addEventListener("loadedmetadata", () => fitMediaBox(n), { once: true });
          return;
        }
        if (n.tagName === "A") {
          n.href = u;
          n.download = rec.name;
          return;
        }
      }
      n.classList.add("asset-missing");
      return;
    }
    const u = assetURL(rec.id, rec.blob);
    if (n.tagName === "IMG" || n.tagName === "VIDEO") {
      n.src = u;
      if (n.tagName === "IMG") n.addEventListener("load", () => fitMediaBox(n), { once: true });
      else n.addEventListener("loadedmetadata", () => fitMediaBox(n), { once: true });
    } else if (n.tagName === "A") {
      n.href = u;
      n.download = rec.name;
    }
  });
}
let hydrPend = false;
const hydrObs = new MutationObserver(() => {
  if (hydrPend) return;
  hydrPend = true;
  requestAnimationFrame(() => {
    hydrPend = false;
    if (plane.querySelector("[data-asset]:not([data-hydr])") || mediaplane.querySelector("[data-asset]:not([data-hydr])")) hydrateAssets();
  });
});
hydrObs.observe(plane, { childList: true, subtree: true });
hydrObs.observe(mediaplane, { childList: true, subtree: true });
viewport.addEventListener("click", (e) => {
  const a = e.target.closest("a.dl, a[data-asset]");
  if (a && a.href) {
    e.preventDefault();
    const u = document.createElement("a");
    u.href = a.href;
    u.download = a.download || "file";
    u.click();
  }
});
/* links open with Ctrl+click (or Cmd+click), like in Word;
       a plain click just places the caret */
viewport.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a || !a.href || a.classList.contains("dl") || a.hasAttribute("data-asset")) return;
  if (!(e.ctrlKey || e.metaKey)) return; /* plain click = caret, no navigation */
  const url = a.getAttribute("href") || "";
  if (!/^https?:/i.test(url)) return;
  e.preventDefault();
  window.open(url, "_blank", "noopener");
});

/* live HTML: sandboxed iframe — scripts run, but they cannot reach
   this page (no allow-same-origin), so pasted markup is contained */
/* live HTML: sandboxed iframe — scripts run, but they cannot reach
   this page (no allow-same-origin), so pasted markup is contained.
   A small bootstrap script inside answers scroll-position queries, so
   two-finger gestures can scroll the content and chain to the paper. */
function makeRunHtmlLive(w, rec) {
  const stage = w.querySelector(".tbox-ro");
  if (!stage || w.dataset.live === "1") return;
  w.dataset.live = "1";
  stage.innerHTML = "";
  const ifr = document.createElement("iframe");
  ifr.className = "runframe";
  ifr.style.width = "100%";
  ifr.style.height = "100%";
  ifr.style.border = "0";
  ifr.style.display = "block";
  ifr.style.background = "#fff";
  ifr.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
  ifr.setAttribute("scrolling", "yes");
  /* cross-origin: write via srcdoc — document.write needs same-origin access.
     The bootstrap listens for {nc:'scroll'} deltas, scrolls, and reports
     {nc:'scrollpos'} back so edge-chaining works from outside. */
  const boot =
    "<scr" +
    "ipt>(function(){" +
    "function rep(){parent.postMessage({nc:'scrollpos'," +
    "top:window.scrollY||document.documentElement.scrollTop||0," +
    "left:window.scrollX||document.documentElement.scrollLeft||0," +
    "height:Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)," +
    "client:document.documentElement.clientHeight},'*')}" +
    "addEventListener('message',function(ev){var d=ev.data;" +
    "if(!d||d.nc!=='scroll')return;" +
    "window.scrollBy(d.dx||0,d.dy||0);rep();},false);" +
    "addEventListener('load',rep,false);" +
    "rep();})()</scr" +
    "ipt>";
  ifr.srcdoc = boot + rec.runHtml;
  stage.append(ifr);
  stage.style.overflow = "hidden";
  /* the stage height is owned by applyBoxSize (rec.h, default 480) */
  if (!stage.style.height) stage.style.height = (rec.h || 480) + "px";
}
/* ================= object clipboard ================= */
let clip = null,
  clipT = null;

function syncPasteBtn() {
  if (document.getElementById("clipPasteBtn")) return;
  const b = el("button", "tb");
  b.id = "clipPasteBtn";
  b.title = "Paste — Ctrl+V";
  b.innerHTML = '<svg class="ic"><use href="#i-paste"/></svg>';
  b.addEventListener("click", () => doClipPaste());
  toolbar.append(b);
}
function setClip(c) {
  clip = c;
  clearTimeout(clipT);
  syncPasteBtn();
  if (c)
    clipT = setTimeout(() => {
      clip = null;
    }, 60000);
}
function doClipCopyCont(rec) {
  capturePage();
  const fresh = cur.pg.conts.find((c) => c.id === rec.id) || rec;
  setClip({ kind: "cont", rec: JSON.parse(JSON.stringify(fresh)) });
  toast("Box copied — Ctrl+V or the paste button");
}
function doClipCopy() {
  if (mode === "select" && typeof selActive === "function" && selActive()) {
    capturePage();
    const items = {
      conts: selBoxes
        .map((b) => cur.pg.conts.find((c) => c.id === b.rec.id))
        .filter(Boolean)
        .map((r) => JSON.parse(JSON.stringify(r))),
      covers: selCovers.map((c) => JSON.parse(JSON.stringify(c.sh))),
      strokes: selStrokes.map((t) => {
        const s = JSON.parse(JSON.stringify(t.s));
        delete s.bb;
        return { plane: t.plane, s };
      }),
    };
    if (!items.conts.length && !items.covers.length && !items.strokes.length) {
      toast("Nothing selected");
      return;
    }
    setClip({ kind: "sel", items });
    toast("Selection copied — Ctrl+V or the paste button");
    return;
  }
  if (activeShape) {
    const sh = cur.pg && cur.pg.shapes.find((s) => s.id === activeShape);
    if (sh) {
      setClip({ kind: "cover", sh: JSON.parse(JSON.stringify(sh)) });
      toast("Cover copied — Ctrl+V or the paste button");
      return;
    }
  }
  const ae = document.activeElement;
  const w = ae && ae.classList && ae.classList.contains("cont") ? ae.closest(".tbox") : null;
  if (w) {
    const rec = cur.pg.conts.find((c) => c.id === w.dataset.cid);
    if (rec) {
      doClipCopyCont(rec);
      return;
    }
  }
  toast("Nothing to copy — select something, or focus a box");
}
function pasteContObj(rec, off) {
  const r = JSON.parse(JSON.stringify(rec));
  r.id = uid();
  r.x = Math.max(0, Math.round((r.x || 0) + off));
  r.y = Math.max(0, Math.round((r.y || 0) + off));
  cur.pg.conts.push(r);
  renderBox(r);
  growPaperTo(r.x + r.w + 140, r.y + (r.h || 300) + 180);
  if (r.ro) hydrateAssets();
}
function pasteCoverObj(sh, off) {
  const s = JSON.parse(JSON.stringify(sh));
  s.id = uid();
  s.x = Math.max(0, Math.round((s.x || 0) + off));
  s.y = Math.max(0, Math.round((s.y || 0) + off));
  cur.pg.shapes.push(s);
  renderShapes();
}
function pasteStrokeObj(s0, plane, off) {
  const s = JSON.parse(JSON.stringify(s0));
  delete s.bb;
  s.pts = s.pts.map((p) => [p[0] + off, p[1] + off, p[2] || 0.5]);
  if (!cur.pg[plane]) cur.pg[plane] = [];
  cur.pg[plane].push(s);
  const en = { k: "add", strokes: [s], plane };
  if (typeof pushUndo === "function")
    pushUndo(
      () => revertEntry(en),
      () => applyEntry(en),
    );
  redrawInk();
}
function pasteTextAtCaret(rec, contEl) {
  /* text goes to the caret; every media element becomes its own box */
  const tpl = document.createElement("template");
  tpl.innerHTML = rec.html || "";
  const roots = new Set();
  tpl.content.querySelectorAll("img, video, .embed, .attach").forEach((n) => {
    roots.add(n.closest(".embed") || n);
  });
  roots.forEach((r) => r.remove());
  insHTML(tpl.innerHTML);
  const host = contEl.closest(".tbox");
  const hrec = host && cur.pg.conts.find((c) => c.id === host.dataset.cid);
  let bx = hrec ? hrec.x + (hrec.w || 300) + 30 : 40,
    by = hrec ? hrec.y : 80,
    i = 0;
  roots.forEach((r) => {
    const rec2 = { id: uid(), x: bx + i * 26, y: by + i * 26, w: DEFMEDIAW, ro: true, fit: 1, html: r.outerHTML };
    cur.pg.conts.push(rec2);
    renderBox(rec2);
    growPaperTo(rec2.x + rec2.w + 140, rec2.y + 700);
    i++;
  });
  if (roots.size) {
    hydrateAssets();
    toast(roots.size + (roots.size === 1 ? " media item" : " media items") + " pasted as own boxes");
  }
  queueSave();
}
async function doClipPaste() {
  if (!clip) return pasteFromSystem(); /* nothing internal — the button reads the OS clipboard */
  const ae = document.activeElement;
  const inCont = !!(ae && ae.classList && ae.classList.contains("cont") && ae.isConnected);
  if (inCont && clip.kind === "cont" && !clip.rec.ro) {
    pasteTextAtCaret(clip.rec, ae);
    setClip(clip); /* keep it — and restart the 60 s window */
    return;
  }
  const off = 26;
  if (clip.kind === "cont") pasteContObj(clip.rec, off);
  else if (clip.kind === "cover") pasteCoverObj(clip.sh, off);
  else if (clip.kind === "sel") {
    clip.items.conts.forEach((r) => pasteContObj(r, off));
    clip.items.covers.forEach((s) => pasteCoverObj(s, off));
    clip.items.strokes.forEach(({ s, plane }) => pasteStrokeObj(s, plane, off));
  }
  setClip(clip); /* keep it — and restart the 60 s window */
  queueSave();
  toast("Pasted");
}

/* ---- the button's system paste: read the OS clipboard once, paste what's there ---- */
async function pasteFromSystem() {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    toast("This browser can't read the clipboard — press Ctrl+V instead");
    return;
  }
  let items;
  try {
    items = await navigator.clipboard.read();
  } catch (e) {
    toast("Clipboard blocked — allow clipboard access (padlock in the address bar), or press Ctrl+V");
    return;
  }
  /* a copied picture becomes its own image box */
  for (const it of items) {
    const imgT = (it.types || []).find((t) => t.startsWith("image/"));
    if (imgT) {
      const f = new File([await it.getType(imgT)], "clipboard." + imgT.split("/")[1], { type: imgT });
      await importImage(f);
      return;
    }
  }
  let html = null,
    text = null;
  for (const it of items) {
    if (html == null && (it.types || []).includes("text/html")) html = await (await it.getType("text/html")).text();
    if (text == null && (it.types || []).includes("text/plain")) text = await (await it.getType("text/plain")).text();
  }
  if (!(html || (text || "").trim())) {
    toast("The clipboard holds nothing to paste");
    return;
  }
  const ae = document.activeElement;
  const inCont = !!(ae && ae.classList && ae.classList.contains("cont") && ae.isConnected);
  if (inCont) {
    /* caret in a box: insert right there, like Ctrl+V */
    let h = html ? sanitize(html) : esc(text).replace(/\r?\n/g, "<br>");
    h = await extractDataURIsToAssets(h);
    insHTML(h);
    queueSave();
    return;
  }
  pasteNativeAsBox(html, text);
}
/* ---- Ctrl+V with nothing focused: object clip, files, or plain/rich text ---- */
document.addEventListener("paste", (e) => {
  const ae = document.activeElement;
  const inCont = !!(ae && ae.classList && ae.classList.contains("cont") && ae.isConnected);
  if (inCont || isTyping()) return; /* in-box pasting is edit.js's ground */
  if (clip) {
    e.preventDefault();
    doClipPaste();
    return;
  }
  if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) {
    e.preventDefault();
    handleFiles([...e.clipboardData.files]);
    return;
  }
  const html = e.clipboardData && e.clipboardData.getData("text/html");
  const text = e.clipboardData && e.clipboardData.getData("text/plain");
  if (!(html || (text || "").trim())) return;
  e.preventDefault();
  pasteNativeAsBox(html, text);
});

function looksLikeHtml(t) {
  return /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<div[\s>]|<section[\s>]|<article[\s>]|<script[\s>]|<style[\s>]|<iframe[\s>]|<svg[\s>]|<table[\s>]|<form[\s>]|<p[\s>]|<h[1-6][\s>])/i.test(
    t || "",
  );
}
async function pasteNativeAsBox(html, text) {
  /* copied HTML source — the text itself is markup → live HTML box */
  if (looksLikeHtml(text)) {
    insertRunHtml(text);
    return;
  }
  let h;
  if (html) {
    h = sanitize(html);
    h = await extractDataURIsToAssets(h);
  } else {
    h = esc(text).replace(/\r?\n/g, "<br>");
  }
  const tpl = document.createElement("template");
  tpl.innerHTML = h;
  /* images copied inside this app arrive with blob: URLs — re-point
     them at their assets so they survive page switches and saves */
  const rev = new Map();
  urlCache.forEach((u, id) => rev.set(u, id));
  tpl.content.querySelectorAll("img,video").forEach((n) => {
    const id = rev.get(n.getAttribute("src") || "");
    if (id) {
      n.setAttribute("data-asset", id);
      n.removeAttribute("src");
    }
  });
  /* media elements become their own read-only boxes; the text keeps its own box */
  const media = [];
  const roots = new Set();
  tpl.content.querySelectorAll("img, video, .embed, .attach").forEach((n) => roots.add(n.closest(".embed") || n));
  roots.forEach((r) => {
    media.push(r.outerHTML);
    r.remove();
  });
  const wx = Math.max(24, (vpW / 2 - VP.x) / VP.z - 240),
    wy = Math.max(pgHead.offsetHeight, (vpH / 2 - VP.y) / VP.z - 60);
  if (tpl.innerHTML.trim()) {
    const rec = { id: uid(), x: snapVal(wx), y: snapVal(wy), w: 480, ro: false, html: tpl.innerHTML };
    cur.pg.conts.push(rec);
    const w = renderBox(rec);
    growPaperTo(rec.x + rec.w + 140, rec.y + 500);
    const c = w.querySelector(".cont");
    if (c) placeCaretStart(c);
  }
  media.forEach((mh, i) => {
    const rec2 = { id: uid(), x: snapVal(wx + 40 + i * 26), y: snapVal(wy + 40 + i * 26), w: DEFMEDIAW, ro: true, fit: 1, html: mh };
    cur.pg.conts.push(rec2);
    renderBox(rec2);
    growPaperTo(rec2.x + rec2.w + 140, rec2.y + 700);
  });
  if (media.length) hydrateAssets();
  queueSave();
  toast("Pasted as a new box" + (media.length ? " — media in its own boxes" : ""));
}
