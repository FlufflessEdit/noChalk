/*  noCHalk
      by Fluffless
      backups.js
*/
"use strict";

/* ================= incremental zip writer =================
   Layout: [assets — append-only, STORE] [manifest.json] [central dir] [EOCD].
   Saving appends new assets and rewrites only the small tail; already-saved
   assets are never read or rewritten again. JSZip reads these files as-is.
   warmSaveWriter() primes the entry map from a just-loaded file, so even the
   first save after opening is incremental. Linked videos (ext: 2) live only
   in the manifest — their bytes never enter the zip unless we are building
   the shareable file. */
let saveW = { valid: false, entries: new Map(), regionEnd: 0, garbage: 0, lastManifest: "", fileSize: null };
function resetSaveWriter() {
  saveW = { valid: false, entries: new Map(), regionEnd: 0, garbage: 0, lastManifest: "", fileSize: null };
}

let CRC_T = null;
function crcTable() {
  if (CRC_T) return CRC_T;
  CRC_T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_T[n] = c;
  }
  return CRC_T;
}
async function blobCRC(b) {
  const t = crcTable();
  let s = 0xffffffff;
  for (let o = 0; o < b.size; o += 4194304) {
    const u8 = new Uint8Array(await b.slice(o, o + 4194304).arrayBuffer());
    for (let i = 0; i < u8.length; i++) s = t[(s ^ u8[i]) & 0xff] ^ (s >>> 8);
  }
  return (s ^ 0xffffffff) >>> 0;
}
function bytesCRC(u8) {
  const t = crcTable();
  let s = 0xffffffff;
  for (let i = 0; i < u8.length; i++) s = t[(s ^ u8[i]) & 0xff] ^ (s >>> 8);
  return (s ^ 0xffffffff) >>> 0;
}
const TE = new TextEncoder();
const TD = new TextDecoder();
function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
}
function dosDate(d) {
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
}
function zipLFH(name, method, crc, csize, usize, t, d) {
  const nb = TE.encode(name);
  const h = new Uint8Array(30 + nb.length);
  const dv = new DataView(h.buffer);
  dv.setUint32(0, 0x04034b50, true);
  dv.setUint16(4, 20, true);
  dv.setUint16(6, 0x0800, true);
  dv.setUint16(8, method, true);
  dv.setUint16(10, t, true);
  dv.setUint16(12, d, true);
  dv.setUint32(14, crc, true);
  dv.setUint32(18, csize, true);
  dv.setUint32(22, usize, true);
  dv.setUint16(26, nb.length, true);
  h.set(nb, 30);
  return h;
}
function zipCDFH(name, method, crc, csize, usize, t, d, off) {
  const nb = TE.encode(name);
  const h = new Uint8Array(46 + nb.length);
  const dv = new DataView(h.buffer);
  dv.setUint32(0, 0x02014b50, true);
  dv.setUint16(4, 20, true);
  dv.setUint16(6, 20, true);
  dv.setUint16(8, 0x0800, true);
  dv.setUint16(10, method, true);
  dv.setUint16(12, t, true);
  dv.setUint16(14, d, true);
  dv.setUint32(16, crc, true);
  dv.setUint32(20, csize, true);
  dv.setUint32(24, usize, true);
  dv.setUint16(28, nb.length, true);
  dv.setUint32(42, off, true);
  h.set(nb, 46);
  return h;
}
function zipEOCD(n, cdSize, cdOff) {
  const h = new Uint8Array(22);
  const dv = new DataView(h.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(8, n, true);
  dv.setUint16(10, n, true);
  dv.setUint32(12, cdSize, true);
  dv.setUint32(16, cdOff, true);
  return h;
}
async function deflateRaw(u8) {
  try {
    const ab = await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
    return new Uint8Array(ab);
  } catch (e) {
    return null; /* no raw-deflate support: store the manifest plain, still a valid zip */
  }
}

async function gatherNotebook() {
  await savePageNow();
  const nbx = JSON.parse(JSON.stringify(cur.nb));
  for (const s of nbx.sections) {
    for (let i = 0; i < s.pages.length; i++) {
      const st = s.pages[i];
      let rec = cur.pg && cur.pg.id === st.id ? cur.pg : await idbGet("pages", st.id);
      if (!rec) rec = st;
      s.pages[i] = JSON.parse(JSON.stringify(rec));
    }
  }
  const ids = new Set();
  const scan = (h) => (h || "").replace(/data-asset="([^"]+)"/g, (m, id) => (ids.add(id), m));
  for (const s of nbx.sections)
    for (const p of s.pages) {
      scan(p.html);
      (p.conts || []).forEach((c) => scan(c.html));
    }
  return { nbx, ids };
}
function manifestFor(nbx, meta) {
  /* no exportedAt: it would change every save and defeat the no-change skip; nothing reads it */
  return JSON.stringify({ app: "noChalk", version: 2, ui: state.ui, notebook: nbx, assets: meta });
}
async function prepareAssets(ids, needBlobs, embedLinked) {
  const meta = {};
  const list = [];
  for (const id of ids) {
    const ent = saveW.entries.get(id);
    if (ent && ent.off >= 0 && !needBlobs) {
      /* already on disk, untouched — no IDB read, no CRC, no copy */
      meta[id] = { name: ent.name, type: ent.type, size: ent.size };
      list.push({ id, crc: ent.crc, size: ent.size, off: ent.off, blob: null, name: ent.name, type: ent.type });
      continue;
    }
    const a = await getAsset(id);
    if (!a) continue;
    if (a.ext === 2) {
      /* linked video: bytes live in the media folder, next to the notebook file —
         they enter the zip only when building the shareable file.
         mediaAssetPath normalizes legacy "media/…" rel values, so records
         saved before that fix read from the correct single media folder too. */
      const p = typeof mediaAssetPath === "function" ? mediaAssetPath(a) : null;
      if (!embedLinked || !p) {
        meta[id] = { name: a.name, type: a.type, size: a.size, ext: 2, rel: (a.rel || "").replace(/^media[\\/]/, "") };
        continue;
      }
      const bytes = await Platform.readAll({ path: p });
      const blob = new Blob([bytes], { type: a.type });
      meta[id] = { name: a.name, type: a.type, size: blob.size };
      list.push({ id, crc: await blobCRC(blob), size: blob.size, off: -1, blob, name: a.name, type: a.type });
      continue;
    }
    meta[id] = { name: a.name, type: a.type, size: a.size };
    list.push({ id, crc: ent ? ent.crc : await blobCRC(a.blob), size: a.size, off: -1, blob: a.blob, name: a.name, type: a.type });
  }
  return { meta, list };
}

async function writeNotebookFull(ref, updateState, embedLinked) {
  const g = await gatherNotebook();
  const { meta, list } = await prepareAssets(g.ids, true, embedLinked);
  const manStr = manifestFor(g.nbx, meta);
  const now = new Date(),
    t = dosTime(now),
    d = dosDate(now);
  const parts = [];
  const central = [];
  const ents = new Map();
  let off = 0;
  for (const e of list) {
    const name = "assets/" + e.id;
    const lfh = zipLFH(name, 0, e.crc, e.size, e.size, t, d);
    parts.push(lfh, e.blob);
    central.push({ name, method: 0, crc: e.crc, csize: e.size, usize: e.size, off });
    ents.set(e.id, { crc: e.crc, size: e.size, off, name: e.name, type: e.type });
    off += lfh.length + e.size;
  }
  const regionEnd = off;
  const mraw = TE.encode(manStr);
  let mdata = await deflateRaw(mraw);
  const mm = mdata ? 8 : 0;
  if (!mdata) mdata = mraw;
  const mcrc = bytesCRC(mraw);
  const mlfh = zipLFH("manifest.json", mm, mcrc, mdata.length, mraw.length, t, d);
  parts.push(mlfh, mdata);
  central.push({ name: "manifest.json", method: mm, crc: mcrc, csize: mdata.length, usize: mraw.length, off });
  off += mlfh.length + mdata.length;
  let cdSize = 0;
  for (const c of central) {
    const b = zipCDFH(c.name, c.method, c.crc, c.csize, c.usize, t, d, c.off);
    parts.push(b);
    cdSize += b.length;
  }
  parts.push(zipEOCD(central.length, cdSize, off));
  const blob = new Blob(parts);
  if (blob.size > 0xfffffffe || central.length > 0xffff) throw new Error("notebook exceeds the 4 GB / 65535-entry zip limit");
  if (ref) await Platform.writeFull(ref, blob);
  if (updateState) saveW = { valid: true, entries: ents, regionEnd, garbage: 0, lastManifest: manStr, fileSize: blob.size };
  return blob;
}
async function fsBuildBlob() {
  return writeNotebookFull(null, false);
}
async function writeNotebookIncremental(ref) {
  const g = await gatherNotebook();
  for (const [id, ent] of [...saveW.entries]) {
    if (!g.ids.has(id)) {
      saveW.garbage += 30 + ("assets/" + id).length + ent.size;
      saveW.entries.delete(id);
    }
  }
  if (saveW.garbage > 64 * 1048576) return null; /* too much dead weight: full rebuild */
  const { meta, list } = await prepareAssets(g.ids, false);
  const manStr = manifestFor(g.nbx, meta);
  const fresh = list.filter((e) => e.off < 0);
  const key = (s) => s.replace(/"modified":\d+,/g, "");
  if (!fresh.length && key(manStr) === key(saveW.lastManifest)) return { skipped: true };
  /* append AFTER the current tail, never over it: if anything interrupts this
     save, the previous EOCD — still intact, mid-file — keeps the file openable
     as the last complete state */
  const fileLen = await Platform.sizeOf(ref);

  /* staleness guard: the file changed on disk since we loaded or last wrote it
     (another noChalk instance, an external edit, a replaced copy) — the warmed
     offsets would point at shifted bytes, so rebuild the whole file instead */
  if (saveW.fileSize != null && fileLen !== saveW.fileSize) return null;

  saveW.garbage += Math.max(0, fileLen - saveW.regionEnd); /* the old tail becomes garbage */
  const now = new Date(),
    t = dosTime(now),
    d = dosDate(now);
  let pos = fileLen;
  for (const e of list) {
    if (e.off >= 0) continue; /* already on disk — its bytes are never touched */
    const lfh = zipLFH("assets/" + e.id, 0, e.crc, e.size, e.size, t, d);
    await Platform.writeAt(ref, pos, lfh);
    await Platform.writeAt(ref, pos + lfh.length, e.blob);
    e.off = pos;
    pos += lfh.length + e.size;
  }
  const regionEnd = pos; /* end of the live asset region — for garbage accounting */
  const mraw = TE.encode(manStr);
  let mdata = await deflateRaw(mraw);
  const mm = mdata ? 8 : 0;
  if (!mdata) mdata = mraw;
  const mcrc = bytesCRC(mraw);
  const mlfh = zipLFH("manifest.json", mm, mcrc, mdata.length, mraw.length, t, d);
  const central = [];
  for (const e of list) central.push({ name: "assets/" + e.id, method: 0, crc: e.crc, csize: e.size, usize: e.size, off: e.off });
  central.push({ name: "manifest.json", method: mm, crc: mcrc, csize: mdata.length, usize: mraw.length, off: pos });
  pos += mlfh.length + mdata.length;
  let cdSize = 0;
  const cds = [];
  for (const c of central) {
    const b = zipCDFH(c.name, c.method, c.crc, c.csize, c.usize, t, d, c.off);
    cds.push(b);
    cdSize += b.length;
  }
  const eocd = zipEOCD(central.length, cdSize, pos);
  const tail = new Blob([mlfh, mdata].concat(cds, [eocd]));
  if (pos + tail.size > 0xfffffffe || central.length > 0xffff) throw new Error("notebook exceeds the 4 GB / 65535-entry zip limit");
  await Platform.writeAt(ref, regionEnd, tail); /* extends the file — nothing after it, no truncate */
  for (const e of list) saveW.entries.set(e.id, { crc: e.crc, size: e.size, off: e.off, name: e.name, type: e.type });
  saveW.valid = true;
  saveW.regionEnd = regionEnd;
  saveW.lastManifest = manStr;
  saveW.fileSize = regionEnd + tail.size;
  return { ok: true };
}

/* ---- warm the save writer from a loaded file ----
   Parses the EOCD + central directory of the file we just loaded and records
   each asset's offset/size/CRC. The first save after loading then writes
   only the manifest + directory — the asset bytes on disk are never touched. */
function warmSaveWriter(bytes, man, manStr) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /* find the EOCD scanning backwards — the comment can be up to 64 KB */
  let eocd = -1;
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return resetSaveWriter();
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  /* ZIP64 or a foreign layout — stay cold; first save is then a full write (the safe fallback) */
  if (count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) return resetSaveWriter();
  const entries = new Map();
  let liveBytes = 0,
    regionEnd = 0,
    manOff = null,
    p = cdOff;
  for (let i = 0; i < count && p + 46 <= bytes.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break; /* central-header signature */
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lfhOff = dv.getUint32(p + 42, true);
    if (p + 46 + nlen > bytes.length) break;
    const name = TD.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name === "manifest.json") {
      manOff = lfhOff;
      continue;
    }
    if (!name.startsWith("assets/") || method !== 0) continue; /* only stored assets are warmable */
    const id = name.slice(7);
    const m = (man.assets || {})[id];
    entries.set(id, { crc, size: usize, off: lfhOff, name: m ? m.name : id, type: m ? m.type : "application/octet-stream" });
    liveBytes += 30 + name.length + csize;
    if (lfhOff + 30 + name.length + csize > regionEnd) regionEnd = lfhOff + 30 + name.length + csize;
  }
  if (!entries.size) return resetSaveWriter();
  /* dead space: everything between the live assets and the manifest */
  const garbage = manOff != null ? Math.max(0, manOff - liveBytes) : 0;
  saveW = { valid: true, entries, regionEnd, garbage, lastManifest: manStr || "", fileSize: bytes.length };
}

async function saveNotebookToRef(ref) {
  if (saveW.valid) {
    try {
      const r = await writeNotebookIncremental(ref);
      if (r) return r;
    } catch (e) {
      console.warn("noChalk: incremental save fell back to a full write —", e);
    }
  }
  await writeNotebookFull(ref, true);
  return { ok: true };
}

/* save a copy under a new name — the hand-a-file-to-a-colleague path */
async function saveCopy() {
  if (!cur.nb) return;
  const t = progToast("Packing “" + cur.nb.name + "”…");
  try {
    const blob = await fsBuildBlob();
    await saveNbBlob(blob, (cur.nb.name.replace(/[^\w\- ]+/g, "").trim() || "notebook") + ".noChalk");
    t.done("Copy saved — " + fmtSize(blob.size));
  } catch (e) {
    t.fail("Save failed: " + (e.message || "library could not load"));
  }
}
async function saveNbBlob(blob, name) {
  const ref = await Platform.pickSave(name);
  if (ref && (ref.path || ref.handle)) {
    await Platform.writeFull(ref, blob);
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/* legacy importer — used only when filesys.js's loadNotebookFile is unavailable
   (Firefox fallback). Imports into the session as the current notebook. */
async function importLnote(f) {
  const t = progToast("Reading notebook…");
  try {
    await loadLib("jszip");
    const zip = await JSZip.loadAsync(await f.arrayBuffer());
    const man = JSON.parse(await zip.file("manifest.json").async("string"));
    if (!man || !man.notebook) throw new Error("not a noChalk notebook file — no notebook in the archive");
    if (man.app && man.app !== "noChalk" && man.app !== "Chalkbook")
      console.warn("Notebook from a different app version:", man.app, "— importing anyway");
    const idmap = {};
    for (const [id, meta] of Object.entries(man.assets || {})) {
      const file = zip.file("assets/" + id);
      if (!file) continue;
      const blob = await file.async("blob");
      const nid = "a" + uid();
      await idbPut("assets", { id: nid, name: meta.name, type: meta.type, size: meta.size, blob });
      idmap[id] = nid;
    }
    const remap = (h) => (h || "").replace(/data-asset="([^"]+)"/g, (m, id) => (idmap[id] ? `data-asset="${idmap[id]}"` : m));
    const nb = man.notebook;
    nb.id = uid();
    for (const s of nb.sections) {
      s.id = uid();
      for (const p of s.pages) {
        p.id = uid();
        p.html = remap(p.html || "");
        (p.conts || []).forEach((c) => {
          c.id = uid();
          c.html = remap(c.html || "");
        });
        await putPage(p);
      }
      s.pages = s.pages.map(stubOf);
    }
    /* in the one-notebook session this *is* the session's notebook */
    state = { v: 1, ui: man.ui || {}, notebooks: [nb] };
    if (!state.ui.theme) state.ui.theme = "dark";
    cur.nb = nb;
    cur.sec = nb.sections[0];
    if (!cur.sec.pages.length) {
      const rec = blankPage();
      await putPage(rec);
      cur.sec.pages.push(stubOf(rec));
    }
    await idbPut("kv", state, "state");
    if (typeof applyUiState === "function") applyUiState();
    renderAll();
    await openPage(cur.sec.pages[0].id);
    statusSaved();
    t.done("Notebook “" + nb.name + "” loaded");
  } catch (e) {
    t.fail("Import failed: " + (e.message || "not a valid backup"));
  }
}
