/*  noCHalk
      by Fluffless
      imports.js
*/
"use strict";
/* ================= imports — drag-and-drop is the entry point ================= */
fileInput.addEventListener("change", () => {
  const fs = [...fileInput.files];
  if (fs.length) handleFiles(fs);
});
async function handleFiles(files) {
  for (const f of files) {
    try {
      await importFile(f);
    } catch (err) {
      console.error(err);
      toast("Could not import " + f.name + " — " + (err.message || "error"), { icon: "i-x" });
    }
  }
}
function pickMime(f, fb) {
  return f.type || fb;
}
async function importFile(f) {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  if (ext === "chalkbook" || ext === "nochalk" || ext === "nochallk") {
    return pickNotebookSections(f);
  }
  if (ext === "one") {
    toast(
      "OneNote’s .one is a closed format. In OneNote: File ▸ Export ▸ “Single File Web Page (.mht)” — then import that here (text, images and handwriting are preserved). PDF export works too.",
      { icon: "i-book", dur: 9000 },
    );
    return;
  }
  if (ext === "mht" || ext === "mhtml" || ext === "eml") return importMHTAsPage(f);
  if (ext === "pdf") return importPDF(f);
  if (ext === "docx") return importDocx(f);
  if (ext === "doc" || ext === "dot") {
    toast("Legacy “.doc” isn’t supported — in Word: Save as → .docx, then import.");
    return;
  }
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "csv") return importXlsx(f);
  if (/^image\//.test(f.type) || ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return importImage(f);
  if (/^video\//.test(f.type) || ["mp4", "webm", "m4v", "ogv", "mov", "mkv"].includes(ext)) return importVideo(f);
  return importAttachment(f);
}
function insertEmbedHTML(html) {
  const wx = Math.max(24, (vpW / 2 - VP.x) / VP.z - DEFMEDIAW / 2),
    wy = Math.max(pgHead.offsetHeight, (vpH / 2 - VP.y) / VP.z - 60);
  const rec = { id: uid(), x: snapVal(wx), y: snapVal(wy), w: DEFMEDIAW, ro: true, html: html };
  cur.pg.conts.push(rec);
  growPaperTo(rec.x + DEFMEDIAW + 120, rec.y + 700);
  const w = renderBox(rec);
  hydrateAssets();
  queueSave();
  requestAnimationFrame(() => centerViewOn(w));
}
function capHTML(icon, name, size, attId, dim) {
  return (
    `<div class="ecap head"><svg class="ic"><use href="#${icon}"/></svg><span class="en">${esc(name)}</span>` +
    (dim ? `<span class="dim">${esc(dim)}</span>` : "") +
    `<a class="dl" data-asset="${attId}">Save original</a></div>`
  );
}

async function importImage(f) {
  const id = await addAsset(f, f.name, pickMime(f, "image/png"));
  insertEmbedHTML(`<img class="pg-img" data-asset="${id}" alt="${esc(f.name)}" loading="lazy" decoding="async">`);
  toast(f.name + " inserted");
}
async function importVideo(f) {
  const id = await addAsset(f, f.name, pickMime(f, "video/mp4"));
  insertEmbedHTML(
    `<div class="embed" contenteditable="false">${capHTML("i-video", f.name, fmtSize(f.size), id)}<video controls preload="metadata" data-asset="${id}"></video></div>`,
  );
  toast(f.name + " — embedded & attached", { icon: "i-video" });
}
async function importAttachment(f) {
  const id = await addAsset(f, f.name, f.type || "application/octet-stream");
  insertEmbedHTML(
    `<div class="attach" contenteditable="false"><svg class="ic"><use href="#i-file"/></svg><span class="an">${esc(f.name)}</span><span class="dim">${fmtSize(f.size)}</span><a class="dl" data-asset="${id}">Save</a></div>`,
  );
  toast(f.name + " attached");
}
async function importDocx(f) {
  const t = progToast("Reading " + f.name);
  try {
    await loadLib("mammoth");
    const res = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
    let html = await extractDataURIsToAssets(sanitize(res.value || ""));
    const id = await addAsset(f, f.name, pickMime(f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    insertEmbedHTML(
      `<div class="embed" contenteditable="false">${capHTML("i-file", f.name, fmtSize(f.size), id, "printed")}<div class="docx-b">${html}</div></div>`,
    );
    t.done(f.name + " — printed & attached");
  } catch (e) {
    t.fail("Word import failed: " + (e.message || "library could not load"));
  }
}
async function importXlsx(f) {
  const t = progToast("Reading " + f.name);
  try {
    await loadLib("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
    let inner = "";
    for (const nm of wb.SheetNames.slice(0, 15)) {
      const h = XLSX.utils.sheet_to_html(wb.Sheets[nm], {});
      const tab = h.match(/<table[\s\S]*<\/table>/i);
      if (tab) inner += `<div class="sheetname">${esc(nm)}</div>` + tab[0];
    }
    if (!inner) throw new Error("no sheets found");
    const id = await addAsset(f, f.name, pickMime(f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    insertEmbedHTML(
      `<div class="embed" contenteditable="false">${capHTML("i-file", f.name, fmtSize(f.size), id, "printed")}<div class="xlsx-b">${inner}</div></div>`,
    );
    t.done(f.name + " — printed & attached");
  } catch (e) {
    t.fail("Excel import failed: " + (e.message || "library could not load"));
  }
}

let pdfWorkerSrc = null;
async function ensurePdfWorker() {
  if (pdfWorkerSrc) return pdfWorkerSrc;
  try {
    const code = await (await fetch(CDN.pdfworker)).text();
    pdfWorkerSrc = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
  } catch (e) {
    pdfWorkerSrc = CDN.pdfworker;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  return pdfWorkerSrc;
}
async function importPDF(f) {
  const t = progToast("Opening " + f.name);
  try {
    await loadLib("pdfjs");
    await ensurePdfWorker();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    const total = Math.min(pdf.numPages, 100),
      ids = [];
    const cnv = document.createElement("canvas"),
      cx = cnv.getContext("2d");
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const sc = Math.max(1, Math.min(2.1, 760 / v1.width));
      const vp = page.getViewport({ scale: sc });
      cnv.width = Math.round(vp.width);
      cnv.height = Math.round(vp.height);
      cx.fillStyle = "#fff";
      cx.fillRect(0, 0, cnv.width, cnv.height);
      await page.render({ canvasContext: cx, viewport: vp }).promise;
      const blob = await new Promise((r) => cnv.toBlob(r, "image/jpeg", 0.87));
      ids.push(await addAsset(blob, f.name + " — page " + i, "image/jpeg"));
      t.set(`Printing page ${i}/${total}`);
      if (i % 3 === 0) await nextFrame();
    }
    const att = await addAsset(f, f.name, pickMime(f, "application/pdf"));
    insertEmbedHTML(
      `<div class="embed" contenteditable="false">${capHTML("i-file", f.name, fmtSize(f.size), att, total + " page" + (total === 1 ? "" : "s") + " printed")}<div class="pdfpages">${ids.map((id) => `<img data-asset="${id}" alt="page" loading="lazy" decoding="async">`).join("")}</div></div>`,
    );
    t.done(f.name + " — printed & attached");
  } catch (e) {
    t.fail("PDF import failed: " + (e.message || "library could not load"));
  }
}

/* ---- OneNote .mht import ---- */
function u8BinStr(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return s;
}
function parseHeaders(h) {
  const o = {};
  h.replace(/\r?\n[ \t]+/g, " ")
    .split(/\r?\n/)
    .forEach((l) => {
      const i = l.indexOf(":");
      if (i > 0) o[l.slice(0, i).trim().toLowerCase()] = l.slice(1, i + 1).trim();
    });
  return o;
}
function mhtParts(text) {
  const bm = text.match(/boundary=(?:"([^"]+)"|([^\r\n;]+))/i);
  if (!bm) return [];

  const bnd = "--" + (bm[1] || bm[2]).trim();
  const chunks = text.split(bnd);
  const parts = [];
  for (let i = 1; i < chunks.length; i++) {
    let ch = chunks[i];
    if (ch.startsWith("--")) continue;
    ch = ch.replace(/^\r?\n/, "");
    const idx = ch.search(/\r?\n\r?\n/);
    if (idx < 0) continue;
    parts.push({ H: parseHeaders(ch.slice(0, idx)), body: ch.slice(idx).replace(/^\r?\n/, "") });
  }
  return parts;
}
function qpDecode(str) {
  str = str.replace(/=\r?\n/g, "");
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "=" && /[0-9A-Fa-f]/.test(str[i + 1] || "") && /[0-9A-Fa-f]/.test(str[i + 2] || "")) {
      out.push(parseInt(str.substr(i + 1, 2), 16));
      i += 2;
    } else out.push(str.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}
function decodePart(part) {
  const enc = (part.H["content-transfer-encoding"] || "").toLowerCase();
  if (enc === "base64") {
    const b = part.body.replace(/[^A-Za-z0-9+/=]/g, "");
    const bin = atob(b);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  if (enc === "quoted-printable") return qpDecode(part.body);
  const u = new Uint8Array(part.body.length);
  for (let i = 0; i < part.body.length; i++) u[i] = part.body.charCodeAt(i) & 0xff;
  return u;
}
function bytesToText(u8, charset) {
  let t = new TextDecoder(charset || "utf-8").decode(u8);
  if ((t.match(/\uFFFD/g) || []).length > 2) {
    try {
      t = new TextDecoder("windows-1252").decode(u8);
    } catch (e) {}
  }
  return t;
}
function collectParts(text, out) {
  for (const p of mhtParts(text)) {
    const ct = (p.H["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/")) collectParts(u8BinStr(decodePart(p)), out);
    else out.push(p);
  }
  return out;
}
async function importMHTAsPage(f) {
  const t = progToast("Reading " + f.name);
  try {
    const text = u8BinStr(new Uint8Array(await f.arrayBuffer()));
    const parts = collectParts(text, []);
    let htmlPart = null;
    const assets = {};
    for (const p of parts) {
      const ct = (p.H["content-type"] || "").toLowerCase().split(";")[0].trim();
      if (!htmlPart && ct === "text/html") htmlPart = p;
      else if (/^(image|video|audio)\//.test(ct) || ct === "application/octet-stream") {
        const loc = (p.H["content-location"] || "").toLowerCase().trim();
        const u8 = decodePart(p);
        if (loc && u8.length && !assets[loc]) {
          const blob = new Blob([u8], { type: ct });
          assets[loc] = await addAsset(blob, (loc.split("/").pop() || "image").slice(0, 40), ct);
        }
      }
    }
    if (!htmlPart) throw new Error("no HTML part found");
    let html = bytesToText(decodePart(htmlPart), (/charset="?([\w-]+)/i.exec(htmlPart.H["content-type"]) || [])[1]);
    const title = ((/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || "").trim() || f.name.replace(/\.(mht(ml)?|eml)$/i, "");
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const doc = tpl.content;
    doc
      .querySelectorAll("script,style,link,meta,noscript,iframe,object,embed,form,input,button,head,title,base,video,audio,select,textarea")
      .forEach((n) => n.remove());
    doc.querySelectorAll("img").forEach((img) => {
      const src = (img.getAttribute("src") || "").trim().toLowerCase();
      let id = assets[src];
      if (!id) id = assets[src.replace(/^file:\/+/, "")];
      if (!id) id = assets[decodeURIComponent(src)];
      if (!id) {
        const base = src.split("/").pop().split("?")[0];
        for (const k in assets) {
          if (k.split("/").pop() === base) {
            id = assets[k];
            break;
          }
        }
      }
      if (id) {
        img.setAttribute("data-asset", id);
        img.removeAttribute("src");
      } else img.remove();
      img.removeAttribute("width");
      img.removeAttribute("height");
      img.style.maxWidth = "100%";
      img.style.height = "auto";
    });
    doc.querySelectorAll("[style]").forEach((n) => {
      ["position", "left", "top", "width", "height", "min-width", "max-width"].forEach((pn) => n.style.removeProperty(pn));
      if (!n.style.cssText) n.removeAttribute("style");
    });
    doc.querySelectorAll("*").forEach((n) => {
      [...n.attributes].forEach((a) => {
        if (a.name.toLowerCase().startsWith("on")) n.removeAttribute(a.name);
      });
    });
    await savePageNow();
    const p = blankPage();
    p.title = title.slice(0, 80);
    p.conts = [
      {
        id: uid(),
        x: 56,
        y: pgHead.offsetHeight + 6,
        w: DEFMEDIAW,
        ro: true,
        html: `<div class="embed" contenteditable="false"><div class="ecap"><svg class="ic"><use href="#i-book"/></svg><span class="en">${esc(f.name)}</span><span class="dim">OneNote import</span></div><div class="docx-b">${tpl.innerHTML}</div></div><p><br></p>`,
      },
    ];
    await putPage(p);
    cur.sec.pages.push(stubOf(p));
    renderPages();
    await openPage(p.id);
    queueSave();
    t.done("“" + p.title + "” imported from OneNote export");
  } catch (e) {
    t.fail("OneNote import failed: " + e.message);
  }
}

/* ---- dropped notebook: pick sections to import, or open whole ---- */
async function pickNotebookSections(f) {
  const t = progToast("Reading " + f.name + "…");
  let zip, man;
  try {
    await loadLib("jszip");
    zip = await JSZip.loadAsync(await f.arrayBuffer());
    man = JSON.parse(await zip.file("manifest.json").async("string"));
    if (!man || !man.notebook || !Array.isArray(man.notebook.sections)) throw new Error("not a noChalk notebook file");
  } catch (e) {
    t.fail("Could not read " + f.name + ": " + (e.message || "error"));
    return;
  }
  if (typeof t.hide === "function") t.hide();
  const secs = man.notebook.sections.filter((s) => s && s.pages && s.pages.length);
  if (!secs.length) {
    toast("No sections found in " + f.name, { icon: "i-x" });
    return;
  }
  const res = await sectionsPickDialog(f, secs);
  if (!res || res === "cancel") return;
  if (res === "all") {
    /* the old drop behaviour: replace the session with this file */
    if (dirty || (typeof statusUnsavedFor === "function" && statusUnsavedFor() > 0)) {
      const save = await dialog({
        title: "Save current notebook?",
        msg: "The current notebook has unsaved changes. Save to its file before loading another?",
        ok: "Save",
      });
      if (save) await saveAll();
    }
    await loadNotebookFile(f, null);
    return;
  }
  await importSections(zip, man, res);
}

function sectionsPickDialog(f, secs) {
  return new Promise((res) => {
    const ov = el("div", "dlg-ov"),
      card = el("div", "dlg");
    card.innerHTML =
      `<div class="dlg-t">Import sections from “${esc(f.name)}”</div>` +
      `<div class="dlg-m">Check the sections to copy into “${esc(cur.nb.name)}” — pages, drawings and embedded files come along.</div>`;
    const list = el("div", "sec-pick");
    const checks = secs.map((s) => {
      const row = el("label", "sec-row");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = true;
      const dot = el("span", "sec-dot");
      dot.style.background = s.color || "#999";
      const c = el("span", "sec-c");
      c.textContent = s.pages.length + (s.pages.length === 1 ? " page" : " pages");
      row.append(cb, dot, el("span", "sec-n", esc(s.name || "Untitled")), c);
      list.append(row);
      return cb;
    });
    const allRow = el("label", "sec-all");
    const allCb = el("input");
    allCb.type = "checkbox";
    allCb.checked = true;
    allRow.append(allCb, el("span", null, "All sections"));
    card.append(list, allRow);
    const btns = el("div", "dlg-b");
    const bc = el("button", "btn", "Cancel"),
      bo = el("button", "btn", "Open whole notebook"),
      bg = el("button", "btn go", "Import");
    btns.append(bc, bo, bg);
    card.append(btns);
    const upd = () => {
      const n = checks.filter((c) => c.checked).length;
      bg.textContent = n ? "Import " + n + (n === 1 ? " section" : " sections") : "Import";
      bg.disabled = !n;
      bg.style.opacity = n ? "" : "0.5";
      allCb.checked = n === checks.length;
    };
    checks.forEach((c) => c.addEventListener("change", upd));
    allCb.addEventListener("change", () => checks.forEach((c) => (c.checked = allCb.checked)));
    upd();
    const done = (v) => {
      ov.remove();
      res(v);
    };
    bc.onclick = () => done(null);
    bo.onclick = () => done("all");
    bg.onclick = () => done(checks.map((c, i) => (c.checked ? secs[i] : null)).filter(Boolean));
    ov.append(card);
    document.body.append(ov);
    ov.addEventListener("pointerdown", (e) => {
      if (e.target === ov) done(null);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !bg.disabled) {
        e.preventDefault();
        bg.click();
      }
      if (e.key === "Escape") done(null);
    });
    setTimeout(() => checks[0] && checks[0].focus(), 30);
  });
}

async function importSections(zip, man, secs) {
  const t = progToast("Importing sections…");
  try {
    /* only the assets the chosen sections actually use */
    const ids = new Set();
    for (const s of secs)
      for (const p of s.pages) {
        (p.html || "").replace(/data-asset="([^"]+)"/g, (m, id) => (ids.add(id), m));
        (p.conts || []).forEach((c) => (c.html || "").replace(/data-asset="([^"]+)"/g, (m, id) => (ids.add(id), m)));
      }
    const idmap = {};
    for (const id of ids) {
      const meta = (man.assets || {})[id];
      const file = zip.file("assets/" + id);
      if (!file || !meta) continue;
      t.set("Loading files… " + esc(meta.name));
      idmap[id] = await addAsset(await file.async("blob"), meta.name, meta.type);
    }
    const remap = (h) => (h || "").replace(/data-asset="([^"]+)"/g, (m, id) => (idmap[id] ? `data-asset="${idmap[id]}"` : m));
    const names = new Set(cur.nb.sections.map((s) => s.name));
    for (const s of secs) {
      if (names.has(s.name)) {
        let i = 2;
        while (names.has(s.name + " (" + i + ")")) i++;
        s.name = s.name + " (" + i + ")";
      }
      names.add(s.name);
      s.id = uid();
      s.color = s.color || SEC_COLORS[cur.nb.sections.length % SEC_COLORS.length];
      for (const p of s.pages) {
        p.id = uid();
        p.conts = p.conts || [];
        p.ink = p.ink || [];
        p.shapes = p.shapes || [];
        if (!p.size) p.size = { w: 880, h: 1150 };
        p.html = remap(p.html || "");
        p.conts.forEach((c) => {
          c.id = uid();
          c.html = remap(c.html || "");
        });
        await putPage(p);
      }
      s.pages = s.pages.map(stubOf);
      cur.nb.sections.push(s);
    }
    renderTabs();
    queueSave();
    t.done(
      secs.length +
        (secs.length === 1 ? " section imported — Ctrl+S saves it into the file" : " sections imported — Ctrl+S saves them into the file"),
    );
  } catch (e) {
    t.fail("Import failed: " + (e.message || "error"));
  }
}
