use std::path::Path;
use tauri::AppHandle;
use tauri::Manager;
use crate::models::BarChartData;
use crate::services::{path_resolver, EtlService, RegistryRepo};

#[tauri::command]
pub async fn run_etl(
    app_handle: AppHandle,
    group_name: String,
    files: Vec<String>,
    columns: Vec<String>,
) -> Result<String, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let base_downloads_path = path_resolver::get_base_downloads_path(&app_handle)?;
    let registry_path = path_resolver::get_primary_registry_path(&app_handle, "datasets-registry.json")?;

    EtlService::run_etl(
        &app_data_dir,
        &base_downloads_path,
        &registry_path,
        &group_name,
        &files,
        &columns,
    )
}

#[tauri::command]
pub async fn get_barchart_data(
    file_path: String,
    category_col: String,
    value_col: String,
    metric: String,
) -> Result<BarChartData, String> {
    EtlService::get_barchart_data(Path::new(&file_path), &category_col, &value_col, &metric)
}

#[tauri::command]
pub async fn get_variable_sample(
    file_path: String,
    column_name: String,
    limit: usize,
) -> Result<Vec<String>, String> {
    EtlService::get_variable_sample(Path::new(&file_path), &column_name, limit)
}

#[tauri::command]
pub async fn save_analysis(
    app_handle: AppHandle,
    config: serde_json::Value,
) -> Result<(), String> {
    RegistryRepo::save_analysis(&app_handle, config)
}

#[tauri::command]
pub async fn get_analyses(
    app_handle: AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    RegistryRepo::load_analyses(&app_handle)
}

#[tauri::command]
pub async fn delete_analysis(
    app_handle: AppHandle,
    id: String,
) -> Result<(), String> {
    RegistryRepo::delete_analysis(&app_handle, &id)
}
