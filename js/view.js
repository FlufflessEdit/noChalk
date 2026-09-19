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
}
function applyView() {
  plane.style.transform = `translate(${VP.x}px, ${VP.y}px) scale(${VP.z})`;
  mediaplane.style.transform = plane.style.transform;
  if (cur.pg) cur.pg.view = { x: Math.round(VP.x), y: Math.round(VP.y), z: VP.z };
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
  redrawInk();
}
if (window.ResizeObserver)
  new ResizeObserver(() => {
    sizeCanvas();
    setView();
  }).observe(viewport);
addEventListener("resize", () => {
  sizeCanvas();
  setView();
});
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
    gesture.n = pts.length;
    gesture.d = pinchdist();
    gesture.cx = cx;
    gesture.cy = cy;
    return;
  }
  if (gesture.cx != null) {
    let f = 1;
    if (gesture.d > 10) {
      const d = pinchdist();
      if (d > 10) f = Math.min(2.5, Math.max(0.4, d / gesture.d));
    }
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
  gesture.d = pinchdist();
  gesture.cx = cx;
  gesture.cy = cy;
}
function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  modeSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.mode === m));
  closePop();
  if (m !== "select" && typeof clearSel === "function") clearSel();
  if (m !== "text") {
    try {
      getSelection().removeAllRanges();
    } catch (e) {}
  }
  setView();
}
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
      if (touches.size >= 2) {
        touchPan = null;
        cancelToolInput();
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
        touchPan = { id: e.pointerId, x: e.clientX, y: e.clientY };
        e.preventDefault();
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
    if (touchPan && e.pointerId === touchPan.id) {
      if (Math.hypot(e.clientX - touchPan.x, e.clientY - touchPan.y) > 8) {
        startPan(e, "hand");
        touchPan = null;
      }
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
    if (touchPan && e.pointerId === touchPan.id) touchPan = null;
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
      gesture = null;
      const g = touchGroup;
      touchGroup = null;
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
    let dx = e.deltaX,
      dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 33;
      dy *= 33;
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
