/*  noCHalk
      by Fluffless
      ruler.js
*/
"use strict";
/* ================= Geodreieck (German set square) =================
   Triangle, 45°/45°/90°. Long edge = ruler with 0 in the middle,
   scale printed 7 … 0 … 7; the edge runs 1 cm past the scale each
   side. Degree numbers sit outside the arc, radially oriented
   (10–170), short ticks hugging the outer circle. Centre line from
   the 0 to the apex, grip hole near the apex. Colour configurable;
   the degree part is always brighter than the ruler part. */
const PXCM = 96 / 2.54;
const SQ = { B: 8, S: 7, H: 8, R: 4.2, holeR: 0.62, holeCy: -6.3 };
const SQ_SNAP_PX = 40; /* snap reach in screen pixels — higher = edges cling longer */
let setSqOn = false;
let setSq = { x: 620, y: 720, rot: 0 }; /* world position of the 0 point */
let setSqEl = null,
  sqSvgBox = null,
  sqMoveH = null,
  sqRotH = null;

function sqScale() {
  if (!state || !state.ui) return 1;
  if (!state.ui.setsq) state.ui.setsq = { scale: 1 };
  if (!state.ui.setsq.scale) state.ui.setsq.scale = 1;
  return state.ui.setsq.scale;
}
function sqCm() {
  return PXCM * sqScale();
} /* design-cm → world pixels */

function sqBaseColor() {
  if (state && state.ui && state.ui.setsq && state.ui.setsq.color) return state.ui.setsq.color;
  return SQ_DEF_COL;
}
function sqParse(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const sqCss = (c) =>
  "#" +
  c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
function sqMix(rgb, t) {
  /* t > 0 toward white, t < 0 toward black */
  const w = t >= 0 ? 255 : 0,
    k = Math.abs(t);
  return rgb.map((v) => v + (w - v) * k);
}
/* ruler part = chosen colour, degree part = brighter version of it.
   If the chosen colour is too light to brighten, the ruler part is
   darkened instead — the protractor always stays the brighter one. */
function sqColors() {
  const rgb = sqParse(sqBaseColor()) || [36, 112, 168];
  const L = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  let main, deg;
  if (L > 185) {
    main = sqMix(rgb, -0.38);
    deg = rgb;
  } else {
    main = rgb;
    deg = sqMix(rgb, 0.38);
  }
  return { main: sqCss(main), deg: sqCss(deg), fill: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.10)` };
}
const SQ_DEF_COL = "#2470a8";

/* hold (550 ms) or right-click a button → onEdit, quick click → onSelect.
   After a hold, the browser still fires a click on release — which would hit
   the normal mode wiring (setMode → closePop) and instantly close the popover
   the hold just opened. That one click is swallowed here in the capture
   phase, before it reaches the button. */
let holdSwallowBtn = null,
  holdSwallowT = 0;
document.addEventListener(
  "click",
  (e) => {
    const armed = holdSwallowBtn && Date.now() - holdSwallowT < 500;
    if (armed && holdSwallowBtn.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault();
    }
    holdSwallowBtn = null; /* one-shot: any click disarms it */
  },
  true,
);
function holdEdit(b, onSelect, onEdit) {
  b.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    onEdit();
  });
  b.addEventListener("pointerdown", (e) => {
    if (e.button === 2 || e.button === 1) return;
    const sx = e.clientX,
      sy = e.clientY;
    let moved = false,
      done = false;
    const t = setTimeout(() => {
      if (!moved) {
        done = true;
        onEdit();
      }
    }, 550);
    const mv = (e2) => {
      if (Math.hypot(e2.clientX - sx, e2.clientY - sy) > 6) {
        moved = true;
        clearTimeout(t);
      }
    };
    const up = () => {
      clearTimeout(t);
      b.removeEventListener("pointermove", mv);
      b.removeEventListener("pointerup", up);
      b.removeEventListener("pointercancel", up);
      if (done && !moved) {
        holdSwallowBtn = b;
        holdSwallowT = Date.now();
      } else if (!moved && !done) onSelect();
    };
    b.addEventListener("pointermove", mv);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
  });
}

function buildSqSvg() {
  const { B, S, H, R, holeR, holeCy } = SQ;
  const { main: C, deg: D, fill: F } = sqColors();
  const f2 = (v) => v.toFixed(2);

  /* ruler scale: short ticks, numbers tucked close — printed −7 … 0 … +7 */
  let s = "";
  const tick = (x, h) => `<line x1="${f2(x)}" y1="0" x2="${f2(x)}" y2="${f2(-h)}" stroke="${C}" stroke-width="0.028"/>`;
  const num = (x, t) => `<text x="${f2(x)}" y="-0.44" fill="${C}" stroke="none" font-size="0.36" text-anchor="middle">${t}</text>`;
  for (let i = 1; i <= S * 10; i++) {
    const d = i / 10,
      maj = i % 10 === 0,
      mid = i % 5 === 0;
    const h = maj ? 0.36 : mid ? 0.22 : 0.11;
    s += tick(d, h) + tick(-d, h);
    if (maj) s += num(d, i / 10) + num(-d, i / 10);
  }

  /* protractor: degree tick every 1° — short, hugging the outer circle */
  let arc = "";
  for (let a = 0; a <= 180; a++) {
    const rad = (a * Math.PI) / 180,
      co = Math.cos(rad),
      si = Math.sin(rad);
    const maj = a % 10 === 0,
      mid = a % 5 === 0;
    const r0 = maj ? R - 0.34 : mid ? R - 0.2 : R - 0.11;
    arc += `<line x1="${f2(r0 * co)}" y1="${f2(-r0 * si)}" x2="${f2(R * co)}" y2="${f2(-R * si)}" stroke="${D}" stroke-width="${maj ? 0.038 : 0.024}"/>`;
  }
  /* degree numbers 10–170: outside the arc, on one radial circle,
     radially oriented — no offsets anywhere */
  const rn = R + 0.42;
  for (let a = 10; a <= 170; a += 10) {
    const rad = (a * Math.PI) / 180,
      co = Math.cos(rad),
      si = Math.sin(rad);
    const tx = rn * co,
      ty = -rn * si;
    arc += `<text x="${f2(tx)}" y="${f2(ty)}" fill="${D}" stroke="none" font-size="0.3" text-anchor="middle" dominant-baseline="middle" transform="rotate(${90 - a} ${f2(tx)} ${f2(ty)})">${a}</text>`;
  }

  /* triangle body with a real hole (evenodd) */
  const body =
    `M${f2(-B)} 0 L${f2(B)} 0 L0 ${f2(-H)} Z ` +
    `M${f2(holeR)} ${f2(holeCy)} A${f2(holeR)} ${f2(holeR)} 0 1 0 ${f2(-holeR)} ${f2(holeCy)} A${f2(holeR)} ${f2(holeR)} 0 1 0 ${f2(holeR)} ${f2(holeCy)} Z`;

  /* centre line, gapped around the 90° number and the hole */
  const g1 = 4.32,
    g2 = 4.95;
  const hTop = holeCy + holeR + 0.12;
  const hBot = holeCy - holeR - 0.12;

  sqSvgBox.innerHTML = `<svg viewBox="${-B} ${-H} ${2 * B} ${H}" width="100%" height="100%">
  <path d="${body}" fill="${F}" fill-rule="evenodd" stroke="${C}" stroke-width="0.07" stroke-linejoin="round"/>
  <path d="M${f2(-R)} 0 A${f2(R)} ${f2(R)} 0 0 1 ${f2(R)} 0" fill="none" stroke="${D}" stroke-width="0.05"/>
  ${arc}
  <line x1="0" y1="0" x2="0" y2="${f2(-g1)}" stroke="${C}" stroke-width="0.04"/>
  <line x1="0" y1="${f2(-g2)}" x2="0" y2="${f2(hTop)}" stroke="${C}" stroke-width="0.04"/>
  <line x1="0" y1="${f2(hBot)}" x2="0" y2="${f2(-H)}" stroke="${C}" stroke-width="0.04"/>
  ${s}
  <circle cx="0" cy="0" r="0.15" fill="none" stroke="${C}" stroke-width="0.04"/>
</svg>`;
  setSqEl._col = sqBaseColor(); /* remember which colour this SVG was built with */
}

(function initSetSquare() {
  setSqEl = el("div");
  setSqEl.id = "setsq";
  setSqEl.style.display = "none";
  sqSvgBox = el("div");
  sqSvgBox.style.cssText = "position:absolute;inset:0";
  sqMoveH = el("div", "sqh");
  sqMoveH.title = "Drag to move the Geodreieck";
  sqMoveH.innerHTML =
    '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-2.6 2.6M12 3l2.6 2.6M12 21l-2.6-2.6M12 21l2.6-2.6M3 12l2.6-2.6M3 12l2.6 2.6M21 12l-2.6-2.6M21 12l-2.6 2.6"/></svg>';
  sqRotH = el("div", "sqh");
  sqRotH.title = "Drag to rotate around the 0 — Shift snaps to 15°";
  sqRotH.innerHTML =
    '<svg class="ic" viewBox="0 0 24 24"><path d="M5 16 A7 7 0 0 1 19 16M6.6 14.9 L5 13.3 L3.4 14.9M17.4 17.1 L19 18.7 L20.6 17.1"/></svg>';
  setSqEl.append(sqSvgBox, sqMoveH, sqRotH);
  viewport.append(setSqEl);
  buildSqSvg(); /* rebuilt only when the colour changes */

  sqMoveH.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      sqMoveH.setPointerCapture(e.pointerId);
    } catch (err) {}
    const sx = e.clientX,
      sy = e.clientY,
      ox = setSq.x,
      oy = setSq.y;
    const { B, H } = SQ,
      u = sqCm();
    const mv = (e2) => {
      setSq.x = ox + (e2.clientX - sx) / VP.z;
      setSq.y = oy + (e2.clientY - sy) / VP.z;
      growPaperTo(setSq.x + B * u + 80, setSq.y + H * u + 80);
      positionSetSq();
    };
    const up = () => {
      sqMoveH.removeEventListener("pointermove", mv);
      sqMoveH.removeEventListener("pointerup", up);
      sqMoveH.removeEventListener("pointercancel", up);
      if (state && state.ui) {
        state.ui.setsqPos = { x: setSq.x, y: setSq.y, rot: setSq.rot };
        queueSave();
      }
    };
    sqMoveH.addEventListener("pointermove", mv);
    sqMoveH.addEventListener("pointerup", up);
    sqMoveH.addEventListener("pointercancel", up);
  });
  sqRotH.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      sqRotH.setPointerCapture(e.pointerId);
    } catch (err) {}
    const mv = (e2) => {
      const [wx, wy] = toWorld(e2.clientX, e2.clientY);
      let r = (Math.atan2(wy - setSq.y, wx - setSq.x) * 180) / Math.PI + 90;
      if (e2.shiftKey) r = Math.round(r / 15) * 15;
      setSq.rot = r;
      positionSetSq();
    };
    const up = () => {
      sqRotH.removeEventListener("pointermove", mv);
      sqRotH.removeEventListener("pointerup", up);
      sqRotH.removeEventListener("pointercancel", up);
      if (state && state.ui) {
        state.ui.setsqPos = { x: setSq.x, y: setSq.y, rot: setSq.rot };
        queueSave();
      }
    };
    sqRotH.addEventListener("pointermove", mv);
    sqRotH.addEventListener("pointerup", up);
    sqRotH.addEventListener("pointercancel", up);
  });

  holdEdit(
    $("#setSqBtn"),
    () => {
      if (typeof disarmShape === "function") disarmShape();
      setSqOn = !setSqOn;
      $("#setSqBtn").classList.toggle("on", setSqOn);
      positionSetSq();
    },
    () => openPop($("#setSqBtn"), setSqConfigNode()),
  );
})();

function setSqConfigNode() {
  sqScale(); /* ensures state.ui.setsq exists */
  const n = el("div", "pop-preset");
  n.innerHTML = `<div class="pop-h">Set square</div>
<div class="pr-row"><span>Scale</span><input type="range" min="50" max="200" step="5"><b class="sqsz"></b></div>
<div class="pr-row"><span>Colour</span><input type="color" value="${sqBaseColor()}" style="width:36px;height:26px;border:1px solid var(--ch);border-radius:6px;background:none;padding:2px;cursor:pointer"></div>
<div class="dlg-b"><button class="btn go">Done</button></div>`;
  const rng = n.querySelector("input[type=range]"),
    lab = n.querySelector(".sqsz");
  rng.value = Math.round(sqScale() * 100);
  const upd = () => (lab.textContent = rng.value + "%");
  upd();
  rng.addEventListener("input", () => {
    state.ui.setsq.scale = parseInt(rng.value, 10) / 100;
    upd();
    positionSetSq();
    queueSave();
  });
  n.querySelector("input[type=color]").addEventListener("input", (ev) => {
    state.ui.setsq.color = ev.target.value;
    buildSqSvg();
    queueSave();
  });
  n.querySelector(".btn.go").onclick = () => closePop();
  return n;
}

function positionSetSq() {
  if (!setSqEl) return;
  /* rebuild if the saved colour changed since the SVG was built
     (covers page reload: the initial build ran before state loaded) */
  if (setSqEl._col !== sqBaseColor()) buildSqSvg();
  if (!setSqOn) {
    setSqEl.style.display = "none";
    return;
  }
  const { B, H, holeCy } = SQ;
  const z = VP.z,
    s = sqCm() * z;
  setSqEl.style.display = "block";
  setSqEl.style.width = 2 * B * s + "px";
  setSqEl.style.height = H * s + "px";
  setSqEl.style.left = VP.x + setSq.x * z - B * s + "px";
  setSqEl.style.top = VP.y + setSq.y * z - H * s + "px";
  setSqEl.style.transformOrigin = "50% 100%";
  setSqEl.style.transform = "rotate(" + setSq.rot + "deg)";
  sqMoveH.style.left = B * s + "px";
  sqMoveH.style.top = (holeCy + H) * s + "px";
  sqRotH.style.left = B * s + "px";
  sqRotH.style.top = "0px";
}

/* snap a world point onto the nearest edge — base, both slopes,
   centre line, and the protractor arc (so arcs can be traced) */
function rulerSnapPt(x, y) {
  if (!setSqOn) return [x, y];
  const { B, H, R } = SQ;
  const u = sqCm();
  const r = (setSq.rot * Math.PI) / 180,
    cos = Math.cos(r),
    sin = Math.sin(r);
  const dx = x - setSq.x,
    dy = y - setSq.y;
  const lu = (dx * cos + dy * sin) / u; /* local coords, design-cm */
  const lv = (-dx * sin + dy * cos) / u;
  let bu = null,
    bv = 0,
    bd = SQ_SNAP_PX / VP.z / u;
  for (const [ax, ay, bx, by] of [
    [-B, 0, B, 0],
    [B, 0, 0, -H],
    [0, -H, -B, 0],
    [0, 0, 0, -H],
  ]) {
    const ex = bx - ax,
      ey = by - ay,
      L2 = ex * ex + ey * ey;
    let t = L2 ? ((lu - ax) * ex + (lv - ay) * ey) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + ex * t,
      py = ay + ey * t;
    const d = Math.hypot(lu - px, lv - py);
    if (d < bd) {
      bd = d;
      bu = px;
      bv = py;
    }
  }
  const dc = Math.hypot(lu, lv);
  if (dc > 0.5 && lv <= 0.15 && Math.abs(dc - R) < bd) {
    bd = Math.abs(dc - R);
    const k = R / dc;
    bu = lu * k;
    bv = lv * k;
  }
  if (bu == null) return [x, y];
  return [setSq.x + (bu * cos - bv * sin) * u, setSq.y + (bu * sin + bv * cos) * u];
}
