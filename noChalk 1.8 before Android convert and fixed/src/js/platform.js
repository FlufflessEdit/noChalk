"use strict";
/* platform.js — one storage transport for every environment.
   Tauri shell: native dialogs + direct disk writes (chunked base64 over IPC,
   so video-sized payloads never become giant JSON arrays).
   Browser: File System Access if present, else file-input/download paths. */
const TAURI_INVOKE =
  (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) ||
  (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) ||
  null;
const IS_TAURI = !!TAURI_INVOKE;

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

const Platform = {
  shell: IS_TAURI ? "tauri" : "browser",
  async invoke(cmd, args) {
    if (!IS_TAURI) throw new Error("not in the shell");
    return TAURI_INVOKE(cmd, args);
  },

  /* ---- pickers ---- */
  async pickOpen() {
    if (IS_TAURI) return (await this.invoke("pick_open")) || null; /* { path, name } */
    if (window.showOpenFilePicker) {
      const [h] = await showOpenFilePicker({
        types: [{ description: "noChalk notebook", accept: { "application/octet-stream": [".noChalk", ".chalkbook"] } }],
        multiple: false,
      });
      const f = await h.getFile();
      return { handle: h, name: f.name, file: f };
    }
    return null; /* caller falls back to the file-input path */
  },
  async pickSave(suggested) {
    if (IS_TAURI) return (await this.invoke("pick_save", { suggested })) || null;
    if (window.showSaveFilePicker) {
      try {
        const h = await showSaveFilePicker({
          suggestedName: suggested,
          types: [{ description: "noChalk notebook", accept: { "application/octet-stream": [".noChalk"] } }],
        });
        return { handle: h, name: h.name };
      } catch (e) {
        return null; /* cancelled */
      }
    }
    return null;
  },

  /* ---- binary transport (16 MB chunks — memory-flat on both sides) ---- */
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
    /* last resort: download */
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
