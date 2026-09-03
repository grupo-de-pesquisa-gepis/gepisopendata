use tauri::AppHandle;
use tauri::Manager;
use crate::models::GithubConfig;
use crate::services::{path_resolver, GithubClient, RegistryRepo};

#[tauri::command]
pub async fn get_github_config(app_handle: AppHandle) -> Result<Option<GithubConfig>, String> {
    let config_path = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("github-config.json");
    GithubClient::load_config(&config_path)
}

#[tauri::command]
pub async fn save_github_config(app_handle: AppHandle, config: GithubConfig) -> Result<(), String> {
    let config_path = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("github-config.json");
    GithubClient::save_config(&config_path, &config)
}

#[tauri::command]
pub async fn test_github_connection(token: String, owner: String, repo: String) -> Result<String, String> {
    GithubClient::test_connection(&token, &owner, &repo).await
}

#[tauri::command]
pub async fn push_dataset_to_github(app_handle: AppHandle, dataset_id: String) -> Result<String, String> {
    let config = get_github_config(app_handle.clone())
        .await?
        .ok_or("Configuração do GitHub não encontrada. Vá em Configurações > Colaboração GitHub.")?;

    let registry = RegistryRepo::load_datasets(&app_handle)?;
    let local_entry = registry
        .iter()
        .find(|item| item["id"].as_str() == Some(&dataset_id))
        .ok_or(format!("Dataset {} não encontrado no registro local.", dataset_id))?
        .clone();

    GithubClient::push_dataset(&config, local_entry, &dataset_id).await
}

#[tauri::command]
pub async fn publish_analysis(app_handle: AppHandle, id: Option<String>) -> Result<String, String> {
    let config = get_github_config(app_handle.clone())
        .await?
        .ok_or("GitHub configuration not found. Configure it in Settings > Collaboration.")?;

    let history = RegistryRepo::load_analyses(&app_handle)?;

    if let Some(ref aid) = id {
        if !history.iter().any(|item| item["id"].as_str() == Some(aid)) {
            return Err("Analysis id not found in local analyses-history.json".into());
        }
    }

    GithubClient::publish_analysis(&config, &history, id.as_deref()).await
}
