/*  noCHalk
      by Fluffless
      text.js
*/
"use strict";
/* ================= text toolbar ================= */
function focusContent() {
  const c = activeCont || plane.querySelector(".tbox>.cont");
  if (!c) return false;
  c.focus();
  if (savedRange && c.contains(savedRange.startContainer)) {
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(savedRange);
  }
  return true;
}
function exec(cmd, val) {
  if (!focusContent()) return;
  try {
    document.execCommand("styleWithCSS", false, false);
  } catch (e) {}
  document.execCommand(cmd, false, val);
  queueSave();
}
function insHTML(html) {
  if (!focusContent()) return;
  document.execCommand("insertHTML", false, html);
  queueSave();
}
function insertTextAtCaret(t) {
  if (!focusContent()) return;
  if (!document.execCommand("insertText", false, t)) document.execCommand("insertHTML", false, esc(t));
  queueSave();
}
function setFontSize(px) {
  if (!focusContent()) return;
  const sel = getSelection();
  if (sel && sel.isCollapsed && sel.rangeCount) {
    /* Word behaviour: with the caret alone, set the size for what comes
           next. A zero-width marker span (same technique as the tab stops)
           receives the caret, so typed text inherits the size. */
    const r = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.style.fontSize = px + "px";
    span.appendChild(document.createTextNode("\u200B"));
    r.insertNode(span);
    const r2 = document.createRange();
    r2.setStart(span.firstChild, 1);
    r2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r2);
    savedRange = r2.cloneRange();
    queueSave();
    return;
  }
  try {
    document.execCommand("styleWithCSS", false, false);
  } catch (e) {}
  document.execCommand("fontSize", false, 7);
  plane.querySelectorAll('font[size="7"]').forEach((f) => {
    const s = document.createElement("span");
    s.style.fontSize = px + "px";
    s.innerHTML = f.innerHTML;
    f.replaceWith(s);
  });
  queueSave();
}

let updPend = false;
document.addEventListener("selectionchange", () => {
  if (updPend) return;
  updPend = true;
  requestAnimationFrame(() => {
    updPend = false;
    const s = getSelection();
    if (s.rangeCount && s.anchorNode && plane.contains(s.anchorNode)) {
      const node = s.anchorNode,
        pe = node.nodeType === 3 ? node.parentElement : node;
      const c = pe ? pe.closest(".cont") : null;
      if (c) {
        activeCont = c;
        savedRange = s.getRangeAt(0).cloneRange();
        curCell = pe ? pe.closest("td,th") : null;
        const t = curCell ? curCell.closest("table") : null;
        const seg = document.getElementById("tblSeg");
        const inTbl = !!(t && mode === "text" && t.isConnected);
        if (seg) seg.classList.toggle("on", inTbl);
        if (inTbl) showTblbar(t);
        else hideTblbar();
        if (document.activeElement !== sizeIn && !popEl && pe) sizeIn.value = Math.round(parseFloat(getComputedStyle(pe).fontSize));
      }
    }
    /* live highlight: while the mode is on, a selection inside a text box
       highlights itself as it's made */
    if (typeof hlMode !== "undefined" && hlMode && s && !s.isCollapsed && s.rangeCount) {
      const an = s.anchorNode;
      if (an && plane.contains(an) && document.activeElement && document.activeElement.isContentEditable) {
        applyHighlightCurrent();
      }
    }
    refreshCmdButtons();
  });
});

function refreshCmdButtons() {
  let inPage = false;
  try {
    const s = getSelection();
    inPage = !!(s && s.anchorNode && plane.contains(s.anchorNode));
  } catch (e) {}
  toolbar.querySelectorAll("[data-cmd]").forEach((b) => {
    let on = false;
    if (inPage) {
      try {
        on = document.queryCommandState(b.dataset.cmd);
      } catch (e) {}
    }
    b.classList.toggle("on", on);
  });
}

toolbar.addEventListener("mousedown", (e) => {
  const b = e.target.closest("button");
  if (b && !b.closest("select,input")) e.preventDefault();
});
toolbar.querySelectorAll("[data-cmd]").forEach((b) =>
  b.addEventListener("click", () => {
    exec(b.dataset.cmd);
    refreshCmdButtons();
  }),
);
$("#indBtn").addEventListener("click", () => exec("indent"));
$("#outdBtn").addEventListener("click", () => exec("outdent"));
function applySizeIn() {
  const v = parseFloat(sizeIn.value);
  if (!isFinite(v)) return;
  const px = Math.min(160, Math.max(6, v));
  sizeIn.value = px;
  setFontSize(px);
}
sizeIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    applySizeIn();
    sizeIn.blur();
  }
});
let sizeInLast = null;
sizeIn.addEventListener("focus", () => {
  sizeInLast = sizeIn.value;
});
sizeIn.addEventListener("blur", () => {
  if (sizeIn.value !== sizeInLast) applySizeIn();
  sizeInLast = null;
});
$("#sizeChev").addEventListener("click", () => {
  if (popAnchor === $("#sizeChev")) {
    closePop();
    return;
  }
  const n = el("div", "pop-sizes");
  SIZES.forEach((v) => {
    const b = el("button", "", v + "");
    b.onclick = () => {
      closePop();
      sizeIn.value = v;
      applySizeIn();
    };
    n.append(b);
  });
  openPop($("#sizeChev"), n);
});
/* parity: right-click opens the same size menu */
$("#sizeChev").addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (popAnchor !== $("#sizeChev")) $("#sizeChev").click();
});

let txColor = "#1c1917";
$("#colBtn").addEventListener("click", () => {
  openPop(
    $("#colBtn"),
    swatchNode(TXCOLORS, txColor, (c) => {
      txColor = c;
      $("#colDot").style.background = c;
      exec("foreColor", c);
      closePop();
    }),
  );
});
/* parity: right-click opens the same colour menu */
$("#colBtn").addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (popAnchor !== $("#colBtn")) $("#colBtn").click();
});

/* ---- marker/highlight: toggle mode, per-character colors ---- */
let hlMode = false; /* highlight toggle state — off by default */
let hlColor = "#fde68a";

/* the button: click toggles, hold/right-click configures */
(function wireHilBtn() {
  const b = document.getElementById("hilBtn");
  if (!b) return;
  holdEdit(
    b,
    () => toggleHighlight(),
    () => openPop(b, hlConfigNode()),
  );
  syncHilDot();
})();
function syncHilDot() {
  const d = document.getElementById("hilDot");
  if (d) d.style.background = hlMode ? hlColor : "transparent";
}

function hlConfigNode() {
  const n = el("div", "pop-preset");
  n.append(el("div", "pop-h", "Highlight colour"));
  const row = el("div", "pop-colors");
  HLCOLORS.filter((c) => c !== "none").forEach((c) => {
    const s = el("button", "sw" + (c === hlColor ? " on" : ""));
    s.style.background = c;
    s.title = c;
    s.onclick = () => {
      hlColor = c;
      syncHilDot();
      if (hlMode) applyHighlightCurrent();
      closePop();
    };
    row.append(s);
  });
  const cust = el("label", "sw-cust", '<input type="color" title="Pick any colour">');
  cust.querySelector("input").addEventListener("input", (ev) => {
    hlColor = ev.target.value;
    syncHilDot();
    if (hlMode) applyHighlightCurrent();
  });
  row.append(cust);
  n.append(row);
  n.append(el("div", "pi-r", "Click the button to toggle highlighting on/off."));
  return n;
}
function toggleHighlight() {
  hlMode = !hlMode;
  document.getElementById("hilBtn").classList.toggle("on", hlMode);
  syncHilDot();
  const sel = getSelection();
  const hasSel = sel && !sel.isCollapsed && sel.rangeCount && plane.contains(sel.anchorNode);
  if (hlMode) {
    if (hasSel) {
      applyHighlightCurrent(); /* selection made: mark it */
    } else {
      plantHlMarker(); /* caret: mark what gets typed from here */
    }
    toast("Highlight on — text you write and select is marked");
  } else {
    if (hasSel) removeHighlightCurrent(); /* selection made: strip its marks */
    clearHlMarker();
    toast("Highlight off");
  }
}

/* ---- mark-as-you-type: a zero-width span carrying the background ---- */
let hlMarker = null;
function plantHlMarker() {
  clearHlMarker();
  if (!focusContent()) return;
  const sel = getSelection();
  if (!sel || !sel.isCollapsed || !sel.rangeCount) return; /* only for a bare caret */
  const r = sel.getRangeAt(0);
  const span = document.createElement("span");
  span.className = "hltype";
  span.style.backgroundColor = hlColor;
  span.appendChild(document.createTextNode("\u200B"));
  r.insertNode(span);
  const r2 = document.createRange();
  r2.setStart(span.firstChild, 1);
  r2.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r2);
  savedRange = r2.cloneRange();
  hlMarker = span;
}
function clearHlMarker() {
  if (hlMarker) {
    try {
      const fc = hlMarker.firstChild;
      if (fc && fc.nodeType === 3 && fc.textContent === "\u200B" && !hlMarker.textContent.replace("\u200B", "")) {
        hlMarker.remove();
      }
      /* user typed inside the marker: keep the marked text, drop our bookkeeping */
    } catch (e) {}
    hlMarker = null;
  }
  /* the caret must not sit inside any highlighted element,
     or typing just extends the colored span. Split at the caret and
     step out to a clean position after the marks. */
  const sel = getSelection();
  if (!sel || !sel.isCollapsed || !sel.rangeCount) return;
  const n = sel.anchorNode;
  if (!n || !plane.contains(n)) return;
  const pe = n.nodeType === 3 ? n.parentElement : n;
  if (!pe) return;
  /* climb to the nearest highlighted ancestor (background style, mark, or legacy attr) */
  let host = pe;
  while (host && host !== plane && !(host.classList && host.classList.contains("cont"))) {
    const bg = host.style ? host.style.backgroundColor : "";
    const marked = host.tagName === "MARK";
    const attr = host.hasAttribute && (host.hasAttribute("backcolor") || host.hasAttribute("bgcolor"));
    if ((bg && bg !== "transparent") || marked || attr) break;
    host = host.parentElement;
  }
  if (!host || host === plane || (host.classList && host.classList.contains("cont"))) return; /* not inside a highlight */

  /* split the text node at the caret so the tail becomes plain */
  if (n.nodeType === 3) {
    const off = sel.anchorOffset;
    if (off < n.textContent.length) n.splitText(off);
  }
  /* move the caret to a clean position immediately AFTER the highlighted host */
  const out = document.createRange();
  const nx = host.nextSibling;
  if (nx && nx.nodeType === 3) out.setStart(nx, 0);
  else out.setStartAfter(host);
  out.collapse(true);
  sel.removeAllRanges();
  sel.addRange(out);
  savedRange = out.cloneRange();
  /* a zero-width plain spacer guarantees the next keystroke has somewhere clean to land,
     even if the host is the last child of its paragraph */
  try {
    const r2 = sel.getRangeAt(0);
    const spacer = document.createTextNode("\u200B");
    r2.insertNode(spacer);
    const r3 = document.createRange();
    r3.setStartAfter(spacer);
    r3.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r3);
    savedRange = r3.cloneRange();
  } catch (e) {}
}
/* apply highlight to the current selection — exactly the selection, nothing else */
function applyHighlightCurrent() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return; /* caret alone: nothing to do */
  try {
    document.execCommand("styleWithCSS", false, true);
  } catch (e) {}
  try {
    document.execCommand("hiliteColor", false, hlColor);
  } catch (e) {
    try {
      document.execCommand("backColor", false, hlColor);
    } catch (e2) {}
  }
  try {
    document.execCommand("styleWithCSS", false, false);
  } catch (e) {}
  queueSave();
}
/* remove highlight from the current selection — DOM surgery, selection-exact */
function removeHighlightCurrent() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const cont = activeCont || plane.querySelector(".tbox>.cont");
  if (!cont || !cont.contains(r.commonAncestorContainer)) return;
  const walker = document.createTreeWalker(cont, NodeFilter.SHOW_ELEMENT);
  const touched = [];
  let n;
  while ((n = walker.nextNode())) {
    if (r.intersectsNode(n)) touched.push(n);
  }
  let changed = false;
  touched.forEach((elx) => {
    const bg = elx.style ? elx.style.backgroundColor : "";
    const marked = elx.tagName === "MARK";
    const attr = elx.hasAttribute && (elx.hasAttribute("backcolor") || elx.hasAttribute("bgcolor"));
    if ((bg && bg !== "transparent") || marked || attr) {
      changed = true;
      if (elx.style) elx.style.backgroundColor = "";
      try {
        elx.removeAttribute("backcolor");
        elx.removeAttribute("bgcolor");
      } catch (e) {}
    }
  });
  /* unwrap empty mark/font wrappers in the range so no stray tags pile up */
  touched.forEach((elx) => {
    if ((elx.tagName === "MARK" || elx.tagName === "FONT") && !elx.attributes.length && !elx.childNodes.length) {
      elx.remove();
      changed = true;
    }
  });
  if (changed) queueSave();
}

/* ---- formulas ---- */
function insertFrac() {
  insHTML(
    `<span class="mfrac" contenteditable="false"><span class="num" contenteditable="true">a</span><span class="den" contenteditable="true">b</span></span>&nbsp;`,
  );
  requestAnimationFrame(() => {
    const f = [...plane.querySelectorAll(".mfrac .num")].pop();
    if (f) selectIn(f);
  });
}
function insertSqrt(idx) {
  const svg = `<svg class="sqsvg" viewBox="0 0 10 16" preserveAspectRatio="none"><path d="M0.6 9.2 L2.9 15 L9.6 0.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const idxH = idx > 2 ? `<sup class="sqidx">${idx}</sup>` : "";
  insHTML(`<span class="msqrt" contenteditable="false">${idxH}${svg}<span class="sqin" contenteditable="true">x</span></span>&nbsp;`);
  requestAnimationFrame(() => {
    const f = [...plane.querySelectorAll(".msqrt .sqin")].pop();
    if (f) selectIn(f);
  });
}

$("#symBtn").addEventListener("click", () => {
  openPop($("#symBtn"), symNode());
});
function symFavs() {
  if (!Array.isArray(state.ui.symFavs)) state.ui.symFavs = [];
  const i = state.ui.symFavs.indexOf("");
  if (i >= 0) state.ui.symFavs.splice(i, 1);
  return state.ui.symFavs;
}
function toggleSymFav(s) {
  if (!s) return;
  const favs = symFavs();
  const i = favs.indexOf(s);
  if (i >= 0) favs.splice(i, 1);
  else {
    if (favs.length >= 12) {
      toast("Favorites are full — right-click one in the toolbar to remove it");
      return;
    }
    favs.push(s);
  }
  queueSave();
  renderSymFavs();
  document.querySelectorAll(".pop-syms .sym").forEach((b) => {
    const key = b._fav || b.textContent;
    b.classList.toggle("fav", favs.includes(key));
  });
}
function renderSymFavs() {
  if (!state || !state.ui) return;
  const box = $("#symFavBox");
  if (!box) return;
  box.innerHTML = "";
  symFavs().forEach((s) => {
    if (s === "frac") {
      const b = el("button", "tb symfav", '<span class="frg" style="font-size:11px"><i>a</i><i>b</i></span>');
      b.title = "Insert fraction — right-click to remove from favorites";
      b.addEventListener("click", () => insertFrac());
      b.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        toggleSymFav(s);
      });
      box.append(b);
      return;
    }
    const m = /^root(\d)$/.exec(s);
    if (m) {
      const idx = parseInt(m[1], 10);
      const b = el("button", "tb symfav", esc(idx === 2 ? "√" : idx + "√"));
      b.title = "Insert " + (idx === 2 ? "square root" : idx + "th root") + " — right-click to remove from favorites";
      b.addEventListener("click", () => insertSqrt(idx));
      b.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        toggleSymFav(s);
      });
      box.append(b);
      return;
    }
    const b = el("button", "tb symfav", esc(s));
    b.title = "Insert " + s + " — right-click to remove from favorites";
    b.addEventListener("click", () => insertTextAtCaret(s));
    b.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      toggleSymFav(s);
    });
    box.append(b);
  });
}
function symNode() {
  const n = el("div", "pop-syms");
  n.append(el("div", "ph", "Right-click a symbol to pin it next to the π button"));
  n.append(el("div", "ph", "Formulas"));
  const fr = el("div", "syms");
  const bf = el("button", "sym" + (symFavs().includes("frac") ? " fav" : ""), '<span class="frg"><i>a</i><i>b</i></span>');

  bf._fav = "frac";
  bf.title = "Fraction (a over b) — right-click to pin/unpin";
  bf.onclick = () => insertFrac();
  bf.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    toggleSymFav("frac");
  });
  fr.append(bf);
  [
    [2, "√"],
    [3, "³√"],
    [4, "⁴√"],
    [5, "⁵√"],
  ].forEach(([idx, lb]) => {
    const b = el("button", "sym" + (symFavs().includes("root" + idx) ? " fav" : ""), lb);
    b._fav = "root" + idx;
    b.title = (idx === 2 ? "Square root" : idx + "th root") + " — right-click to pin/unpin";
    b.onclick = () => insertSqrt(idx);
    b.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      toggleSymFav("root" + idx);
    });
    fr.append(b);
  });
  n.append(fr);

  SYMS.forEach(([g, list]) => {
    n.append(el("div", "ph", g));
    const row = el("div", "syms");
    list.forEach((s) => {
      const fav = symFavs().includes(s);
      const b = el("button", "sym" + (fav ? " fav" : ""), esc(s));
      b.title = "Insert " + s + " — right-click to " + (fav ? "remove from" : "add to") + " favorites";
      b.onclick = () => insertTextAtCaret(s);
      b.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        toggleSymFav(s);
      });
      row.append(b);
    });
    n.append(row);
  });
  return n;
}
