/*  noCHalk
      by Fluffless
      covers.js
*/
"use strict";
/* ================= covers ================= */
function updateCoverBadge() {
  if (coverCountEl) coverCountEl.textContent = cur.pg && cur.pg.shapes.length ? cur.pg.shapes.length : "";
}
function coverPos(d, sh) {
  d.style.left = VP.x + sh.x * VP.z + "px";
  d.style.top = VP.y + sh.y * VP.z + "px";
  d.style.width = sh.w * VP.z + "px";
  d.style.height = sh.h * VP.z + "px";
}
function positionCovers() {
  if (!cur.pg) return;
  shapesL.querySelectorAll(".cover").forEach((d) => {
    const sh = cur.pg.shapes.find((s) => s.id === d.dataset.id);
    if (sh) coverPos(d, sh);
  });
}
function renderShapes() {
  shapesL.querySelectorAll(".cover").forEach((n) => n.remove());
  if (cur.pg) {
    cur.pg.shapes.forEach((sh) => shapesL.append(coverEl(sh)));
  }
  positionCovers();
  updateCoverBadge();
}
function coverEl(sh) {
  const d = el("div", "cover" + (sh.hid ? " hid" : ""));
  d.dataset.id = sh.id;
  d.style.setProperty("--cc", sh.color);
  const rs = el("div", "cv-rs"),
    del = el("button", "cv-x", "×");
  del.title = "Delete cover";
  d.append(rs, del);
  d.addEventListener("pointerdown", (ev) => coverDown(ev, sh, d));
  return d;
}
/* cover interaction — the handlers live on the element itself and listen for the
       release on the element (released pointer) so that finger lifts always finish the gesture */
function coverDown(ev, sh, d) {
  ev.stopPropagation();
  if (ev.target.classList.contains("cv-x")) {
    ev.preventDefault();
    deleteShape(sh);
    return;
  }
  const resizing = ev.target.classList.contains("cv-rs");
  ev.preventDefault();
  activeShape = sh.id;
  d.classList.add("sel");
  const sx = ev.clientX,
    sy = ev.clientY,
    ox = sh.x,
    oy = sh.y,
    ow = sh.w,
    oh = sh.h;
  let moved = false;
  try {
    d.setPointerCapture(ev.pointerId);
  } catch (e) {}
  const mv = (e2) => {
    const dx = e2.clientX - sx,
      dy = e2.clientY - sy;
    if (!moved && Math.hypot(dx, dy) > 4) moved = true;
    if (!moved) return;
    if (resizing) {
      sh.w = Math.max(16 / VP.z, ow + dx / VP.z);
      sh.h = Math.max(14 / VP.z, oh + dy / VP.z);
    } else {
      sh.x = ox + dx / VP.z;
      sh.y = oy + dy / VP.z;
    }
    coverPos(d, sh);
    if (sh.x + sh.w > cur.pg.size.w - 160 || sh.y + sh.h > cur.pg.size.h - 160) growPaperTo(sh.x + sh.w, sh.y + sh.h);
  };
  const up = () => {
    d.removeEventListener("pointermove", mv);
    d.removeEventListener("pointerup", up);
    d.removeEventListener("pointercancel", up);
    d.removeEventListener("lostpointercapture", up);
    d.classList.remove("sel");
    if (!moved && !resizing) {
      sh.hid = !sh.hid;
      d.classList.toggle("hid", sh.hid);
    }
    queueSave();
  };
  d.addEventListener("pointermove", mv);
  d.addEventListener("pointerup", up);
  d.addEventListener("pointercancel", up);
  d.addEventListener("lostpointercapture", up);
}

let draft = null;
shapesL.addEventListener("pointerdown", (e) => {
  if (mode !== "shape" || e.target !== shapesL) return;
  e.preventDefault();
  try {
    shapesL.setPointerCapture(e.pointerId);
  } catch (err) {}
  const [x0, y0] = toWorld(e.clientX, e.clientY);
  const ghost = el("div", "cover ghost");
  ghost.style.setProperty("--cc", coverColor);
  shapesL.append(ghost);
  let made = false;
  const mv = (e2) => {
    const [x, y] = toWorld(e2.clientX, e2.clientY);
    const X = Math.min(x, x0),
      Y = Math.min(y, y0),
      W = Math.abs(x - x0),
      H = Math.abs(y - y0);
    ghost.style.left = VP.x + X * VP.z + "px";
    ghost.style.top = VP.y + Y * VP.z + "px";
    ghost.style.width = W * VP.z + "px";
    ghost.style.height = H * VP.z + "px";
    if (W > 14 && H > 12) made = true;
    if (X + W > cur.pg.size.w - 160 || Y + H > cur.pg.size.h - 160) growPaperTo(X + W, Y + H);
  };
  const up = () => {
    shapesL.removeEventListener("pointermove", mv);
    shapesL.removeEventListener("pointerup", up);
    shapesL.removeEventListener("pointercancel", up);
    shapesL.removeEventListener("lostpointercapture", up);
    const X = parseFloat(ghost.style.left),
      Y = parseFloat(ghost.style.top);
    const W = parseFloat(ghost.style.width) / VP.z,
      H = parseFloat(ghost.style.height) / VP.z;
    const wx = (X - VP.x) / VP.z,
      wy = (Y - VP.y) / VP.z;
    ghost.remove();
    draft = null;
    if (made) {
      cur.pg.shapes.push({
        id: uid(),
        x: Math.round(wx),
        y: Math.round(wy),
        w: Math.round(W),
        h: Math.round(H),
        color: coverColor,

        hid: false,
      });
      renderShapes();
      queueSave();
      toast("Cover created — click it to switch to outline mode");
    }
  };
  shapesL.addEventListener("pointermove", mv);
  shapesL.addEventListener("pointerup", up);
  shapesL.addEventListener("pointercancel", up);
  shapesL.addEventListener("lostpointercapture", up);
  draft = {
    cancel: () => {
      shapesL.removeEventListener("pointermove", mv);
      shapesL.removeEventListener("pointerup", up);
      shapesL.removeEventListener("pointercancel", up);
      shapesL.removeEventListener("lostpointercapture", up);
      ghost.remove();
      draft = null;
    },
  };
});
function cancelDraft() {
  if (draft) draft.cancel();
}

function deleteShape(sh) {
  if (!sh) return;
  const i = cur.pg.shapes.indexOf(sh);
  if (i < 0) return;
  cur.pg.shapes.splice(i, 1);
  if (activeShape === sh.id) activeShape = null;
  renderShapes();
  queueSave();
  toast("Cover deleted", {
    action: {
      label: "Undo",
      fn: () => {
        cur.pg.shapes.push(sh);
        renderShapes();
        queueSave();
      },
    },
  });
}

/* ================= page style ================= */
$("#bgBtn").addEventListener("click", () => openPop($("#bgBtn"), styleNode()));
function styleNode() {
  const st = cur.pg.style;
  const n = el("div", "pop-style");
  n.append(el("div", "pop-h", "Texture"));
  const texRow = el("div", "tex-row");
  [
    ["plain", "Blank"],
    ["ruled", "Ruled"],
    ["grid", "Squares"],
    ["dots", "Dots"],
  ].forEach(([k, lb]) => {
    const b = el("button", "tex" + (st.bg === k ? " on" : ""), `<span class="tex-prev ${k}"></span><span>${lb}</span>`);
    b.onclick = () => {
      st.bg = k;
      paintPage();
      queueSave();
      texRow.querySelectorAll(".on").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    };
    texRow.append(b);
  });
  n.append(texRow);
  n.append(el("div", "pop-h", "Background"));
  const sw = el("div", "sw-row");
  PAGECOLORS.forEach(([c, lb]) => {
    const b = el("button", "sw");
    b.style.background = c;
    b.title = lb;
    if (st.color === c) b.classList.add("on");
    b.onclick = () => {
      st.color = c;
      paintPage();
      queueSave();
      sw.querySelectorAll(".on").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    };
    sw.append(b);
  });
  const cust = el("label", "sw-c", 'Custom <input type="color">');
  const inp = cust.querySelector("input");
  if (/^#[0-9a-f]{6}$/i.test(st.color)) inp.value = st.color;
  inp.addEventListener("input", () => {
    st.color = inp.value;
    paintPage();
    queueSave();
  });
  n.append(sw, cust);
  const tip = el("div", "pop-h", "Dark colours switch typed text to light automatically. New pages follow the current app theme.");
  tip.style.cssText = "font-weight:400;text-transform:none;letter-spacing:0;font-size:11.5px;color:var(--ink2)";
  n.append(tip);
  return n;
}
/* ---- covers button: hold / right-click for colour + reset ---- */
(function wireCoversBtn() {
  const b = document.getElementById("modeShapeBtn");
  if (!b) return;
  holdEdit(
    b,
    () => {},
    () => openPop(b, coversConfigNode()),
  );
})();

function syncCovDot() {
  const d = document.getElementById("covDot");
  if (d) d.style.background = coverColor;
}
function coversConfigNode() {
  const n = el("div", "pop-preset");
  const cnt = cur.pg ? cur.pg.shapes.length : 0;
  n.innerHTML = `<div class="pop-h">Covers</div>
    <div class="pr-row"><span>Colour</span><input type="color" value="${coverColor}" style="width:36px;height:26px;border:1px solid var(--ch);border-radius:6px;background:none;padding:2px;cursor:pointer"></div>
    <div class="dlg-b"><button class="btn" data-a="reset">Reset covers (${cnt})</button><button class="btn go">Done</button></div>`;
  n.querySelector("input[type=color]").addEventListener("input", (ev) => {
    coverColor = ev.target.value;
    syncCovDot();
    if (state && state.ui) {
      state.ui.coverColor = coverColor;
      queueSave();
    }
  });
  n.querySelector("[data-a=reset]").onclick = () => {
    if (!cur.pg) return;
    const c = cur.pg.shapes.length;
    if (!c) {
      toast("No covers on this page");
      return;
    }
    cur.pg.shapes.forEach((s) => (s.hid = false));
    renderShapes();
    queueSave();
    toast(c + (c === 1 ? " cover was" : " covers were") + " filled again — ready for the next class");
    closePop();
  };
  n.querySelector(".btn.go").onclick = () => closePop();
  return n;
}
