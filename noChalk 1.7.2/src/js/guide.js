"use strict";
/* ================= noChalk Guide — ONE page inside the current notebook ================= */
const GUIDE_VER = 9;

const IC = {
  text: '<svg class="ic" viewBox="0 0 24 24"><path d="M4.5 6V4.5h9V6M9 4.5V20M6 20h6"/></svg>',
  cursor:
    '<svg class="ic" viewBox="0 0 24 24"><path d="M5.5 3.2v15.6l3.9-3.6 2.2 5.3 2.6-1-2.2-5.3 5.5-.5z" fill="currentColor" stroke="none"/></svg>',
  layers:
    '<svg class="ic" viewBox="0 0 24 24"><rect x="8.5" y="3.5" width="12" height="12" rx="2"/><path d="M15.5 9v9.5a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2H6"/></svg>',
  panel: '<svg class="ic" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/></svg>',
  magnet: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 3h4v7a2 2 0 0 0 4 0V3h4v7a6 6 0 0 1-12 0zM6 6.5h4M14 6.5h4"/></svg>',
  pagestyle: '<svg class="ic" viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>',
  moon: '<svg class="ic" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  expand: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  down: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 4v11M7.5 11.5 12 16l4.5-4.5M5 20h14"/></svg>',
  up: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 20V9M7.5 12.5 12 8l4.5 4.5M5 4h14"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  table: '<svg class="ic" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 9.5h16M11.5 5v14"/></svg>',
  ruler:
    '<svg class="ic" viewBox="0 0 24 24"><path d="M4 20L20 4v16H4z"/><path d="M7.5 16.5l1.4 1.4M10.5 13.5l1.4 1.4M13.5 10.5l1.4 1.4M16.5 7.5l1.4 1.4"/></svg>',
  compass:
    '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.2"/><path d="M11 7.2 7 19M13 7.2 17 19"/><path d="M6.2 16.2l.8 2.4M17.8 16.2l-.8 2.4"/></svg>',
};

const GUIDE_HTML = `<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { background:#fff; color:#111; font-family: Roboto,'Segoe UI',sans-serif; font-size:11px; line-height:1.38; margin:0; padding:10px 12px; column-count:3; column-gap:12px; }
  h1 { column-span: all; font-size:16px; margin:0 0 2px; letter-spacing:-0.01em; }
  .sub { column-span: all; margin:0 0 9px; color:#666; font-size:10.5px; }
  .foot { column-span: all; margin:2px 0 0; color:#999; font-size:10px; text-align:center; }
  h3 { font-size:11px; margin:0 0 4px; text-transform:uppercase; letter-spacing:0.04em; color:#8a3b1c; }
  .c { break-inside:avoid; border:1px solid #ddd6c4; border-radius:6px; padding:6px 8px 5px; margin:0 0 8px; background:#fbf9f4; }
  ul { margin:0; padding-left:13px; }
  li { margin:1.5px 0; }
  b { font-weight:700; }
  .ic { width:13px; height:13px; fill:none; stroke:#26211b; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; vertical-align:-2px; }
</style>
<h1>noChalk — the Guide</h1>
<p class="sub">One page, everything on it. The Tutorial button on the start prompt walks you through live.</p>

<div class="c"><h3>The idea</h3><ul>
<li>A teaching notebook: chalkboard, exercise book and the pile of printouts in one — type, draw, import, present, projected straight from this computer.</li>
<li>The notebook <b>is</b> the .noChalk file you pick. The browser keeps nothing between sessions; reopen the file to continue.</li>
<li><b>Sections → pages</b>, like a workbook. Every page is infinite paper that grows as you approach its edges — zoom and pan instead of scrolling.</li>
<li>The file carries its settings: theme, page backgrounds, snap, presets, instruments.</li>
</ul></div>

<div class="c"><h3>Selection is the default</h3><ul>
<li>${IC.cursor} <b>Select</b> is the home tool: tap or click objects to move, resize or delete them. Tap a text box to place the caret. Drag a rectangle around objects — or lasso; click the button again while active to switch style.</li>
<li>You never hunt for the mode: clicking a box's buttons, a cover, or a video's Convert while in another mode lands you in Select automatically — and the action goes through in the same click.</li>
<li>Everything caught joins one temporary box: drag its handle to move it all at once, × or Delete removes it, Esc clears. A single click selects one object.</li>
<li>Hold or right-click the Select button for the style menu.</li>
</ul></div>

<div class="c"><h3>Text</h3><ul>
<li>${IC.text} <b>Text mode</b>: <b>tap empty paper and a box appears</b> with the caret inside — holding works too, mouse, pen or finger. Tap an existing box to place the caret.</li>
<li>Placing a caret or typing anywhere switches to Text automatically — you arrive in the right mode without thinking about it.</li>
<li>Drag a box by its handle, resize at any edge or corner, delete with the ×, copy with Ctrl+C, paste with Ctrl+V or the paste button at the toolbar's right end. Pin a box to the background to write over it.</li>
</ul></div>

<div class="c"><h3>Covers</h3><ul>
<li>${IC.layers} <b>Covers</b>: drag a rectangle over an answer to hide it. Click the cover to reveal or re-hide it — you land in Select automatically. Perfect for quizzes.</li>
<li>Hold or right-click the button for the colour, and to reset every cover on the page to hidden.</li>
<li>Clicking the Covers button while it is active returns you to Select.</li>
</ul></div>

<div class="c"><h3>Navigation</h3><ul>
<li>Wheel scrolls; Shift+wheel pans sideways; Ctrl or Alt+wheel zooms (also Ctrl +, Ctrl −, Ctrl 0). Two fingers pinch-zoom and pan.</li>
<li>Space+drag, both mouse buttons together, or the middle button pans with the mouse.</li>
<li>Ctrl+Z / Ctrl+Shift+Z — undo / redo. Undo covers ink, box moves and resizes, deletions, covers and group operations.</li>
</ul></div>

<div class="c"><h3>Drawing</h3><ul>
<li>Pen renders <b>beneath</b> text, marker above it; eraser whole-stroke or precise (four presets).</li>
<li>Preset dots: click to use, hold or right-click to edit, drag to sort — eight slots each for pen and marker.</li>
<li>Rectangle, ellipse, triangle: click = outline, again = filled, third time = off. Shift → square, circle, equilateral. Shift while drawing → straight line.</li>
<li>Click the Draw button while active to toggle <b>pen-only</b> (fingers pan instead of drawing); a pen touching the screen switches there automatically — and touch no longer kicks you out.</li>
</ul></div>

<div class="c"><h3>Instruments — true to scale</h3><ul>
<li>${IC.ruler} <b>Set square</b>: drag the hole to move, rotate around the 0 (Shift = 15°). Strokes snap to every edge and the arc. Hold or right-click for scale and colour.</li>
<li>${IC.compass} <b>Compass</b>: the ↔ handle sets the radius (a ruler appears), the head shows it in cm; draw around the planted needle with the current pen.</li>
</ul></div>

<div class="c"><h3>Pages and sections</h3><ul>
<li>${IC.plus} New page or section; double-click any name to rename; drag the grips to reorder tabs and pages.</li>
<li>The copy button beside a page title copies the page; the paste button in the list header pastes it into <b>any</b> section.</li>
<li>Drop a .noChalk file onto the window: check the sections to import into this notebook, or open the whole file.</li>
</ul></div>

<div class="c"><h3>Formatting text</h3><ul>
<li><b>Size</b>: caret alone sets what you type next; a selection reformats. Each list row <b>and its marker</b> follow the row's first character.</li>
<li><b>Colour</b>: the A shows the last used colour — click applies it; hold or right-click for the palette.</li>
<li><b>Highlighter</b>: on — everything you type and select is marked; off — unmarked. Hold for colours.</li>
<li>Sub/superscript: Ctrl+, and Ctrl+. — leave with the → key. Enter inside a fraction jumps to the denominator.</li>
<li>Lists: Tab nests, Shift+Tab outdents, like Word. Type “1. ”, “3) ” or “- ” to start one. Tab elsewhere jumps to the next 48 px stop.</li>
</ul></div>

<div class="c"><h3>Tables</h3><ul>
<li>${IC.table} Drag over the grid to insert. While the caret is in a cell, row and column buttons appear at the toolbar's end.</li>
<li><b>Merge</b>: drag the caret across several cells, click — the rectangle becomes one cell. <b>Split</b>: a merged cell falls back into single cells.</li>
<li>Drag any column border to resize it — widths are saved with the page.</li>
</ul></div>

<div class="c"><h3>Media and import</h3><ul>
<li>Drop or paste files: PDF (printed and attached), Word, Excel, images, video, OneNote export (.mht).</li>
<li><b>Videos offload automatically</b> into a media folder next to the notebook file — the toast says exactly where. Each video's caption has a <b>Convert</b> button that asks, then converts it to WebM and offloads it. Hover a video's name to see where its bytes live.</li>
<li>Only <b>Save for sharing</b> packs media into the file — the complete copy to hand to someone.</li>
<li>HTML files or copied source code become live sandboxed boxes; the <b>&lt;/&gt;</b> button on the box edits the code.</li>
<li>Media boxes move via their grip and edges — never by dragging the content. Pinned boxes are background: write and draw over them.</li>
</ul></div>

<div class="c"><h3>Links</h3><ul>
<li>Type a URL and a space: it becomes a link. Pasted text containing URLs arrives linkified; a lone URL pastes as a link.</li>
<li>Ctrl+click opens a link (a plain click places the caret, like Word).</li>
</ul></div>

<div class="c"><h3>Files and settings</h3><ul>
<li>${IC.down} Ctrl+S saves to the .noChalk file — only the small tail is rewritten, so even big notebooks save in milliseconds. The button also offers <b>Save a copy</b> and <b>Save for sharing</b>.</li>
<li>${IC.up} Open loads another notebook (this one is saved first). ${IC.plus} New picks a fresh file.</li>
<li>Status strip: the filename sits there; red means unsaved for more than 5 minutes.</li>
<li>${IC.panel} page list · ${IC.magnet} snap to a 24 px grid · ${IC.pagestyle} page background · ${IC.moon} theme · ${IC.expand} fullscreen — all saved with the notebook. Unpinned, the top bar hides until the mouse touches the very top.</li>
<li>The <b>floating clock</b> bottom-right: click to expand into a minutes timer — ▶ starts it, a ring drains green to red, a gentle bell rings at zero.</li>
<li>This Guide is a section in the notebook: the ? button rebuilds it after updates. The <b>Tutorial</b> button on the start prompt walks you through live.</li>
</ul></div>

<p class="foot">noChalk, by Fluffless</p>`;

/* build the Guide as a SECTION of the given notebook — one wide page */
async function buildGuideSection() {
  const sec = { id: uid(), name: "The Guide", color: "#31567f", pages: [] };
  const rec = blankPage();
  rec.title = "The Guide";
  rec.style = { bg: "plain", color: "#ffffff" };
  rec.conts = [{ id: uid(), x: 24, y: pgHead.offsetHeight + 6, w: 1080, h: 1200, ro: true, runHtml: GUIDE_HTML }];
  await putPage(rec);
  sec.pages.push(stubOf(rec));
  return sec;
}

function findGuideSection() {
  return cur.nb.sections.find((s) => s.name === "The Guide") || null;
}

async function openGuide() {
  if (!cur.nb) return;
  let sec = findGuideSection();
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
