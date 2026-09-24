/*  noCHalk
      by Fluffless
      converter.js
*/
"use strict";
/* ============================================================
   CONVERTER.JS — video import with WebM conversion + media folder.
   Offload is the DEFAULT: imported videos go straight into the media
   folder next to the notebook file; only when there is no saved file
   yet do they embed. Every video's caption carries a Convert button
   that asks, converts to WebM and offloads it. Media bytes only ever
   enter the notebook file on Save for sharing.
   - PNGs ≥ 150 KB: converted to WebP on import.
   - PDFs, JPEGs, GIFs and everything else: never touched.
   NOTE: the importVideo/importImage functions re-declare ones from
   imports.js — this file loads after it, so these win.
   ============================================================ */

let MB = null;
async function loadMB() {
  if (MB) return MB;
  const mod = await import("../lib/mediabunny.mjs");
  const cands = [mod, mod.default, mod.default && mod.default.default, window.mediabunny, window.Mediabunny].filter(Boolean);
  const cand = cands.find((c) => c && typeof c.Input === "function" && typeof c.Output === "function");
  if (!cand) {
    console.error(
      "noChalk mediabunny shapes:",
      cands.map((c) => "keys=[" + Object.keys(c).slice(0, 30).join(",") + "]"),
    );
    throw new Error("mediabunny loaded but its shape is unknown — see console");
  }
  MB = cand;
  return MB;
}

/* ---------- size-first presets: how hard to squeeze ---------- */
const CONVERT_MODES = {
  tiny: { label: "Tiny — about half the original", factor: 0.45, floor: 300000 },
  small: { label: "Small — a bit more", factor: 0.55, floor: 400000 },
  medium: { label: "Medium — two-thirds", factor: 0.7, floor: 500000 },
};
function convertMode() {
  const k = (state && state.ui && state.ui.convertMode) || "tiny";
  return CONVERT_MODES[k] || CONVERT_MODES.tiny;
}

/* ---------- the conversion (verified against mediabunny's own source) ---------- */
async function convertToWebm(blob, onProgress) {
  const mb = await loadMB();
  const m = convertMode();

  let vcodec = "vp9";
  if (mb.canEncodeVideo && !(await mb.canEncodeVideo("vp9").catch(() => false))) {
    if (await mb.canEncodeVideo("vp8").catch(() => false)) vcodec = "vp8";
    else throw new Error("this machine's WebView2 cannot encode WebM video (no VP8/VP9 encoder available)");
  }

  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });

  const inVideo = await input.getPrimaryVideoTrack().catch(() => null);
  const inAudio = await input.getPrimaryAudioTrack().catch(() => null);
  if (!inVideo && !inAudio) throw new Error("no audio or video track found in the file");

  /* size-first bitrate: a fraction of the source's own bitrate, floored */
  const duration = await input.computeDuration().catch(() => 0);
  let vbr = 700000;
  if (duration > 0 && blob.size > 0) {
    const srcBps = (blob.size * 8) / duration; /* source bits per second, all tracks */
    vbr = Math.max(m.floor, Math.round((srcBps * m.factor) / 1000) * 1000);
  }

  let videoSink = null,
    videoSrc = null,
    audioSink = null,
    audioSrc = null;
  if (inVideo) {
    videoSink = new mb.VideoSampleSink(inVideo);
    videoSrc = new mb.VideoSampleSource({
      codec: vcodec,
      bitrate: vbr,
      keyFrameInterval: 2 /* a keyframe every 2 s — decent seeking, small size cost */,
    });
    await output.addVideoTrack(videoSrc);
  }
  if (inAudio) {
    audioSink = new mb.AudioSampleSink(inAudio);
    audioSrc = new mb.AudioSampleSource({ codec: "opus", bitrate: 64000 });
    await output.addAudioTrack(audioSrc);
  }

  await output.start();

  const pump = async (sink, src, isVideo) => {
    for await (const sample of sink.samples()) {
      await src.add(sample); /* honor encoder backpressure */
      if (isVideo && onProgress && duration > 0) {
        onProgress(Math.min(0.99, (sample.timestamp || 0) / duration));
      }
      /* release the frame's resources now, not at GC time */
      if (sample && typeof sample.close === "function") sample.close();
      else if (sample && sample.frame && typeof sample.frame.close === "function") sample.frame.close();
    }
  };
  await Promise.all([
    videoSink && videoSrc ? pump(videoSink, videoSrc, true) : Promise.resolve(),
    audioSink && audioSrc ? pump(audioSink, audioSrc, false) : Promise.resolve(),
  ]);

  await output.finalize();
  return new Blob([target.buffer], { type: "video/webm" });
}

async function pngToWebp(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  bmp.close();
  return await new Promise((res) => c.toBlob(res, "image/webp", 0.82));
}

/* ---------- media folder plumbing ---------- */
/* sanitize a display name into a free filename inside the media folder */
async function freeMediaName(md, rawName) {
  let file = rawName.replace(/[\\/:*?"<>|]/g, "").trim() || "video.mp4";
  const dot = file.lastIndexOf(".");
  const base = dot > 0 ? file.slice(0, dot) : file,
    ext = dot > 0 ? file.slice(dot) : "";
  let i = 2;
  while (await Platform.invoke("path_exists", { path: md + "/" + file }).catch(() => false)) file = base + " (" + i++ + ")" + ext;
  return file;
}

/* ---------- video import: offload is the default ---------- */
async function importVideo(f) {
  const md = typeof mediaDirOf === "function" ? mediaDirOf() : null;
  if (md) return importVideoLinked(f); /* default: offload to the media folder */
  const id = await addAsset(f, f.name, pickMime(f, "video/mp4"));
  insertEmbedHTML(
    `<div class="embed" contenteditable="false"><div class="ecap" data-loc="embedded"><svg class="ic"><use href="#i-video"/></svg><span class="en">${esc(f.name)}</span></div><video controls preload="metadata" data-asset="${id}"></video></div>`,
    true,
  );
  toast(f.name + " — embedded; save the notebook, then Convert offloads it to the media folder", { icon: "i-video" });
}
async function importVideoLinked(f) {
  const md = mediaDirOf();
  if (!md) {
    toast("Linking needs a saved notebook file");
    return;
  }
  const t = progToast("Copying " + f.name + "…");
  try {
    await Platform.invoke("mkdirs", { path: md });
    const file = await freeMediaName(md, f.name);
    await Platform.writeFull({ path: md + "/" + file }, f);
    const id = "a" + uid();
    await idbPut("assets", { id, name: file, type: pickMime(f, "video/mp4"), size: f.size, ext: 2, rel: file });
    insertEmbedHTML(
      `<div class="embed" contenteditable="false"><div class="ecap" data-loc="${esc(md + "/" + file)}"><svg class="ic"><use href="#i-video"/></svg><span class="en">${esc(file)}</span></div><video controls preload="metadata" data-asset="${id}"></video></div>`,
      true,
    );
    t.done(file + " — offloaded to the media folder next to the notebook: " + md);
  } catch (e) {
    t.fail("Could not link: " + (typeof e === "string" ? e : (e && e.message) || "error"));
  }
}

/* ---------- image import override: big PNGs become WebP ---------- */
async function importImage(f) {
  if (f.type === "image/png" && f.size >= 150 << 10) {
    try {
      const out = await pngToWebp(f);
      if (out && out.size < f.size) {
        const id = await addAsset(out, f.name.replace(/\.[^.]+$/, "") + ".webp", "image/webp");
        insertEmbedHTML(`<img class="pg-img" data-asset="${id}" alt="${esc(f.name)}" loading="lazy" decoding="async">`, true);
        toast(f.name + " → WebP, " + fmtSize(out.size) + " (was " + fmtSize(f.size) + ")");
        return;
      }
    } catch (e) {
      console.error("noChalk image conversion failed:", e);
    }
  }
  const id = await addAsset(f, f.name, pickMime(f, "image/png"));
  insertEmbedHTML(`<img class="pg-img" data-asset="${id}" alt="${esc(f.name)}" loading="lazy" decoding="async">`, true);
  toast(f.name + " inserted");
}

/* ---------- the notebook-wide optimizer (hold a button somewhere to call) ---------- */
const MIN_VID = 8 << 20 /* videos below 8 MB are not worth it */,
  MIN_IMG = 150 << 10; /* PNGs below 150 KB are not worth it */
async function optimizeMedia() {
  if (!cur.nb) return;
  const t = progToast("Scanning media…");
  try {
    const pages = [];
    for (const s of cur.nb.sections)
      for (const st of s.pages) {
        const rec = cur.pg && cur.pg.id === st.id ? cur.pg : await idbGet("pages", st.id);
        if (rec) pages.push(rec);
      }
    const ids = new Set();
    const scan = (h) => (h || "").replace(/data-asset="([^"]+)"/g, (m, id) => (ids.add(id), m));
    pages.forEach((p) => {
      scan(p.html);
      (p.conts || []).forEach((c) => scan(c.html));
    });
    const map = {};
    let freed = 0,
      nV = 0,
      nI = 0;
    for (const id of ids) {
      const a = await getAsset(id);
      if (!a) continue;
      let out = null,
        name = a.name,
        type = a.type;
      if (/^video\//.test(a.type || "") && a.type !== "video/webm" && a.size >= MIN_VID) {
        t.set("Converting " + esc(a.name) + "…");
        await nextFrame();
        out = await convertToWebm(a.blob);
        name = (a.name.replace(/\.[^.]+$/, "") || "video") + ".webm";
        type = "video/webm";
      } else if (a.type === "image/png" && a.size >= MIN_IMG) {
        t.set("Converting " + esc(a.name) + "…");
        await nextFrame();
        out = await pngToWebp(a.blob);
        name = (a.name.replace(/\.[^.]+$/, "") || "image") + ".webp";
        type = "image/webp";
      } else continue; /* PDFs, JPEGs, GIFs, WebM, small files: untouched by design */
      if (!out || out.size >= a.size) continue; /* not actually smaller — keep the original */
      map[id] = await addAsset(out, name, type);
      freed += a.size - out.size;
      if (type === "video/webm") nV++;
      else nI++;
    }
    if (!Object.keys(map).length) {
      t.done("Nothing worth converting — media already compact");
      return;
    }
    const remap = (h) => (h || "").replace(/data-asset="([^"]+)"/g, (m, id) => (map[id] ? `data-asset="${map[id]}"` : m));
    for (const p of pages) {
      if (p === cur.pg) continue;
      p.html = remap(p.html);
      (p.conts || []).forEach((c) => (c.html = remap(c.html)));
      await putPage(p);
    }
    if (cur.pg) {
      cur.pg.html = remap(cur.pg.html);
      (cur.pg.conts || []).forEach((c) => (c.html = remap(c.html)));
      [...plane.querySelectorAll("[data-asset]"), ...mediaplane.querySelectorAll("[data-asset]")].forEach((n) => {
        const nid = map[n.dataset.asset];
        if (!nid) return;
        n.dataset.asset = nid;
        n.removeAttribute("data-hydr");
        if (n.tagName === "IMG" || n.tagName === "VIDEO") n.removeAttribute("src");
      });
      hydrateAssets();
    }
    t.done(
      nV + " video" + (nV === 1 ? "" : "s") + " and " + nI + " image" + (nI === 1 ? "" : "s") + " converted — about " + fmtSize(freed) + " smaller",
    );
    resetSaveWriter(); /* the next save writes a fresh, compacted file */
    await saveToFile();
  } catch (e) {
    t.fail("Conversion stopped: " + (typeof e === "string" ? e : (e && e.message) || "error"));
  }
}

/* ---------- settings popover (wire to whatever opens it) ---------- */
function optimizeConfigNode() {
  const n = el("div", "pop-preset");
  n.append(el("div", "pop-h", "Video compression — how small?"));
  const cur = (state.ui && state.ui.convertMode) || "tiny";
  Object.entries(CONVERT_MODES).forEach(([k, mo]) => {
    const b = el("button", "btn", mo.label + (k === cur ? "  ✓" : ""));
    b.style.width = "100%";
    b.style.marginTop = "6px";
    b.onclick = () => {
      state.ui.convertMode = k;
      queueSave();
      closePop();
    };
    n.append(b);
  });
  n.append(
    el(
      "div",
      "pi-r",
      "Videos become WebM at a fraction of their original bitrate, large PNGs become WebP. PDFs, JPEGs, GIFs and small files are never touched. Converted originals are not kept — the size win comes from replacing them.",
    ),
  );
  return n;
}

/* ================= per-video Convert button =================
   Every video box gets a Convert button in its caption (a plain button —
   an <a data-asset> would be armed with a blob href by hydrateAssets and
   its click hijacked, navigating the WebView to the video). The caption
   also shows the file's real location: the media-folder path, or
   "embedded". Clicking Convert asks first, then converts to WebM and
   offloads it. Media bytes only enter the file on Save for sharing. */
function addConvertButtons() {
  [...plane.querySelectorAll(".embed"), ...mediaplane.querySelectorAll(".embed")].forEach((em) => {
    const vid = em.querySelector("video[data-asset]");
    if (!vid) return;
    const cap = em.querySelector(".ecap");
    if (!cap) return;
    const id = vid.dataset.asset;
    /* the location lives in data-loc, shown on hover; legacy saves carry it
       in a visible .dim — drop that and refresh data-loc from the asset */
    const legacy = cap.querySelector(".dim");
    if (legacy) legacy.remove();
    getAsset(id).then((a) => {
      if (!a) return;
      if (a.ext === 2) {
        const p = typeof mediaAssetPath === "function" ? mediaAssetPath(a) : null;
        if (p) cap.dataset.loc = p;
      } else cap.dataset.loc = "embedded";
    });
    if (cap.querySelector(".cv")) return;
    const b = el("button", "cv", "Convert");
    b.dataset.cvid = id;
    b.title = "Convert this video to WebM and offload it to the media folder";
    cap.append(b);
  });
}
let cvPend = false;
const cvObs = new MutationObserver(() => {
  if (cvPend) return;
  cvPend = true;
  requestAnimationFrame(() => {
    cvPend = false;
    addConvertButtons();
  });
});
cvObs.observe(plane, { childList: true, subtree: true });
cvObs.observe(mediaplane, { childList: true, subtree: true });

viewport.addEventListener("click", (e) => {
  const b = e.target.closest ? e.target.closest(".ecap .cv") : null;
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  const id = b.dataset.cvid;
  getAsset(id).then((a) => {
    if (!a) return;
    if (a.ext === 2 && a.type === "video/webm") {
      toast("Already converted — WebM in the media folder");
      return;
    }
    dialog({
      title: "Convert to WebM?",
      msg:
        "“" +
        a.name +
        "” becomes a much smaller WebM and is stored in the media folder next to the notebook file. The notebook file itself stays small; Save for sharing packs the video back in.",
      ok: "Convert",
    }).then((ok) => {
      if (ok) convertVideoAsset(id);
    });
  });
});

async function convertVideoAsset(id) {
  const a = await getAsset(id);
  if (!a) return;
  if (a.ext === 2 && a.type === "video/webm") {
    toast("Already WebM in the media folder");
    return;
  }
  const md = mediaDirOf();
  if (!md) {
    toast("Needs a saved notebook file first");
    return;
  }
  const t = progToast("Converting " + esc(a.name) + "…");
  try {
    const wasLinked = a.ext === 2;
    const bytes = wasLinked ? await Platform.readAll({ path: mediaAssetPath(a) }) : new Uint8Array(await a.blob.arrayBuffer());
    const blob = await convertToWebm(new Blob([bytes], { type: a.type }), (p) =>
      t.set("Converting " + esc(a.name) + "… " + Math.round(p * 100) + "%"),
    );
    if (!blob || blob.size >= a.size) {
      t.fail("Conversion didn't shrink this video — left as is");
      return;
    }
    await Platform.invoke("mkdirs", { path: md });
    const file = await freeMediaName(md, (a.name.replace(/\.[^.]+$/, "") || "video") + ".webm");
    await Platform.writeFull({ path: md + "/" + file }, blob);
    await idbPut("assets", { id, name: file, type: "video/webm", size: blob.size, ext: 2, rel: file });
    const vid = document.querySelector('video[data-asset="' + id + '"]');
    if (vid) {
      vid.src = fileSrc(md + "/" + file);
      vid.classList.remove("asset-missing");
    }
    const cv = document.querySelector('.ecap .cv[data-cvid="' + id + '"]');
    if (cv) {
      const cap = cv.closest(".ecap");
      if (cap) {
        const en = cap.querySelector(".en");
        if (en) en.textContent = file;
        cap.dataset.loc = md + "/" + file;
      }
      cv.remove();
    }
    if (!wasLinked) {
      resetSaveWriter(); /* the next save writes a fresh, slimmed file */
      await saveToFile();
    }
    t.done(file + " — converted to WebM, stored in " + md);
  } catch (e) {
    t.fail("Conversion failed: " + (typeof e === "string" ? e : (e && e.message) || "error"));
  }
}

/* ---------- video location tooltip: hover the caption ---------- */
let cvTip = null;
function showCvTip(cap) {
  const loc = cap.dataset.loc || "";
  if (!loc) return;
  if (!cvTip) {
    cvTip = el("div");
    cvTip.id = "cvTip";
    document.body.append(cvTip);
  }
  cvTip.textContent = loc === "embedded" ? "embedded in the notebook file" : loc;
  cvTip.style.display = "block";
  const r = cap.getBoundingClientRect();
  const w = cvTip.offsetWidth,
    h = cvTip.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - w - 8, r.left));
  let y = r.bottom + 8;
  if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 8);
  cvTip.style.left = x + "px";
  cvTip.style.top = y + "px";
}
function hideCvTip() {
  if (cvTip) cvTip.style.display = "none";
}
viewport.addEventListener("mouseover", (e) => {
  const cap = e.target.closest ? e.target.closest(".ecap[data-loc]") : null;
  if (cap) showCvTip(cap);
});
viewport.addEventListener("mouseout", (e) => {
  const cap = e.target.closest ? e.target.closest(".ecap[data-loc]") : null;
  if (cap && (!e.relatedTarget || !cap.contains(e.relatedTarget))) hideCvTip();
});

/* ---------- on load: offer to offload embedded videos ---------- */
async function maybeAskOffload() {
  try {
    const md = typeof mediaDirOf === "function" ? mediaDirOf() : null;
    if (!md) return; /* no saved file path — nowhere to offload */
    const ids = new Set();
    const scan = (h) => (h || "").replace(/data-asset="([^"]+)"/g, (m, id) => (ids.add(id), m));
    for (const s of cur.nb.sections)
      for (const st of s.pages) {
        const rec = cur.pg && cur.pg.id === st.id ? cur.pg : await idbGet("pages", st.id);
        if (rec) {
          scan(rec.html);
          (rec.conts || []).forEach((c) => scan(c.html));
        }
      }
    let n = 0,
      bytes = 0;
    for (const id of ids) {
      const a = await getAsset(id);
      if (a && a.ext !== 2 && /^video\//.test(a.type || "")) {
        n++;
        bytes += a.size || 0;
      }
    }
    if (!n) return;
    const ok = await dialog({
      title: "Offload videos?",
      msg:
        "This file carries " +
        n +
        " video" +
        (n === 1 ? "" : "s") +
        " (" +
        fmtSize(bytes) +
        ") inside the .noChalk file itself. Offload them to the media folder next to it? The notebook file becomes much smaller and saves faster — the videos keep playing from the folder, and “Save for sharing” packs them back in whenever you hand the file to someone.",
      ok: "Offload",
    });
    if (ok) offloadEmbeddedVideos();
  } catch (e) {}
}
async function offloadEmbeddedVideos() {
  const md = mediaDirOf();
  if (!md) return;
  const t = progToast("Offloading videos…");
  try {
    await Platform.invoke("mkdirs", { path: md });
    const ids = new Set();
    const scan = (h) => (h || "").replace(/data-asset="([^"]+)"/g, (m, id) => (ids.add(id), m));
    for (const s of cur.nb.sections)
      for (const st of s.pages) {
        const rec = cur.pg && cur.pg.id === st.id ? cur.pg : await idbGet("pages", st.id);
        if (rec) {
          scan(rec.html);
          (rec.conts || []).forEach((c) => scan(c.html));
        }
      }
    let n = 0;
    for (const id of ids) {
      const a = await getAsset(id);
      if (!a || a.ext === 2 || !/^video\//.test(a.type || "")) continue;
      t.set("Offloading " + esc(a.name) + "…");
      const file = await freeMediaName(md, a.name);
      await Platform.writeFull({ path: md + "/" + file }, a.blob);
      await idbPut("assets", { id, name: file, type: a.type, size: a.size, ext: 2, rel: file });
      const vid = document.querySelector('video[data-asset="' + id + '"]');
      if (vid) {
        vid.src = fileSrc(md + "/" + file);
        vid.classList.remove("asset-missing");
        const cap = vid.closest(".embed") && vid.closest(".embed").querySelector(".ecap");
        if (cap) cap.dataset.loc = md + "/" + file;
      }
      n++;
    }
    if (!n) {
      t.done("No embedded videos to offload");
      return;
    }
    resetSaveWriter();
    await saveToFile();
    t.done(n + " video" + (n === 1 ? "" : "s") + " offloaded to " + md);
  } catch (e) {
    t.fail("Offloading failed: " + (typeof e === "string" ? e : (e && e.message) || "error"));
  }
}
