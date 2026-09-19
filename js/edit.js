/*  noCHalk
      by Fluffless
      edit.js
*/
"use strict";
/* ---- Word-style tab stops ---- */
function insertTabNodes(withBr, width) {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0).cloneRange();
  if (!sel.isCollapsed) r.deleteContents();
  const span = document.createElement("span");
  span.className = "tabsp";
  span.style.width = Math.max(4, Math.round(width)) + "px";
  const zw = document.createTextNode("\u200B");
  if (withBr) {
    const br = document.createElement("br");
    r.insertNode(br);
    br.after(span, zw);
  } else {
    r.insertNode(span);
    span.after(zw);
  }
  const r2 = document.createRange();
  r2.setStart(zw, 1);
  r2.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r2);
  savedRange = r2.cloneRange();
  queueSave();
}
function insertTabStop() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  const an = sel.anchorNode;
  if (!an) return;
  const pe = an.nodeType === 3 ? an.parentElement : an;
  const c = pe && pe.closest ? pe.closest(".cont") : null;
  if (!c) return;
  const contR = c.getBoundingClientRect();
  const cs = getComputedStyle(c);
  const padL = parseFloat(cs.paddingLeft) || 0,
    padR = parseFloat(cs.paddingRight) || 0;
  let x = null;
  const r = sel.getRangeAt(0);
  const rects = r.getClientRects();
  if (rects.length) x = rects[0].left;
  else {
    const br = r.getBoundingClientRect();
    if (br && (br.left || br.top || br.height)) x = br.left;
  }
  if (x == null) {
    try {
      const rr = r.cloneRange();
      rr.collapse(false);
      const m = document.createElement("span");
      m.textContent = "\u200B";
      rr.insertNode(m);
      x = m.getBoundingClientRect().left;
      m.remove();
      try {
        pe.normalize();
      } catch (err) {}
    } catch (err) {}
  }
  let rel = x == null ? 0 : (x - contR.left) / VP.z - padL;
  if (rel < 0) rel = 0;
  const maxX = c.clientWidth - padL - padR;
  let stop = Math.floor(rel / TABSTEP) * TABSTEP + TABSTEP;
  if (stop <= rel + 0.5) stop += TABSTEP;
  if (stop > maxX + 2) {
    insertTabNodes(true, TABSTEP);
  } else {
    insertTabNodes(false, Math.max(4, Math.round(stop - rel)));
  }
  queueSave();
}
function removeTabAtCaret(back) {
  const sel = getSelection();
  if (!sel || !sel.isCollapsed || !sel.rangeCount) return false;
  const n = sel.anchorNode,
    off = sel.anchorOffset;
  if (!n) return false;
  const isTab = (s) => s && s.nodeType === 1 && s.classList && s.classList.contains("tabsp");
  const pe = n.nodeType === 3 ? n.parentElement : n;
  if (pe && pe.classList && pe.classList.contains("tabsp")) {
    pe.remove();
    queueSave();
    return true;
  }
  if (back) {
    if (n.nodeType === 3) {
      const ps = n.previousSibling;
      if (isTab(ps)) {
        if (off === 1 && n.textContent === "\u200B") {
          ps.remove();
          n.textContent = "";
          const r2 = document.createRange();
          r2.setStart(n, 0);
          r2.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r2);
        } else ps.remove();
        queueSave();
        return true;
      }
      if (off === 0 && !ps && n.parentElement) {
        const pp = n.parentElement.previousSibling;
        if (isTab(pp)) {
          pp.remove();
          queueSave();
          return true;
        }
      }
    }
    if (n.nodeType === 1 && off === 0) {
      const ps = n.previousSibling;
      if (isTab(ps)) {
        ps.remove();
        queueSave();
        return true;
      }
    }
  } else {
    if (n.nodeType === 3) {
      const ns = n.nextSibling;
      if (isTab(ns)) {
        ns.remove();
        queueSave();
        return true;
      }
      if (off === n.textContent.length && ns && ns.nodeType === 3 && ns.textContent === "\u200B") {
        const nn = ns.nextSibling;
        if (isTab(nn)) {
          ns.remove();
          nn.remove();
          queueSave();
          return true;
        }
      }
    }
    if (n.nodeType === 1) {
      const cn = n.childNodes[off];
      if (isTab(cn)) {
        cn.remove();
        queueSave();
        return true;
      }
    }
  }
  return false;
}
plane.addEventListener("keydown", (e) => {
  if (linkAskEl && e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt") closeLinkAsk();

  if (e.key === "Backspace" || e.key === "Delete") {
    if (removeTabAtCaret(e.key === "Backspace")) {
      e.preventDefault();
      return;
    }
  }
  if (e.key === "Enter") {
    const node = getSelection().anchorNode;
    const f = node ? ((node.nodeType === 3 ? node.parentElement : node) || {}).closest?.(".mfrac,.msqrt") : null;
    if (f) {
      e.preventDefault();
      const den = f.querySelector(".den");
      if (den) selectIn(den);
    }
  }

  if (e.key === "ArrowRight") {
    const sel = getSelection();
    if (sel && sel.isCollapsed && sel.rangeCount) {
      const n = sel.anchorNode;
      const pe = n ? (n.nodeType === 3 ? n.parentElement : n) : null;
      const sub = pe && pe.closest ? pe.closest("sub,sup") : null;
      if (sub && sub.parentElement && sub.contains(n)) {
        const r = document.createRange();
        r.setStart(n, sel.anchorOffset);
        r.setEnd(sub, sub.childNodes.length);
        if (r.collapsed) {
          e.preventDefault();
          const out = document.createRange();
          const nx = sub.nextSibling;
          if (nx && nx.nodeType === 3) out.setStart(nx, 0);
          else out.setStartAfter(sub);
          out.collapse(true);
          sel.removeAllRanges();
          sel.addRange(out);
          savedRange = out.cloneRange();
        }
      }
    }
  }

  if (e.key === "Tab") {
    const node = getSelection().anchorNode;
    const pe = node ? (node.nodeType === 3 ? node.parentElement : node) || {} : null;
    const cont = pe && pe.closest ? pe.closest(".cont") : null;
    if (!cont) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const cell = pe && pe.closest ? pe.closest("td,th") : null;
    if (cell) {
      moveNextCell(cell);
      return;
    }
    const li = pe && pe.closest ? pe.closest("li") : null;
    if (li) {
      exec(e.shiftKey ? "outdent" : "indent");
      return;
    }
    if (e.shiftKey) {
      exec("outdent");
      return;
    }
    insertTabStop();
  }
});
function moveNextCell(cell) {
  const row = cell.parentElement;
  let next = cell.nextElementSibling;
  if (!next) next = row.nextElementSibling ? row.nextElementSibling.firstElementChild : null;
  if (next) selectIn(next);
}

/* ---- tables ---- */
$("#tableBtn").addEventListener("click", () => openPop($("#tableBtn"), tableGridNode()));
function tableGridNode() {
  const n = el("div", "tg");
  n.append(el("div", "tg-l", "3 × 3"));
  const g = el("div", "tg-g");
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const cell = el("button", "tg-c");
      cell.dataset.r = r;
      cell.dataset.c = c;
      g.append(cell);
    }
  g.addEventListener("mouseover", (e) => {
    const t = e.target.closest(".tg-c");
    if (!t) return;
    const R = +t.dataset.r,
      C = +t.dataset.c;
    g.querySelectorAll(".tg-c").forEach((x) => x.classList.toggle("hl", +x.dataset.r <= R && +x.dataset.c <= C));
    n.querySelector(".tg-l").textContent = R + 1 + " × " + (C + 1);
  });
  g.addEventListener("mouseleave", () => {
    g.querySelectorAll(".tg-c").forEach((x) => x.classList.remove("hl"));
  });
  g.addEventListener("click", (e) => {
    const t = e.target.closest(".tg-c");
    if (!t) return;
    insertTable(+t.dataset.r + 1, +t.dataset.c + 1);
    closePop();
  });
  n.append(g);
  return n;
}
function insertTable(r, c) {
  const html = `<table><tbody><tr>${"<th><br></th>".repeat(c)}</tr>${`<tr>${"<td><br></td>".repeat(c)}</tr>`.repeat(r - 1)}</tbody></table><p><br></p>`;
  const wx = Math.max(24, (vpW / 2 - VP.x) / VP.z - 300),
    wy = Math.max(pgHead.offsetHeight, (vpH / 2 - VP.y) / VP.z - 60);
  const rec = { id: uid(), x: snapVal(wx), y: snapVal(wy), w: 600, ro: false, html };
  cur.pg.conts.push(rec);
  growPaperTo(rec.x + 600 + 140, rec.y + 500);
  const w = renderBox(rec);
  queueSave();
  const cell = w.querySelector("th,td");
  if (cell) selectIn(cell);
  centerViewOn(w);
}
/* ---- table ribbon controls: state, wiring, operations — one unit ---- */
function showTblbar(t) {
  curTable = t && t.isConnected ? t : null;
}
function hideTblbar() {
  curTable = null;
}
(function wireTableSeg() {
  const b = (id, fn) => {
    const n = document.getElementById(id);
    if (n) n.addEventListener("click", fn);
  };
  b("tRowAdd", () => tableOp("row+"));
  b("tRowDel", () => tableOp("row-"));
  b("tColAdd", () => tableOp("col+"));
  b("tColDel", () => tableOp("col-"));
})();
function tableOp(op) {
  /* derive the table from the caret if the state wiring is stale */
  const t = curTable || (curCell && curCell.closest ? curCell.closest("table") : null);
  if (!t || !curCell || !t.contains(curCell)) return;
  const rowIdx = curCell.parentElement.rowIndex,
    colIdx = curCell.cellIndex;
  if (op === "row+") {
    const tr = document.createElement("tr");
    for (let i = 0; i < t.rows[0].cells.length; i++) tr.innerHTML += "<td><br></td>";
    t.rows[rowIdx].after(tr);
  }
  if (op === "row-" && t.rows.length > 1) t.deleteRow(rowIdx);
  if (op === "col+")
    t.querySelectorAll("tr").forEach((tr) => {
      const ref = tr.cells[colIdx] || null;
      const td = document.createElement("td");
      td.innerHTML = "<br>";
      tr.insertBefore(td, ref ? ref.nextSibling : null);
    });
  if (op === "col-" && (t.rows[0] ? t.rows[0].cells.length : 0) > 1)
    t.querySelectorAll("tr").forEach((tr) => {
      if (tr.cells[colIdx]) tr.deleteCell(colIdx);
    });
  queueSave();
  const after = t.rows[Math.min(rowIdx, t.rows.length - 1)]?.cells[Math.min(colIdx, (t.rows[0] ? t.rows[0].cells.length : 1) - 1)];
  if (after) selectIn(after);
}
/* the floating table bar is gone — its state duty lives on here:
   showTblbar records the table containing the caret (called from
   text.js selectionchange); hideTblbar clears it. */
function showTblbar(t) {
  curTable = t && t.isConnected ? t : null;
}
function hideTblbar() {
  curTable = null;
}
/* ---- paste & drop ---- */
plane.addEventListener("paste", (e) => {
  const c = e.target.closest ? e.target.closest(".cont") : null;
  if (!c) return;
  const cd = e.clipboardData;
  if (cd && cd.files && cd.files.length) {
    e.preventDefault();
    handleFiles([...cd.files]);
    return;
  }
  const html = cd && cd.getData("text/html");
  if (html) {
    e.preventDefault();
    (async () => {
      let h = sanitize(html);
      h = await extractDataURIsToAssets(h);
      c.focus();
      document.execCommand("insertHTML", false, h);
      queueSave();
    })();
    return;
  }

  /* a pasted URL *on its own*: a plain link right away (image URLs ask) */
  const alone = ((cd && cd.getData("text/plain")) || "").trim();
  if (alone && /^(?:https?:\/\/|www\.)[^\s<>"']+$/.test(alone)) {
    e.preventDefault();
    c.focus();
    document.execCommand("insertText", false, alone);
    const sel = getSelection();
    if (sel && sel.rangeCount && sel.anchorNode && sel.anchorNode.nodeType === 3) {
      const off = sel.anchorOffset;
      const r = document.createRange();
      r.setStart(sel.anchorNode, off - alone.length);
      r.setEnd(sel.anchorNode, off);
      if (IMG_URL_RE.test(alone)) {
        linkAskUrl = alone;
        linkAskRange = r;
        showLinkAsk();
      } else {
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand("createLink", false, /^www\./i.test(alone) ? "https://" + alone : alone);
        toast("Inserted as link — Ctrl+click to open");
      }
    }
    queueSave();
    return;
  }
  const txt = cd && cd.getData("text/plain");
  if (txt && (txt.indexOf("\t") >= 0 || URL_IN_TEXT_RE.test(txt))) {
    e.preventDefault();
    const parts = txt.split(URL_IN_TEXT_SPLIT_RE);
    let h = parts
      .map((p) => {
        if (/^(?:https?:\/\/|www\.)/i.test(p)) {
          const href = /^www\./i.test(p) ? "https://" + p : p;
          return `<a href="${esc(href)}">${esc(p)}</a>`;
        }
        return esc(p);
      })
      .join("");
    h = h.replace(/\t/g, '<span class="tabsp" style="width:48px"></span>&#8203;').replace(/\r?\n/g, "<br>");
    c.focus();
    document.execCommand("insertHTML", false, h);
    queueSave();
  }
});
function sanitize(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  t.content
    .querySelectorAll("script,style,link,meta,iframe,object,embed,form,input,button,select,textarea,noscript,title,head,base,video,audio")
    .forEach((n) => n.remove());
  t.content.querySelectorAll("[style]").forEach((n) => {
    if (n.classList && n.classList.contains("tabsp")) return;
    ["white-space", "width", "max-width", "min-width", "position", "left", "top", "right", "bottom", "float"].forEach((pn) =>
      n.style.removeProperty(pn),
    );
    if (!n.style.cssText) n.removeAttribute("style");
  });
  t.content.querySelectorAll("*").forEach((n) => {
    [...n.attributes].forEach((a) => {
      const nm = a.name.toLowerCase();
      if (nm.startsWith("on") || (nm === "href" && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    });
  });
  return t.innerHTML;
}
async function extractDataURIsToAssets(html) {
  const re = /src="data:([^;,"]+);base64,([^"]*)"/g;
  const jobs = [];
  let m;
  while ((m = re.exec(html))) jobs.push(m);
  for (const j of jobs) {
    try {
      const bin = atob(j[2]);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const id = await addAsset(new Blob([u8], { type: j[1] }), "pasted-image", j[1]);
      html = html.replace(j[0], () => `data-asset="${id}"`);
    } catch (e) {}
  }
  return html;
}
titleEl.addEventListener("input", () => {
  queueSave();
  if (!cur.pg || domPageId !== cur.pg.id) return;
  const t = titleEl.textContent.replace(/\s+/g, " ").trim();
  const st = curStub();
  if (st) {
    st.title = t;
    st.modified = Date.now();
  }
  const tt = pageList.querySelector('.pg-it[data-pid="' + cur.pg.id + '"] .pg-tt');
  if (tt) tt.textContent = t || "Untitled page";
});

titleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const c = activeCont || plane.querySelector(".tbox>.cont");
    if (c) c.focus();
  }
});

/* ---- list font-size: each row and its marker track that row's first character ---- */
function syncListSizes() {
  plane.querySelectorAll(".cont ul, .cont ol").forEach((list) => {
    list.style.removeProperty("--li-size"); /* legacy whole-list value, if one was saved */
    list.querySelectorAll("li").forEach((li) => {
      /* the row's first visible character — skipping anything in a nested list */
      let px = null;
      const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement.closest("ul,ol") === list ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      let tn;
      while ((tn = walker.nextNode())) {
        if (tn.textContent.replace(/[\s\u00A0\u200B\uFEFF]/g, "")) {
          px = getComputedStyle(tn.parentElement).fontSize;
          break;
        }
      }
      /* measure first, then strip — a pasted li's own inline size
         survives as the variable instead of being lost */
      li.style.removeProperty("font-size");
      if (px) li.style.setProperty("--li-size", px);
      else li.style.removeProperty("--li-size");
    });
  });
}
plane.addEventListener("input", () => {
  if (plane.querySelector(".cont ul, .cont ol")) syncListSizes();
});

let dragCnt = 0;
viewport.addEventListener("dragover", (e) => {
  e.preventDefault();
});
viewport.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCnt++;
  viewport.classList.add("drag");
});
viewport.addEventListener("dragleave", () => {
  if (--dragCnt <= 0) {
    dragCnt = 0;
    viewport.classList.remove("drag");
  }
});
viewport.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCnt = 0;
  viewport.classList.remove("drag");
  if (e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]);
});

/* ---- typed links: on space, image URLs ask — plain URLs link automatically ---- */
let linkAskEl = null,
  linkAskRange = null,
  linkAskUrl = null;
const IMG_URL_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|$)/i;
const URL_IN_TEXT_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;
const URL_IN_TEXT_SPLIT_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/g;
const LINKRE = /(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]]$/;
function offerLink() {
  const sel = getSelection();
  if (!sel || !sel.isCollapsed || !sel.rangeCount) return;
  const n = sel.anchorNode;
  if (!n || n.nodeType !== 3) return;
  const pe = n.parentElement;
  if (!pe || !plane.contains(pe) || pe.closest("a")) return;
  const off = sel.anchorOffset;
  const m = LINKRE.exec(n.textContent.slice(0, off));
  if (!m) return;
  const url = /^www\./i.test(m[0]) ? "https://" + m[0] : m[0];
  if (IMG_URL_RE.test(url)) {
    linkAskUrl = url;
    linkAskRange = document.createRange();
    linkAskRange.setStart(n, off - m[0].length);
    linkAskRange.setEnd(n, off);
    showLinkAsk();
  } else {
    /* plain URL: wrap it as a link immediately, no interruption */
    const r = document.createRange();
    r.setStart(n, off - m[0].length);
    r.setEnd(n, off);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand("createLink", false, url);
    sel.collapseToEnd();
    queueSave();
  }
}
function showLinkAsk() {
  closeLinkAsk();
  const r = linkAskRange.getBoundingClientRect();
  linkAskEl = el("div");
  linkAskEl.id = "linkAsk";
  linkAskEl.innerHTML = `<span>Insert as</span><button data-a="img">Image</button><button data-a="x" title="Keep as plain text">×</button>`;
  document.body.append(linkAskEl);
  linkAskEl.style.left = Math.max(8, Math.min(innerWidth - 220, r.left)) + "px";
  linkAskEl.style.top = r.bottom + 8 + "px";
  linkAskEl.querySelector('[data-a="img"]').onclick = () => applyLinkAsk("img");
  linkAskEl.querySelector('[data-a="x"]').onclick = () => closeLinkAsk();
  linkAskEl.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  setTimeout(() => document.addEventListener("pointerdown", linkAskOutside, true), 0);
}
function linkAskOutside(e) {
  if (linkAskEl && !linkAskEl.contains(e.target)) closeLinkAsk();
}
function closeLinkAsk() {
  if (!linkAskEl) return;
  linkAskEl.remove();
  linkAskEl = null;
  linkAskRange = null;
  linkAskUrl = null;
  document.removeEventListener("pointerdown", linkAskOutside, true);
}
function applyLinkAsk(mode) {
  if (!linkAskRange || !linkAskUrl) return closeLinkAsk();
  if (mode === "img") {
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(linkAskRange);
    document.execCommand("delete");
    insHTML(`<img src="${esc(linkAskUrl)}" class="pg-img" alt="" loading="lazy">`);
    queueSave();
  }
  closeLinkAsk();
}
/* ---- HTML tool: paste markup, it runs in its own box ---- */
(function wireHtmlBtn() {
  const b = document.getElementById("htmlBtn");
  if (!b) return;
  b.addEventListener("click", () => openPop(b, htmlToolNode()));
})();

function htmlToolNode() {
  const n = el("div", "pop-preset");
  n.style.minWidth = "340px";
  n.append(el("div", "pop-h", "Insert HTML"));
  const ta = el("textarea", "html-tool-in");
  ta.placeholder = "Paste HTML here — scripts, iframes and styles run inside the box";
  ta.spellcheck = false;
  n.append(ta);
  const row = el("div", "dlg-b");
  const run = el("button", "btn go", "Insert");
  run.title = "Creates a box on the paper and runs the markup in it";
  row.append(run);
  n.append(row);
  run.addEventListener("click", () => {
    const html = ta.value.trim();
    closePop();
    if (!html) return;
    insertRunHtml(html);
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run.click();
    }
  });
  setTimeout(() => ta.focus(), 30);
  return n;
}

function insertRunHtml(html) {
  /* own read-only box near the middle of the current view */
  const wx = Math.max(24, (vpW / 2 - VP.x) / VP.z - 320),
    wy = Math.max(pgHead.offsetHeight, (vpH / 2 - VP.y) / VP.z - 60);
  const rec = { id: uid(), x: Math.round(wx), y: Math.round(wy), w: 700, ro: true, runHtml: html };
  cur.pg.conts.push(rec);
  growPaperTo(rec.x + rec.w + 140, rec.y + 900);
  const w = renderBox(rec);
  queueSave();
  requestAnimationFrame(() => centerViewOn(w));
  toast("HTML inserted — it runs until you reload the page, then needs a click");
}
