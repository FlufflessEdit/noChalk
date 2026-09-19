/*  noCHalk
      by Fluffless
      guide.js
*/
"use strict";
/* ================= noChalk Guide — a section inside the current notebook ================= */
const GUIDE_VER = 5;

const GUIDE_CSS = `<style>
  body { background: #ffffff; color: #000000; font-family: Roboto, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; margin: 0; padding: 6px 10px; }
  h2 { font-size: 21px; margin: 26px 0 10px; letter-spacing: -0.01em; }
  h2:first-child { margin-top: 0; }
  p { margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  td, th { border: 1px solid #b9b2a2; padding: 5px 10px; vertical-align: middle; text-align: left; font-size: 14px; }
  td:first-child { width: 44px; text-align: center; white-space: nowrap; }
  .ic { width: 20px; height: 20px; fill: none; stroke: #26211b; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; vertical-align: middle; }
  .ic text { fill: #26211b; stroke: none; }
  b { font-weight: 700; }
</style>`;

const IC = {
  text: '<svg class="ic" viewBox="0 0 24 24"><path d="M5 6V4.5h14V6M12 4.5V20M9 20h6"/></svg>',
  pen: '<svg class="ic" viewBox="0 0 24 24"><path d="M16.5 3.5l4 4L8 20l-5 1 1-5zM14.5 5.5l4 4"/></svg>',
  layers:
    '<svg class="ic" viewBox="0 0 24 24"><rect x="8.5" y="3.5" width="12" height="12" rx="2"/><path d="M15.5 9v9.5a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2H6"/></svg>',
  select:
    '<svg class="ic" viewBox="0 0 24 24"><path d="M5 7V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" stroke-dasharray="2.5 2.5"/><path d="M10 10l7 4-3 1.2L12.8 18z" fill="currentColor" stroke="none"/></svg>',
  panel: '<svg class="ic" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/></svg>',
  clip: '<svg class="ic" viewBox="0 0 24 24"><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
  magnet: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 3h4v7a2 2 0 0 0 4 0V3h4v7a6 6 0 0 1-12 0zM6 6.5h4M14 6.5h4"/></svg>',
  pagestyle: '<svg class="ic" viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>',
  moon: '<svg class="ic" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  code: '<svg class="ic" viewBox="0 0 24 24"><path d="M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5M13 5l-2 14"/></svg>',
  expand: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  pin: '<svg class="ic" viewBox="0 0 24 24"><path d="M9 3h6v7l2 3H7l2-3zM12 13v8"/></svg>',
  down: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 4v11M7.5 11.5 12 16l4.5-4.5M5 20h14"/></svg>',
  up: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 20V9M7.5 12.5 12 8l4.5 4.5M5 4h14"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  copy: '<svg class="ic" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/></svg>',
  x: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  grip: '<svg class="ic" viewBox="0 0 24 24"><g fill="currentColor" stroke="none"><circle cx="9" cy="5" r="1.8"/><circle cx="15" cy="5" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="19" r="1.8"/><circle cx="15" cy="19" r="1.8"/></g></svg>',
  hl: '<svg class="ic" viewBox="0 0 24 24"><path d="M15 4l5 5-8 8H7v-5zM13 6l5 5"/></svg>',
  bold: '<svg class="ic" viewBox="0 0 24 24"><path d="M7 4h5.5a3.5 3.5 0 0 1 0 7H7zm0 7h6.5a3.5 3.5 0 0 1 0 7H7v-7z"/></svg>',
  italic: '<svg class="ic" viewBox="0 0 24 24"><path d="M19 4h-9M14 20H5M15 4 9 20"/></svg>',
  underline: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 4v6a6 6 0 0 0 12 0V4M5 20h14"/></svg>',
  strike:
    '<svg class="ic" viewBox="0 0 24 24"><path d="M5 12h14M15.5 7.5c-.5-1.7-2-2.8-4-2.8-2.2 0-3.8 1.3-3.8 2.9 0 1.5 1.2 2.4 3.6 3M8.5 16.5c.5 1.7 2 2.8 4 2.8 2.2 0 3.8-1.3 3.8-2.9 0-1.5-1.2-2.4-3.6-3"/></svg>',
  alignl: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 6h16M4 11h10M4 16h13"/></svg>',
  alignc: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 6h16M7 11h10M6 16h12"/></svg>',
  alignr: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 6h16M10 11h10M7 16h13"/></svg>',
  alignj: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 6h16M4 11h16M4 16h16"/></svg>',
  listul:
    '<svg class="ic" viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
  listol:
    '<svg class="ic" viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><text x="2" y="7.5" font-size="7.5">1</text><text x="2" y="13.5" font-size="7.5">2</text><text x="2" y="19.5" font-size="7.5">3</text></svg>',
  outdent: '<svg class="ic" viewBox="0 0 24 24"><path d="M10 6h11M10 12h11M10 18h11M6 9 3 12l3 3"/></svg>',
  indent: '<svg class="ic" viewBox="0 0 24 24"><path d="M10 6h11M10 12h11M10 18h11M3 9l3 3-3 3"/></svg>',
  table: '<svg class="ic" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 9.5h16M11.5 5v14"/></svg>',
  eraser:
    '<svg class="ic" viewBox="0 0 24 24"><path d="M21 21H8l-5-5a2 2 0 0 1 0-2.83L12.6 4.6a2 2 0 0 1 2.83 0l5.9 5.9a2 2 0 0 1 0 2.83L14 18M5.5 11.5l7 7"/></svg>',
  rect: '<svg class="ic" viewBox="0 0 24 24"><rect x="4.5" y="6" width="15" height="12" rx="1.5"/></svg>',
  ellipse: '<svg class="ic" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>',
  tri: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5l8 14H4z"/></svg>',
  ruler:
    '<svg class="ic" viewBox="0 0 24 24"><path d="M4 20L20 4v16H4z"/><path d="M7.5 16.5l1.4 1.4M10.5 13.5l1.4 1.4M13.5 10.5l1.4 1.4M16.5 7.5l1.4 1.4"/></svg>',
  compass:
    '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.2"/><path d="M11 7.2 7 19M13 7.2 17 19"/><path d="M6.2 16.2l.8 2.4M17.8 16.2l-.8 2.4"/></svg>',
  cross: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9 2 12l3 3M19 9l3 3-3 3"/></svg>',
  lr: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>',
  rot: '<svg class="ic" viewBox="0 0 24 24"><path d="M5 16 A7 7 0 0 1 19 16M6.6 14.9 L5 13.3 L3.4 14.9M17.4 17.1 L19 18.7 L20.6 17.1"/></svg>',
};
const row = (icon, txt) => `<tr><td>${icon}</td><td>${txt}</td></tr>`;

const GUIDE_PAGES = [
  [
    "Idea",
    `${GUIDE_CSS}
<p>noChalk is a teaching notebook: one program that replaces the chalkboard, the exercise book and the pile of printouts. You type, draw, import documents and present — all on the same pages, projected directly from this computer.</p>
<p>The notebook lives in a <b>.noChalk file</b> you choose — that file is the notebook, and it goes wherever you put it. Nothing is stored in the browser between sessions: when noChalk closes, its traces here are wiped. Reopen the file to continue.</p>
<p>Content is organised as <b>sections → pages</b>, like a real workbook. Each page is an infinite sheet of paper that grows by itself when you move toward its edges — you never run out of space, and you zoom and pan freely instead of scrolling a fixed document.</p>
<p>Built for teaching: <b>covers</b> hide answers during class and reveal them with a click; the <b>set square</b> and <b>compass</b> are true-to-scale instruments with snapping edges, so students see on the projector exactly how to use the real ones; pen presets work like a pen case — click to use, hold to edit, drag to sort.</p>
<p>For anything a page can't do on its own, the <b>HTML tool</b> runs real markup in its own box — live widgets, embeds, anything the browser can render. And <b>links</b> behave like in Word: type or paste a URL, it becomes a link, Ctrl+click to open it.</p>`,
  ],

  [
    "Controls",
    `${GUIDE_CSS}
<table>
 ${row("Space + drag", "move the paper (also: both mouse buttons, middle button, or one finger)")}
 ${row("Wheel / Shift+wheel", "scroll / pan sideways")}
 ${row("Alt+wheel or Ctrl+wheel", "zoom — also Ctrl + / Ctrl − / Ctrl 0; two fingers pinch-zoom")}
 ${row("Ctrl+click a link", "opens it in a new tab — a plain click just places the caret (like Word)")}
 ${row("Hold on empty paper", "creates a text box there (about half a second)")}
 ${row("Drag a box edge or corner", "resize it; drag its handle to move it")}
 ${row("Ctrl+Z / Ctrl+Shift+Z", "undo / redo strokes")}
 ${row("Ctrl+S", "save to the notebook file")}
 ${row("Esc", "close popups, clear the selection")}
 ${row("Delete", "remove everything currently selected")}
 ${row("Shift while drawing", "forces a straight line")}
 ${row("Shift with a shape tool", "square, circle or equilateral triangle")}
 ${row("Tab / Shift+Tab", "next 48 px tab stop / outdent — nests list items like Word")}
 ${row("Ctrl+, / Ctrl+.", "subscript / superscript — leave with the right arrow key")}
 ${row("Enter inside a fraction", "jumps from numerator to denominator")}
 ${row("Double-click a name", "rename a page or section")}
 ${row("Drag a tab / page entry", "reorders — the item follows the pointer until you let go")}
 ${row("Hold a toolbar button", "opens its hidden settings (also right-click)")}
 ${row("Right-click a symbol", "pins it as a favourite next to the π button")}
 ${row("Double-tap with three fingers", "switch between eraser and pen while drawing")}
</table>`,
  ],

  [
    "Icons",
    `${GUIDE_CSS}
<table>
 ${row(IC.text, "<b>Text mode</b> — type; hold on empty paper for a new box")}
 ${row(IC.pen, "<b>Draw mode</b> — hold the button for pen-only mode (fingers pan instead of drawing)")}
 ${row(IC.layers, "<b>Covers mode</b> — drag over answers; hold the button for cover colour and reset")}
 ${row(IC.select, "<b>Select mode</b> — drag a window; click again to switch rectangle/lasso, hold to choose")}
 ${row(IC.panel, "<b>Page list</b> — show/hide the page list (sits in the toolbar while the list is hidden)")}
 ${row(IC.clip, "<b>Import</b> — PDF, Word, Excel, images, video, OneNote export, attachments; drag-and-drop works too")}
 ${row(IC.magnet, "<b>Snap</b> — snap text boxes to a 24 px grid")}
 ${row(IC.pagestyle, "<b>Page background</b> — colour, ruled, squares, dots, dark")}
 ${row(IC.moon, "<b>Theme</b> — light / dark")}
 ${row(IC.code, "<b>HTML tool</b> — paste markup, it runs in its own box")}
 ${row("<b>?</b>", "<b>Guide</b> — inserts this section and switches to it")}
 ${row(IC.expand, "<b>Fullscreen</b>")}
 ${row(IC.pin, "<b>Pin the bar</b> — keep top bar and notebook row visible; unpinned they hide until the mouse touches the very top edge")}
 ${row(IC.down, "<b>Save</b> — writes the notebook to its .noChalk file (same as Ctrl+S)")}
 ${row(IC.up, "<b>Open</b> — load another notebook file; the current one is saved first")}
 ${row(IC.plus, "<b>New notebook</b> — choose where its new file is saved; the current one is saved first")}
 ${row(IC.plus + " (tabs row)", "<b>New section</b> — name and colour")}
 ${row(IC.plus + " (pages list)", "<b>New page</b>")}
 ${row(IC.copy, "<b>Duplicate page</b> — appears on hover")}
 ${row(IC.x, "<b>Delete</b> — page, section, box, cover or selection")}
 ${row(IC.grip, "<b>Drag handle</b> — on tabs and page entries; drag to reorder")}
 ${row('■ <span style="color:#b3492f">■</span>', "<b>Colour square</b> on a section tab — click to change the section colour")}
</table>`,
  ],

  [
    "Text Tool",
    `${GUIDE_CSS}
<table>
 ${row(IC.bold + " " + IC.italic + " " + IC.underline + " " + IC.strike, "<b>Bold, italic, underline, strikethrough</b>")}
 ${row("<b>16 ▾</b>", "<b>Font size</b> — with the caret alone it sets the size for what you type next; with a selection it reformats")}
 ${row('<b>A</b> <span style="color:#1c1917">●</span>', "<b>Text colour</b>")}
 ${row(IC.hl + ' <span style="color:#fde68a">●</span>', "<b>Highlight</b> — applies to the word at the cursor; “none” removes it")}
 ${row("x<sub>2</sub>&nbsp;&nbsp;x<sup>2</sup>", "<b>Subscript / superscript</b> — leave with the right arrow key")}
 ${row(IC.alignl + " " + IC.alignc + " " + IC.alignr + " " + IC.alignj, "<b>Align</b> — left, centre, right, justify")}
 ${row(IC.listul + " " + IC.listol, "<b>Bullet / numbered list</b>")}
 ${row(IC.outdent + " " + IC.indent, "<b>Outdent / indent</b> — indent nests list items")}
 ${row(IC.table, "<b>Table</b> — drag over the grid to pick rows × columns; a small bar adds/removes rows and columns")}
 ${row("<b>π</b>", "<b>Symbols</b> — formulas (fraction, √, ³√ …), relations, Greek, arrows, sets, chemistry, Spanish/German/French signs. Right-click to pin favourites")}
 ${row('<span style="color:#b3271d">π</span> <span style="color:#1c56b0">→</span>', "<b>Pinned favourites</b> — sit next to the π button; right-click to remove")}
</table>`,
  ],

  [
    "Drawing Tool",
    `${GUIDE_CSS}
<table>
 ${row(IC.pen + " " + IC.hl + " " + IC.eraser, "<b>Pen, marker, eraser</b> — the marker always applies one transparent layer; ink appears only while the button is held and moved")}
 ${row('<span style="color:#201d1a">●</span><span style="color:#b3271d">●</span><span style="color:#1c56b0">●</span> …', "<b>Pen presets</b> — click to use, hold or right-click to edit, drag to sort; <b>eight slots</b> each for pen and marker, empty ones dashed")}
 ${row(IC.rect + " " + IC.ellipse + " " + IC.tri, "<b>Rectangle, ellipse, triangle</b> — click to arm, then click again: filled; click a third time: back to outline. They use the current pen")}
 ${row(IC.ruler, "<b>Set square</b> — 45°/45°/90° triangle, ruler with 0 in the middle reading 7 … 0 … 7, half-circle with degrees. Hold its button for scale (100% = true size) and colour — the degree ring always renders a bit brighter than the ruler. Strokes snap onto every edge and the arc")}
 ${row(IC.compass, "<b>Compass</b> — the head shows the current radius in cm; it appears in the middle of your view when switched on")}
 ${row(IC.cross, "<b>Cross arrow</b> — above the needle tip: moves the compass (needle = centre of the circle)")}
 ${row(IC.lr, "<b>Radius handle (↔)</b> — above the rotate arrow on the drawing arm: drag in or out to open/close the compass; a ruler appears showing the distance from the needle, 0 on the needle")}
 ${row(IC.rot, "<b>Rotate handle</b> — compass: swings the arm around the needle; set square: rotates around the 0 (Shift = 15° steps)")}
 ${row(IC.pen, "<b>Pen handle</b> — compass: drag it around to draw the circle with the current pen preset")}
 ${row(IC.pin, "<b>Pin</b> — locks a box into the background so you can write over it")}
 ${row("■ corner", "<b>Resize corner</b> — on boxes and covers")}
 ${row('<span style="color:#b3271d"><b>×</b></span>', "<b>Red ×</b> — deletes a whole selection at once")}
</table>`,
  ],

  [
    "Links and HTML",
    `${GUIDE_CSS}
<p><b>Typing:</b> the moment you type a space after a URL, it becomes a link — no interruption, you just keep typing. If the URL points to an image (ends in .png, .jpg …), a small popup offers to insert it as an <b>Image</b> instead.</p>
<p><b>Pasting:</b> a lone URL pastes as a link right away. Text containing URLs arrives with every URL linkified. Pasted rich text keeps its formatting and links — scripts and other active content are always stripped from ordinary pasting.</p>
<p><b>Opening:</b> Ctrl+click (Cmd+click on Mac) opens a link in a new tab. A plain click or tap places the caret, so link text stays editable like any other text.</p>
<p><b>The HTML tool (</b>${IC.code}<b>):</b> paste any markup into the field — scripts, iframes and styles included — and press Insert (or Ctrl+Enter). The markup runs immediately inside its own read-only box, fully sandboxed: its styles and scripts cannot reach anything outside the box. The box content scrolls if taller than the box; drag the edges to resize. HTML boxes run automatically whenever their page opens. The box moves, resizes and deletes like any other.</p>`,
  ],
];

/* build the Guide as a SECTION of the given notebook */
async function buildGuideSection() {
  const sec = { id: uid(), name: "The Guide", color: "#31567f", pages: [] };
  for (const [title, html] of GUIDE_PAGES) {
    const rec = blankPage();
    rec.title = title;
    rec.style = { bg: "plain", color: "#ffffff" };
    rec.conts = [{ id: uid(), x: 56, y: pgHead.offsetHeight + 6, w: 760, h: 1000, ro: true, runHtml: html }];
    await putPage(rec);
    sec.pages.push(stubOf(rec));
  }
  return sec;
}

function findGuideSection() {
  return cur.nb.sections.find((s) => s.name === "The Guide") || null;
}

async function openGuide() {
  if (!cur.nb) return;
  let sec = findGuideSection();
  /* stale version: drop the old guide section, rebuild */
  if (sec && state.ui.guideVer !== GUIDE_VER) {
    for (const st of sec.pages) idbDel("pages", st.id);
    cur.nb.sections.splice(cur.nb.sections.indexOf(sec), 1);
    sec = null;
  }
  if (!sec) {
    sec = await buildGuideSection();
    cur.nb.sections.push(sec);
    state.ui.guideVer = GUIDE_VER;
    queueSave();
  }
  await openSection(sec);
  toast("Guide — a section in this notebook; Ctrl+S saves it into the file");
}

$("#helpBtn").addEventListener("click", () => openGuide());
