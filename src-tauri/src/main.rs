// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[derive(Debug, Serialize, Deserialize)]
struct FileResult {
    success: bool,
    data: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Settings {
    #[serde(rename = "recentFiles")]
    recent_files: Option<Vec<String>>,
    #[serde(rename = "lastOpenedProject")]
    last_opened_project: Option<String>,
}

// File operations
#[tauri::command]
async fn read_file(file_path: String) -> FileResult {
    match fs::read_to_string(&file_path) {
        Ok(data) => FileResult {
            success: true,
            data: Some(data),
            error: None,
        },
        Err(e) => FileResult {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
async fn write_file(file_path: String, data: String) -> FileResult {
    match fs::write(&file_path, data) {
        Ok(_) => FileResult {
            success: true,
            data: None,
            error: None,
        },
        Err(e) => FileResult {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

// Settings operations
#[tauri::command]
async fn load_settings(app: tauri::AppHandle) -> FileResult {
    let settings_path = get_settings_path(&app);
    match fs::read_to_string(&settings_path) {
        Ok(data) => FileResult {
            success: true,
            data: Some(data),
            error: None,
        },
        Err(e) => FileResult {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
async fn save_settings(app: tauri::AppHandle, settings_json: String) -> FileResult {
    let settings_path = get_settings_path(&app);

    // Ensure the directory exists
    if let Some(parent) = settings_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    match fs::write(&settings_path, settings_json) {
        Ok(_) => FileResult {
            success: true,
            data: None,
            error: None,
        },
        Err(e) => FileResult {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

fn get_settings_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("settings.json")
}

// Dialog operations - simplified to use native file picking
#[tauri::command]
async fn show_open_dialog(app: tauri::AppHandle, options: serde_json::Value) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;

    let mut builder = app.dialog().file();

    // Parse options
    if let Some(title) = options.get("title").and_then(|v| v.as_str()) {
        builder = builder.set_title(title);
    }

    if let Some(default_path) = options.get("defaultPath").and_then(|v| v.as_str()) {
        builder = builder.set_directory(default_path);
    }

    // Check for directory mode
    let directory_mode = options
        .get("properties")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().any(|v| v.as_str() == Some("openDirectory")))
        .unwrap_or(false);

    // Handle filters
    if let Some(filters) = options.get("filters").and_then(|v| v.as_array()) {
        for filter in filters {
            if let (Some(name), Some(extensions)) = (
                filter.get("name").and_then(|v| v.as_str()),
                filter.get("extensions").and_then(|v| v.as_array()),
            ) {
                let exts: Vec<&str> = extensions.iter().filter_map(|e| e.as_str()).collect();
                if !exts.is_empty() {
                    builder = builder.add_filter(name, &exts);
                }
            }
        }
    }

    // Execute dialog using callback API
    let (tx, rx) = std::sync::mpsc::channel();

    if directory_mode {
        builder.pick_folder(move |path| {
            let result = match path {
                Some(p) => serde_json::json!({
                    "canceled": false,
                    "filePaths": [p.to_string()]
                }),
                None => serde_json::json!({
                    "canceled": true,
                    "filePaths": []
                }),
            };
            let _ = tx.send(result);
        });
    } else {
        builder.pick_file(move |path| {
            let result = match path {
                Some(p) => serde_json::json!({
                    "canceled": false,
                    "filePaths": [p.to_string()]
                }),
                None => serde_json::json!({
                    "canceled": true,
                    "filePaths": []
                }),
            };
            let _ = tx.send(result);
        });
    }

    // Wait for result
    rx.recv().unwrap_or_else(|_| {
        serde_json::json!({
            "canceled": true,
            "filePaths": []
        })
    })
}

#[tauri::command]
async fn show_save_dialog(app: tauri::AppHandle, options: serde_json::Value) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;

    let mut builder = app.dialog().file();

    // Parse options
    if let Some(title) = options.get("title").and_then(|v| v.as_str()) {
        builder = builder.set_title(title);
    }

    if let Some(default_path) = options.get("defaultPath").and_then(|v| v.as_str()) {
        builder = builder.set_file_name(default_path);
    }

    // Handle filters
    if let Some(filters) = options.get("filters").and_then(|v| v.as_array()) {
        for filter in filters {
            if let (Some(name), Some(extensions)) = (
                filter.get("name").and_then(|v| v.as_str()),
                filter.get("extensions").and_then(|v| v.as_array()),
            ) {
                let exts: Vec<&str> = extensions.iter().filter_map(|e| e.as_str()).collect();
                if !exts.is_empty() {
                    builder = builder.add_filter(name, &exts);
                }
            }
        }
    }

    // Execute dialog using callback API
    let (tx, rx) = std::sync::mpsc::channel();

    builder.save_file(move |path| {
        let result = match path {
            Some(p) => serde_json::json!({
                "canceled": false,
                "filePath": p.to_string()
            }),
            None => serde_json::json!({
                "canceled": true,
                "filePath": null
            }),
        };
        let _ = tx.send(result);
    });

    // Wait for result
    rx.recv().unwrap_or_else(|_| {
        serde_json::json!({
            "canceled": true,
            "filePath": null
        })
    })
}

#[tauri::command]
async fn rebuild_menu() {
    // Menu rebuild will be handled through Tauri's menu system
    // This is a placeholder for compatibility
}

#[tauri::command]
async fn create_dir(path: String) -> FileResult {
    match fs::create_dir_all(&path) {
        Ok(_) => FileResult {
            success: true,
            data: None,
            error: None,
        },
        Err(e) => FileResult {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

fn create_menu(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let menu = MenuBuilder::new(app)
        .items(&[
            &SubmenuBuilder::new(app, "Default").build()?,
            // File menu
            &SubmenuBuilder::new(app, "File")
                .items(&[
                    &MenuItemBuilder::with_id("new-project", "New Project")
                        .accelerator("CmdOrCtrl+N")
                        .build(app)?,
                    &MenuItemBuilder::with_id("open-project", "Open Project")
                        .accelerator("CmdOrCtrl+O")
                        .build(app)?,
                    &MenuItemBuilder::with_id("new-map", "New Map")
                        .accelerator("CmdOrCtrl+M")
                        .build(app)?,
                    &MenuItemBuilder::with_id("new-tileset", "New Tileset")
                        .accelerator("CmdOrCtrl+T")
                        .build(app)?,
                    &MenuItemBuilder::with_id("new-entity", "New Entity")
                        .accelerator("CmdOrCtrl+E")
                        .build(app)?,
                    &MenuItemBuilder::with_id("save-project", "Save Project")
                        .accelerator("CmdOrCtrl+S")
                        .build(app)?,
                    &MenuItemBuilder::with_id("save-project-as", "Save Project As")
                        .accelerator("CmdOrCtrl+Shift+S")
                        .build(app)?,
                ])
                .build()?,
            // Edit menu
            &SubmenuBuilder::new(app, "Edit")
                .items(&[
                    &MenuItemBuilder::with_id("undo", "Undo")
                        .accelerator("CmdOrCtrl+Z")
                        .build(app)?,
                    &MenuItemBuilder::with_id("redo", "Redo")
                        .accelerator("CmdOrCtrl+Shift+Z")
                        .build(app)?,
                    &MenuItemBuilder::with_id("cut", "Cut")
                        .accelerator("CmdOrCtrl+X")
                        .build(app)?,
                    &MenuItemBuilder::with_id("copy", "Copy")
                        .accelerator("CmdOrCtrl+C")
                        .build(app)?,
                    &MenuItemBuilder::with_id("paste", "Paste")
                        .accelerator("CmdOrCtrl+V")
                        .build(app)?,
                ])
                .build()?,
            // View menu
            &SubmenuBuilder::new(app, "View")
                .items(&[
                    &MenuItemBuilder::with_id("reload", "Reload")
                        .accelerator("CmdOrCtrl+R")
                        .build(app)?,
                    &MenuItemBuilder::with_id("toggle-devtools", "Toggle DevTools")
                        .accelerator("F12")
                        .build(app)?,
                ])
                .build()?,
        ])
        .build()?;

    app.set_menu(menu)?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Create menu
            if let Err(e) = create_menu(&app.handle()) {
                eprintln!("Failed to create menu: {}", e);
            }

            // Handle menu events
            app.on_menu_event(move |app, event| {
                if let Some(window) = app.get_webview_window("main") {
                    match event.id().as_ref() {
                        "new-project" => {
                            let _ = window.emit("menu:new-project", ());
                        }
                        "open-project" => {
                            let _ = window.emit("menu:open-project", ());
                        }
                        "new-map" => {
                            let _ = window.emit("menu:new-map", ());
                        }
                        "new-tileset" => {
                            let _ = window.emit("menu:new-tileset", ());
                        }
                        "new-entity" => {
                            let _ = window.emit("menu:new-entity", ());
                        }
                        "save-project" => {
                            let _ = window.emit("menu:save-project", ());
                        }
                        "save-project-as" => {
                            let _ = window.emit("menu:save-project-as", ());
                        }
                        "reload" => {
                            let _ = window.eval("location.reload()");
                        }
                        "toggle-devtools" => {
                            if window.is_devtools_open() {
                                let _ = window.close_devtools();
                            } else {
                                let _ = window.open_devtools();
                            }
                        }
                        _ => {}
                    }
                }
            });

            // Auto-load last project
            let app_handle_clone = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let settings_result = load_settings(app_handle_clone.clone()).await;
                if settings_result.success {
                    if let Some(data) = settings_result.data {
                        if let Ok(settings) = serde_json::from_str::<Settings>(&data) {
                            if let Some(last_project) = settings.last_opened_project {
                                // Check if file exists
                                if std::path::Path::new(&last_project).exists() {
                                    // Wait for window and frontend to be ready
                                    tokio::time::sleep(tokio::time::Duration::from_millis(1500))
                                        .await;

                                    if let Some(window) =
                                        app_handle_clone.get_webview_window("main")
                                    {
                                        let _ = window.emit("auto-load-project", last_project);
                                    }
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            load_settings,
            save_settings,
            show_open_dialog,
            show_save_dialog,
            rebuild_menu,
            create_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
