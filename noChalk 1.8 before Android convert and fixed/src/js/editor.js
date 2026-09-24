/*  noCHalk
      by Fluffless
      editor.js
*/
"use strict";
console.log("noChalk: editor.js v4 loaded");
/* ================= ProseMirror core for the text boxes =================
   One shared plugin set, one EditorView per text box (cont.pmView), the
   focused box is ED.active. text.js / edit.js / page.js talk to ED only.
   The schema's parse rules match everything the old contenteditable could
   save (b / font color+size / mark / align attrs / .tabsp / .mfrac / .msqrt
   / tables), so existing notebooks open losslessly; saving goes through
   DOMSerializer and produces the same HTML shapes as before.
   Bundle: lib/prosemirror.js (window.PM), built once from pm-entry.mjs.
   API facts this file is written against:
   - prosemirror-schema-list's node specs export as OBJECTS in the installed
     version, not functions — the three list specs below are hand-written.
   - every toDOM must be a FUNCTION returning the array — never a bare array.
   - there is no parseFromString: parse()/parseSlice() take real DOM nodes
     (we feed them a detached div with innerHTML).
   - EditorView takes two arguments: place = {mount: cont}, props = the rest. */

var PM = window.PM;
const ED = { active: null };

/* ---------- bundle self-check ---------- */
(function () {
  if (typeof PM !== "object" || !PM) {
    console.error("noChalk: window.PM is missing — lib/prosemirror.js is not loaded or empty.");
    return;
  }
  var need = (
    "Schema DOMParser DOMSerializer EditorState Plugin PluginKey TextSelection NodeSelection EditorView " +
    "keymap history undo redo inputRules InputRule wrappingInputRule baseKeymap chainCommands toggleMark " +
    "createParagraphNear liftEmptyBlock newlineInCode splitBlock wrapInList splitListItem liftListItem sinkListItem " +
    "tableEditing columnResizing goToNextCell CellSelection deleteCellSelection fixTables " +
    "addColumnAfter addColumnBefore addRowAfter addRowBefore deleteColumn deleteRow deleteTable " +
    "mergeCells splitCell toggleHeaderRow setCellAttr"
  ).split(" ");
  var missing = need.filter(function (k) {
    if (k === "baseKeymap") return !PM[k]; /* a keymap — an object by design */
    return typeof PM[k] !== "function";
  });
  if (missing.length) console.error("noChalk: the ProseMirror bundle is incomplete — missing: " + missing.join(", ") + ".");
})();

/* ---------- formula DOM builders (shared by toDOM + NodeViews) ---------- */
function fracDOM(a) {
  const d = document.createElement("span");
  d.className = "mfrac";
  d.setAttribute("contenteditable", "false");
  d.innerHTML = '<span class="num">' + a.num + '</span><span class="den">' + a.den + "</span>";
  return d;
}
function sqrtDOM(a) {
  const d = document.createElement("span");
  d.className = "msqrt";
  d.setAttribute("contenteditable", "false");
  d.innerHTML =
    (a.idx > 2 ? '<sup class="sqidx">' + a.idx + "</sup>" : "") +
    '<svg class="sqsvg" viewBox="0 0 10 16" preserveAspectRatio="none"><path d="M0.6 9.2 L2.9 15 L9.6 0.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<span class="sqin">' +
    a.in +
    "</span>";
  return d;
}

/* ---------- schema ---------- */
function styleAlign(el) {
  const a = el.style && el.style.textAlign;
  if (a && a !== "left" && a !== "start") return a;
  const at = el.getAttribute && el.getAttribute("align");
  return at && at !== "left" ? at : null;
}
function blkStyle(n) {
  let s = "";
  if (n.attrs.align) s += "text-align:" + n.attrs.align + ";";
  if (n.attrs.indent) s += "padding-left:" + n.attrs.indent * 48 + "px;";
  return s || null;
}

const nodes = {
  doc: { content: "block+" },
  paragraph: {
    content: "inline*",
    group: "block",
    attrs: { align: { default: null }, indent: { default: 0 } },
    parseDOM: [{ tag: "p", getAttrs: (el) => ({ align: styleAlign(el), indent: 0 }) }],
    toDOM: (n) => ["p", { style: blkStyle(n) }, 0],
  },
  heading: {
    content: "inline*",
    group: "block",
    defining: true,
    attrs: { level: { default: 1 }, align: { default: null } },
    parseDOM: [
      { tag: "h1", getAttrs: (el) => ({ level: 1, align: styleAlign(el) }) },
      { tag: "h2", getAttrs: (el) => ({ level: 2, align: styleAlign(el) }) },
      { tag: "h3", getAttrs: (el) => ({ level: 3, align: styleAlign(el) }) },
    ],
    toDOM: (n) => ["h" + n.attrs.level, { style: blkStyle(n) }, 0],
  },
  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{ tag: "blockquote" }],
    toDOM() {
      return ["blockquote", 0];
    },
  },
  horizontal_rule: {
    group: "block",
    atom: true,
    parseDOM: [{ tag: "hr" }],
    toDOM() {
      return ["hr"];
    },
  },
  code_block: {
    content: "text*",
    marks: "",
    group: "block",
    code: true,
    parseDOM: [{ tag: "pre" }],
    toDOM() {
      return ["pre", 0];
    },
  },
  /* the one type the schema refuses to build without */
  text: { group: "inline" },
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    atom: true,
    parseDOM: [{ tag: "br" }],
    toDOM() {
      return ["br"];
    },
  },
  image: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { src: { default: null }, alt: { default: "" }, title: { default: null }, asset: { default: null } },
    parseDOM: [
      { tag: "img[data-asset]", getAttrs: (el) => ({ asset: el.getAttribute("data-asset"), alt: el.getAttribute("alt") || "" }) },
      { tag: "img[src]", getAttrs: (el) => ({ src: el.getAttribute("src"), alt: el.getAttribute("alt") || "", title: el.getAttribute("title") }) },
    ],
    toDOM: (n) => {
      const a = { alt: n.attrs.alt };
      if (n.attrs.title) a.title = n.attrs.title;
      if (n.attrs.asset) a["data-asset"] = n.attrs.asset;
      else if (n.attrs.src) a.src = n.attrs.src;
      return ["img", a];
    },
  },
  tabsp: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { width: { default: 48 } },
    parseDOM: [{ tag: "span.tabsp", getAttrs: (el) => ({ width: parseFloat(el.style.width) || 48 }) }],
    toDOM: (n) => ["span", { class: "tabsp", style: "width:" + n.attrs.width + "px", contenteditable: "false" }],
  },
  /* formulas are atoms — click one to edit its fields in a popover */
  mfrac: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { num: { default: "a" }, den: { default: "b" } },
    parseDOM: [
      {
        tag: "span.mfrac",
        getAttrs: (el) => ({ num: (el.querySelector(":scope > .num") || el).innerHTML, den: (el.querySelector(":scope > .den") || el).innerHTML }),
      },
    ],
    toDOM: (n) => fracDOM(n.attrs),
  },
  msqrt: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { idx: { default: null }, in: { default: "x" } },
    parseDOM: [
      {
        tag: "span.msqrt",
        getAttrs: (el) => ({
          idx: parseInt((el.querySelector(":scope > .sqidx") || {}).textContent, 10) || null,
          in: (el.querySelector(":scope > .sqin") || el).innerHTML,
        }),
      },
    ],
    toDOM: (n) => sqrtDOM(n.attrs),
  },
};

/* ---- lists: hand-written specs (the package's exports are plain objects
   in this version, its commands work with any correctly-shaped schema) ---- */
nodes.ordered_list = {
  content: "list_item+",
  group: "block",
  attrs: { start: { default: 1 } },
  parseDOM: [{ tag: "ol", getAttrs: (el) => ({ start: el.hasAttribute("start") ? +el.getAttribute("start") : 1 }) }],
  toDOM: (n) => ["ol", { start: n.attrs.start !== 1 ? n.attrs.start : null }, 0],
};
nodes.bullet_list = {
  content: "list_item+",
  group: "block",
  parseDOM: [{ tag: "ul" }],
  toDOM() {
    return ["ul", 0];
  },
};
nodes.list_item = {
  content: "paragraph block*",
  defining: true,
  parseDOM: [{ tag: "li" }],
  toDOM() {
    return ["li", 0];
  },
};

/* ---- tables ---- */
function parseCell(el) {
  const cw = el.getAttribute("colwidth");
  return {
    colspan: +el.getAttribute("colspan") || 1,
    rowspan: +el.getAttribute("rowspan") || 1,
    colwidth: cw ? cw.split(",").map((w) => +w) : null,
    background: el.style.backgroundColor || null,
  };
}
function cellDOM(tag) {
  return (n) => {
    const a = {};
    if (n.attrs.colspan !== 1) a.colspan = n.attrs.colspan;
    if (n.attrs.rowspan !== 1) a.rowspan = n.attrs.rowspan;
    if (n.attrs.colwidth) a.colwidth = n.attrs.colwidth.join(",");
    if (n.attrs.background) a.style = "background-color:" + n.attrs.background;
    return [tag, a, 0];
  };
}
const cellAttrs = { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null }, background: { default: null } };
nodes.table = {
  content: "table_row+",
  group: "block",
  tableRole: "table",
  isolating: true,
  parseDOM: [{ tag: "table" }],
  toDOM: (n) => {
    const row = n.content.firstChild;
    let cols = null;
    if (row) {
      let w = [],
        seen = false;
      row.forEach((c) => {
        if (c.attrs.colwidth) {
          w = w.concat(c.attrs.colwidth);
          seen = true;
        } else for (let i = 0; i < (c.attrs.colspan || 1); i++) w.push(0);
      });
      cols = seen ? w : null;
    }
    const dom = ["table", cols ? { style: "table-layout:fixed;width:100%" } : {}];
    if (cols) dom.push(["colgroup", {}, cols.map((x) => ["col", x ? { style: "width:" + x + "px" } : {}])]);
    dom.push(["tbody", 0]);
    return dom;
  },
};
nodes.table_row = {
  content: "(table_cell | table_header)*",
  tableRole: "row",
  parseDOM: [{ tag: "tr" }],
  toDOM() {
    return ["tr", 0];
  },
};
nodes.table_cell = {
  content: "block+",
  attrs: cellAttrs,
  tableRole: "cell",
  isolating: true,
  parseDOM: [{ tag: "td", getAttrs: parseCell }],
  toDOM: cellDOM("td"),
};
nodes.table_header = {
  content: "block+",
  attrs: cellAttrs,
  tableRole: "header",
  isolating: true,
  parseDOM: [{ tag: "th", getAttrs: parseCell }],
  toDOM: cellDOM("th"),
};

const FSLEGACY = { 1: 10, 2: 13, 3: 16, 4: 18, 5: 24, 6: 32, 7: 48 };
const marks = {
  /* must be FIRST (lowest mark rank → renders outermost), so that
     strike/underline/highlight inherit the font size and position right */
  fontSize: {
    attrs: { px: {} },
    parseDOM: [
      { tag: "span[style]", getAttrs: (el) => (el.style.fontSize ? { px: parseFloat(el.style.fontSize) || null } : false) },
      { tag: "font[size]", getAttrs: (el) => ({ px: FSLEGACY[+el.getAttribute("size")] || 16 }) },
    ],
    toDOM: (n) => ["span", { style: "font-size:" + n.attrs.px + "px" }, 0],
  },

  strong: {
    parseDOM: [{ tag: "strong" }, { tag: "b" }],
    toDOM() {
      return ["strong", 0];
    },
  },
  em: {
    parseDOM: [{ tag: "em" }, { tag: "i" }],
    toDOM() {
      return ["em", 0];
    },
  },
  underline: {
    parseDOM: [{ tag: "u" }],
    toDOM() {
      return ["u", 0];
    },
  },
  strike: {
    parseDOM: [{ tag: "s" }, { tag: "del" }, { tag: "strike" }],
    toDOM() {
      return ["s", 0];
    },
  },
  code: {
    parseDOM: [{ tag: "code" }],
    toDOM() {
      return ["code", 0];
    },
  },
  subscript: {
    parseDOM: [{ tag: "sub" }],
    toDOM() {
      return ["sub", 0];
    },
    excludes: "superscript",
  },
  superscript: {
    parseDOM: [{ tag: "sup" }],
    toDOM() {
      return ["sup", 0];
    },
    excludes: "subscript",
  },
  link: {
    attrs: { href: {} },
    inclusive: false,
    parseDOM: [
      { tag: "a[href]", getAttrs: (el) => (/^javascript:/i.test(el.getAttribute("href") || "") ? false : { href: el.getAttribute("href") }) },
    ],
    toDOM: (n) => ["a", { href: n.attrs.href }, 0],
  },
  foreColor: {
    attrs: { color: {} },
    parseDOM: [
      { tag: "span[style]", getAttrs: (el) => (el.style.color ? { color: el.style.color } : false) },
      { tag: "font[color]", getAttrs: (el) => ({ color: el.getAttribute("color") }) },
    ],
    toDOM: (n) => ["span", { style: "color:" + n.attrs.color }, 0],
  },
  hilite: {
    attrs: { color: {} },
    parseDOM: [
      { tag: "span[style]", getAttrs: (el) => (el.style.backgroundColor ? { color: el.style.backgroundColor } : false) },
      { tag: "mark", getAttrs: (el) => ({ color: el.style.backgroundColor || "yellow" }) },
      { tag: "font[bgcolor]", getAttrs: (el) => ({ color: el.getAttribute("bgcolor") }) },
    ],
    toDOM: (n) => ["span", { style: "background-color:" + n.attrs.color }, 0],
  },
};

const schema = new PM.Schema({ nodes, marks });

/* ---------- typing state: highlighter + pending font size ---------- */
const hlState = { on: false, color: "#fde68a" };
const pend = { size: null };

/* keeps storedMarks in sync on every caret move:
   hl on  → the hilite mark rides along with everything typed
   hl off → the hilite mark is stripped, so typing beside a mark never extends it
   pend.size → the size rides along until changed */
const markKeeper = new PM.Plugin({
  appendTransaction(transs, old, state) {
    const sel = state.selection;
    if (!sel.empty) return null;
    const M = schema.marks;
    const cur = state.storedMarks;
    const src = cur || sel.$from.marks();
    let want = src.filter((m) => m.type !== M.hilite && m.type !== M.fontSize);
    if (hlState.on) want.push(M.hilite.create({ color: hlState.color }));
    if (pend.size) want.push(M.fontSize.create({ px: pend.size }));
    const same = want.length === src.length && want.every((m) => src.some((w) => w.eq(m)));
    if (same) return null;
    const tr = state.tr;
    src.forEach((m) => {
      if (!want.some((w) => w.eq(m))) tr.removeStoredMark(m);
    });
    want.forEach((m) => {
      if (!src.some((c) => c.eq(m))) tr.addStoredMark(m);
    });
    return tr;
  },
});

/* ---------- Tab: table cells → lists → 48 px stops ---------- */
function insertTabStop(state, dispatch, view) {
  const sel = state.selection;
  if (!sel.empty) return false;
  const cont = view.dom;
  const r = cont.getBoundingClientRect();
  const cs = getComputedStyle(cont);
  const padL = parseFloat(cs.paddingLeft) || 0,
    padR = parseFloat(cs.paddingRight) || 0;
  let x = null;
  try {
    x = view.coordsAtPos(sel.from).left;
  } catch (e) {}
  let rel = x == null ? 0 : (x - r.left) / VP.z - padL;
  if (rel < 0) rel = 0;
  const maxX = cont.clientWidth - padL - padR;
  let stop = Math.floor(rel / TABSTEP) * TABSTEP + TABSTEP;
  if (stop <= rel + 0.5) stop += TABSTEP;
  let width = TABSTEP;
  if (stop <= maxX + 2) width = Math.max(4, Math.round(stop - rel));
  if (dispatch) dispatch(state.tr.replaceSelection(schema.nodes.tabsp.create({ width: Math.round(width) })));
  return true;
}
function outdentBlocks(state, dispatch) {
  const tr = state.tr;
  const apply = (n, p) => {
    if ((n.attrs.indent || 0) > 0) tr.setNodeMarkup(p, null, Object.assign({}, n.attrs, { indent: n.attrs.indent - 1 }));
  };
  if (state.selection.empty) {
    const $f = state.selection.$from;
    for (let d = $f.depth; d > 0; d--) {
      if ($f.node(d).isTextblock) {
        apply($f.node(d), $f.before(d));
        break;
      }
    }
  } else state.doc.nodesBetween(state.selection.from, state.selection.to, (n, p) => n.isTextblock && apply(n, p));
  if (!tr.steps.length) return false;
  if (dispatch) dispatch(tr);
  return true;
}
const tabCmd = (state, dispatch, view) => {
  try {
    if (PM.goToNextCell && PM.goToNextCell(1)(state, dispatch, view)) return true; /* table cell */
  } catch (e) {
    console.error("noChalk: Tab (table path) —", e);
  }
  try {
    if (PM.sinkListItem(schema.nodes.list_item)(state, dispatch, view)) return true; /* list: indent */
  } catch (e) {}
  try {
    if (insertTabStop(state, dispatch, view)) return true; /* plain text: jump to the next 48 px stop */
  } catch (e) {
    console.error("noChalk: Tab (tab stop) —", e);
  }
  /* last resort — never let Tab kick the focus out of the box */
  if (dispatch) dispatch(state.tr.replaceSelection(schema.nodes.tabsp.create({ width: TABSTEP })));
  return true;
};
const shiftTabCmd = (state, dispatch, view) => {
  if (PM.goToNextCell(-1)(state, dispatch, view)) return true;
  if (PM.liftListItem(schema.nodes.list_item)(state, dispatch, view)) return true;
  return outdentBlocks(state, dispatch);
};

/* ---------- input rules: auto lists + typed URLs linkify ---------- */
const inputRulesPlugin = PM.inputRules({
  rules: [
    PM.wrappingInputRule(
      /^(\d{1,3})[.)] $/,
      schema.nodes.ordered_list,
      (m) => ({ start: +m[1] }),
      (m, node) => node.childCount + node.attrs.start === +m[1],
    ),
    PM.wrappingInputRule(/^[-*] $/, schema.nodes.bullet_list),
    new PM.InputRule(/((?:https?:\/\/|www\.)[^\s<>"']+) $/, (state, m, from, to) => {
      const href = /^www\./i.test(m[1]) ? "https://" + m[1] : m[1];
      return state.tr.addMark(from, to - 1, schema.marks.link.create({ href }));
    }),
  ],
});

const plugins = [
  PM.keymap({
    "Mod-z": PM.undo,
    "Shift-Mod-z": PM.redo,
    "Mod-y": PM.redo,
    Tab: tabCmd,
    "Shift-Tab": shiftTabCmd,
    Enter: PM.chainCommands(PM.newlineInCode, PM.createParagraphNear, PM.liftEmptyBlock, PM.splitListItem(schema.nodes.list_item), PM.splitBlock),
    "Mod-[": PM.liftListItem(schema.nodes.list_item),
    "Mod-]": PM.sinkListItem(schema.nodes.list_item),
  }),
  PM.keymap({ Backspace: (st, d, v) => (st.selection instanceof PM.CellSelection ? PM.deleteCellSelection(st, d, v) : false) }),
  PM.keymap(PM.baseKeymap),
  PM.history(),
  inputRulesPlugin,
  PM.tableEditing(),
  PM.columnResizing({ handleWidth: 5, cellMinWidth: 34 }),
  markKeeper,
];

/* ---------- NodeViews ---------- */
/* formulas: editable islands, exactly like the old contenteditable days.
   Fields are plain contenteditable; PM ignores their DOM (ignoreMutation)
   and events (stopEvent); every keystroke commits the field content into
   the node attrs. Nested formulas (root in a fraction, fraction in a root)
   live as HTML inside the parent's attrs — same file format as before. */

/* wire every field under `root` (including fields of nested formulas) so
   that editing commits the TOP atom `top` that owns the doc node */
function wireFormulaFields(root, top) {
  root.querySelectorAll(".num, .den, .sqin").forEach((f) => {
    if (f._ncWired) return;
    f._ncWired = true;
    f.contentEditable = "true";
    f.spellcheck = false;
    f.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const frac = f.closest(".mfrac");
      if (f.classList.contains("num") && frac) {
        const den = frac.querySelector(":scope > .den");
        if (den) {
          den.focus();
          selectIn(den);
          return;
        }
      }
      f.blur();
    });
    f.addEventListener("input", () => top._ncCommit && top._ncCommit());
    f.addEventListener("blur", () => top._ncCommit && top._ncCommit());
  });
}

/* is the caret inside a formula field? → { atom: top formula element, field } */
function formulaFieldAt() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return null;
  const n = sel.anchorNode;
  if (!n) return null;
  const el = n.nodeType === 3 ? n.parentElement : n;
  if (!el || !el.closest) return null;
  const field = el.closest(".num, .den, .sqin");
  if (!field) return null;
  let top = field.closest(".mfrac, .msqrt");
  if (!top) return null;
  while (top.parentElement) {
    const outer = top.parentElement.closest(".mfrac, .msqrt");
    if (outer && outer !== top) top = outer;
    else break;
  }
  if (!top._ncCommit) return null; /* not a live formula view */
  return { atom: top, field };
}

/* insert a DOM node at the caret inside the host field */
function insertIntoField(host, node) {
  const sel = getSelection();
  if (sel && sel.rangeCount) {
    const r = sel.getRangeAt(0);
    const anc = r.commonAncestorContainer;
    const ancEl = anc.nodeType === 3 ? anc.parentElement : anc;
    if (host.field.contains(ancEl)) {
      r.deleteContents();
      r.insertNode(node);
      return;
    }
  }
  host.field.append(node);
}

function formulaView(kind) {
  return (node, view, getPos) => {
    const dom = kind === "mfrac" ? fracDOM(node.attrs) : sqrtDOM(node.attrs);
    function read() {
      if (kind === "mfrac") {
        const num = dom.querySelector(":scope > .num"),
          den = dom.querySelector(":scope > .den");
        return { num: num ? num.innerHTML : "", den: den ? den.innerHTML : "" };
      }
      const inF = dom.querySelector(":scope > .sqin"),
        ix = dom.querySelector(":scope > .sqidx");
      return { idx: ix ? parseInt(ix.textContent, 10) || null : null, in: inF ? inF.innerHTML : "" };
    }
    function commit() {
      try {
        const pos = getPos();
        if (pos == null || pos < 0) return;
        const cur = view.state.doc.nodeAt(pos);
        if (!cur) return;
        const attrs = read();
        if (JSON.stringify(cur.attrs) === JSON.stringify(attrs)) return;
        view.dispatch(view.state.tr.setNodeMarkup(pos, null, attrs));
      } catch (e) {}
    }
    dom._ncCommit = commit;
    wireFormulaFields(dom, dom);
    return {
      dom,
      update(n) {
        if (n.type.name !== kind) return false;
        if (dom.contains(document.activeElement)) return true; /* typing — leave the DOM alone */
        dom.innerHTML = (kind === "mfrac" ? fracDOM(n.attrs) : sqrtDOM(n.attrs)).innerHTML;
        wireFormulaFields(dom, dom);
        return true;
      },
      ignoreMutation() {
        return true;
      },
      stopEvent() {
        return true;
      },
    };
  };
}
function imageView(node) {
  const dom = document.createElement("img");
  dom.setAttribute("alt", node.attrs.alt || "");
  if (node.attrs.title) dom.setAttribute("title", node.attrs.title);
  if (node.attrs.asset) {
    dom.setAttribute("data-asset", node.attrs.asset);
    const get = typeof getAsset === "function" ? getAsset : null;
    if (get)
      get(node.attrs.asset).then((a) => {
        if (a && a.blob && typeof assetURL === "function") dom.src = assetURL(a.id, a.blob);
      });
  } else if (node.attrs.src) dom.src = node.attrs.src;
  return {
    dom,
    update(n) {
      return n.attrs.asset === node.attrs.asset && n.attrs.src === node.attrs.src;
    },
    ignoreMutation() {
      return true;
    },
  };
}

/* ---------- paste: files / html / URL-text ---------- */
const URL_ALONE = /^(?:https?:\/\/|www\.)[^\s<>"']+$/;
const URL_SPLIT = /((?:https?:\/\/|www\.)[^\s<>"']+)/g;
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;
function pasteHandler(view, e) {
  const cd = e.clipboardData;
  if (!cd) return false;
  if (cd.files && cd.files.length) {
    e.preventDefault();
    handleFiles([...cd.files]);
    return true;
  }
  const html = cd.getData("text/html");
  if (html) {
    e.preventDefault();
    (async () => {
      let h = sanitize(html);
      h = await extractDataURIsToAssets(h);
      ED.insertHTML(view, h);
    })();
    return true;
  }
  const alone = (cd.getData("text/plain") || "").trim();
  if (alone && URL_ALONE.test(alone)) {
    e.preventDefault();
    const from = view.state.selection.from;
    const href = /^www\./i.test(alone) ? "https://" + alone : alone;
    const tr = view.state.tr.insertText(alone);
    tr.addMark(from, from + alone.length, schema.marks.link.create({ href }));
    view.dispatch(tr);
    return true;
  }
  const txt = cd.getData("text/plain");
  if (txt && (txt.indexOf("\t") >= 0 || URL_RE.test(txt))) {
    e.preventDefault();
    const h = txt
      .split(URL_SPLIT)
      .map((p) => (URL_ALONE.test(p) ? '<a href="' + (/^www\./i.test(p) ? "https://" + p : p) + '">' + esc(p) + "</a>" : esc(p)))
      .join("")
      .replace(/\t/g, '<span class="tabsp" style="width:48px"></span>')
      .replace(/\r?\n/g, "<br>");
    ED.insertHTML(view, h);
    return true;
  }
  return false; /* plain text — ProseMirror inserts it */
}

/* ---------- update hook ---------- */
function afterUpdate(view, tr) {
  if (view.hasFocus()) {
    ED.active = view;
    const sel = view.state.selection;
    let cellEl = null;
    for (let d = sel.$from.depth; d > 0 && !cellEl; d--) {
      const n = sel.$from.node(d);
      const role = n.type.spec.tableRole;
      if (role === "cell" || role === "header") {
        const dom = view.nodeDOM(sel.$from.before(d));
        cellEl = dom && dom.nodeType === 1 ? dom : null;
      }
    }
    curCell = cellEl;
    const tEl = cellEl && cellEl.closest ? cellEl.closest("table") : null;
    const seg = document.getElementById("tblSeg");
    const inTbl = !!(tEl && tEl.isConnected);
    if (seg) seg.classList.toggle("on", inTbl);
    if (inTbl) showTblbar(tEl);
    else hideTblbar();
    if (document.activeElement !== sizeIn && !popEl) {
      const fm = sel.empty ? sel.$from.marks().find((m) => m.type === schema.marks.fontSize) : null;
      sizeIn.value = Math.round(fm ? fm.attrs.px : parseFloat(getComputedStyle(view.dom).fontSize) || 16);
    }
    if (typeof refreshCmdButtons === "function") refreshCmdButtons();
  }
  if (tr.docChanged) {
    if (view.dom.querySelector("ul,ol") && typeof syncListSizes === "function") syncListSizes();
    if (cur.pg && (cur.pg.shapes || []).some((s) => s.anchor) && typeof reflowAnchoredCovers === "function") reflowAnchoredCovers();
    queueSave();
  }
  /* live highlight: a selection made while the mode is on marks itself */
  if (hlState.on) {
    const sel = view.state.selection;
    if (!sel.empty && !view.state.doc.rangeHasMark(sel.from, sel.to, schema.marks.hilite))
      view.dispatch(view.state.tr.addMark(sel.from, sel.to, schema.marks.hilite.create({ color: hlState.color })));
  }
}

/* ---------- view lifecycle ---------- */
function initEditor(w, rec) {
  const cont = w.querySelector(".cont");
  if (!cont || cont.pmView) return cont ? cont.pmView : null;
  /* strings become real DOM first — parse()/parseSlice() take nodes */
  let doc = null;
  try {
    const holder = document.createElement("div");
    holder.innerHTML = rec.html || "<p><br></p>";
    doc = PM.DOMParser.fromSchema(schema).parse(holder);
  } catch (e) {
    console.error("noChalk: PM parse failed —", e);
  }
  if (!doc || !doc.type) doc = schema.nodes.doc.createAndFill() || schema.nodes.doc.create(null, schema.nodes.paragraph.create());
  let st;
  try {
    st = PM.EditorState.create({ doc, plugins });
  } catch (e) {
    console.error("noChalk: PM state creation failed —", e);
    return null;
  }

  try {
    const view = new PM.EditorView(
      { mount: cont },
      {
        state: st,
        nodeViews: { mfrac: formulaView("mfrac"), msqrt: formulaView("msqrt"), image: imageView },
        handlePaste: pasteHandler,
        /* Tab hard-wired at the view — checked before all plugin keymaps */
        handleKeyDown(v, event) {
          if (event.key === "Tab") {
            event.preventDefault();
            if (event.shiftKey) shiftTabCmd(v.state, v.dispatch, v);
            else tabCmd(v.state, v.dispatch, v);
            return true;
          }
          return false;
        },
        dispatchTransaction(tr) {
          const st2 = view.state.apply(tr);
          view.updateState(st2);
          afterUpdate(view, tr);
        },
      },
    );
    view._recId = rec.id;
    cont.pmView = view;
    if (view.dom.querySelector("ul,ol") && typeof syncListSizes === "function") syncListSizes();
    return view;
  } catch (e) {
    console.error("noChalk: PM view creation failed —", e);
    return null;
  }
}
function destroyEditor(w) {
  const c = w.querySelector(".cont");
  if (c && c.pmView) {
    if (ED.active === c.pmView) ED.active = null;
    try {
      c.pmView.destroy();
    } catch (e) {}
    c.pmView = null;
  }
}
function serializeView(view) {
  const div = document.createElement("div");
  div.append(PM.DOMSerializer.fromSchema(schema).serializeFragment(view.state.doc.content));
  return div.innerHTML;
}

/* ---------- the ED API ---------- */
ED.view = () => {
  if (ED.active && ED.active.dom && ED.active.dom.isConnected) return ED.active;
  /* nothing focused: fall back to the last focused (or first) box —
     the old focusContent() behavior, so commands also work without a click-in */
  let c = typeof activeCont !== "undefined" && activeCont && activeCont.isConnected && activeCont.pmView ? activeCont : null;
  if (!c) c = document.querySelector(".cont");
  if (c && c.pmView) {
    ED.active = c.pmView;
    try {
      c.pmView.focus();
    } catch (e) {}
    return c.pmView;
  }
  return null;
};

ED.insertHTML = (view, html) => {
  try {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const slice = PM.DOMParser.fromSchema(schema).parseSlice(holder);
    view.dispatch(view.state.tr.replaceSelection(slice));
  } catch (e) {
    console.warn("noChalk: insert failed —", e);
  }
};

ED.focusStart = (view) => {
  view.focus();
  view.dispatch(view.state.tr.setSelection(PM.TextSelection.near(view.state.doc.resolve(0))));
};
ED.toggle = (markName) => {
  const v = ED.view();
  if (v) PM.toggleMark(schema.marks[markName])(v.state, v.dispatch);
};
function eachTextblockSel(st, cb) {
  if (st.selection.empty) {
    const $f = st.selection.$from;
    for (let d = $f.depth; d > 0; d--) {
      if ($f.node(d).isTextblock) {
        cb($f.node(d), $f.before(d));
        return;
      }
    }
    return;
  }
  st.doc.nodesBetween(st.selection.from, st.selection.to, (n, p) => n.isTextblock && cb(n, p));
}
ED.setAlign = (cmd) => {
  const v = ED.view();
  if (!v) return;
  const val = { justifyLeft: null, justifyCenter: "center", justifyRight: "right", justifyFull: "justify" }[cmd];
  const st = v.state;
  const tr = st.tr;
  const blocks = [];
  if (st.selection.empty) {
    const $f = st.selection.$from;
    for (let d = $f.depth; d > 0; d++) {
      if ($f.node(d).isTextblock) {
        blocks.push([$f.node(d), $f.before(d)]);
        break;
      }
    }
  } else st.doc.nodesBetween(st.selection.from, st.selection.to, (n, p) => n.isTextblock && blocks.push([n, p]));
  blocks.forEach(([n, p]) => {
    if (n.type.name !== "code_block") tr.setNodeMarkup(p, null, Object.assign({}, n.attrs, { align: val }));
  });
  if (tr.steps.length) v.dispatch(tr);
};
ED.wrapList = (name) => {
  const v = ED.view();
  if (v) PM.wrapInList(schema.nodes[name])(v.state, v.dispatch);
};

ED.toggleList = (name) => {
  const v = ED.view();
  if (!v) return;
  const type = schema.nodes[name];
  let inSame = false,
    inList = false;
  for (let d = v.state.selection.$from.depth; d >= 0; d--) {
    const n = v.state.selection.$from.node(d);
    if (n.type === schema.nodes.bullet_list || n.type === schema.nodes.ordered_list) {
      inList = true;
      if (n.type === type) inSame = true;
    }
  }
  if (inSame) {
    PM.liftListItem(schema.nodes.list_item)(v.state, v.dispatch); /* same type → turn it off */
    return;
  }
  if (inList) PM.liftListItem(schema.nodes.list_item)(v.state, v.dispatch); /* other type → switch: lift, then wrap */
  PM.wrapInList(type)(v.state, v.dispatch);
};

ED.indent = () => {
  const v = ED.view();
  if (!v) return;
  if (PM.sinkListItem(schema.nodes.list_item)(v.state, v.dispatch)) return;
  const tr = v.state.tr;
  eachTextblockSel(v.state, (n, p) => {
    if (n.type.name !== "code_block" && (n.attrs.indent || 0) < 3)
      tr.setNodeMarkup(p, null, Object.assign({}, n.attrs, { indent: (n.attrs.indent || 0) + 1 }));
  });
  if (tr.steps.length) v.dispatch(tr);
};
ED.outdent = () => {
  const v = ED.view();
  if (!v) return;
  if (PM.liftListItem(schema.nodes.list_item)(v.state, v.dispatch)) return;
  outdentBlocks(v.state, v.dispatch);
};
ED.color = (c) => {
  const v = ED.view();
  if (!v) return;
  const { from, to, empty } = v.state.selection;
  if (empty) v.dispatch(v.state.tr.addStoredMark(schema.marks.foreColor.create({ color: c })));
  else v.dispatch(v.state.tr.addMark(from, to, schema.marks.foreColor.create({ color: c })));
};
ED.fontSize = (px) => {
  const v = ED.view();
  if (!v) return;
  pend.size = px;
  const { from, to, empty } = v.state.selection;
  if (empty) v.dispatch(v.state.tr.addStoredMark(schema.marks.fontSize.create({ px })));
  else v.dispatch(v.state.tr.addMark(from, to, schema.marks.fontSize.create({ px })));
};
ED.markSel = (name, attrs) => {
  const v = ED.view();
  if (!v || v.state.selection.empty) return;
  const { from, to } = v.state.selection;
  v.dispatch(v.state.tr.addMark(from, to, schema.marks[name].create(attrs)));
};
ED.setHl = (on) => {
  hlState.on = on;
  const v = ED.view();
  if (!v) return;
  const { from, to, empty } = v.state.selection;
  if (!empty) {
    if (on) v.dispatch(v.state.tr.addMark(from, to, schema.marks.hilite.create({ color: hlState.color })));
    else v.dispatch(v.state.tr.removeMark(from, to, schema.marks.hilite));
  } else v.dispatch(v.state.tr.setSelection(v.state.selection)); /* wake the keeper */
};
ED.hlState = hlState;
ED.insertFrac = () => {
  const v = ED.view();
  if (!v) return;
  /* caret inside a formula → nest there */
  const host = formulaFieldAt();
  if (host) {
    const el = fracDOM({ num: "a", den: "b" });
    insertIntoField(host, el);
    wireFormulaFields(el, host.atom);
    const f = el.querySelector(":scope > .num");
    if (f) {
      f.focus();
      selectIn(f);
    }
    host.atom._ncCommit();
    return;
  }
  const at = v.state.selection.from;
  v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.mfrac.create()));
  setTimeout(() => {
    const dom = v.nodeDOM(at);
    const num = dom && dom.querySelector ? dom.querySelector(":scope > .num") : null;
    if (num) {
      num.focus();
      selectIn(num);
    }
  }, 30);
};
ED.insertSqrt = (idx) => {
  const v = ED.view();
  if (!v) return;
  const host = formulaFieldAt();
  if (host) {
    const el = sqrtDOM({ idx: idx > 2 ? idx : null, in: "x" });
    insertIntoField(host, el);
    wireFormulaFields(el, host.atom);
    const f = el.querySelector(":scope > .sqin");
    if (f) {
      f.focus();
      selectIn(f);
    }
    host.atom._ncCommit();
    return;
  }
  const at = v.state.selection.from;
  v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.msqrt.create({ idx: idx > 2 ? idx : null })));
  setTimeout(() => {
    const dom = v.nodeDOM(at);
    const inF = dom && dom.querySelector ? dom.querySelector(":scope > .sqin") : null;
    if (inF) {
      inF.focus();
      selectIn(inF);
    }
  }, 30);
};
ED.insertText = (t) => {
  /* symbols from the tray: caret inside a formula → into the field */
  const host = formulaFieldAt();
  if (host) {
    insertIntoField(host, document.createTextNode(t));
    host.atom._ncCommit();
    return;
  }
  const v = ED.view();
  if (v) v.dispatch(v.state.tr.insertText(t));
};
ED.insertTableInto = (view, rows, cols) => {
  const mkCell = (h) => schema.nodes[h ? "table_header" : "table_cell"].createAndFill();
  const mkRow = (h) =>
    schema.nodes.table_row.create(
      null,
      Array.from({ length: cols }, () => mkCell(h)),
    );
  const tbl = schema.nodes.table.create(null, [mkRow(true)].concat(Array.from({ length: Math.max(0, rows - 1) }, () => mkRow(false))));
  const tr = view.state.tr.insert(0, tbl);
  tr.setSelection(PM.TextSelection.near(tr.doc.resolve(4)));
  view.dispatch(tr);
  view.focus();
};
const TBLCMDS = { "row+": PM.addRowAfter, "row-": PM.deleteRow, "col+": PM.addColumnAfter, "col-": PM.deleteColumn };
ED.tableOp = (op) => {
  const v = ED.view();
  if (!v) return;
  const c = TBLCMDS[op];
  if (c) c(v.state, v.dispatch);
};
ED.markActive = (name) => {
  const v = ED.view();
  if (!v) return false;
  const ty = schema.marks[name];
  const { from, $from, to, empty } = v.state.selection;
  return empty
    ? $from.marks().some((m) => m.type === ty) || (v.state.storedMarks || []).some((m) => m.type === ty)
    : v.state.doc.rangeHasMark(from, to, ty);
};
ED.blockInfo = () => {
  const v = ED.view();
  if (!v) return { list: null, align: null };
  const $f = v.state.selection.$from;
  let list = null,
    blk = null;
  for (let d = $f.depth; d >= 0; d--) {
    const n = $f.node(d);
    if (n.type.name === "bullet_list") list = "bullet";
    else if (n.type.name === "ordered_list") list = "ordered";
    else if (!blk && n.isTextblock) blk = n;
  }
  return { list, align: blk && blk.attrs.align ? blk.attrs.align : null };
};
ED.init = initEditor;
ED.destroy = destroyEditor;
ED.serialize = serializeView;

ED.schema = schema;
