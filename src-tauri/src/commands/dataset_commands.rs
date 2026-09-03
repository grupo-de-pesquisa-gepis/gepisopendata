use std::path::{Path, PathBuf};
use tauri::AppHandle;
use crate::models::{ColumnInfo, DictionaryEntry, GroupAnalysis};
use crate::services::{
    path_resolver,
    DictionaryParser,
    Downloader,
    EtlService,
    RegistryRepo,
};

#[tauri::command]
pub async fn download_dataset(
    app_handle: AppHandle,
    url: String,
    metadata: serde_json::Value,
) -> Result<String, String> {
    tracing::info!("Starting download_dataset: url={}", url);
    println!("Rust => Processing download for: {}", url);

    let titulo_curto = metadata["tituloCurto"].as_str().unwrap_or("sem-titulo");
    let grupo = metadata["grupo"].as_str().unwrap_or("sem-grupo");
    let formato_esperado = metadata["formato"].as_str().unwrap_or("outro").to_lowercase();

    let base_downloads_path = path_resolver::get_base_downloads_path(&app_handle)?;
    let target_dir = path_resolver::resolve_dataset_dir(&base_downloads_path, grupo, titulo_curto);

    let final_files = Downloader::download_and_extract(&url, &target_dir, &formato_esperado).await?;

    RegistryRepo::save_dataset(&app_handle, metadata, &final_files, &target_dir)?;

    let file_name = url.split('/').last().unwrap_or("dataset.zip");
    tracing::info!("Dataset downloaded and registered successfully: {}", file_name);
    Ok(file_name.to_string())
}

#[tauri::command]
pub async fn import_local_dataset(
    app_handle: AppHandle,
    file_paths: Vec<String>,
    metadata: serde_json::Value,
) -> Result<String, String> {
    tracing::info!("Starting import_local_dataset: files={:?}", file_paths);

    let titulo_curto = metadata["tituloCurto"].as_str().unwrap_or("sem-titulo");
    let grupo = metadata["grupo"].as_str().unwrap_or("sem-grupo");

    let base_downloads_path = path_resolver::get_base_downloads_path(&app_handle)?;
    let target_dir = path_resolver::resolve_dataset_dir(&base_downloads_path, grupo, titulo_curto);

    let final_files = Downloader::import_local_files(&file_paths, &target_dir)?;

    RegistryRepo::save_dataset(&app_handle, metadata, &final_files, &target_dir)?;

    Ok(format!("{} arquivos importados com sucesso!", final_files.len()))
}

#[tauri::command]
pub async fn get_registry(app_handle: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    RegistryRepo::load_datasets(&app_handle)
}

#[tauri::command]
pub async fn delete_dataset(app_handle: AppHandle, id: String) -> Result<(), String> {
    RegistryRepo::delete_dataset(app_handle, &id)
}

#[tauri::command]
pub async fn delete_group(app_handle: AppHandle, mut group_name: String) -> Result<(), String> {
    if group_name == "Sem Grupo" {
        group_name = "".to_string();
    }
    RegistryRepo::delete_group(&app_handle, &group_name)
}

#[tauri::command]
pub async fn check_path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub async fn get_excel_files(app_handle: AppHandle, group_name: String) -> Result<Vec<String>, String> {
    let registry = RegistryRepo::load_datasets(&app_handle)?;
    let group_items: Vec<_> = registry
        .into_iter()
        .filter(|item| item["grupo"].as_str().unwrap_or("") == group_name)
        .collect();

    if group_items.is_empty() {
        return Err("Grupo não encontrado".into());
    }

    let base_downloads_path = path_resolver::get_base_downloads_path(&app_handle)?;
    let mut excel_files = std::collections::HashSet::new();

    for item in group_items {
        let local_path_str = item["localPath"].as_str().unwrap_or("");
        if local_path_str.is_empty() {
            continue;
        }

        let p = PathBuf::from(local_path_str);
        let local_path = if p.is_relative() {
            base_downloads_path.join(p)
        } else {
            p
        };

        if !local_path.exists() {
            continue;
        }

        for file in DictionaryParser::find_excel_files(&local_path) {
            excel_files.insert(file);
        }
    }

    let mut result: Vec<String> = excel_files.into_iter().collect();
    result.sort();
    Ok(result)
}

#[tauri::command]
pub async fn parse_dictionary(
    app_handle: AppHandle,
    group_name: String,
    file_name: String,
) -> Result<Vec<DictionaryEntry>, String> {
    let registry = RegistryRepo::load_datasets(&app_handle)?;
    let group_items: Vec<_> = registry
        .into_iter()
        .filter(|item| item["grupo"].as_str().unwrap_or("") == group_name)
        .collect();

    let base_downloads_path = path_resolver::get_base_downloads_path(&app_handle)?;
    let mut full_path = None;

    for item in &group_items {
        let local_path_str = item["localPath"].as_str().unwrap_or("");
        let p = PathBuf::from(local_path_str);
        let local_path = if p.is_relative() {
            base_downloads_path.join(p)
        } else {
            p
        };
        let test_path = local_path.join(&file_name);
        if test_path.exists() {
            full_path = Some(test_path);
            break;
        }
    }

    let full_path = full_path.ok_or("Arquivo não encontrado")?;
    DictionaryParser::parse_dictionary(&full_path)
}

#[tauri::command]
pub async fn get_group_columns(
    app_handle: AppHandle,
    group_name: String,
) -> Result<Vec<serde_json::Value>, String> {
    let registry_path = path_resolver::get_primary_registry_path(&app_handle, "datasets-registry.json")?;
    let base_downloads_path = path_resolver::get_base_downloads_path(&app_handle)?;
    EtlService::get_group_columns(&registry_path, &base_downloads_path, &group_name)
}

#[tauri::command]
pub async fn analyze_group(
    app_handle: AppHandle,
    group_name: String,
) -> Result<GroupAnalysis, String> {
    let registry_path = path_resolver::get_primary_registry_path(&app_handle, "datasets-registry.json")?;
    let base_downloads_path = path_resolver::get_base_downloads_path(&app_handle)?;
    EtlService::analyze_group(&registry_path, &base_downloads_path, &group_name)
}

#[tauri::command]
pub async fn get_columns_for_files(
    app_handle: AppHandle,
    group_name: String,
    files: Vec<String>,
) -> Result<Vec<ColumnInfo>, String> {
    let registry_path = path_resolver::get_primary_registry_path(&app_handle, "datasets-registry.json")?;
    let base_downloads_path = path_resolver::get_base_downloads_path(&app_handle)?;
    EtlService::get_columns_for_files(&registry_path, &base_downloads_path, &group_name, &files)
}
