/*  noCHalk
      by Fluffless
      model.js
*/

"use strict";
/*
================= notebook / section / page model ================= */
function pageDefaultColor() {
  return document.documentElement.dataset.theme === "dark" ? "#2b2f36" : "#ffffff";
}

function snapshot(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  const t = (d.textContent || "").replace(/\s+/g, " ").trim();
  return t.slice(0, 70);
}
function snippetFromRec(rec) {
  let h = (rec.conts || [])
    .slice(0, 2)
    .map((c) => (c.html || "").slice(0, 2000))
    .join(" ");
  if (!h) h = (rec.html || "").slice(0, 2000);
  return snapshot(h);
}
function stubOf(rec) {
  return { id: rec.id, title: rec.title, created: rec.created, modified: rec.modified, sn: snippetFromRec(rec) };
}
function blankPage() {
  return {
    id: uid(),
    title: "",
    created: Date.now(),
    modified: Date.now(),
    style: { bg: "plain", color: pageDefaultColor() },
    html: "",
    conts: [],
    ink: [],
    shapes: [],
    size: { w: 880, h: 1150 },
    view: null,
    mig: 1,
  };
}
async function newSection(name, color, idx) {
  const rec = blankPage();
  const sec = { id: uid(), name: name || "Section " + (idx || 1), color: color || SEC_COLORS[(idx || 1) % SEC_COLORS.length], pages: [stubOf(rec)] };
  await putPage(rec);
  return sec;
}
function findStubAnywhere(id) {
  for (const s of cur.nb.sections) for (const p of s.pages) if (p.id === id) return p;
  return null;
}
function curStub() {
  if (!cur.pg) return null;
  for (const s of cur.nb.sections) for (const p of s.pages) if (p.id === cur.pg.id) return p;
  return null;
}
function seedState() {
  return { v: 1, ui: { theme: "dark", themed: 1, penOnly: false, cur: {} }, notebooks: [] };
}

function renderAll() {
  renderTabs();
  renderPages();
  if (typeof statusPaint === "function") statusPaint();
}

/* --- generic drag-handle reorder --- */
function gripReorder(grip, item, container, selector, axis, commit) {
  grip.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX,
      sy = e.clientY;
    let moved = false;
    const mv = (e2) => {
      const pos = axis === "x" ? e2.clientX : e2.clientY;
      if (!moved) {
        const d = axis === "x" ? Math.abs(e2.clientX - sx) : Math.hypot(e2.clientX - sx, e2.clientY - sy);
        if (d < 8) return;
        moved = true;
        item.classList.add("drag");
      }
      const sibs = [...container.querySelectorAll(selector)].filter((x) => x !== item);
      let target = null;
      for (const sib of sibs) {
        const r = sib.getBoundingClientRect();
        const mid = axis === "x" ? r.left + r.width / 2 : r.top + r.height / 2;
        if (pos < mid) {
          target = sib;
          break;
        }
      }
      if (target) {
        if (target.previousSibling !== item) container.insertBefore(item, target);
      } else {
        const last = sibs[sibs.length - 1];
        if (last && last.nextSibling !== item) container.insertBefore(item, last.nextSibling);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      item.classList.remove("drag");
      if (moved) {
        clickGuard = Date.now();
        commit();
      }
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
}

/* --- section tabs --- */
function renderTabs() {
  tabsRow.querySelectorAll(".tab").forEach((n) => n.remove());
  cur.nb.sections.forEach((sec) => {
    const t = el("div", "tab" + (sec === cur.sec ? " on" : ""));
    t.dataset.sid = sec.id;
    t.style.setProperty("--tc", sec.color);
    const grip = el("span", "tab-grip", '<svg class="ic" style="width:10px;height:14px"><use href="#i-grip"/></svg>');
    grip.title = "Drag to move this section";
    const nm = el("span", "tab-n");
    nm.textContent = sec.name;
    const cbtn = el("button", "tab-c");
    cbtn.style.background = sec.color;
    cbtn.title = "Change section colour";
    const xbtn = el("button", "tab-x", "×");
    xbtn.title = "Delete section";
    t.append(grip, nm, cbtn, xbtn);
    t.addEventListener("click", (e) => {
      if (e.target.closest(".tab-grip")) return;
      if (e.target === cbtn) {
        openPop(
          cbtn,
          swatchNode(SEC_COLORS, sec.color, (c) => {
            sec.color = c;
            queueSave();
            renderTabs();
            closePop();
          }),
        );
        return;
      }
      if (e.target === xbtn) {
        confirmDeleteSection(sec);
        return;
      }
      if (sec !== cur.sec) openSection(sec);
    });
    nm.addEventListener("dblclick", () =>
      inlineRename(nm, (v) => {
        sec.name = v;
        queueSave();
        renderTabs();
      }),
    );
    gripReorder(grip, t, tabsRow, ".tab", "x", () => {
      const order = [...tabsRow.querySelectorAll(".tab")].map((x) => cur.nb.sections.find((s) => s.id === x.dataset.sid)).filter(Boolean);
      if (order.length === cur.nb.sections.length) {
        cur.nb.sections.length = 0;
        cur.nb.sections.push(...order);
        queueSave();
      }
    });
    tabsRow.insertBefore(t, addSecBtn);
  });
}

/* --- page list --- */
function renderPages() {
  pageList.innerHTML = "";
  cur.sec.pages.forEach((st) => {
    const it = el("div", "pg-it" + (cur.pg && st.id === cur.pg.id ? " on" : ""));
    it.dataset.pid = st.id;
    const grip = el("span", "pg-grip", '<svg class="ic" style="width:10px;height:14px"><use href="#i-grip"/></svg>');
    grip.title = "Drag to move this page";
    /* top row: title + copy/delete buttons beside it */
    const top = el("div", "pg-top");
    const tt = el("div", "pg-tt");
    tt.textContent = st.title || "Untitled page";
    const acts = el("div", "pg-acts");
    const bCopy = el("button", "pi", '<svg class="ic"><use href="#i-copy"/></svg>');
    bCopy.title = "Copy this page — paste it in any section";
    const bDel = el("button", "pi", '<svg class="ic"><use href="#i-x"/></svg>');
    bDel.title = "Delete page";
    bCopy.onclick = (e) => {
      e.stopPropagation();
      copyPage(st);
    };
    bDel.onclick = (e) => {
      e.stopPropagation();
      confirmDeletePage(st);
    };
    acts.append(bCopy, bDel);
    top.append(tt, acts);
    const sn = el("div", "pg-sn");
    sn.textContent = st.sn || "";
    tt.addEventListener("dblclick", () =>
      inlineRename(tt, (v) => {
        st.title = v;
        queueSave();
        renderPages();
      }),
    );
    it.addEventListener("click", (e) => {
      if (e.target.closest(".pg-grip")) return;
      openPage(st.id);
    });
    gripReorder(grip, it, pageList, ".pg-it", "y", () => {
      const order = [...pageList.querySelectorAll(".pg-it")].map((x) => cur.sec.pages.find((p) => p.id === x.dataset.pid)).filter(Boolean);
      if (order.length === cur.sec.pages.length) {
        cur.sec.pages.length = 0;
        cur.sec.pages.push(...order);
        queueSave();
      }
    });
    it.append(grip, top, sn);
    pageList.append(it);
  });
}

/* --- page clipboard: copy in one section, paste in another --- */
let pageClip = null;
async function copyPage(stub) {
  if (cur.pg && cur.pg.id === stub.id) await savePageNow();
  let rec = cur.pg && cur.pg.id === stub.id ? cur.pg : await idbGet("pages", stub.id);
  if (!rec) rec = stub;
  pageClip = JSON.parse(JSON.stringify(rec));
  (pageClip.ink || []).forEach((s) => delete s.bb);
  (pageClip.shapeInk || []).forEach((s) => delete s.bb);
  syncPagePasteBtn();
  toast("Page copied — switch sections and tap the paste button");
}
async function pastePage() {
  if (!pageClip || !cur.sec) return;
  const copy = JSON.parse(JSON.stringify(pageClip));
  copy.id = uid();
  (copy.conts || []).forEach((c) => (c.id = uid()));
  copy.created = copy.modified = Date.now();
  await putPage(copy);
  const i = cur.pg ? cur.sec.pages.findIndex((p) => p.id === cur.pg.id) : -1;
  if (i >= 0) cur.sec.pages.splice(i + 1, 0, stubOf(copy));
  else cur.sec.pages.push(stubOf(copy));
  pageClip = null;
  syncPagePasteBtn();
  renderPages();
  await openPage(copy.id);
  queueSave();
  toast("Page pasted into “" + cur.sec.name + "”");
}
function syncPagePasteBtn() {
  const b = document.getElementById("pagePasteBtn");
  if (b) b.classList.toggle("on", !!pageClip);
}

async function openSection(sec) {
  if (!sec || (sec === cur.sec && cur.pg)) return;
  const my = ++openSeq;
  await savePageNow();
  if (my !== openSeq) return;
  cur.sec = sec;
  if (!sec.pages.length) {
    const rec = blankPage();
    await putPage(rec);
    sec.pages.push(stubOf(rec));
  }
  renderTabs();
  renderPages();
  await openPage(sec.pages[0].id);
}
/* only used internally (guide generation). Session-level notebook
   switching goes through loadNotebookFile — wipe + reload. */
async function openNotebook(nb) {
  if (!nb) return;
  const my = ++openSeq;
  await savePageNow();
  if (my !== openSeq) return;
  cur.nb = nb;
  if (!nb.sections.length) nb.sections.push(await newSection("Section 1", SEC_COLORS[0], 1));
  cur.sec = nb.sections[0];
  if (!cur.sec.pages.length) {
    const rec = blankPage();
    await putPage(rec);
    cur.sec.pages.push(stubOf(rec));
  }
  renderAll();
  await openPage(cur.sec.pages[0].id);
}
function confirmDeleteSection(sec) {
  const n = sec.pages.length;
  dialog({
    title: "Delete section?",
    msg: `“${sec.name}” and its ${n} page${n === 1 ? "" : "s"} will be deleted. This cannot be undone.`,
    ok: "Delete",
    danger: true,
  }).then(async (ok) => {
    if (!ok) return;
    for (const st of sec.pages) idbDel("pages", st.id);
    const i = cur.nb.sections.indexOf(sec);
    const wasCurrent = sec === cur.sec;
    cur.nb.sections.splice(i, 1);
    if (!cur.nb.sections.length) {
      /* it was the last section: make a fresh one and open it */
      const fresh = await newSection("Section 1", SEC_COLORS[0], 1);
      cur.nb.sections.push(fresh);
      cur.sec = null; /* force openSection to run fully */
      await openSection(fresh);
    } else if (wasCurrent) {
      /* move to the section LEFT of the deleted one (or the first, if it was leftmost) */
      const left = cur.nb.sections[Math.max(0, i - 1)];
      cur.sec = null; /* force openSection to run fully */
      await openSection(left);
    } else {
      renderTabs(); /* row updates immediately; page list unaffected (not current) */
    }
    queueSave();
    toast("Section deleted");
  });
}
function confirmDeletePage(stub) {
  dialog({
    title: "Delete page?",
    msg: `“${stub.title || "Untitled page"}” will be deleted. This cannot be undone.`,
    ok: "Delete",
    danger: true,
  }).then((ok) => {
    if (ok) deletePage(stub);
  });
}

async function deletePage(stub) {
  const i = cur.sec.pages.indexOf(stub);
  if (i < 0) return;
  cur.sec.pages.splice(i, 1);
  idbDel("pages", stub.id);
  if (cur.pg && cur.pg.id === stub.id) {
    const nx = cur.sec.pages[i] || cur.sec.pages[i - 1];
    if (nx) await openPage(nx.id);
    else {
      const rec = blankPage();
      await putPage(rec);
      cur.sec.pages.push(stubOf(rec));
      await openPage(rec.id);
    }
  } else renderPages();
  queueSave();
  toast("Page deleted");
}
