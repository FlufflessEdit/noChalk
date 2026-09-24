/*  noCHalk
      by Fluffless
      presets.js
*/
"use strict";
/* ---- presets ---- */
function wirePresetBtn(b, { onSelect, onEdit, getList, afterOrder }) {
  b.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    onEdit();
  });
  b.addEventListener("pointerdown", (e) => {
    if (e.button === 2 || e.button === 1) return;
    const sx = e.clientX,
      sy = e.clientY;
    let moved = false,
      edited = false;
    const t = setTimeout(() => {
      if (!moved) {
        edited = true;
        onEdit();
      }
    }, 550);
    const mv = (e2) => {
      if (!moved && Math.hypot(e2.clientX - sx, e2.clientY - sy) > 6) {
        moved = true;
        clearTimeout(t);
        b.classList.add("drag");
      }
      if (moved && !edited) {
        const sibs = [...b.parentElement.querySelectorAll(".pdot")].filter((x) => x !== b && x._p);
        for (const sib of sibs) {
          const r = sib.getBoundingClientRect();
          if (e2.clientY > r.top - 10 && e2.clientY < r.bottom + 10 && e2.clientX > r.left - 12 && e2.clientX < r.right + 12) {
            if (e2.clientX < r.left + r.width / 2) b.parentElement.insertBefore(b, sib);
            else b.parentElement.insertBefore(b, sib.nextSibling);
            break;
          }
        }
      }
    };
    const up = () => {
      clearTimeout(t);
      b.removeEventListener("pointermove", mv);
      b.removeEventListener("pointerup", up);
      b.removeEventListener("pointercancel", up);
      b.classList.remove("drag");
      if (moved && !edited) {
        const order = [...b.parentElement.querySelectorAll(".pdot")].filter((x) => x._p).map((x) => x._p);
        const list = getList();
        list.length = 0;
        list.push(...order);
        queueSave();
        afterOrder();
      } else if (!moved && !edited) onSelect();
    };
    try {
      b.setPointerCapture(e.pointerId);
    } catch (err) {}
    b.addEventListener("pointermove", mv);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
  });
}

function syncDrawIcon() {
  const b = document.getElementById("modeDrawBtn");
  if (b) b.querySelector("use").setAttribute("href", penOnly ? "#i-pen" : "#i-penhand");
}

function presetDotSize(hl, w) {
  return hl ? Math.max(11, Math.min(27, 10 + w * 0.6)) : Math.max(10, Math.min(27, 9 + w * 1.7));
}
function renderPresets() {
  const box = $("#presetBox");
  box.innerHTML = "";
  if (drawTool === "eraser") {
    ERASERS.forEach((er, i) => {
      const b = el("button", "pdot er" + ((state.ui.eraserIdx || 0) === i ? " on" : ""));
      if (er.k === "line") {
        b.innerHTML = '<svg class="ic" style="width:24px;height:14px"><use href="#i-squig"/></svg>';
        b.title = "Erase whole strokes at once";
      } else {
        const s = [13, 17, 23][i - 1];
        b.innerHTML = `<svg class="ic" style="width:${s}px;height:${s}px"><use href="#i-eraser"/></svg>`;
        b.title = "Precise eraser — " + ["small", "medium", "big"][i - 1];
      }
      b.onclick = () => {
        state.ui.eraserIdx = i;
        queueSave();
        renderPresets();
      };
      box.append(b);
    });
    return;
  }

  const hl = drawTool === "hl";
  const list = hl ? state.ui.hlPresets : state.ui.penPresets;
  const act = hl ? activeHl : activePen;
  list.forEach((p) => {
    const b = el("button", "pdot" + (p === act ? " on" : ""));
    const d = presetDotSize(hl, p.w);
    b.style.width = d + "px";
    b.style.height = d + "px";
    b.style.background = p.c;
    if (hl) b.style.opacity = 0.85;
    b.title = p.c + " · size " + p.w + " — click to use, hold or right-click to edit, drag to sort";
    b._p = p;
    wirePresetBtn(b, {
      onSelect: () => {
        if (hl) {
          activeHl = p;
          state.ui.hlIdx = list.indexOf(p);
        } else {
          activePen = p;
          state.ui.penIdx = list.indexOf(p);
        }
        if (typeof disarmShape === "function") disarmShape();
        renderPresets();
      },
      onEdit: () => openPop(b, presetEditorNode(drawTool, p)),
      getList: () => list,
      afterOrder: renderPresets,
    });
    box.append(b);
  });
  for (let i = list.length; i < 8; i++) {
    const b = el("button", "pdot empty");
    b.title = "Empty preset slot — click to set colour and size";
    b.onclick = () => openPop(b, presetEditorNode(drawTool, null));
    box.append(b);
  }
}
function removePreset(tool, p) {
  const list = tool === "hl" ? state.ui.hlPresets : state.ui.penPresets;
  const i = list.indexOf(p);
  if (i < 0) return;
  list.splice(i, 1);
  if (tool === "hl") {
    if (activeHl === p) activeHl = list[0] || null;
  } else {
    if (activePen === p) activePen = list[0] || null;
  }
  queueSave();
  renderPresets();
  toast("Preset removed");
}
function presetEditorNode(tool, p) {
  const hl = tool === "hl";
  const list = hl ? state.ui.hlPresets : state.ui.penPresets;
  const n = el("div", "pop-preset");
  n.innerHTML = `<div class="pop-h">${hl ? "Marker" : "Pen"} preset</div>
    <div class="pr-row"><span>Colour</span><input type="color" value="${p ? p.c : hl ? "#f7dd4f" : "#201d1a"}"></div>
    <div class="pr-row"><span>Size</span><input type="range" min="${hl ? 6 : 1}" max="${hl ? 24 : 10}" step="${hl ? 1 : 0.5}" value="${p ? p.w : hl ? 13 : 2.5}"></div>
    <div class="pr-prev"><span class="pv"></span></div>
    <div class="dlg-b">${p ? '<button class="btn danger">Remove</button>' : ""}<button class="btn go">Save</button></div>`;
  const cin = n.querySelector("input[type=color]"),
    rin = n.querySelector("input[type=range]"),
    pv = n.querySelector(".pv");
  const upd = () => {
    const c = cin.value,
      w = parseFloat(rin.value);
    const d = presetDotSize(hl, w);
    pv.style.cssText = `width:${d}px;height:${d}px;background:${c};border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);${hl ? "opacity:.6;" : ""}`;
  };
  cin.addEventListener("input", upd);
  rin.addEventListener("input", upd);
  upd();
  n.querySelector(".btn.go").onclick = () => {
    if (!p) {
      if (list.length >= 8) {
        toast("All 8 preset slots are used — remove one first");
        return;
      }
      p = { c: cin.value, w: parseFloat(rin.value) };
      list.push(p);
      if (hl) activeHl = p;
      else activePen = p;
    } else {
      p.c = cin.value;
      p.w = parseFloat(rin.value);
    }
    queueSave();
    renderPresets();
    closePop();
  };
  const rm = n.querySelector(".btn.danger");
  if (rm)
    rm.onclick = () => {
      closePop();
      removePreset(tool, p);
    };
  return n;
}
$("#drawToolSeg")
  .querySelectorAll("button")
  .forEach((b) => b.addEventListener("click", () => setDrawTool(b.dataset.tool)));
(function wireDrawBtn() {
  const b = document.getElementById("modeDrawBtn");
  if (!b) return;
  holdEdit(
    b,
    () => {},
    () => openPop(b, drawConfigNode()),
  );
})();
function drawConfigNode() {
  const n = el("div", "pop-preset");
  n.innerHTML = `<div class="pop-h">Draw settings</div>
    <label class="pr-row" style="cursor:pointer"><input type="checkbox" ${penOnly ? "checked" : ""}><span>Pen only — fingers never draw: one finger pans, two pinch-zoom</span></label>
    <div class="dlg-b"><button class="btn go">Done</button></div>`;
  const cb = n.querySelector("input[type=checkbox]");
  cb.addEventListener("change", () => {
    penOnly = cb.checked;
    syncDrawIcon();
    state.ui.penOnly = penOnly;
    queueSave();
  });
  n.querySelector(".btn.go").onclick = () => closePop();
  return n;
}
