/*  noCHalk
      by Fluffless
      compass.js
*/
"use strict";
/* ================= compass (circle tool) =================
   Needle tip = centre & pivot. The ↔ handle on the drawing arm sets the
   radius (a ruler with 0 on the needle appears while dragging; the head
   shows the current radius). The cross arrow above the needle moves it —
   and so does grabbing the head itself, like the real thing. Rotation and
   drawing resolve around the NEEDLE: the arm points where you drag, the
   needle stays planted. On first activation the compass appears in the
   top-left of the current view. */
const CMP = { legCm: 10, minR: 0.5, maxR: 12, COL: "#2470a8" };
let cmpOn = false;
let cmp = { x: 560, y: 640, r: 4, ang: -0.7 }; /* world px centre; r in cm; angle rad */
let cmpEl = null,
  cmpSvg = null,
  cmpMoveH = null,
  cmpRotH = null,
  cmpPenH = null,
  cmpRadH = null;

let cmpRulerUntil = 0,
  cmpStroke = null,
  cmpLastAng = 0,
  cmpEverOn = false;

function cmpRPx() {
  return cmp.r * PXCM * sqScale();
}
function cmpPts() {
  const rpx = cmpRPx(),
    L = CMP.legCm * PXCM * sqScale();
  const C = [cmp.x, cmp.y];
  const P = [cmp.x + Math.cos(cmp.ang) * rpx, cmp.y + Math.sin(cmp.ang) * rpx];
  const dx = P[0] - C[0],
    dy = P[1] - C[1];
  const h = Math.sqrt(Math.max(1, L * L - (rpx * rpx) / 4));
  const ux = -dy / (rpx || 1),
    uy = dx / (rpx || 1);
  const M = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];
  const H = [M[0] + ux * h, M[1] + uy * h];
  return { C, P, H };
}

function placeCmpInView() {
  const r = cmpRPx();
  const pad = 110 / VP.z;
  cmp.x = -VP.x / VP.z + r + pad;
  cmp.y = -VP.y / VP.z + r + pad;
  if (state && state.ui) state.ui.compassPos = { ...cmp };
}

(function initCompass() {
  cmpEl = el("div");
  cmpEl.id = "compass";
  cmpEl.style.display = "none";
  cmpSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  cmpSvg.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none");
  cmpEl.append(cmpSvg);

  const mk = (id, icon, title) => {
    const n = el("div", "sqh");
    n.id = id;
    n.title = title;
    n.innerHTML = icon;
    cmpEl.append(n);
    return n;
  };

  /* the head's invisible grab zone — created FIRST so the specific handles
     (radius, rotate, pen, move) sit above it wherever they overlap */
  /* the head's grab zone — invisible, exactly on the degree head */

  cmpMoveH = mk(
    "cmpMove",
    '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-2.6 2.6M12 3l2.6 2.6M12 21l-2.6-2.6M12 21l2.6-2.6M3 12l2.6-2.6M3 12l2.6 2.6M21 12l-2.6-2.6M21 12l-2.6 2.6"/></svg>',
    "Drag to position the compass — the needle tip is the centre",
  );
  cmpRotH = mk(
    "cmpRot",
    '<svg class="ic" viewBox="0 0 24 24"><path d="M5 16 A7 7 0 0 1 19 16M6.6 14.9 L5 13.3 L3.4 14.9M17.4 17.1 L19 18.7 L20.6 17.1"/></svg>',
    "Drag to swing the arm around the centre",
  );
  cmpPenH = mk(
    "cmpPen",
    '<svg class="ic" viewBox="0 0 24 24"><path d="M16.5 3.5l4 4L8 20l-5 1 1-5zM14.5 5.5l4 4"/></svg>',
    "Drag to draw the circle with the current pen",
  );
  cmpRadH = mk(
    "cmpRad",
    '<svg class="ic" viewBox="0 0 24 24"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>',
    "Drag in or out to set the radius — the ruler shows the distance",
  );

  viewport.append(cmpEl);

  /* ---- move: the cross arrow AND the head zone share this drag ---- */
  const moveDrag = (handle) => {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (err) {}
      const sx = e.clientX,
        sy = e.clientY,
        ox = cmp.x,
        oy = cmp.y;
      const mv = (e2) => {
        cmp.x = ox + (e2.clientX - sx) / VP.z;
        cmp.y = oy + (e2.clientY - sy) / VP.z;
        growPaperTo(cmp.x + cmpRPx() + 80, cmp.y + cmpRPx() + 80);
        positionCompass();
      };
      const up = () => {
        handle.removeEventListener("pointermove", mv);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        if (state && state.ui) {
          state.ui.compassPos = { ...cmp };
          queueSave();
        }
      };
      handle.addEventListener("pointermove", mv);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  };
  moveDrag(cmpMoveH);

  /* ---- radius: the ↔ handle on the drawing arm ---- */
  cmpRadH.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      cmpRadH.setPointerCapture(e.pointerId);
    } catch (err) {}
    cmpRulerUntil = Date.now() + 1100;
    const mv = (e2) => {
      const [wx, wy] = toWorld(e2.clientX, e2.clientY);
      const d = Math.hypot(wx - cmp.x, wy - cmp.y) / PXCM;
      cmp.r = Math.min(CMP.maxR * sqScale(), Math.max(CMP.minR * sqScale(), d));
      cmpRulerUntil = Date.now() + 1100;
      positionCompass();
    };
    const up = () => {
      cmpRadH.removeEventListener("pointermove", mv);
      cmpRadH.removeEventListener("pointerup", up);
      cmpRadH.removeEventListener("pointercancel", up);
      if (state && state.ui) {
        state.ui.compassPos = { ...cmp };
        queueSave();
      }
    };
    cmpRadH.addEventListener("pointermove", mv);
    cmpRadH.addEventListener("pointerup", up);
    cmpRadH.addEventListener("pointercancel", up);
  });

  /* ---- rotate (dry) and draw (pen) — resolve around the NEEDLE:
       the arm turns to point where you drag, the needle stays planted ---- */
  const armDrag = (handle, draw) => {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (draw) {
        if (!activePen) {
          toast("Add a pen preset first (click an empty preset slot)");
          return;
        }
        cmpStroke = { c: activePen.c, w: activePen.w, t: "pen", pts: [] };
        cmpLastAng = cmp.ang;
        pushCmpPt();
      }
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (err) {}
      const mv = (e2) => {
        const [wx, wy] = toWorld(e2.clientX, e2.clientY);
        cmp.ang = Math.atan2(wy - cmp.y, wx - cmp.x);
        if (draw && cmpStroke) {
          let d = cmp.ang - cmpLastAng;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const step = 0.035 * (d >= 0 ? 1 : -1);
          /* the preview draws on the pen plane (shapesCtx) — the same plane
             the committed stroke renders on, beneath the text */
          setInkXform(shapesCtx);
          while (Math.abs(d) > 0.035) {
            cmpLastAng += step;
            d -= step;
            const n2 = cmpStroke.pts.length;
            cmpStroke.pts.push(cmpPtAt(cmpLastAng));
            drawSeg(shapesCtx, cmpStroke, n2);
          }
        }
        positionCompass();
      };
      const up = () => {
        handle.removeEventListener("pointermove", mv);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        if (draw && cmpStroke) {
          if (cmpStroke.pts.length) {
            delete cmpStroke.bb;
            strokeBB(cmpStroke);
            cur.pg.ink.push(cmpStroke);
            /* the entry must carry the stroke itself — `drawing` is null here.
               plane is the string "ink", not the #plane element */
            const en = { k: "add", strokes: [cmpStroke], plane: "ink" };
            pushUndo(
              () => revertEntry(en),
              () => applyEntry(en),
            );
            growPaperTo(cmp.x + cmpRPx() + 60, cmp.y + cmpRPx() + 60);
            queueSave();
            redrawInk();
          }
          cmpStroke = null;
        }
        if (state && state.ui) {
          state.ui.compassPos = { ...cmp };
          queueSave();
        }
      };
      handle.addEventListener("pointermove", mv);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  };
  armDrag(cmpRotH, false);
  armDrag(cmpPenH, true);
  function cmpConfigNode() {
    const n = el("div", "pop-preset");
    n.append(el("div", "pop-h", "Compass"));
    if (typeof sqScale !== "function") return n;
    sqScale();
    const row = el("div", "pr-row", "<span>Scale</span>");
    const rng = el("input");
    rng.type = "range";
    rng.min = "50";
    rng.max = "200";
    rng.step = "5";
    const lab = el("b");
    row.append(rng, lab);
    n.append(row);
    rng.value = Math.round(sqScale() * 100);
    const upd = () => (lab.textContent = rng.value + "%");
    upd();
    rng.addEventListener("input", () => {
      state.ui.setsq.scale = parseInt(rng.value, 10) / 100;
      upd();
      positionCompass();
      queueSave();
    });
    n.append(el("div", "pi-r", "Same scale as the set square — their rulers always match."));
    const done = el("button", "btn go", "Done");
    done.style.marginTop = "8px";
    done.onclick = () => closePop();
    n.append(done);
    return n;
  }
  (function wireCompassBtn() {
    const b = document.getElementById("compassBtn");
    if (!b) return;
    (() => openPop(b, cmpConfigNode()),
      holdEdit(
        b,
        () => {
          if (typeof disarmShape === "function") disarmShape();
          cmpOn = !cmpOn;
          b.classList.toggle("on", cmpOn);
          if (cmpOn) placeCmpInView();
          positionCompass();
        },
        () => {
          if (typeof disarmShape === "function") disarmShape();
          cmpOn = !cmpOn;
          b.classList.toggle("on", cmpOn);
          if (cmpOn) placeCmpInView();
          positionCompass();
        },
      ));
  })();
})();

function cmpPtAt(a) {
  return [cmp.x + Math.cos(a) * cmpRPx(), cmp.y + Math.sin(a) * cmpRPx(), 0.5];
}
function pushCmpPt() {
  if (cmpStroke) cmpStroke.pts.push(cmpPtAt(cmp.ang));
}

function positionCompass() {
  if (!cmpEl) return;
  if (!cmpOn) {
    cmpEl.style.display = "none";
    return;
  }
  cmpEl.style.display = "block";
  const z = VP.z;
  const { C, P, H } = cmpPts();
  const S = (pt) => [VP.x + pt[0] * z, VP.y + pt[1] * z];
  const [csx, csy] = S(C),
    [psx, psy] = S(P),
    [hsx, hsy] = S(H);
  const COL = CMP.COL;
  let ruler = "";
  if (Date.now() < cmpRulerUntil) {
    const dx = psx - csx,
      dy = psy - csy,
      len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len,
      ny = dx / len;
    const tickLen = Math.min(12, len * 0.12);
    for (let cm = 0; cm <= cmp.r + 0.001; cm += 0.5) {
      const t = (cm / cmp.r) * len;
      const maj = cm % 1 === 0;
      const l = maj ? tickLen : tickLen * 0.55;
      const tx = csx + (dx / len) * t,
        ty = csy + (dy / len) * t;
      ruler += `<line x1="${tx}" y1="${ty}" x2="${tx + nx * l}" y2="${ty + ny * l}" stroke="${COL}" stroke-width="1"/>`;
      if (maj && cm > 0)
        ruler += `<text x="${tx + nx * (l + 4)}" y="${ty + ny * (l + 4)}" fill="${COL}" font-size="10" text-anchor="middle" stroke="none">${cm}</text>`;
    }
    ruler += `<text x="${csx - nx * 14}" y="${csy - ny * 14}" fill="${COL}" font-size="10" text-anchor="middle" stroke="none">0</text>`;
    ruler = `<line x1="${csx}" y1="${csy}" x2="${psx}" y2="${psy}" stroke="${COL}" stroke-width="1" stroke-dasharray="5 4"/>` + ruler;
  }
  /* head with the current radius */
  const radLab = (Math.round(cmp.r * 10) / 10).toString();
  cmpSvg.innerHTML = `
  <line x1="${hsx}" y1="${hsy}" x2="${csx}" y2="${csy}" stroke="${COL}" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="${hsx}" y1="${hsy}" x2="${psx}" y2="${psy}" stroke="${COL}" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="${hsx}" cy="${hsy}" r="13" fill="#f6f2ea" stroke="${COL}" stroke-width="1.6"/>
  <text x="${hsx}" y="${hsy + 3.5}" fill="${COL}" font-size="10.5" font-weight="700" text-anchor="middle" stroke="none">${radLab}</text>
  ${ruler}`;

  const place = (h, from, to, dist) => {
    const fx = to[0] - from[0],
      fy = to[1] - from[1],
      L = Math.hypot(fx, fy) || 1;
    h.style.left = from[0] + (fx / L) * dist + "px";
    h.style.top = from[1] + (fy / L) * dist + "px";
  };
  place(cmpMoveH, S(C), S(H), 44);
  place(cmpPenH, S(P), S(H), 20);
  place(cmpRotH, S(P), S(H), 60);
  place(cmpRadH, S(P), S(H), 100);
}
