/*  noCHalk
      by Fluffless
      tour.js
*/
"use strict";
/* ================= interactive tutorial =================
   Esc or "Skip tour" cancels at any time. Steps that need a ribbon switch
   modes and switch back. Finishing returns to the start prompt. */

let tour = null;

const TOUR = [
  {
    center: true,
    t: "Welcome to noChalk",
    x: "A short walk through the app: boxes, modes, media, saving. <b>Esc or Skip tour cancels at any time</b>.",
  },
  { sel: "#tabsRow", t: "Sections", x: "One tab per topic. <b>+</b> adds one (name + colour), double-click renames, the grip reorders, × deletes." },
  {
    sel: "#pagesPane",
    t: "Pages",
    x: "Each section holds pages, listed here. <b>+</b> new page, double-click renames, hover for copy/delete, drag reorders. The paste button at the top pastes a copied page into any section.",
  },
  {
    sel: "#toolbar",
    t: "The toolbar",
    x: "Mode buttons on the left — <b>Select is the default</b> — the ribbon for the active mode in the middle, and undo &amp; paste at the far right.",
  },
  {
    sel: "#modeSeg",
    t: "The four modes",
    x: "<b>Select</b> — the default: tap objects to move, resize or delete them, drag a rectangle or lasso to group. <b>Text</b> — typing: tap empty paper and a box appears. <b>Draw</b> — ink. <b>Covers</b> — hide answers. Hold or right-click any mode button for its settings.",
  },
  {
    sel: "#modeTextBtn",
    t: "Text mode",
    x: "Tap empty paper — a text box appears with the caret inside, ready to type. Hold works too. Tap an existing box to place the caret; typing anywhere flips you here automatically.",
  },
  {
    sel: "#modeShapeBtn",
    t: "Covers",
    x: "Drag a rectangle over an answer to hide it. Click the cover to reveal or re-hide it — you land in Select automatically. Hold or right-click the button for the colour and to reset every cover on the page.",
  },
  {
    el: () => tourDemoBox(),
    t: "Moving & transforming",
    x: "This box was made for the tour. Drag its <b>handle</b> to move, edges and corners resize, <b>×</b> deletes, the <b>pin</b> glues it to the background so you can write over it. It disappears when the tour ends.",
  },
  {
    sel: "#colBtn",
    mode: "text",
    t: "Hidden settings",
    x: "Almost every button hides its settings behind a <b>hold or right-click</b>. This one shows the last used colour — a click applies it, holding it opens the palette.",
  },
  {
    sel: "#sizeIn",
    mode: "text",
    t: "Font size",
    x: "With the caret alone it sets the size of what you type next; with a selection it reformats. The chevron offers presets.",
  },
  {
    sel: "#symBtn",
    mode: "text",
    t: "Formulas & symbols",
    x: "Fractions and roots — type into the fields, Enter jumps from numerator to denominator. Plus Greek, arrows, sets. Right-click a symbol to pin it next to the π.",
  },
  {
    sel: "#tableBtn",
    mode: "text",
    t: "Tables",
    x: "Drag over the grid to insert. While the caret is in a cell, row/column buttons appear at the toolbar's end — plus <b>merge</b> (drag across cells, then click) and <b>split</b>. Drag a column border to resize it.",
  },
  {
    sel: "#setSqBtn",
    mode: "draw",
    t: "Set square & compass",
    x: "True to scale, like the real thing. The set square snaps strokes to its edges; rotate it around the 0, drag the hole to move it. The compass draws circles around its planted needle — the head shows the radius in cm. Hold or right-click either button for scale and colour.",
  },
  {
    sel: "#viewport",
    t: "Importing media",
    x: "Drag &amp; drop files onto the paper or paste them: PDF, Word, Excel, images. Videos go straight into a <b>media folder next to the notebook file</b> — a toast says exactly where. HTML files or copied code become live boxes; the <b>&lt;/&gt;</b> button edits the code.",
  },
  {
    sel: "#floatClock",
    t: "The timer",
    x: "Click the clock, type minutes, press ▶. A ring drains from green to red; when time is up a gentle bell rings and the window collapses. ■ or a click cancels.",
  },
  {
    sel: "#saveBtn",
    t: "Saving",
    x: "<b>Ctrl+S</b> saves into the .noChalk file. The button also offers <b>Save a copy</b> and <b>Save for sharing</b>, which packs the offloaded videos into one complete file.",
  },
  {
    center: true,
    t: "That's the tour",
    x: "Back at the start — open your own notebook or create a new one. The <b>?</b> button brings the full guide, in every notebook.",
  },
];
function tourDemoBox() {
  if (tour && tour.demo && tour.demo.isConnected) return tour.demo;
  const wx = Math.max(24, (vpW / 2 - VP.x) / VP.z - 110);
  const wy = Math.max((typeof pgHead !== "undefined" ? pgHead.offsetHeight : 40) + 10, (vpH / 2 - VP.y) / VP.z - 30);
  const w = createTextAt(wx, wy);
  if (tour) tour.demo = w;
  return w;
}
function tourEnsureVisible(target) {
  const r = target.getBoundingClientRect();
  const v = viewport.getBoundingClientRect();
  if (r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom) return;
  VP.x += v.left + v.width / 2 - (r.left + r.width / 2);
  VP.y += v.top + v.height / 2 - (r.top + r.height / 2);
  clampView();
  setView();
}
function startTour() {
  if (tour) endTour(true);
  tour = { i: 0, demo: null };
  tour.spot = el("div");
  tour.spot.id = "tourSpot";
  tour.card = el("div");
  tour.card.id = "tourCard";
  document.body.append(tour.spot, tour.card);
  document.addEventListener("keydown", tourEsc, true);
  showTourStep();
}
function endTour(silent) {
  if (!tour) return;
  document.removeEventListener("keydown", tourEsc, true);
  try {
    tour.spot.remove();
    tour.card.remove();
  } catch (e) {}
  if (mode !== "select") setMode("select");
  if (tour.demo && tour.demo.isConnected && typeof boxIsEmpty === "function" && boxIsEmpty(tour.demo)) {
    const w = tour.demo;
    if (cur.pg) {
      const i = cur.pg.conts.findIndex((c) => c.id === w.dataset.cid);
      if (i >= 0) cur.pg.conts.splice(i, 1);
    }
    w.remove();
    queueSave();
  }
  tour = null;
  if (!silent && typeof nbFileRef !== "undefined" && !nbFileRef && typeof sessionPrompt === "function") sessionPrompt();
}
function tourEsc(e) {
  if (e.key === "Escape") {
    e.stopPropagation();
    e.preventDefault();
    endTour();
  }
}
function showTourStep() {
  if (!tour) return;
  const s = TOUR[tour.i];
  const wantMode = s.mode || "select";
  if (mode !== wantMode) setMode(wantMode);
  let target = null;
  if (!s.center) {
    target = typeof s.el === "function" ? s.el() : document.querySelector(s.sel);
    if (target && viewport.contains(target)) tourEnsureVisible(target);
  }
  if (target) {
    const r = target.getBoundingClientRect();
    const pad = 6;
    tour.spot.style.display = "block";
    tour.spot.style.left = r.left - pad + "px";
    tour.spot.style.top = r.top - pad + "px";
    tour.spot.style.width = r.width + pad * 2 + "px";
    tour.spot.style.height = r.height + pad * 2 + "px";
  } else {
    tour.spot.style.display = "none";
  }
  tour.card.innerHTML =
    '<div class="tc-step">' +
    (tour.i + 1) +
    " / " +
    TOUR.length +
    "</div>" +
    '<div class="tc-t">' +
    s.t +
    "</div>" +
    '<div class="tc-x">' +
    s.x +
    "</div>" +
    '<div class="tc-b"><button class="btn" data-a="skip">Skip tour</button>' +
    (tour.i > 0 ? '<button class="btn" data-a="back">Back</button>' : "") +
    '<button class="btn go" data-a="next">' +
    (tour.i === TOUR.length - 1 ? "Finish" : "Next") +
    "</button></div>";
  tour.card.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.a === "skip") endTour();
      else if (b.dataset.a === "back") {
        tour.i = Math.max(0, tour.i - 1);
        showTourStep();
      } else if (tour.i === TOUR.length - 1) endTour();
      else {
        tour.i++;
        showTourStep();
      }
    };
  });
  placeTourCard(target);
}
function placeTourCard(target) {
  const cw = tour.card.offsetWidth,
    ch = tour.card.offsetHeight;
  let x, y;
  if (!target) {
    x = (innerWidth - cw) / 2;
    y = innerHeight * 0.3;
  } else {
    const r = target.getBoundingClientRect();
    const fits = (px, py) => px >= 12 && px + cw <= innerWidth - 12 && py >= 12 && py + ch <= innerHeight - 12;
    const covers = (px, py) => px < r.right + 8 && px + cw > r.left - 8 && py < r.bottom + 8 && py + ch > r.top - 8;
    const midY = Math.max(12, Math.min(innerHeight - ch - 12, r.top + r.height / 2 - ch / 2));
    const cands = [
      [r.left + r.width / 2 - cw / 2, r.bottom + 14],
      [r.left + r.width / 2 - cw / 2, r.top - ch - 14],
      [r.right + 14, midY],
      [r.left - cw - 14, midY],
    ];
    let p = null;
    for (const c of cands)
      if (fits(c[0], c[1]) && !covers(c[0], c[1])) {
        p = c;
        break;
      }
    if (!p) p = [(innerWidth - cw) / 2, 58];
    x = p[0];
    y = p[1];
  }
  tour.card.style.left = Math.max(12, Math.min(innerWidth - cw - 12, x)) + "px";
  tour.card.style.top = Math.max(12, Math.min(innerHeight - ch - 12, y)) + "px";
}
