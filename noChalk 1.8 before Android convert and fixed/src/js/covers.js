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

/* ================= covers glued to text rows =================
   A cover placed over a text box remembers which character its top-left
   corner sits on. When rows above it are added or removed, the cover
   follows that row. */
function lineAnchorAt(cont, worldX, worldY) {
  const vRect = viewport.getBoundingClientRect();
  const sx = vRect.left + VP.x + worldX * VP.z;
  const syTop = vRect.top + VP.y + worldY * VP.z;
  /* aim at the first text line inside the cover: its top + a small offset.
     The offset must be small enough to stay in the first row but big
     enough to clear anti-aliasing gaps — half a line-height at current zoom. */
  const aim = syTop + Math.min(14 * VP.z, 12);
  /* browser-native hit test: which character is at this pixel? */
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(sx + 2, aim);
    if (r && cont.contains(r.startContainer)) {
      /* character offset within the whole box — robust across nested spans */
      const pre = document.createRange();
      pre.selectNodeContents(cont);
      pre.setEnd(r.startContainer, r.startOffset);
      const off = pre.toString().length;
      /* the row's top rect, measured on the character itself */
      const rects = r.getClientRects();
      let top = null;
      if (rects.length) top = rects[0].top;
      else {
        const rr = r.getBoundingClientRect();
        if (rr) top = rr.top;
      }
      if (top != null) return { off, top };
    }
  }
  /* fallback: the old line walk, for browsers without caretRangeFromPoint */
  const walker = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT);
  let n,
    base = 0;
  while ((n = walker.nextNode())) {
    const txt = n.textContent;
    if (!txt.trim()) {
      base += txt.length;
      continue;
    }
    const r = document.createRange();
    r.selectNodeContents(n);
    const lineRects = r.getClientRects();
    for (let li = 0; li < lineRects.length; li++) {
      const lr = lineRects[li];
      if (aim >= lr.top - 2 && aim <= lr.bottom + 2) {
        return { off: base, top: lr.top };
      }
    }
    base += txt.length;
  }
  return null;
}

function rangeAtCharOffset(cont, off) {
  const walker = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT);
  let n,
    count = 0;
  while ((n = walker.nextNode())) {
    const len = n.textContent.length;
    if (count + len >= off) {
      const r = document.createRange();
      r.setStart(n, Math.max(0, off - count));
      r.collapse(true);
      return r;
    }
    count += len;
  }
  const r = document.createRange();
  r.selectNodeContents(cont);
  r.collapse(false);
  return r;
}
function anchorCover(sh) {
  sh.anchor = null;
  const hosts = [...plane.querySelectorAll(".tbox:not(.ro)")];
  const host = hosts.find(
    (h) =>
      sh.x + 8 < h.offsetLeft + h.offsetWidth && sh.x + sh.w - 8 > h.offsetLeft && sh.y + 8 >= h.offsetTop && sh.y + 8 < h.offsetTop + h.offsetHeight,
  );
  if (!host) return;
  const cont = host.querySelector(".cont");
  if (!cont) return;
  const a = lineAnchorAt(cont, sh.x + 8, sh.y + 8);
  if (!a) return;
  const vRect = viewport.getBoundingClientRect();
  const rowTop = (a.top - vRect.top - VP.y) / VP.z;
  sh.anchor = { cid: host.dataset.cid, off: a.off, dx: sh.x - host.offsetLeft, dy: sh.y - rowTop, dr: sh.y - host.offsetTop };
}
function reflowAnchoredCovers() {
  if (!cur.pg) return;
  const vRect = viewport.getBoundingClientRect();
  let changed = false;
  cur.pg.shapes.forEach((sh) => {
    if (!sh.anchor) return;
    const host = plane.querySelector('.tbox[data-cid="' + sh.anchor.cid + '"]');
    if (!host) return;
    const cont = host.querySelector(".cont");
    if (!cont) return;
    const r = rangeAtCharOffset(cont, sh.anchor.off);
    if (!r) return;
    const rect = r.getBoundingClientRect();
    if (!rect || (!rect.top && !rect.height)) {
      /* character deleted: fall back to box-relative */
      if (Math.abs(host.offsetTop + sh.anchor.dr - sh.y) > 0.5) {
        sh.y = host.offsetTop + sh.anchor.dr;
        sh.x = host.offsetLeft + sh.anchor.dx;
        const d = shapesL.querySelector('.cover[data-id="' + sh.id + '"]');
        if (d) coverPos(d, sh);
        changed = true;
      }
      return;
    }
    const rowTop = (rect.top - vRect.top - VP.y) / VP.z;
    const ty = rowTop + sh.anchor.dy;
    if (Math.abs(ty - sh.y) > 0.5 || Math.abs(host.offsetLeft + sh.anchor.dx - sh.x) > 0.5) {
      sh.y = ty;
      sh.x = host.offsetLeft + sh.anchor.dx;
      const d = shapesL.querySelector('.cover[data-id="' + sh.id + '"]');
      if (d) coverPos(d, sh);
      changed = true;
    }
  });
  if (changed) queueSave();
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
  const s0 = { x: sh.x, y: sh.y, w: sh.w, h: sh.h };
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
  let moved = false,
    aborted = false;
  try {
    d.setPointerCapture(ev.pointerId);
  } catch (e) {}
  const mv = (e2) => {
    if (navGest) {
      aborted = true;
      up();
      return;
    }
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
    if (!moved && !resizing && !aborted && !navGest) {
      if (mode !== "select") setMode("select");
      sh.hid = !sh.hid;
      d.classList.toggle("hid", sh.hid);
    }
    if (!aborted && moved && !resizing) anchorCover(sh); /* keep it glued to its text row */
    if (moved && !aborted) {
      const s1 = { x: sh.x, y: sh.y, w: sh.w, h: sh.h };
      const apply = (s) => {
        Object.assign(sh, s);
        const d = shapesL.querySelector('.cover[data-id="' + sh.id + '"]');
        if (d) coverPos(d, sh);
        queueSave();
      };
      pushUndo(
        () => apply(s0),
        () => apply(s1),
      );
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
      const nsh = { id: uid(), x: Math.round(wx), y: Math.round(wy), w: Math.round(W), h: Math.round(H), color: coverColor, hid: false };
      cur.pg.shapes.push(nsh);
      renderShapes();
      anchorCover(nsh);
      pushUndo(
        () => {
          const i = cur.pg.shapes.indexOf(nsh);
          if (i >= 0) cur.pg.shapes.splice(i, 1);
          renderShapes();
          queueSave();
        },
        () => {
          cur.pg.shapes.push(nsh);
          renderShapes();
          queueSave();
        },
      );
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
