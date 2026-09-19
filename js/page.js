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
      html = c.innerHTML;
    }
    const x = parseFloat(w.style.left),
      y = parseFloat(w.style.top),
      wd = parseFloat(w.style.width);
    const h = parseFloat(w.dataset.h);
    const isRo = w.classList.contains("ro");
    conts.push({
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
  inkUndo = [];
  inkRedo = [];
  hideTblbar();
  sizePaper();
  sizeCanvas();
  applyView();
  renderPages();
  updateCoverBadge();
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
  if (rec.h != null && rec.h > 0) {
    w.dataset.h = rec.h;
    const inner = w.querySelector(".cont") || w.querySelector(".tbox-ro");
    if (inner) {
      if (inner.classList.contains("cont")) {
        inner.style.minHeight = rec.h + "px";
        w.style.height = "";
      } else {
        const only = inner.children.length === 1 ? inner.children[0] : null;
        if (only && only.tagName === "IMG") {
          only.style.height = rec.h + "px";
          only.style.width = "auto";
          only.style.maxWidth = "none";
          inner.style.height = "";
          inner.style.overflow = "";
          w.style.height = "";
        } else if (only && only.tagName === "VIDEO") {
          only.style.maxHeight = "none";
          only.style.height = rec.h + "px";
          inner.style.height = "";
          w.style.height = "";
        } else {
          w.style.height = rec.h + "px";
          inner.style.height = "100%";
          inner.style.overflow = "hidden";
        }
      }
    }
  } else {
    delete w.dataset.h;
    w.style.height = "";
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
  const del = el("button", "tbx-x", "×");

  del.title = "Delete this box";
  if (rec.ro) {
    const inner = el("div", "tbox-ro");
    inner.innerHTML = rec.runHtml ? "" : rec.html || "";
    w.append(inner);
    if (rec.runHtml) requestAnimationFrame(() => makeRunHtmlLive(w, rec));
  } else {
    const c = el("div", "cont");
    c.contentEditable = "true";
    c.spellcheck = true;
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
  w.append(grip, pin, del);
  grip.addEventListener("pointerdown", (e) => boxGripDown(e, w, rec, grip));
  pin.addEventListener("click", (ev) => {
    ev.stopPropagation();
    rec.pinned = !rec.pinned;
    w.classList.toggle("pinned", rec.pinned);
    pin.classList.toggle("on", rec.pinned);
    (rec.pinned ? mediaplane : plane).append(w);
    savePageNow();
    queueSave();
    toast(rec.pinned ? "Pinned to the background — write on it" : "Unpinned");
  });
  del.addEventListener("click", () => deleteBox(rec, w));
  applyBoxSize(w, rec);
  (rec.ro ? mediaplane : plane).append(w);
  roConts.observe(w);
  return w;
}
function boxGripDown(e, w, rec, grip) {
  if (mode === "hand" || rec.pinned) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    grip.setPointerCapture(e.pointerId);
  } catch (err) {}
  const sx = e.clientX,
    sy = e.clientY,
    ox = rec.x,
    oy = rec.y;
  const mv = (e2) => {
    clickGuard = Date.now();
    rec.x = snapVal(ox + (e2.clientX - sx) / VP.z);
    rec.y = snapVal(oy + (e2.clientY - sy) / VP.z);
    w.style.left = rec.x + "px";
    w.style.top = rec.y + "px";
    growPaperTo(rec.x + w.offsetWidth + 140, rec.y + w.offsetHeight + 180);
  };
  const up = () => {
    grip.removeEventListener("pointermove", mv);
    grip.removeEventListener("pointerup", up);
    grip.removeEventListener("pointercancel", up);
    savePageNow();
    queueSave();
  };
  grip.addEventListener("pointermove", mv);
  grip.addEventListener("pointerup", up);
  grip.addEventListener("pointercancel", up);
}
function boxEdgeDown(e, w, rec, dir) {
  if (mode === "hand" || rec.pinned) return;
  e.preventDefault();
  e.stopPropagation();
  const h = e.target;
  try {
    h.setPointerCapture(e.pointerId);
  } catch (err) {}
  const sx = e.clientX,
    sy = e.clientY;
  const ox = rec.x,
    oy = rec.y;
  const ow = rec.w || (rec.ro ? DEFMEDIAW : DEFTEXTW);
  const oh = rec.h || boxHeight(w);
  const minw = rec.ro ? 120 : 60;
  const mv = (e2) => {
    clickGuard = Date.now();
    const dx = (e2.clientX - sx) / VP.z,
      dy = (e2.clientY - sy) / VP.z;
    if (dir.indexOf("e") >= 0) rec.w = Math.max(minw, Math.round(ow + dx));
    if (dir.indexOf("w") >= 0) {
      const nw = Math.max(minw, Math.round(ow - dx));
      rec.x = Math.round(ox + (ow - nw));
      rec.w = nw;
    }
    if (dir.indexOf("s") >= 0) rec.h = Math.max(40, Math.round(oh + dy));
    if (dir.indexOf("n") >= 0) {
      const nh = Math.max(40, Math.round(oh - dy));
      rec.y = Math.round(oy + (oh - nh));
      rec.h = nh;
    }
    rec.x = snapVal(rec.x);
    rec.y = snapVal(rec.y);
    if (state.ui.snap && !rec.ro) rec.w = Math.round(rec.w / GS) * GS;
    w.style.left = rec.x + "px";
    w.style.top = rec.y + "px";
    applyBoxSize(w, rec);
    growPaperTo(rec.x + rec.w + 140, rec.y + (rec.h || boxHeight(w)) + 180);
  };
  const up = () => {
    h.removeEventListener("pointermove", mv);
    h.removeEventListener("pointerup", up);
    h.removeEventListener("pointercancel", up);
    savePageNow();
    queueSave();
  };
  h.addEventListener("pointermove", mv);
  h.addEventListener("pointerup", up);
  h.addEventListener("pointercancel", up);
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
    toast("Box deleted", {
      action: {
        label: "Undo",
        fn: () => {
          cur.pg.conts.push(rec);
          renderBox(rec);
          queueSave();
        },
      },
    });
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
/* empty paper hit-tests to the viewport itself now (#plane is click-through) */
viewport.addEventListener("pointerdown", (e) => {
  if (mode !== "text" || e.target !== viewport) return;
  if (Date.now() - clickGuard < 600) return;
  if (e.pointerType === "touch" && penOnly) return;
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
  const mv = (e2) => {
    if (holdCreate && Math.hypot(e2.clientX - sx, e2.clientY - sy) > 10) {
      clearTimeout(holdCreate.t);
      holdCreate = null;
      rm();
      if (e2.pointerType === "touch" || e.pointerType === "touch") {
        /* touch: drag pans the paper */
        startPan(e2, "hand");
      } else {
        panDrag = { id: e.pointerId, x: e2.clientX, y: e2.clientY, src: "hand" };
        document.body.classList.add("panning");
      }
      clickGuard = Date.now();
    }
  };
  const up = () => {
    if (holdCreate) {
      clearTimeout(holdCreate.t);
      holdCreate = null;
    }
    rm();
    /* the release is a real user gesture — re-seat the caret here, so the
       focus (and the on-screen keyboard) stick even when the 450 ms timer's
       focus() was refused or stolen */
    if (made) {
      const c = made.querySelector(".cont");
      if (c) placeCaretStart(c);
    }
  };
  window.addEventListener("pointermove", mv, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
});

/* ---- ro-box drag / dragstart / links: on the VIEWPORT, so events from
   both the plane and the mediaplane reach them ---- */
viewport.addEventListener("dragstart", (e) => {
  if (e.target.closest(".tbox.ro") || e.target.tagName === "IMG") e.preventDefault();
});
viewport.addEventListener("pointerdown", (e) => {
  if (mode === "hand") return;
  const box = e.target.closest(".tbox.ro");
  if (!box || e.target.closest("a") || box.classList.contains("pinned")) return;
  const rec = cur.pg.conts.find((c) => c.id === box.dataset.cid);
  if (!rec) return;
  const id = e.pointerId,
    sx = e.clientX,
    sy = e.clientY,
    ox = rec.x,
    oy = rec.y;
  let started = false;
  const mv = (e2) => {
    if (e2.pointerId !== id) return;
    if (!started) {
      if (Math.hypot(e2.clientX - sx, e2.clientY - sy) < 8) return;
      started = true;
      clickGuard = Date.now();
      try {
        box.setPointerCapture(id);
      } catch (err) {}
    }
    rec.x = ox + (e2.clientX - sx) / VP.z;
    rec.y = oy + (e2.clientY - sy) / VP.z;
    box.style.left = rec.x + "px";
    box.style.top = rec.y + "px";
    growPaperTo(rec.x + box.offsetWidth + 120, rec.y + box.offsetHeight + 160);
  };
  const up = () => {
    window.removeEventListener("pointermove", mv);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (started) {
      savePageNow();
      queueSave();
      const sup = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      box.addEventListener("click", sup, { capture: true, once: true });
      setTimeout(() => box.removeEventListener("click", sup, { capture: true, once: true }), 60);
    }
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
function hydrateAssets() {
  [...plane.querySelectorAll("[data-asset]"), ...mediaplane.querySelectorAll("[data-asset]")].forEach(async (n) => {
    if (n.dataset.hydr) return;
    n.dataset.hydr = "1";
    const rec = await getAsset(n.dataset.asset);
    if (!rec) {
      n.classList.add("asset-missing");
      return;
    }
    const u = assetURL(rec.id, rec.blob);
    if (n.tagName === "IMG" || n.tagName === "VIDEO") n.src = u;
    else if (n.tagName === "A") {
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
  /* cross-origin: write via srcdoc — document.write needs same-origin access */
  ifr.srcdoc = rec.runHtml;
  stage.append(ifr);
  stage.style.overflow = "hidden";
  /* no contentDocument access possible: the frame gets a sane default
     height; resize the box manually if the content is taller */
  if (!rec.h) {
    stage.style.height = "480px";
  }
}
