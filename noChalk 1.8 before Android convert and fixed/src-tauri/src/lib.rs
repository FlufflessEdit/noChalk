use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;

#[derive(serde::Serialize)]
struct PickedFile {
    path: String,
    name: String,
}

impl From<tauri_plugin_dialog::FilePath> for PickedFile {
    fn from(f: tauri_plugin_dialog::FilePath) -> Self {
        let s = f.to_string();
        PickedFile {
            name: s.rsplit(['/', '\\']).next().unwrap_or("notebook").to_string(),
            path: s,
        }
    }
}

/* ---------- file dialogs ----------
   async commands run off the main thread, so the blocking pick is safe
   there. Android never calls these — JS routes to the dialog plugin
   (SAF system picker) — but the methods must still compile for the
   android target, and the blocking API is desktop-only. ---------- */
#[tauri::command]
async fn pick_open(app: tauri::AppHandle) -> Result<Option<PickedFile>, String> {
    #[cfg(target_os = "android")]
    {
        let _ = app;
        return Err("use-dialog-plugin".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        use tauri_plugin_dialog::DialogExt;
        let file = app
            .dialog()
            .file()
            .add_filter("noChalk notebook", &["noChalk", "chalkbook"])
            .blocking_pick_file();
        Ok(file.map(PickedFile::from))
    }
}

#[tauri::command]
async fn pick_save(app: tauri::AppHandle, suggested: String) -> Result<Option<PickedFile>, String> {
    #[cfg(target_os = "android")]
    {
        let _ = (&app, &suggested);
        return Err("use-dialog-plugin".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        use tauri_plugin_dialog::DialogExt;
        let file = app
            .dialog()
            .file()
            .set_file_name(suggested)
            .add_filter("noChalk notebook", &["noChalk"])
            .blocking_save_file();
        Ok(file.map(PickedFile::from))
    }
}

/* ---------- app documents dir ----------
   Android: the app's internal data dir — a real filesystem path the
   fs commands can touch, used as the media folder root.
   Desktop: the user's Documents folder (unchanged behavior). ---------- */
#[tauri::command]
fn app_docs_dir(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        app.path()
            .app_data_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        use tauri::Manager;
        app.path()
            .document_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .map_err(|e| e.to_string())
    }
}

/* ---------- disk I/O (chunked base64 — matches platform.js) ---------- */
#[tauri::command]
fn file_size(path: String) -> Result<u64, String> {
    Ok(fs::metadata(&path).map_err(|e| e.to_string())?.len())
}

#[tauri::command]
fn read_b64(path: String, offset: u64, len: u64) -> Result<String, String> {
    let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; len as usize];
    f.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(buf))
}

#[tauri::command]
fn append_b64(path: String, b64: String) -> Result<(), String> {
    let bytes = STANDARD.decode(&b64).map_err(|e| e.to_string())?;
    let mut f = fs::OpenOptions::new().create(true).append(true).open(&path).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_b64_at(path: String, offset: u64, b64: String) -> Result<(), String> {
    let bytes = STANDARD.decode(&b64).map_err(|e| e.to_string())?;
    let mut f = fs::OpenOptions::new().create(true).write(true).open(&path).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn truncate_file(path: String, len: u64) -> Result<(), String> {
    let f = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    f.set_len(len).map_err(|e| e.to_string())
}

#[tauri::command]
fn commit_file(from: String, to: String) -> Result<(), String> {
    /* rename replaces an existing file on Windows — the swap is atomic */
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
fn mkdirs(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

/* ---------- app wiring — ONE run(), both plugins, full command list ---------- */
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        
        .invoke_handler(tauri::generate_handler![
            pick_open,
            pick_save,
            file_size,
            read_b64,
            append_b64,
            write_b64_at,
            truncate_file,
            commit_file,
            mkdirs,
            path_exists,
            list_dir, 
            probe_storage,
            app_docs_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/* directory listing for the in-app Android file browser — real paths,
   no SAF. Returns [name, isDir] pairs. */
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<(String, bool)>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push((entry.file_name().to_string_lossy().into_owned(), is_dir));
    }
    out.sort();
    Ok(out)
}

/* did the user grant All files access? probe by touching shared storage */
#[tauri::command]
fn probe_storage() -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        let marker = "/storage/emulated/0/.nochalk_probe";
        let ok = fs::write(marker, b"ok").and_then(|_| fs::remove_file(marker)).is_ok();
        Ok(ok)
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(true)
    }
}