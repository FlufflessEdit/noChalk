/*  noCHalk
      by Fluffless
      tablecols.js
*/
"use strict";
/* ================= table tools (plain contenteditable tables) =================
   - Column resizing: drag a column border; widths live on <col> elements,
     saved with the box and restored on load.
   - Merge: select text across several cells, click — the selected
     rectangle becomes one cell (colspan/rowspan).
   - Split: a merged cell falls back into single cells.
   - Keeps the colgroup in step when the row/column buttons edit a table. */

(function () {
  let guide = null;
  let drag = null; /* { col, startW, sx, w } */
  let syncPend = false;

  /* ---------- grid model (span-aware) ---------- */
  function tableModel(table) {
    const rows = [...table.querySelectorAll("tr")];
    const grid = [];
    rows.forEach((tr, r) => {
      if (!grid[r]) grid[r] = [];
      [...tr.cells].forEach((c) => {
        const rs = c.rowSpan || 1,
          cs = c.colSpan || 1;
        let col = 0;
        while (grid[r][col] !== undefined) col++;
        for (let dr = 0; dr < rs; dr++) {
          for (let dc = 0; dc < cs; dc++) {
            if (!grid[r + dr]) grid[r + dr] = [];
            grid[r + dr][col + dc] = c;
          }
        }
      });
    });
    return grid;
  }
  function findCell(grid, cell) {
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++)
        if (grid[r][c] === cell && (r === 0 || grid[r - 1][c] !== cell) && (c === 0 || grid[r][c - 1] !== cell)) return { r, c };
    return null;
  }

  /* ---------- column resizing ---------- */
  function cellAt(target) {
    const el = target && target.nodeType === 3 ? target.parentElement : target;
    if (!el || !el.closest) return null;
    const td = el.closest(".cont td, .cont th");
    return td && td.closest(".cont") ? td : null;
  }
  function nearEdge(td, clientX, hitPx) {
    const r = td.getBoundingClientRect();
    return clientX >= r.right - hitPx && clientX <= r.right + hitPx;
  }
  function ensureColgroup(table) {
    let cg = table.querySelector(":scope > colgroup");
    if (cg) return cg;
    const row = table.querySelector("tr");
    if (!row) return null;
    cg = document.createElement("colgroup");
    const cells = [...row.cells];
    if (cells.some((c) => c.colSpan > 1)) {
      let n = 0;
      cells.forEach((c) => (n += c.colSpan || 1));
      const tw = table.getBoundingClientRect().width / VP.z;
      for (let i = 0; i < n; i++) {
        const col = document.createElement("col");
        col.style.width = Math.round(tw / n) + "px";
        cg.append(col);
      }
    } else {
      cells.forEach((c) => {
        const col = document.createElement("col");
        col.style.width = Math.round(c.getBoundingClientRect().width / VP.z) + "px";
        cg.append(col);
      });
    }
    table.insertBefore(cg, table.firstChild);
    return cg;
  }
  function syncColgroups() {
    plane.querySelectorAll(".cont table").forEach((table) => {
      const cg = table.querySelector(":scope > colgroup");
      if (!cg) return;
      const row = table.querySelector("tr");
      if (!row) return;
      let n = 0;
      [...row.cells].forEach((c) => (n += c.colSpan || 1));
      while (cg.children.length < n) cg.append(document.createElement("col"));
      while (cg.children.length > n) cg.lastChild.remove();
    });
  }
  const obs = new MutationObserver(() => {
    if (syncPend) return;
    syncPend = true;
    requestAnimationFrame(() => {
      syncPend = false;
      syncColgroups();
    });
  });
  obs.observe(plane, { childList: true, subtree: true });

  function showGuide(x) {
    if (!guide) {
      guide = el("div");
      guide.id = "colGuide";
      viewport.append(guide);
    }
    guide.style.display = "block";
    guide.style.left = x - viewport.getBoundingClientRect().left + "px";
  }
  function moveGuide(x) {
    guide.style.left = x - viewport.getBoundingClientRect().left + "px";
  }
  function hideGuide() {
    if (guide) guide.style.display = "none";
    viewport.classList.remove("colrz");
  }

  viewport.addEventListener(
    "pointerdown",
    (e) => {
      if (drag) return;
      const td = cellAt(e.target);
      if (!td || !nearEdge(td, e.clientX, e.pointerType === "touch" ? 12 : 7)) return;
      const table = td.closest("table");
      if (!table) return;
      const cg = ensureColgroup(table);
      if (!cg) return;
      const grid = tableModel(table);
      const pos = findCell(grid, td);
      const cs = td.colSpan || 1;
      const colIdx = pos ? pos.c + cs - 1 : td.cellIndex;
      const col = cg.children[colIdx];
      if (!col) return;
      e.preventDefault();
      e.stopPropagation();
      table.style.tableLayout = "fixed";
      const startW = parseFloat(col.style.width) || td.getBoundingClientRect().width / VP.z / cs;
      drag = { col, startW, sx: e.clientX, w: null };
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch (err) {}
      showGuide(e.clientX);
    },
    true,
  );

  viewport.addEventListener("pointermove", (e) => {
    if (drag) {
      if (navGest) {
        finish();
        return;
      }
      drag.w = Math.max(34, drag.startW + (e.clientX - drag.sx) / VP.z);
      moveGuide(e.clientX);
      e.preventDefault();
      return;
    }
    if (e.pointerType !== "mouse") return;
    const td = cellAt(e.target);
    viewport.classList.toggle("colrz", !!(td && nearEdge(td, e.clientX, 7)));
  });

  function finish() {
    if (!drag) return;
    if (drag.w != null) {
      drag.col.style.width = Math.round(drag.w) + "px";
      queueSave();
    }
    drag = null;
    hideGuide();
  }
  viewport.addEventListener("pointerup", finish);
  viewport.addEventListener("pointercancel", finish);
  viewport.addEventListener("pointerleave", () => viewport.classList.remove("colrz"));

  /* ---------- merge selected / split ---------- */
  function cellIsEmpty(c) {
    return !c.textContent.replace(/[\s\u00A0\u200B\uFEFF]/g, "");
  }
  function moveContent(dst, src) {
    if (cellIsEmpty(src)) return;
    if (cellIsEmpty(dst)) {
      dst.innerHTML = src.innerHTML;
    } else {
      dst.appendChild(document.createElement("br"));
      while (src.firstChild) dst.appendChild(src.firstChild);
    }
  }
  function caretEnd(c) {
    c.focus();
    const r = document.createRange();
    r.selectNodeContents(c);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function selectedCells(table) {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return [];
    const r = sel.getRangeAt(0);
    if (r.collapsed) return [];
    const cells = [];
    table.querySelectorAll("td,th").forEach((c) => {
      if (r.intersectsNode(c)) cells.push(c);
    });
    return cells;
  }
  function mergeSelected(table) {
    const cells = selectedCells(table);
    if (cells.length < 2) return { ok: false, why: "Select across several cells first — drag over them, then click Merge" };
    const grid = tableModel(table);
    const set = new Set(cells);
    let minR = 1e9,
      minC = 1e9,
      maxR = -1,
      maxC = -1;
    for (const c of cells) {
      const p = findCell(grid, c);
      if (!p) return { ok: false, why: "The selection isn't a rectangle of cells" };
      minR = Math.min(minR, p.r);
      minC = Math.min(minC, p.c);
      maxR = Math.max(maxR, p.r + (c.rowSpan || 1) - 1);
      maxC = Math.max(maxC, p.c + (c.colSpan || 1) - 1);
    }
    /* every grid slot inside the rectangle must be one of the selected cells */
    for (let r = minR; r <= maxR; r++)
      for (let c = minC; c <= maxC; c++) {
        const x = grid[r] && grid[r][c];
        if (!x || !set.has(x)) return { ok: false, why: "The selection isn't a rectangle of cells" };
      }
    const target = grid[minR][minC];
    const others = [...set]
      .filter((c) => c !== target)
      .sort((a, b) => {
        const pa = findCell(grid, a),
          pb = findCell(grid, b);
        return pa.r - pb.r || pa.c - pb.c;
      });
    others.forEach((c) => moveContent(target, c));
    target.colSpan = maxC - minC + 1;
    target.rowSpan = maxR - minR + 1;
    others.forEach((c) => c.remove());
    return { ok: true, target };
  }
  function splitCell(table, cell) {
    const rs = cell.rowSpan || 1,
      cs = cell.colSpan || 1;
    if (rs === 1 && cs === 1) return false;
    const rows = [...table.querySelectorAll("tr")];
    const grid = tableModel(table);
    const pos = findCell(grid, cell);
    if (!pos) return false;
    cell.rowSpan = 1;
    cell.colSpan = 1;
    const mk = () => {
      const t = document.createElement(cell.tagName === "TH" ? "th" : "td");
      t.innerHTML = "<br>";
      return t;
    };
    for (let i = 1; i < cs; i++) cell.after(mk());
    for (let dr = 1; dr < rs; dr++) {
      const tr = rows[pos.r + dr];
      if (!tr) continue;
      let ref = null;
      const seen = new Set();
      const grow = grid[pos.r + dr] || [];
      for (let col = 0; col < grow.length; col++) {
        const x = grow[col];
        if (!x || seen.has(x)) continue;
        seen.add(x);
        if (x.parentElement === tr && col >= pos.c + cs) {
          ref = x;
          break;
        }
      }
      const cells = Array.from({ length: cs }, mk);
      if (ref) ref.before(...cells);
      else tr.append(...cells);
    }
    return true;
  }
  function tableOp2(op) {
    const t = (typeof curTable !== "undefined" && curTable) || (curCell && curCell.closest ? curCell.closest("table") : null);
    const cell = curCell;
    if (!t || !cell || !t.contains(cell)) return;
    if (op === "merge") {
      const r = mergeSelected(t);
      if (!r.ok) {
        toast(r.why);
        return;
      }
      queueSave();
      caretEnd(r.target);
    } else if (op === "split") {
      if (!splitCell(t, cell)) {
        toast("This cell is not merged");
        return;
      }
      queueSave();
      caretEnd(cell);
    }
  }
  (function wireButtons() {
    const b = (id, op) => {
      const n = document.getElementById(id);
      if (n) n.addEventListener("click", () => tableOp2(op));
    };
    b("tMerge", "merge");
    b("tSplit", "split");
  })();

  /* ---------- keep the colgroup aligned with the row/column buttons ---------- */
  (function wrapTableOp() {
    if (typeof tableOp !== "function") return;
    const orig = tableOp;
    window.tableOp = function (op) {
      const t = (typeof curTable !== "undefined" && curTable) || (curCell && curCell.closest ? curCell.closest("table") : null);
      const cell = curCell;
      const cg = t && cell && t.contains(cell) ? t.querySelector(":scope > colgroup") : null;
      const idx = cg && cell ? cell.cellIndex : null;
      orig(op);
      if (cg) {
        if (op === "col+" && idx != null) {
          const col = document.createElement("col");
          cg.insertBefore(col, cg.children[idx + 1] || null);
        } else if (op === "col-" && idx != null && cg.children[idx]) {
          cg.children[idx].remove();
        }
      }
    };
  })();
})();
