/*  noCHalk
      by Fluffless
      ink.js
*/
"use strict";
/* ================= ink =================
   Three canvases + the media plane, stacked by DOM order at z1 (paper → media → strokes),
   then text (plane, z2), marker (ink, z3), covers (shapes, z4). */
function setInkXform(ctx = inkCtx) {
  ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
  ctx.translate(VP.x, VP.y);
  ctx.scale(VP.z, VP.z);
}
function pr(e) {
  if (e.pointerType === "mouse") return 0.55;
  return e.pressure > 0 ? e.pressure : 0.5;
}
function segW(s, i) {
  const p = (s.pts[i][2] + s.pts[i - 1][2]) / 2;
  return Math.max(0.6, s.w * (0.55 + 0.9 * Math.max(0.05, p)));
}
function drawDot(ctx, s) {
  const p = s.pts[0];
  ctx.globalAlpha = s.t === "hl" ? 0.38 : 1;
  ctx.fillStyle = s.c;
  ctx.beginPath();
  ctx.arc(p[0], p[1], Math.max(1, (s.t === "hl" ? s.w || 13 : segW(s, 1) || s.w) / 2), 0, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
}
function drawSeg(ctx, s, i) {
  const a = s.pts[i - 1],
    b = s.pts[i];
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) {
    drawDot(ctx, s);
    return;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.c;
  if (s.t === "hl") {
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = s.w || 13;
  } else {
    ctx.globalAlpha = 1;
    ctx.lineWidth = segW(s, i);
  }
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function drawStroke(ctx, s) {
  if (s.f && s.pts.length > 2) {
    /* filled shape: completely opaque fill */
    ctx.globalAlpha = 1;
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.moveTo(s.pts[0][0], s.pts[0][1]);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (s.pts.length < 2) drawDot(ctx, s);
  else for (let i = 1; i < s.pts.length; i++) drawSeg(ctx, s, i);
}
function strokeBB(s) {
  if (s.bb) return s.bb;
  let a = 1e9,
    b = -1e9,
    c = 1e9,
    d = -1e9;
  for (const p of s.pts) {
    if (p[0] < a) a = p[0];
    if (p[0] > b) b = p[0];
    if (p[1] < c) c = p[1];
    if (p[1] > d) d = p[1];
  }
  s.bb = [a, c, b, d];
  return s.bb;
}
/* shared viewport cull */
function strokeVisible(s, wx0, wy0, wx1, wy1) {
  const bb = strokeBB(s);
  return !(bb[2] < wx0 || bb[0] > wx1 || bb[3] < wy0 || bb[1] > wy1);
}
function viewBounds() {
  return [-VP.x / VP.z - 30, -VP.y / VP.z - 30, (vpW - VP.x) / VP.z + 30, (vpH - VP.y) / VP.z + 30];
}
let hlC = null,
  hlX = null;

/* ---- paper canvas: the bottom-most layer — the page itself ---- */
let paperC = null,
  paperCtx = null;
function ensurePaperCanvas() {
  if (paperC) return;
  paperC = document.createElement("canvas");
  paperC.id = "paperplane";
  viewport.insertBefore(paperC, viewport.firstChild);
  paperCtx = paperC.getContext("2d");
  paperC.style.cssText = "position:absolute;left:0;top:0;z-index:1;pointer-events:none;touch-action:none";
}

/* ---- paper texture: cached pattern tiles (ruled / grid / dots) ---- */
let paperPat = null,
  paperPatKey = "";
function paperTexture(st) {
  const kind = st.bg || "plain";
  if (kind === "plain") return null;
  const dark = lum(st.color) < 0.42;
  const key = kind + (dark ? "d" : "l");
  if (paperPatKey === key) return paperPat;
  const step = kind === "ruled" ? 28 : 24;
  const t = document.createElement("canvas");
  t.width = 24;
  t.height = step;
  const c = t.getContext("2d");
  const col = dark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.09)";
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = 1;
  if (kind === "ruled") {
    c.beginPath();
    c.moveTo(0, step - 0.5);
    c.lineTo(24, step - 0.5);
    c.stroke();
  } else if (kind === "grid") {
    c.beginPath();
    c.moveTo(0.5, 0);
    c.lineTo(0.5, step);
    c.moveTo(0, 0.5);
    c.lineTo(24, 0.5);
    c.stroke();
  } else {
    /* dots */
    c.beginPath();
    c.arc(12, 12, 1.3, 0, 7);
    c.fill();
  }
  paperPat = paperCtx.createPattern(t, "repeat");
  paperPatKey = key;
  return paperPat;
}

function redrawPaper() {
  if (!paperC) return;
  const W = Math.round(vpW * dprNow),
    H = Math.round(vpH * dprNow);
  if (paperC.width !== W || paperC.height !== H) {
    paperC.width = W;
    paperC.height = H;
  }
  paperC.style.width = vpW + "px";
  paperC.style.height = vpH + "px";
  const ctx = paperCtx;
  ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
  ctx.clearRect(0, 0, vpW, vpH);
  if (!cur.pg) return;
  ctx.translate(VP.x, VP.y);
  ctx.scale(VP.z, VP.z);
  const st = cur.pg.style || {};
  ctx.fillStyle = st.color || "#fff";
  ctx.fillRect(0, 0, cur.pg.size.w, cur.pg.size.h);

  /* texture rides on the paper colour, beneath everything else */
  const pat = paperTexture(st);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, cur.pg.size.w, cur.pg.size.h);
  }

  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1 / VP.z;
  ctx.strokeRect(0, 0, cur.pg.size.w, cur.pg.size.h);
}
ensurePaperCanvas();

/* ---- under-plane canvas: pen + shapes, above media, below the text ---- */
let shapesC = null,
  shapesCtx = null;
function ensureShapeCanvas() {
  if (shapesC) return;
  shapesC = document.createElement("canvas");
  shapesC.id = "shapeplane";
  viewport.insertBefore(shapesC, inkC);
  shapesCtx = shapesC.getContext("2d");
  shapesC.style.cssText = "position:absolute;left:0;top:0;z-index:1;pointer-events:none;touch-action:none";
}
function redrawUnder() {
  if (!shapesC) return;
  const W = Math.round(vpW * dprNow),
    H = Math.round(vpH * dprNow);
  if (shapesC.width !== W || shapesC.height !== H) {
    shapesC.width = W;
    shapesC.height = H;
  }
  shapesC.style.width = vpW + "px";
  shapesC.style.height = vpH + "px";
  const ctx = shapesCtx;
  ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
  ctx.clearRect(0, 0, vpW, vpH);
  if (!cur.pg) return;
  ctx.translate(VP.x, VP.y);
  ctx.scale(VP.z, VP.z);
  const [wx0, wy0, wx1, wy1] = viewBounds();
  /* pen strokes — the in-progress one included */
  const all = drawing && drawing.t !== "hl" ? cur.pg.ink.concat([drawing]) : cur.pg.ink;
  for (const s of all) {
    if (s.t === "hl") continue;
    if (!strokeVisible(s, wx0, wy0, wx1, wy1)) continue;
    drawStroke(ctx, s);
  }
  for (const s of cur.pg.shapeInk || []) {
    if (!strokeVisible(s, wx0, wy0, wx1, wy1)) continue;
    drawStroke(ctx, s);
  }
}
ensureShapeCanvas();

/* ---- marker plane: above the text, translucent composite ---- */
function redrawMarker() {
  const ctx = inkCtx;
  ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
  ctx.clearRect(0, 0, vpW, vpH);
  if (!cur.pg) return;
  const all = drawing && drawing.t === "hl" ? cur.pg.ink.concat([drawing]) : cur.pg.ink;
  const [wx0, wy0, wx1, wy1] = viewBounds();
  const hls = all.filter((s) => s.t === "hl" && strokeVisible(s, wx0, wy0, wx1, wy1));
  if (!hls.length) return;
  if (!hlC) {
    hlC = document.createElement("canvas");
    hlX = hlC.getContext("2d");
  }
  const W = Math.round(vpW * dprNow),
    H = Math.round(vpH * dprNow);
  if (hlC.width !== W || hlC.height !== H) {
    hlC.width = W;
    hlC.height = H;
  }
  hlX.setTransform(dprNow, 0, 0, dprNow, 0, 0);
  hlX.clearRect(0, 0, vpW, vpH);
  hlX.translate(VP.x, VP.y);
  hlX.scale(VP.z, VP.z);
  for (const s of hls) {
    hlX.lineCap = "round";
    hlX.lineJoin = "round";
    hlX.strokeStyle = s.c;
    hlX.fillStyle = s.c;
    hlX.lineWidth = s.w || 13;
    if (s.pts.length < 2) {
      const p = s.pts[0];
      hlX.beginPath();
      hlX.arc(p[0], p[1], (s.w || 13) / 2, 0, 7);
      hlX.fill();
    } else {
      hlX.beginPath();
      hlX.moveTo(s.pts[0][0], s.pts[0][1]);
      for (let i = 1; i < s.pts.length; i++) hlX.lineTo(s.pts[i][0], s.pts[i][1]);
      hlX.stroke();
    }
  }
  ctx.save();
  ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
  ctx.globalAlpha = 0.38;
  ctx.drawImage(hlC, 0, 0, vpW, vpH);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* redraw all planes — every existing call site keeps working */
function redrawInk() {
  redrawPaper();
  redrawUnder();
  redrawMarker();
}

function inkCoords(e) {
  const r = viewport.getBoundingClientRect();
  return [(e.clientX - r.left - VP.x) / VP.z, (e.clientY - r.top - VP.y) / VP.z];
}

/* ---- shapes (rect / ellipse / triangle) & straight lines ---- */
let shapeArm = null; /* 'rect' | 'ellipse' | 'tri' | null */
let shapeFill = { rect: false, ellipse: false, tri: false }; /* false = outline, true = filled */
function armShape(kind) {
  if (shapeArm === kind) {
    if (!shapeFill[kind]) {
      /* selected → filled */
      shapeFill[kind] = true;
      toast(kind + ": filled");
    } else {
      /* filled → deselected */
      shapeArm = null;
    }
    syncShapeBtns();
    return;
  }
  /* fresh selection always starts as outline */
  shapeArm = kind;
  shapeFill[kind] = false;
  if (drawTool !== "pen") setDrawTool("pen");
  syncShapeBtns();
}
function disarmShape() {
  if (!shapeArm) return;
  shapeArm = null;
  syncShapeBtns();
}
function syncShapeBtns() {
  const map = {
    rect: ["shapeRectBtn", "#i-rect", "#i-rect-f"],
    ellipse: ["shapeEllipseBtn", "#i-ellipse", "#i-ellipse-f"],
    tri: ["shapeTriBtn", "#i-tri", "#i-tri-f"],
  };
  for (const k in map) {
    const n = document.getElementById(map[k][0]);
    if (!n) continue;
    n.classList.toggle("on", shapeArm === k);
    n.querySelector("use").setAttribute("href", shapeArm === k && shapeFill[k] ? map[k][2] : map[k][1]);
  }
}
(function wireShapeBtns() {
  const rb = document.getElementById("shapeRectBtn"),
    eb = document.getElementById("shapeEllipseBtn"),
    tb = document.getElementById("shapeTriBtn");
  if (rb) rb.addEventListener("click", () => armShape("rect"));
  if (eb) eb.addEventListener("click", () => armShape("ellipse"));
  if (tb) tb.addEventListener("click", () => armShape("tri"));
})();

let lineRedrawPend = false;
function queueLineRedraw() {
  if (lineRedrawPend) return;
  lineRedrawPend = true;
  requestAnimationFrame(() => {
    lineRedrawPend = false;
    redrawInk();
  });
}
function shapePts(kind, x0, y0, x1, y1) {
  const P = (x, y) => [x, y, 0.5];
  if (kind === "rect") return [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), P(x0, y0)];
  if (kind === "tri") return [P(x0, y1), P(x1, y1), P((x0 + x1) / 2, y0), P(x0, y1)];
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2,
    rx = Math.abs(x1 - x0) / 2,
    ry = Math.abs(y1 - y0) / 2,
    n = 40,
    pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push(P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return pts;
}

inkC.addEventListener("pointerdown", (e) => {
  if (mode !== "draw" || drawing || erasing) return;
  /* stylus barrel button held: erase instead of draw */
  if (e.pointerType === "pen" && (e.button === 5 || e.button === 2)) {
    erasing = true;
    const [x, y] = inkCoords(e);
    try {
      inkC.setPointerCapture(e.pointerId);
    } catch (err) {}
    eraseAt(x, y);
    return;
  }
  if (e.button !== 0) return; /* only the left button draws */
  if (penOnly && e.pointerType === "touch") return;
  let [x, y] = inkCoords(e);
  try {
    inkC.setPointerCapture(e.pointerId);
  } catch (err) {}
  if (drawTool === "eraser") {
    erasing = true;
    eraseAt(x, y);
    return;
  }
  if (typeof rulerSnapPt === "function") {
    const s = rulerSnapPt(x, y);
    x = s[0];
    y = s[1];
  }
  if (shapeArm) {
    if (!activePen) {
      toast("Add a pen preset first (click an empty preset slot)");
      return;
    }
    drawing = {
      c: activePen.c,
      w: activePen.w,
      t: "pen",
      pts: [[x, y, 0.5]],
      _shape: shapeArm,
      _fill: shapeFill[shapeArm],
      _x0: x,
      _y0: y,
      _pt: e.pointerType,
    };
    return;
  }
  const p = drawTool === "hl" ? activeHl : activePen;
  if (!p) {
    toast("Add a preset first (click an empty preset slot)");
    return;
  }
  drawing = { c: p.c, w: p.w, t: drawTool, pts: [[x, y, pr(e)]], _pt: e.pointerType };
});
inkC.addEventListener("pointermove", (e) => {
  if (mode !== "draw") return;
  /* erasing — including the barrel pressed mid-stroke */
  if (erasing || (e.pointerType === "pen" && (e.buttons & 32 || e.buttons & 4))) {
    if (!erasing) {
      erasing = true;
      if (drawing) {
        drawing = null;
        redrawInk();
      }
    }
    const [x, y] = inkCoords(e);
    eraseAt(x, y);
    return;
  }
  if (!drawing) return;
  let [x, y] = inkCoords(e);
  if (typeof rulerSnapPt === "function") {
    const s = rulerSnapPt(x, y);
    x = s[0];
    y = s[1];
  }
  if (drawing._shape) {
    let x2 = x,
      y2 = y;
    if (e.shiftKey) {
      if (drawing._shape === "tri") {
        /* Shift = equilateral */
        const w = Math.abs(x - drawing._x0);
        y2 = drawing._y0 + (y >= drawing._y0 ? 1 : -1) * w * 0.866;
      } else {
        /* Shift = square / circle */
        const dx = x - drawing._x0,
          dy = y - drawing._y0,
          m = Math.max(Math.abs(dx), Math.abs(dy));
        x2 = drawing._x0 + (dx < 0 ? -m : m);
        y2 = drawing._y0 + (dy < 0 ? -m : m);
      }
    }
    drawing.pts = shapePts(drawing._shape, drawing._x0, drawing._y0, x2, y2);
    drawing.f = drawing._fill ? 1 : undefined; /* opaque fill while previewing */
    drawing._moved = true;
    queueLineRedraw();
    return;
  }
  if (e.shiftKey) {
    /* OneNote-style straight line from the stroke's start */
    if (!drawing._ln) {
      drawing._ln = true;
      drawing.pts = [drawing.pts[0]];
    }
    drawing.pts[1] = [x, y, pr(e)];
    drawing._moved = true;
    if (x > cur.pg.size.w - 200 || y > cur.pg.size.h - 200) growPaperTo(x, y);
    queueLineRedraw();
    return;
  }
  if (drawing._ln) {
    drawing._ln = false;
    drawing.pts = [drawing.pts[drawing.pts.length - 1]];
  }
  const pts = drawing.pts,
    lp = pts[pts.length - 1];
  if (Math.hypot(x - lp[0], y - lp[1]) < Math.max(0.5, 1.2 / VP.z)) return;
  pts.push([x, y, pr(e)]);
  drawing._moved = true;
  if (x > cur.pg.size.w - 200 || y > cur.pg.size.h - 200) growPaperTo(x, y);
  /* incremental draw: pen → under-plane, marker → ink plane */
  const cctx = drawing.t === "hl" ? inkCtx : shapesCtx;
  setInkXform(cctx);
  drawSeg(cctx, drawing, pts.length - 1);
});
function endStroke() {
  if (drawing) {
    delete drawing.bb; /* the drag preview may have cached a first-frame bbox */
    const isShape = !!drawing._shape;
    /* a mouse click without movement draws nothing — ink appears only
           while the button is held and moved. Stylus/finger taps still dot. */
    if (!isShape && !drawing._moved && drawing._pt === "mouse") {
      drawing = null;
      redrawInk();
      erasing = false;
      return;
    }
    if (isShape) {
      const bb0 = strokeBB(drawing);
      if (bb0[2] - bb0[0] < 3 && bb0[3] - bb0[1] < 3) {
        drawing = null;
        redrawInk();
        erasing = false;
        return;
      }
    }
    if (drawing.pts.length === 1) drawDot(drawing.t === "hl" ? inkCtx : shapesCtx, drawing);
    let mx = 0,
      my = 0;
    for (const p of drawing.pts) {
      if (p[0] > mx) mx = p[0];
      if (p[1] > my) my = p[1];
    }
    const wasHl = drawing.t === "hl";
    delete drawing._shape;
    delete drawing._ln;
    delete drawing._x0;
    delete drawing._y0;
    delete drawing._fill;
    delete drawing._moved;
    delete drawing._pt;
    strokeBB(drawing);
    /* commit to exactly one plane: shapes and pen below text, marker above */
    const plane = isShape ? "shapeInk" : "ink";
    if (!cur.pg[plane]) cur.pg[plane] = [];
    cur.pg[plane].push(drawing);
    inkUndo.push({ k: "add", strokes: [drawing], plane });
    if (inkUndo.length > 80) inkUndo.shift();
    inkRedo = [];
    drawing = null;
    growPaperTo(mx, my);
    queueSave();
    if (wasHl || isShape) redrawInk();
  }
  erasing = false;
}
/* release backstops: the stroke ends with the button, wherever it happens */
inkC.addEventListener("pointerup", endStroke);
inkC.addEventListener("pointercancel", endStroke);
inkC.addEventListener("lostpointercapture", endStroke);
addEventListener("pointerup", endStroke);
addEventListener("blur", () => endStroke());

let inkUndo = [],
  inkRedo = [];
function inkArrOf(en) {
  return en.plane === "shapeInk" ? "shapeInk" : "ink";
}
function applyEntry(en) {
  const arr = inkArrOf(en);
  if (!cur.pg[arr]) cur.pg[arr] = [];
  if (en.k === "add") cur.pg[arr].push(...en.strokes);
  else if (en.k === "del") cur.pg[arr] = cur.pg[arr].filter((s) => !en.strokes.includes(s));
  else {
    cur.pg[arr] = cur.pg[arr].filter((s) => !en.removed.includes(s));
    cur.pg[arr].push(...en.added);
  }
}
function revertEntry(en) {
  const arr = inkArrOf(en);
  if (!cur.pg[arr]) cur.pg[arr] = [];
  if (en.k === "add") cur.pg[arr] = cur.pg[arr].filter((s) => !en.strokes.includes(s));
  else if (en.k === "del") cur.pg[arr].push(...en.strokes);
  else {
    cur.pg[arr] = cur.pg[arr].filter((s) => !en.added.includes(s));
    cur.pg[arr].push(...en.removed);
  }
}
function undoInk() {
  if (!cur.pg || !inkUndo.length) {
    toast("Nothing to undo");
    return;
  }
  const en = inkUndo.pop();
  revertEntry(en);
  inkRedo.push(en);
  redrawInk();
  queueSave();
}
function redoInk() {
  if (!cur.pg || !inkRedo.length) {
    toast("Nothing to redo");
    return;
  }
  const en = inkRedo.pop();
  applyEntry(en);
  inkUndo.push(en);
  redrawInk();
  queueSave();
}
addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !isTyping()) {
    e.preventDefault();
    if (e.shiftKey) redoInk();
    else undoInk();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !isTyping()) {
    e.preventDefault();
    redoInk();
  }
});

/* ---- eraser ---- */
function curEraser() {
  return ERASERS[state.ui.eraserIdx || 0];
}
function segDist(a, b, x, y) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = dx * dx + dy * dy;
  let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}
function strokeHit(s, x, y, r) {
  const w = s.t === "hl" ? s.w || 13 : s.w,
    rr = r + w / 2;
  for (let i = 0; i < s.pts.length; i++) {
    const p = s.pts[i];
    if (Math.hypot(p[0] - x, p[1] - y) <= rr) return true;
    if (i > 0 && segDist(s.pts[i - 1], p, x, y) <= rr) return true;
  }
  return false;
}
function crossings(a, b, x, y, r) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    fx = a[0] - x,
    fy = a[1] - y;
  const A = dx * dx + dy * dy;
  if (A < 1e-9) return [];
  const B = 2 * (fx * dx + fy * dy),
    C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return [];
  const sq = Math.sqrt(disc);
  const ts = [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].filter((t) => t >= 0 && t <= 1).sort((p, q) => p - q);
  const ppr = (a[2] + b[2]) / 2;
  return ts.map((t) => [a[0] + t * dx, a[1] + t * dy, ppr]);
}
function eraseSplit(arr, x, y, r) {
  const rem = [],
    add = [];
  const mk = (s, pts) => add.push({ c: s.c, w: s.w, t: s.t, f: s.f, pts });
  arr.forEach((s) => {
    const w = s.t === "hl" ? s.w || 13 : s.w,
      rr = r + w * 0.5;
    if (!strokeHit(s, x, y, rr)) return;
    const pts = s.pts;
    const inside = pts.map((p) => Math.hypot(p[0] - x, p[1] - y) < rr);
    if (!inside.some((v) => v)) {
      for (let i = 1; i < pts.length; i++) {
        if (inside[i - 1] || inside[i]) continue;
        if (segDist(pts[i - 1], pts[i], x, y) < rr) {
          const cr = crossings(pts[i - 1], pts[i], x, y, rr);
          if (cr.length >= 2) {
            rem.push(s);
            mk(s, pts.slice(0, i).concat([cr[0]]));
            mk(s, [cr[cr.length - 1]].concat(pts.slice(i)));
          }
          break;
        }
      }
      return;
    }
    rem.push(s);
    let run = [];
    const flush = () => {
      if (run.length) mk(s, run);
      run = [];
    };
    for (let i = 0; i < pts.length; i++) {
      if (inside[i]) {
        if (run.length && i > 0) {
          const cr = crossings(pts[i - 1], pts[i], x, y, rr);
          if (cr.length) run.push(cr[cr.length - 1]);
        }
        flush();
      } else {
        if (!run.length && i > 0 && inside[i - 1]) {
          const cr = crossings(pts[i - 1], pts[i], x, y, rr);
          if (cr.length) run.push(cr[0]);
        }
        run.push(pts[i]);
      }
    }
    flush();
  });
  return { rem, add };
}
function eraseAt(x, y) {
  const er = curEraser();
  let did = false;
  /* both planes: marker first (on top), then pen/shapes */
  for (const plane of ["ink", "shapeInk"]) {
    const arr = cur.pg[plane] || [];
    if (!arr.length) continue;
    if (er.k === "line") {
      const rem = arr.filter((s) => strokeHit(s, x, y, 11 / VP.z));
      if (rem.length) {
        cur.pg[plane] = arr.filter((s) => !rem.includes(s));
        inkUndo.push({ k: "del", strokes: rem, plane });
        did = true;
      }
    } else {
      const { rem, add } = eraseSplit(arr, x, y, er.r / VP.z);
      if (rem.length) {
        cur.pg[plane] = arr.filter((s) => !rem.includes(s));
        cur.pg[plane].push(...add);
        inkUndo.push({ k: "mod", removed: rem, added: add, plane });
        did = true;
      }
    }
  }
  if (!did) return;
  inkRedo = [];
  redrawInk();
  queueSave();
}
