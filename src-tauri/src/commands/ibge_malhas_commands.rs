use crate::models::{IbgeDownloadRequest, IbgeMalhasOverview};
use crate::services::IbgeMalhasService;
use std::fs;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn get_ibge_malhas_status(app: tauri::AppHandle) -> Result<IbgeMalhasOverview, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    Ok(IbgeMalhasService::get_status(&app_data_dir))
}

#[tauri::command]
pub async fn download_ibge_malha(
    app: tauri::AppHandle,
    req: IbgeDownloadRequest,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    IbgeMalhasService::download_malha(&app, &app_data_dir, req).await
}

#[tauri::command]
pub async fn delete_ibge_malha(
    app: tauri::AppHandle,
    level: String,
    format: String,
    quality: Option<String>,
) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    IbgeMalhasService::delete_malha(&app_data_dir, &level, &format, quality.as_deref())
}

#[tauri::command]
pub async fn open_ibge_malhas_folder(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    let base_dir = IbgeMalhasService::get_base_dir(&app_data_dir);
    if !base_dir.exists() {
        fs::create_dir_all(&base_dir)
            .map_err(|e| format!("Falha ao criar diretório das malhas: {}", e))?;
    }

    let dir_str = base_dir.to_string_lossy().to_string();
    app.shell()
        .open(&dir_str, None)
        .map_err(|e| format!("Falha ao abrir pasta no sistema operacional: {}", e))?;

    Ok(())
}
