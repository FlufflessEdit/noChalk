"use strict";
/* platform.js — one storage transport for every environment.
   Tauri shell, Windows AND Android (with All files access granted):
   native dialogs (Windows) or the in-app browser (Android), then direct
   disk I/O over real paths — chunked base64, positioned writes, the
   incremental zip tail, the media folder. Android differs ONLY in the
   pickers. Browser: File System Access if present, else fallbacks. */
const TAURI_INVOKE =
  (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) ||
  (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) ||
  null;
const IS_TAURI = !!TAURI_INVOKE;
const IS_ANDROID = IS_TAURI && /android/i.test(navigator.userAgent);

function u8ToB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fileSrc(path) {
  if (!IS_TAURI) return null;
  const i = window.__TAURI_INTERNALS__;
  if (i && typeof i.convertFileSrc === "function") return i.convertFileSrc(path);
  return "http://asset.localhost/" + path.replace(/\\/g, "/");
}
function b64ToU8(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/* in-app file browser for Android: starts at /storage — internal storage,
   SD cards and USB sticks all appear there as folders */
function androidFilePicker(kind) {
  return new Promise((resolve) => {
    let dir = "/storage";
    const browse = () => {
      Platform.invoke("list_dir", { path: dir }).then(
        (items) => {
          const ov = el("div", "dlg-ov");
          const card = el("div", "dlg");
          card.innerHTML =
            '<div class="dlg-t">' +
            (kind === "open" ? "Open notebook" : "Save notebook") +
            "</div>" +
            '<div class="dlg-m" style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all">' +
            esc(dir) +
            "</div>";
          const list = el("div", "sec-pick");
          const up = el("div", "sec-row", "↰ up");
          up.onclick = () => {
            ov.remove();
            dir = dir.replace(/\/[^/]+$/, "") || "/";
            browse();
          };
          list.append(up);
          items.forEach(([name, isDir]) => {
            if (name.startsWith(".")) return;
            if (!isDir && kind === "open" && !/\.(noChalk|chalkbook)$/i.test(name)) return;
            const row = el("div", "sec-row");
            row.innerHTML = (isDir ? "📂 " : "📄 ") + esc(name);
            row.onclick = () => {
              const p = (dir === "/" ? "" : dir) + "/" + name;
              ov.remove();
              if (isDir) {
                dir = p;
                browse();
              } else if (kind === "open") resolve({ path: p, name });
            };
            list.append(row);
          });
          card.append(list);
          const bar = el("div", "dlg-b");
          if (kind === "save") {
            const inp = el("input", "dlg-in");
            inp.value = "notebook.noChalk";
            const ok = el("button", "btn go", "Save here");
            ok.onclick = () => {
              ov.remove();
              let n = inp.value.trim() || "notebook.noChalk";
              if (!/\.noChalk$/i.test(n)) n += ".noChalk";
              resolve({ path: dir + "/" + n, name: n });
            };
            bar.append(ok);
            card.append(inp, bar);
          }
          const cancel = el("button", "btn", "Cancel");
          cancel.onclick = () => {
            ov.remove();
            resolve(null);
          };
          if (kind === "open") bar.append(cancel);
          else {
            cancel.style.marginRight = "8px";
            bar.prepend(cancel);
          }
          if (kind === "open") card.append(bar);
          ov.append(card);
          document.body.append(ov);
        },
        () => {
          toast("Cannot open " + dir + " — check All files access in Settings");
          resolve(null);
        },
      );
    };
    browse();
  });
}

const Platform = {
  shell: IS_TAURI ? (IS_ANDROID ? "android" : "tauri") : "browser",
  async invoke(cmd, args) {
    if (!IS_TAURI) throw new Error("not in the shell");
    return TAURI_INVOKE(cmd, args);
  },

  /* ---- pickers: Windows native dialog, Android in-app browser ---- */
  async pickOpen() {
    if (IS_ANDROID) return androidFilePicker("open");
    if (window.showOpenFilePicker) {
      const [h] = await showOpenFilePicker({
        types: [{ description: "noChalk notebook", accept: { "application/octet-stream": [".noChalk", ".chalkbook"] } }],
        multiple: false,
      });
      const f = await h.getFile();
      return { handle: h, name: f.name, file: f };
    }
    return null;
  },
  async pickSave(suggested) {
    if (IS_ANDROID) return androidFilePicker("save");
    if (window.showSaveFilePicker) {
      try {
        const h = await showSaveFilePicker({
          suggestedName: suggested,
          types: [{ description: "noChalk notebook", accept: { "application/octet-stream": [".noChalk"] } }],
        });
        return { handle: h, name: h.name };
      } catch (e) {
        return null;
      }
    }
    return null;
  },

  /* ---- binary transport: identical on Windows and Android — real paths ---- */
  async readAll(ref) {
    if (ref.path) {
      const size = await this.invoke("file_size", { path: ref.path });
      const CH = 16 << 20;
      const out = new Uint8Array(size);
      for (let o = 0; o < size; o += CH) {
        const b64 = await this.invoke("read_b64", { path: ref.path, offset: o, len: Math.min(CH, size - o) });
        out.set(b64ToU8(b64), o);
      }
      return out;
    }
    if (ref.handle) return new Uint8Array(await (await ref.handle.getFile()).arrayBuffer());
    if (ref.file) return new Uint8Array(await ref.file.arrayBuffer());
    throw new Error("nothing to read");
  },
  async writeFull(ref, data) {
    if (ref.path) {
      const tmp = ref.path + ".nochalk-tmp";
      await this.invoke("truncate_file", { path: tmp, len: 0 });
      const CH = 16 << 20;
      const send = async (u8) => this.invoke("append_b64", { path: tmp, b64: u8ToB64(u8) });
      if (data instanceof Blob) {
        for (let o = 0; o < data.size; o += CH) await send(new Uint8Array(await data.slice(o, o + CH).arrayBuffer()));
      } else {
        for (let o = 0; o < data.length; o += CH) await send(data.subarray(o, o + CH));
      }
      await this.invoke("commit_file", { from: tmp, to: ref.path });
      return;
    }
    if (ref.handle) {
      const w = await ref.handle.createWritable();
      await w.write(data);
      await w.close();
      return;
    }
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (ref.name || "notebook") + ".noChalk";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  },
  async writeAt(ref, offset, data, totalLen) {
    if (ref.path) {
      const u8 = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
      const CH = 16 << 20;
      for (let o = 0; o < u8.length; o += CH)
        await this.invoke("write_b64_at", { path: ref.path, offset: offset + o, b64: u8ToB64(u8.subarray(o, o + CH)) });
      if (totalLen) await this.invoke("truncate_file", { path: ref.path, len: totalLen });
      return;
    }
    if (ref.handle) {
      const w = await ref.handle.createWritable({ keepExistingData: true });
      await w.write({ type: "write", position: offset, data });
      if (totalLen) await w.write({ type: "truncate", size: totalLen });
      await w.close();
      return;
    }
    throw new Error("no positioned write without a handle/path");
  },
  async sizeOf(ref) {
    if (ref.path) return this.invoke("file_size", { path: ref.path });
    if (ref.handle) return (await ref.handle.getFile()).size;
    return 0;
  },
};
