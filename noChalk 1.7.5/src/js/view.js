/*  noCHalk
      by Fluffless
      view.js
*/
"use strict";
/* ================= infinite plane ================= */
function clampView() {
  VP.x = Math.min(VP.x, 60);
  VP.y = Math.min(VP.y, 60);
}
function setView() {
  if (!viewPend) {
    viewPend = true;
    requestAnimationFrame(() => {
      viewPend = false;
      applyView();
    });
  }
  setInkXform();
  if (typeof setInkXform === "function") setInkXform();
}

/* any stray scroll of the hidden viewport is reset instantly — the
   canvas position belongs to VP alone */
viewport.addEventListener("scroll", () => {
  viewport.scrollTop = 0;
  viewport.scrollLeft = 0;
});
viewport.addEventListener("focusin", () => {
  if (viewport.scrollTop || viewport.scrollLeft) {
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
  }
});

function applyView() {
  if (viewport.scrollTop || viewport.scrollLeft) {
    /* focus() and scrollIntoView scroll even overflow:hidden containers —
       that shifts the whole canvas; undo it */
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
  }
  plane.style.transform = `translate(${VP.x}px, ${VP.y}px) scale(${VP.z})`;
  mediaplane.style.transform = plane.style.transform;
  if (cur.pg) cur.pg.view = { x: Math.round(VP.x), y: Math.round(VP.y), z: VP.z };
  if (typeof redrawInk === "function") redrawInk();
  if (typeof positionCovers === "function") positionCovers();
  redrawInk();
  positionCovers();

  if (typeof positionSetSq === "function") positionSetSq();
  if (typeof positionCompass === "function") positionCompass();
  if (typeof positionSelUI === "function") positionSelUI();
}
function toWorld(cx, cy) {
  const r = viewport.getBoundingClientRect();
  return [(cx - r.left - VP.x) / VP.z, (cy - r.top - VP.y) / VP.z];
}
function zoomAt(sx, sy, f) {
  if (typeof cancelSelectDraft === "function") cancelSelectDraft();
  const nz = Math.min(MAXZ, Math.max(MINZ, VP.z * f));
  const wx = (sx - VP.x) / VP.z,
    wy = (sy - VP.y) / VP.z;
  VP.z = nz;
  VP.x = sx - wx * nz;
  VP.y = sy - wy * nz;
  clampView();
  setView();
}
function sizePaper() {
  const pg = cur.pg;
  if (!pg) return;
  plane.style.width = pg.size.w + "px";
  plane.style.minHeight = pg.size.h + "px";
}
function growPaperTo(wx, wy) {
  const pg = cur.pg;
  if (!pg) return;
  let ch = false;
  if (wx > pg.size.w - 160) {
    pg.size.w = Math.ceil((wx + 220) / 200) * 200;
    ch = true;
  }
  if (wy > pg.size.h - 160) {
    pg.size.h = Math.ceil((wy + 220) / 200) * 200;
    ch = true;
  }
  if (ch) {
    sizePaper();
    queueSave();
  }
}
function growFromView() {
  growPaperTo((vpW - VP.x) / VP.z, (vpH - VP.y) / VP.z);
}
function sizeCanvas() {
  dprNow = Math.min(devicePixelRatio || 1, 2);
  vpW = viewport.clientWidth;
  vpH = viewport.clientHeight;
  if (vpW < 2) return;
  const W = Math.round(vpW * dprNow),
    H = Math.round(vpH * dprNow);
  if (inkC.width !== W || inkC.height !== H) {
    inkC.width = W;
    inkC.height = H;
  }
  inkC.style.width = vpW + "px";
  inkC.style.height = vpH + "px";
  if (typeof redrawInk === "function") redrawInk();
}
function centerViewOn(node) {
  const r = node.getBoundingClientRect(),
    v = viewport.getBoundingClientRect();
  VP.x += v.left + v.width / 2 - (r.left + r.width / 2);
  VP.y += v.top + v.height / 2 - (r.top + r.height / 2);
  clampView();
  setView();
}

/* ================= navigation & touch gestures ================= */
let panDrag = null,
  gesture = null,
  spaceDown = false,
  touchPan = null;
const touches = new Map();
let touchGroup = null,
  last3Tap = 0;
let navGest = false; /* true while 2+ fingers navigate — all interactions stand down */
function isTyping() {
  const a = document.activeElement;
  return !!a && (a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName));
}
function cancelToolInput() {
  if (drawing) {
    drawing = null;
    redrawInk();
  }
  erasing = false;
  cancelDraft();
}
function startPan(e, src) {
  panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, src };
  document.body.classList.add("panning");
  if (typeof cancelSelectDraft === "function") cancelSelectDraft();
  if (typeof clearSel === "function") clearSel();
}
function endPan() {
  panDrag = null;
  document.body.classList.remove("panning");
}
function pinchdist() {
  const pts = [...touches.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
}

/* ---------- two-finger scroll chaining ---------- */
/* the deepest scrollable element under a point, inside an ro-box — or the
   iframe of a live HTML box, whose interior we cannot see from here */
function scrollTargetAt(x, y) {
  const n = document.elementFromPoint(x, y);
  if (!n || !n.closest) return null;
  const box = n.closest(".tbox.ro");
  if (!box) return null;
  if (n.tagName === "IFRAME") return { el: null, iframe: n };
  for (let el = n; el && el !== box; el = el.parentElement) {
    if (el.nodeType !== 1 || el.tagName === "IFRAME") continue;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY + " " + cs.overflowX)) return { el, iframe: null };
    }
  }
  return null;
}

function gestureFrame() {
  const pts = [...touches.values()];
  if (pts.length < 2) return;
  let cx = 0,
    cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  if (gesture.n !== pts.length) {
    /* a new finger count restarts the gesture: re-baseline everything,
       re-probe what sits under the midpoint — latched for the gesture */
    gesture.n = pts.length;
    gesture.d = pinchdist();
    gesture.d0 = pinchdist();
    gesture.zoomed = false;
    gesture.cx = cx;
    gesture.cy = cy;
    gesture.target = scrollTargetAt(cx, cy);
    gesture.paperOwns = !gesture.target;
    gesture.scrolled = false;
    gesture.lastDy = 0;
    gesture.lastDx = 0;
    gesture.edgeCheck = 0;
    return;
  }
  const dx = cx - gesture.cx,
    dy = cy - gesture.cy;
  gesture.cx = cx;
  gesture.cy = cy;

  /* ---- phase 1: an inner scroller consumes the gesture ---- */
  if (gesture.target && !gesture.paperOwns && !gesture.zoomed) {
    if (gesture.target.iframe) {
      /* live HTML box: forward the delta, it replies with its position;
         at its edge (or if it never scrolls), the paper takes over */
      gesture.lastDx = dx;
      gesture.lastDy = dy;
      gesture.scrolled = true;
      gesture.edgeCheck = 0; /* reset the no-reply countdown */
      gesture.target.iframe.contentWindow.postMessage({ nc: "scroll", dx, dy }, "*");
      return;
    }
    const sc = gesture.target.el;
    const atTop = sc.scrollTop <= 0;
    const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
    const atLeft = sc.scrollLeft <= 0;
    const atRight = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 1;
    const canY = (dy < 0 && !atBottom) || (dy > 0 && !atTop);
    const canX = (dx < 0 && !atRight) || (dx > 0 && !atLeft);
    if (canY || canX) {
      if (canY) sc.scrollTop -= dy;
      if (canX) sc.scrollLeft -= dx;
      gesture.scrolled = true;
      return;
    }
    gesture.paperOwns = true; /* latched: the scroller is at its edge */
  }

  /* ---- iframe watchdog: no position reply within ~10 frames (the
     content has no scroller / the script didn't run) → paper owns it ---- */
  if (gesture.target && gesture.target.iframe && !gesture.paperOwns && !gesture.zoomed) {
    gesture.edgeCheck++;
    if (gesture.edgeCheck > 10) gesture.paperOwns = true;
  }

  /* ---- phase 2: pinch zoom (60 px deadzone, re-baselined at the crossing) ---- */
  if (gesture.cx != null) {
    const d = pinchdist();
    if (!gesture.zoomed && Math.abs(d - gesture.d0) > 60) {
      gesture.zoomed = true;
      gesture.d = d; /* re-baseline — no jump */
    }
    let f = 1;
    if (gesture.zoomed && gesture.d > 10 && d > 10) f = Math.min(2.5, Math.max(0.4, d / gesture.d));
    const nz = Math.min(MAXZ, Math.max(MINZ, VP.z * f));
    const wx = (gesture.cx - VP.x) / VP.z,
      wy = (gesture.cy - VP.y) / VP.z;
    VP.z = nz;
    VP.x = cx - wx * nz;
    VP.y = cy - wy * nz;
    clampView();
    setView();
    growFromView();
    queueSave();
  }
  if (gesture.zoomed) gesture.d = pinchdist();

  /* ---- phase 3: paper pan (scroller absent, exhausted, or zoom active) ---- */
  if (gesture.paperOwns) {
    VP.x += dx;
    VP.y += dy;
    clampView();
    setView();
    growFromView();
    queueSave();
  }
}

/* live HTML boxes report their scroll position back; when the iframe is at
   its edge in the direction we are pushing, the gesture hands to the paper */
window.addEventListener("message", (ev) => {
  if (!gesture || !gesture.target || !gesture.target.iframe) return;
  const d = ev.data;
  if (!d || d.nc !== "scrollpos") return;
  gesture.edgeCheck = 0; /* it answered — alive */
  if (!gesture.scrolled || gesture.zoomed || gesture.paperOwns) return;
  const atTop = (d.top || 0) <= 0;
  const atBottom = (d.top || 0) + (d.client || 0) >= (d.height || 0) - 1;
  if ((gesture.lastDy > 0 && atTop) || (gesture.lastDy < 0 && atBottom)) gesture.paperOwns = true;
});

function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  modeSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.mode === m));
  closePop();
  if (typeof clearTapped === "function") clearTapped();
  if (m !== "select" && typeof clearSel === "function") clearSel();
  if (typeof cancelSelectDraft === "function") cancelSelectDraft(); /* kills marquee/lasso mid-drag */
  /* if (m !== "text") {
    try {
      getSelection().removeAllRanges();
    } catch (e) {}
  }*/
  setView();
}

/* pen intelligence: a pen is a drawing tool, always.
   Detection needs real contact (pressure/buttons) — some styluses
   report hover events as pen pointers, and those must not switch modes. */
let penSeen = false,
  touchDrew = false;
viewport.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType === "pen" && !penSeen && (e.pressure > 0 || e.buttons > 0)) {
      penSeen = true;
      if (mode !== "draw") setMode("draw");
      if (!penOnly) {
        penOnly = true;
        state.ui.penOnly = true;
        if (typeof syncDrawIcon === "function") syncDrawIcon();
        toast("Pen detected — drawing, pen only");
      }
    }
    if (e.pointerType === "touch" && penSeen) {
      penSeen = false;
      touchDrew = false;
    }
  },
  { capture: true },
);

function setDrawTool(t) {
  drawTool = t;
  if (t !== "pen" && typeof disarmShape === "function") disarmShape();
  $("#drawToolSeg")
    .querySelectorAll("button")
    .forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
  renderPresets();
  const pen = t === "pen";
  ["shapeRectBtn", "shapeEllipseBtn", "shapeTriBtn", "setSqBtn", "compassBtn"].forEach((id) => {
    const n = document.getElementById(id);
    if (n) n.style.display = pen ? "" : "none";
  });
  const sq = document.getElementById("setSqBtn");
  if (sq && setSqOn) sq.style.display = "";
  const cb = document.getElementById("compassBtn");
  if (cb && cmpOn) cb.style.display = "";
}
/* draw-tool wiring — ONCE, at load time. Clicking the already-active pen
   deselects an armed shape; every click switches the tool. */
$("#drawToolSeg")
  .querySelectorAll("button")
  .forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.tool === drawTool && b.dataset.tool === "pen" && typeof disarmShape === "function") disarmShape();
      setDrawTool(b.dataset.tool);
    }),
  );
let preEraseTool = "pen";
function toggleEraseTool() {
  if (mode !== "draw") setMode("draw");
  if (drawTool === "eraser") {
    setDrawTool(preEraseTool || "pen");
    toast("Back to " + (preEraseTool || "pen"));
  } else {
    preEraseTool = drawTool;
    setDrawTool("eraser");
    toast("Eraser — double-tap three fingers again to switch back");
  }
}
viewport.addEventListener("contextmenu", (e) => e.preventDefault());
viewport.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType === "touch") {
      const wasEmpty = touches.size === 0;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (wasEmpty) touchGroup = { t0: Date.now(), x: e.clientX, y: e.clientY, maxN: 1, moved: 0 };
      if (touchGroup) touchGroup.maxN = Math.max(touchGroup.maxN, touches.size);
      if (touches.size >= 5) {
        /* five fingers: copy/paste swipes — never navigation */
        touchGroup.five = true;
        if (touchGroup.fy0 == null) {
          let cy = 0;
          for (const p of touches.values()) cy += p.y;
          touchGroup.fy0 = cy / touches.size;
          touchGroup.fy = touchGroup.fy0;
        }
        touchPan = null;
        gesture = null;
        cancelToolInput();
        endPan();
        if (typeof cancelHoldCreate === "function") cancelHoldCreate();
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (touches.size >= 2) {
        /* two fingers own the screen: navigation only, everything else stands down */
        navGest = true;
        touchPan = null;
        cancelToolInput();
        if (typeof cancelHoldCreate === "function") cancelHoldCreate();
        if (typeof cancelSelectDraft === "function") cancelSelectDraft();
        endPan();
        if (!gesture) gesture = {};
        gestureFrame();
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (gesture) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (penOnly) {
        e.preventDefault(); /* finger is inert in pen-only: it neither draws nor pans */
        return;
      }
    }
    if (e.pointerType === "mouse" && (e.buttons === 3 || e.button === 1)) {
      cancelToolInput();
      startPan(e, e.button === 1 ? "middle" : "both");
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (spaceDown || mode === "hand") {
      startPan(e, "hand");
      e.stopPropagation();
      e.preventDefault();
      return;
    }
  },
  { capture: true },
);
viewport.addEventListener(
  "pointermove",
  (e) => {
    if (e.pointerType === "touch" && touches.has(e.pointerId)) {
      const t = touches.get(e.pointerId);
      t.x = e.clientX;
      t.y = e.clientY;
      if (touchGroup) touchGroup.moved = Math.max(touchGroup.moved, Math.hypot(e.clientX - touchGroup.x, e.clientY - touchGroup.y));
    }
    if (touchGroup && touchGroup.five) {
      /* five fingers down: track the group's vertical travel only */
      if (touches.size >= 2) {
        let cy = 0;
        for (const p of touches.values()) cy += p.y;
        touchGroup.fy = cy / touches.size;
      }
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    if (gesture) {
      gestureFrame();
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (panDrag) {
      if (panDrag.src === "both" && (e.buttons & 3) !== 3) {
        endPan();
        return;
      }
      if (panDrag.src === "middle" && (e.buttons & 4) === 0) {
        endPan();
        return;
      }
      if (e.pointerId === panDrag.id || panDrag.src === "both" || panDrag.src === "middle") {
        const dx = e.clientX - panDrag.x,
          dy = e.clientY - panDrag.y;
        panDrag.x = e.clientX;
        panDrag.y = e.clientY;
        clickGuard = Date.now();
        VP.x += dx;
        VP.y += dy;
        clampView();
        setView();
        growFromView();
        queueSave();
        e.stopPropagation();
        e.preventDefault();
        return;
      }
    }
  },
  { capture: true },
);
function vpUp(e) {
  if (e.pointerType === "touch" && touches.has(e.pointerId)) {
    touches.delete(e.pointerId);

    if (touches.size === 1 && gesture) {
      gesture = null;
      const id = [...touches.keys()][0],
        p = touches.get(id);
      panDrag = { id, x: p.x, y: p.y, src: "hand" };
      document.body.classList.add("panning");
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (touches.size === 0) {
      navGest = false;
      gesture = null;
      const g = touchGroup;
      touchGroup = null;
      if (g && g.five && g.fy0 != null) {
        /* five-finger swipe: up = copy, down = paste */
        const dy = (g.fy != null ? g.fy : g.fy0) - g.fy0;
        if (dy < -60 && typeof doClipCopy === "function") doClipCopy();
        else if (dy > 60 && typeof doClipPaste === "function") doClipPaste();
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (g && g.maxN >= 3 && Date.now() - g.t0 < 350 && g.moved < 30) {
        if (Date.now() - last3Tap < 450) {
          toggleEraseTool();
          last3Tap = 0;
        } else last3Tap = Date.now();
      }
      e.stopPropagation();
      e.preventDefault();
      return;
    }
  }
  if (gesture) {
    gestureFrame();
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  if (panDrag && (e.pointerId === panDrag.id || panDrag.src === "both" || panDrag.src === "middle")) {
    endPan();
    e.stopPropagation();
    return;
  }
}
viewport.addEventListener("pointerup", vpUp, { capture: true });
viewport.addEventListener("pointercancel", vpUp, { capture: true });

viewport.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (typeof cancelSelectDraft === "function") cancelSelectDraft();
    let dx = e.deltaX,
      dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 33;
      dy *= 33;
    }
    /* scrollable media content scrolls itself before the paper pans */
    const robx = e.target && e.target.closest ? e.target.closest(".tbox.ro") : null;
    if (robx && !e.altKey && !e.ctrlKey && !e.metaKey) {
      let sc = null;
      for (let n = e.target; n && n !== robx; n = n.parentElement) {
        if (n.nodeType !== 1 || n.tagName === "IFRAME") continue;
        if (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1) {
          const cs = getComputedStyle(n);
          if (/(auto|scroll)/.test(cs.overflowY + " " + cs.overflowX)) {
            sc = n;
            break;
          }
        }
      }
      if (sc) {
        const canY = dy < 0 ? sc.scrollTop > 0 : sc.scrollTop < sc.scrollHeight - sc.clientHeight - 1;
        const canX = dx < 0 ? sc.scrollLeft > 0 : sc.scrollLeft < sc.scrollWidth - sc.clientWidth - 1;
        if (canY || canX) {
          sc.scrollTop += dy;
          sc.scrollLeft += dx;
          return;
        }
      }
    }
    if (e.altKey || e.ctrlKey || e.metaKey) {
      const r = viewport.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.0016));
      queueSave();
    } else if (e.shiftKey) {
      VP.x -= dx || dy;
      clampView();
      setView();
      growFromView();
      queueSave();
    } else {
      VP.x -= dx;
      VP.y -= dy;
      clampView();
      setView();
      growFromView();
      queueSave();
    }
  },
  { passive: false },
);

snapBtn.addEventListener("click", () => {
  state.ui.snap = !state.ui.snap;
  snapBtn.classList.toggle("on", state.ui.snap);
  queueSave();
});

addEventListener("keydown", (e) => {
  if (mode !== "text" && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
    const a = document.activeElement;
    if (a && a.classList && a.classList.contains("cont") && a.isConnected) setMode("text");
  }
  if (e.code === "Space" && !isTyping()) {
    spaceDown = true;
    document.body.classList.add("space-pan");
    e.preventDefault();
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && isTyping()) {
    if (e.key === "," || e.key === "<") {
      e.preventDefault();
      exec("subscript");
      return;
    }
    if (e.key === "." || e.key === ">") {
      e.preventDefault();
      exec("superscript");
      return;
    }
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      exec(e.shiftKey ? "superscript" : "subscript");
      return;
    }
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+") && !isTyping()) {
    e.preventDefault();
    zoomAt(vpW / 2, vpH / 2, 1.25);
    queueSave();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "-" && !isTyping()) {
    e.preventDefault();
    zoomAt(vpW / 2, vpH / 2, 1 / 1.25);
    queueSave();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "0" && !isTyping()) {
    e.preventDefault();
    zoomAt(vpW / 2, vpH / 2, 1 / VP.z);
    queueSave();
  }
});
addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceDown = false;
    document.body.classList.remove("space-pan");
  }
});
