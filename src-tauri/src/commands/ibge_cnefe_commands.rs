use crate::models::{
    CnefeSchoolComparisonResult, CnefeSchoolQuery, CnefeSchoolSummary, IbgeCnefeDownloadRequest,
    IbgeCnefeOverview,
};
use crate::services::IbgeCnefeService;
use std::fs;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn get_ibge_cnefe_status(app: tauri::AppHandle) -> Result<IbgeCnefeOverview, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    Ok(IbgeCnefeService::get_status(&app_data_dir))
}

#[tauri::command]
pub async fn download_ibge_cnefe_uf(
    app: tauri::AppHandle,
    req: IbgeCnefeDownloadRequest,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    IbgeCnefeService::download_uf(&app, &app_data_dir, req).await
}

#[tauri::command]
pub async fn extract_ibge_cnefe_uf(
    app: tauri::AppHandle,
    uf: String,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    IbgeCnefeService::extract_uf(&app, &app_data_dir, &uf)
}

#[tauri::command]
pub async fn delete_ibge_cnefe_uf(
    app: tauri::AppHandle,
    uf: String,
) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    IbgeCnefeService::delete_uf(&app_data_dir, &uf)
}

#[allow(deprecated)]
#[tauri::command]
pub async fn open_ibge_cnefe_folder(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    let base_dir = IbgeCnefeService::get_base_dir(&app_data_dir);
    if !base_dir.exists() {
        fs::create_dir_all(&base_dir)
            .map_err(|e| format!("Falha ao criar diretório CNEFE: {}", e))?;
    }

    let dir_str = base_dir.to_string_lossy().to_string();
    app.shell()
        .open(&dir_str, None)
        .map_err(|e| format!("Falha ao abrir pasta no sistema operacional: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_cnefe_inep_summary(app: tauri::AppHandle) -> Result<CnefeSchoolSummary, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    Ok(IbgeCnefeService::get_comparison_summary(&app_data_dir))
}

#[tauri::command]
pub async fn query_cnefe_inep_schools(
    app: tauri::AppHandle,
    query: CnefeSchoolQuery,
) -> Result<CnefeSchoolComparisonResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    Ok(IbgeCnefeService::query_schools_comparison(&app_data_dir, query))
}

#[tauri::command]
pub async fn export_cnefe_inep_csv(
    app: tauri::AppHandle,
    query: CnefeSchoolQuery,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    IbgeCnefeService::export_schools_comparison_csv(&app_data_dir, query)
}

#[tauri::command]
pub async fn run_cnefe_inep_match(
    app: tauri::AppHandle,
    req: crate::models::CnefeInepMatchRequest,
) -> Result<CnefeSchoolSummary, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;

    IbgeCnefeService::run_matching(&app, &app_data_dir, req).await
}




