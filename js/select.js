/*  noCHalk
      by Fluffless
      select.js
*/
"use strict";
/* ================= select mode — rectangle & lasso, one temporary box ================= */
let selStyle = "rect";
let selBoxes = [],
  selCovers = [],
  selStrokes = []; /* entries: { s, plane } — plane = "ink" | "shapeInk" */
let selBounds = null,
  selBoxEl = null,
  selgrip = null,
  selDelBtn = null,
  marqueeEl = null,
  lassoSvg = null;

function setSelStyle(s, save) {
  selStyle = s;
  document.body.dataset.selstyle = s;
  const b = document.getElementById("modeSelectBtn");
  if (b) b.querySelector("use").setAttribute("href", s === "lasso" ? "#i-lasso" : "#i-select");
  if (save !== false && state && state.ui) {
    state.ui.selStyle = s;
    queueSave();
  }
}
const SEL_ICONS = {
  rect: '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" stroke-dasharray="2.5 2.5"/><path d="M10 10l7 4-3 1.2L12.8 18z" fill="currentColor" stroke="none"/></svg>',
  lasso:
    '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3.5c4.1 0 7.5 2.5 7.5 5.5s-3.4 5.5-7.5 5.5S5.5 12 5.5 9 8.9 3.5 13 3.5z"/><path d="M9.5 13.8C7.9 14.9 7 16.3 7 17.8"/><circle cx="7" cy="20.3" r="1.5"/></svg>',
};
function selStyleNode() {
  const n = el("div", "pop-preset");
  n.append(el("div", "pop-h", "Selection style"));
  const row = el("div", "selstyle-row");
  [
    ["rect", "Rectangle select"],
    ["lasso", "Lasso select"],
  ].forEach(([k, tip]) => {
    const b = el("button", "selstyle-btn" + (selStyle === k ? " on" : ""), SEL_ICONS[k]);
    b.title = tip;
    b.onclick = () => {
      setSelStyle(k);
      setMode("select");
    };
    row.append(b);
  });
  n.append(row);
  return n;
}
(function wireSelectBtn() {
  const b = document.getElementById("modeSelectBtn");
  if (!b) return;
  holdEdit(
    b,
    () => {
      if (mode === "select") {
        setSelStyle(selStyle === "rect" ? "lasso" : "rect");
        toast(selStyle === "lasso" ? "Lasso select" : "Rectangle select");
      } else setMode("select");
    },
    () => openPop(b, selStyleNode()),
  );
})();

function selActive() {
  return !!(selBoxes.length || selCovers.length || selStrokes.length);
}
function clearSel() {
  selBoxes = [];
  selCovers = [];
  selStrokes = [];
  selBounds = null;
  if (selBoxEl) {
    selBoxEl.remove();
    selBoxEl = null;
  }
  if (selgrip) {
    selgrip.remove();
    selgrip = null;
  }
  if (selDelBtn) {
    selDelBtn.remove();
    selDelBtn = null;
  }
}

/* every non-pinned box, media plane first (bottom) — reverse iteration
   in selectAt then still prefers boxes that render on top */
function selAllBoxes() {
  return [...mediaplane.querySelectorAll(".tbox:not(.pinned)"), ...plane.querySelectorAll(".tbox:not(.pinned)")];
}
function markBox(w) {
  const rec = cur.pg.conts.find((c) => c.id === w.dataset.cid);
  if (rec) selBoxes.push({ rec, w });
}
function markCover(sh) {
  selCovers.push({ sh });
}
function markStroke(s, plane) {
  selStrokes.push({ s, plane });
}
/* all drawable strokes across both planes, ink-plane first (on top) */
function allInkPlanes() {
  return [...(cur.pg.ink || []).map((s) => ({ s, plane: "ink" })), ...(cur.pg.shapeInk || []).map((s) => ({ s, plane: "shapeInk" }))];
}
function selectAt(x, y) {
  const boxes = selAllBoxes();
  for (let i = boxes.length - 1; i >= 0; i--) {
    const w = boxes[i];
    if (x >= w.offsetLeft && x <= w.offsetLeft + w.offsetWidth && y >= w.offsetTop && y <= w.offsetTop + w.offsetHeight) {
      markBox(w);
      return;
    }
  }
  for (let i = cur.pg.shapes.length - 1; i >= 0; i--) {
    const sh = cur.pg.shapes[i];
    if (x >= sh.x && x <= sh.x + sh.w && y >= sh.y && y <= sh.y + sh.h) {
      markCover(sh);
      return;
    }
  }
  const all = allInkPlanes();
  for (let i = all.length - 1; i >= 0; i--) {
    if (strokeHit(all[i].s, x, y, 6 / VP.z)) {
      markStroke(all[i].s, all[i].plane);
      return;
    }
  }
}
function selUnion() {
  let X0 = 1e9,
    Y0 = 1e9,
    X1 = -1e9,
    Y1 = -1e9;
  selBoxes.forEach((b) => {
    X0 = Math.min(X0, b.rec.x);
    Y0 = Math.min(Y0, b.rec.y);
    X1 = Math.max(X1, b.rec.x + b.w.offsetWidth);
    Y1 = Math.max(Y1, b.rec.y + b.w.offsetHeight);
  });
  selCovers.forEach((c) => {
    X0 = Math.min(X0, c.sh.x);
    Y0 = Math.min(Y0, c.sh.y);
    X1 = Math.max(X1, c.sh.x + c.sh.w);
    Y1 = Math.max(Y1, c.sh.y + c.sh.h);
  });
  selStrokes.forEach(({ s }) => {
    const bb = strokeBB(s);
    X0 = Math.min(X0, bb[0]);
    Y0 = Math.min(Y0, bb[1]);
    X1 = Math.max(X1, bb[2]);
    Y1 = Math.max(Y1, bb[3]);
  });
  return { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
}
function buildSelUI() {
  selBounds = selUnion();
  if (!selBoxEl) {
    selBoxEl = el("div", "selbox");
    selBoxEl.innerHTML = '<span class="selbl"></span>';
    viewport.append(selBoxEl);
  }
  selBoxEl.querySelector(".selbl").textContent = selBoxes.length + selCovers.length + selStrokes.length + " selected";
  if (!selgrip) {
    selgrip = el("div");
    selgrip.id = "selgrip";
    selgrip.innerHTML = '<svg class="ic" style="width:14px;height:14px"><use href="#i-hand"/></svg>';
    selgrip.title = "Drag to move everything — Delete removes it, Esc clears";
    viewport.append(selgrip);
    selgrip.addEventListener("pointerdown", selGripDown);
  }
  if (!selDelBtn) {
    selDelBtn = el("button");
    selDelBtn.id = "selDel";
    selDelBtn.textContent = "×";
    selDelBtn.title = "Delete everything selected";
    selDelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSelection();
    });
    viewport.append(selDelBtn);
  }
  positionSelUI();
}
function positionSelUI() {
  if (!selgrip || !selBounds) return;
  if (
    (selBoxes.length && !selBoxes[0].w.isConnected) ||
    (selCovers.length && !cur.pg.shapes.includes(selCovers[0].sh)) ||
    (selStrokes.length && !cur.pg[selStrokes[0].plane].includes(selStrokes[0].s))
  ) {
    clearSel();
    return;
  }
  selBoxEl.style.left = VP.x + selBounds.x * VP.z + "px";
  selBoxEl.style.top = VP.y + selBounds.y * VP.z + "px";
  selBoxEl.style.width = selBounds.w * VP.z + "px";
  selBoxEl.style.height = selBounds.h * VP.z + "px";
  selgrip.style.left = VP.x + selBounds.x * VP.z - 30 + "px";
  selgrip.style.top = VP.y + selBounds.y * VP.z - 30 + "px";
  selDelBtn.style.left = VP.x + (selBounds.x + selBounds.w) * VP.z + 6 + "px";
  selDelBtn.style.top = VP.y + selBounds.y * VP.z - 28 + "px";
}
function polyHas(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      yi = poly[i][1],
      xj = poly[j][0],
      yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

viewport.addEventListener(
  "pointerdown",
  (e) => {
    if (mode !== "select") return;
    if (e.target.closest(".sqh") || e.target.closest("#selgrip") || e.target.closest("#selDel")) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      viewport.setPointerCapture(e.pointerId);
    } catch (err) {}
    const r0 = viewport.getBoundingClientRect();
    const sx = e.clientX - r0.left,
      sy = e.clientY - r0.top;
    let cx = sx,
      cy = sy;
    const scr = [[sx, sy]];
    let pl = null;
    if (selStyle === "lasso") {
      if (!lassoSvg) {
        lassoSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        lassoSvg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:8;pointer-events:none;display:none";
        lassoSvg.innerHTML = '<polyline fill="rgba(184,67,31,.07)" stroke="var(--acc)" stroke-width="1.5" stroke-dasharray="5 4" points=""/>';
        viewport.append(lassoSvg);
      }
      pl = lassoSvg.firstChild;
      lassoSvg.style.display = "block";
      pl.setAttribute("points", sx + "," + sy);
    } else {
      if (!marqueeEl) {
        marqueeEl = el("div");
        marqueeEl.id = "marquee";
        viewport.append(marqueeEl);
      }
      marqueeEl.style.display = "block";
      marqueeEl.style.left = sx + "px";
      marqueeEl.style.top = sy + "px";
      marqueeEl.style.width = "0px";
      marqueeEl.style.height = "0px";
    }
    const mv = (e2) => {
      cx = e2.clientX - r0.left;
      cy = e2.clientY - r0.top;
      if (selStyle === "lasso") {
        scr.push([cx, cy]);
        pl.setAttribute("points", scr.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") + " " + sx + "," + sy);
      } else {
        marqueeEl.style.left = Math.min(sx, cx) + "px";
        marqueeEl.style.top = Math.min(sy, cy) + "px";
        marqueeEl.style.width = Math.abs(cx - sx) + "px";
        marqueeEl.style.height = Math.abs(cy - sy) + "px";
      }
    };
    const up = () => {
      viewport.removeEventListener("pointermove", mv);
      viewport.removeEventListener("pointerup", up);
      viewport.removeEventListener("pointercancel", up);
      if (selStyle === "lasso") lassoSvg.style.display = "none";
      else marqueeEl.style.display = "none";
      clearSel();
      if (Math.abs(cx - sx) < 4 && Math.abs(cy - sy) < 4) {
        const [wx, wy] = toWorld(sx + r0.left, sy + r0.top);
        selectAt(wx, wy);
      } else if (selStyle === "lasso") {
        const poly = scr.map((p) => toWorld(p[0] + r0.left, p[1] + r0.top));
        selAllBoxes().forEach((w) => {
          const rec = cur.pg.conts.find((c) => c.id === w.dataset.cid);
          if (!rec) return;
          if (polyHas(poly, rec.x + w.offsetWidth / 2, rec.y + w.offsetHeight / 2)) markBox(w);
        });
        cur.pg.shapes.forEach((sh) => {
          if (polyHas(poly, sh.x + sh.w / 2, sh.y + sh.h / 2)) markCover(sh);
        });
        allInkPlanes().forEach(({ s, plane }) => {
          if (s.pts.some((p) => polyHas(poly, p[0], p[1]))) markStroke(s, plane);
        });
      } else {
        const [ax, ay] = toWorld(sx + r0.left, sy + r0.top),
          [bx, by] = toWorld(cx + r0.left, cy + r0.top);
        const X0 = Math.min(ax, bx),
          X1 = Math.max(ax, bx),
          Y0 = Math.min(ay, by),
          Y1 = Math.max(ay, by);
        selAllBoxes().forEach((w) => {
          if (w.offsetLeft < X1 && w.offsetLeft + w.offsetWidth > X0 && w.offsetTop < Y1 && w.offsetTop + w.offsetHeight > Y0) markBox(w);
        });
        cur.pg.shapes.forEach((sh) => {
          if (sh.x < X1 && sh.x + sh.w > X0 && sh.y < Y1 && sh.y + sh.h > Y0) markCover(sh);
        });
        allInkPlanes().forEach(({ s, plane }) => {
          const bb = strokeBB(s);
          if (bb[2] > X0 && bb[0] < X1 && bb[3] > Y0 && bb[1] < Y1) markStroke(s, plane);
        });
      }
      if (selActive()) buildSelUI();
    };
    viewport.addEventListener("pointermove", mv);
    viewport.addEventListener("pointerup", up);
    viewport.addEventListener("pointercancel", up);
  },
  { capture: true },
);

function selGripDown(e) {
  e.preventDefault();
  e.stopPropagation();
  try {
    selgrip.setPointerCapture(e.pointerId);
  } catch (err) {}
  let lx = e.clientX,
    ly = e.clientY;
  const mv = (e2) => {
    const dx = (e2.clientX - lx) / VP.z,
      dy = (e2.clientY - ly) / VP.z;
    lx = e2.clientX;
    ly = e2.clientY;
    clickGuard = Date.now();
    selBoxes.forEach((b) => {
      b.rec.x += dx;
      b.rec.y += dy;
      b.w.style.left = b.rec.x + "px";
      b.w.style.top = b.rec.y + "px";
    });
    selCovers.forEach((c) => {
      c.sh.x += dx;
      c.sh.y += dy;
      const d = shapesL.querySelector('.cover[data-id="' + c.sh.id + '"]');
      if (d) coverPos(d, c.sh);
    });
    selStrokes.forEach(({ s }) =>
      s.pts.forEach((p) => {
        p[0] += dx;
        p[1] += dy;
        delete s.bb;
      }),
    );
    selBounds.x += dx;
    selBounds.y += dy;
    positionSelUI();
    growFromView();
    queueLineRedraw();
  };
  const up = () => {
    selgrip.removeEventListener("pointermove", mv);
    selgrip.removeEventListener("pointerup", up);
    selgrip.removeEventListener("pointercancel", up);
    redrawInk();
    savePageNow();
    queueSave();
  };
  selgrip.addEventListener("pointermove", mv);
  selgrip.addEventListener("pointerup", up);
  selgrip.addEventListener("pointercancel", up);
}

addEventListener("keydown", (e) => {
  if (mode !== "select") return;
  if (e.key === "Escape") {
    clearSel();
    return;
  }
  if ((e.key === "Delete" || e.key === "Backspace") && !isTyping() && selActive()) {
    e.preventDefault();
    deleteSelection();
  }
});
function deleteSelection() {
  const boxes = selBoxes.slice(),
    covers = selCovers.slice(),
    strokes = selStrokes.slice();
  boxes.forEach((b) => {
    roConts.unobserve(b.w);
    b.w.remove();
  });
  cur.pg.conts = cur.pg.conts.filter((c) => !boxes.some((b) => b.rec === c));
  cur.pg.shapes = cur.pg.shapes.filter((s) => !covers.some((c) => c.sh === s));
  cur.pg.ink = cur.pg.ink.filter((s) => !strokes.some((t) => t.s === s));
  if (cur.pg.shapeInk) cur.pg.shapeInk = cur.pg.shapeInk.filter((s) => !strokes.some((t) => t.s === s));
  renderShapes();
  redrawInk();
  clearSel();
  queueSave();
  const n = boxes.length + covers.length + strokes.length;
  toast("Deleted " + n + " object" + (n === 1 ? "" : "s"), {
    action: {
      label: "Undo",
      fn: () => {
        boxes.forEach((b) => {
          cur.pg.conts.push(b.rec);
          renderBox(b.rec);
        });
        covers.forEach((c) => cur.pg.shapes.push(c.sh));
        strokes.forEach(({ s, plane }) => {
          if (!cur.pg[plane]) cur.pg[plane] = [];
          cur.pg[plane].push(s);
        });
        renderShapes();
        redrawInk();
        queueSave();
      },
    },
  });
}
