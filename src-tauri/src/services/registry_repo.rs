use std::fs;
use std::path::{Path, PathBuf};
use crate::services::path_resolver::{self, sanitize_filename};
use crate::services::persistence::JsonStore;

const DATASETS_REGISTRY_FILE: &str = "datasets-registry.json";
const ANALYSES_HISTORY_FILE: &str = "analyses-history.json";

/// Repositório de alto nível para persistência e recuperação dos registros de Datasets e Análises.
/// 100% puro Rust, agnóstico ao framework de UI.
pub struct RegistryRepo;

impl RegistryRepo {
    /// Carrega o registro de datasets e hidrata os caminhos relativos para absolutos.
    pub fn load_datasets(app_data_dir: &Path) -> Result<Vec<serde_json::Value>, String> {
        let path = path_resolver::get_primary_registry_path(app_data_dir, DATASETS_REGISTRY_FILE);
        let mut registry: Vec<serde_json::Value> = JsonStore::load_list(&path)?;
        let base_path = path_resolver::get_base_downloads_path(app_data_dir);

        // Hidrata caminhos relativos para o frontend
        for item in registry.iter_mut() {
            if let Some(local_path) = item["localPath"].as_str() {
                let p = PathBuf::from(local_path);
                if p.is_relative() {
                    let abs_path = base_path.join(p);
                    item["localPath"] = serde_json::json!(abs_path.to_string_lossy());
                }
            }
        }

        Ok(registry)
    }

    /// Registra ou atualiza um dataset baixado ou importado no registro JSON.
    pub fn save_dataset(
        app_data_dir: &Path,
        metadata: serde_json::Value,
        final_files: &[String],
        target_dir: &Path,
    ) -> Result<(), String> {
        let base_downloads_path = path_resolver::get_base_downloads_path(app_data_dir);
        let titulo_curto = metadata["tituloCurto"].as_str().unwrap_or("sem-titulo");
        let grupo = metadata["grupo"].as_str().unwrap_or("sem-grupo");
        let entry_id = format!("{}-{}", sanitize_filename(grupo), sanitize_filename(titulo_curto));
        let relative_path = target_dir.strip_prefix(&base_downloads_path).unwrap_or(target_dir);

        let paths = path_resolver::get_registry_paths(app_data_dir, DATASETS_REGISTRY_FILE);
        let primary_path = path_resolver::get_primary_registry_path(app_data_dir, DATASETS_REGISTRY_FILE);
        let mut registry: Vec<serde_json::Value> = JsonStore::load_list(&primary_path)?;

        let mut entry_exists = false;
        for item in registry.iter_mut() {
            if item["id"].as_str() == Some(&entry_id) {
                if let Some(files) = item["files"].as_array_mut() {
                    for f in final_files {
                        let f_val = serde_json::json!(f);
                        if !files.contains(&f_val) {
                            files.push(f_val);
                        }
                    }
                }
                item["localPath"] = serde_json::json!(relative_path.to_string_lossy());
                entry_exists = true;
                break;
            }
        }

        if !entry_exists {
            let mut entry = metadata.clone();
            if let Some(obj) = entry.as_object_mut() {
                obj.insert("id".to_string(), serde_json::json!(entry_id));
                obj.insert("dateAdded".to_string(), serde_json::json!(chrono::Utc::now().to_rfc3339()));
                obj.insert("files".to_string(), serde_json::json!(final_files));
                obj.insert("localPath".to_string(), serde_json::json!(relative_path.to_string_lossy()));
                if obj.get("urls").is_none() {
                    obj.insert("urls".to_string(), serde_json::json!(""));
                }
            }
            registry.push(entry);
        }

        JsonStore::save_atomic(&paths, &registry)
    }

    /// Remove um dataset do registro e apaga sua pasta correspondente em disco.
    pub fn delete_dataset(app_data_dir: &Path, id: &str) -> Result<(), String> {
        let paths = path_resolver::get_registry_paths(app_data_dir, DATASETS_REGISTRY_FILE);
        let primary_path = path_resolver::get_primary_registry_path(app_data_dir, DATASETS_REGISTRY_FILE);
        let mut registry: Vec<serde_json::Value> = JsonStore::load_list(&primary_path)?;
        let base_downloads_path = path_resolver::get_base_downloads_path(app_data_dir);

        let mut path_to_delete: Option<PathBuf> = None;
        if let Some(item) = registry.iter().find(|i| i["id"].as_str() == Some(id)) {
            if let Some(local_path) = item["localPath"].as_str() {
                let p = PathBuf::from(local_path);
                path_to_delete = Some(if p.is_relative() { base_downloads_path.join(p) } else { p });
            }
        }

        registry.retain(|item| item["id"].as_str() != Some(id));
        JsonStore::save_atomic(&paths, &registry)?;

        if let Some(p) = path_to_delete {
            if p.exists() {
                let _ = fs::remove_dir_all(p);
            }
        }

        Ok(())
    }

    /// Remove todos os datasets pertencentes a um determinado grupo e apaga as pastas em disco.
    pub fn delete_group(app_data_dir: &Path, group_name: &str) -> Result<(), String> {
        let target_group = if group_name == "Sem Grupo" { "" } else { group_name };
        let paths = path_resolver::get_registry_paths(app_data_dir, DATASETS_REGISTRY_FILE);
        let primary_path = path_resolver::get_primary_registry_path(app_data_dir, DATASETS_REGISTRY_FILE);
        let mut registry: Vec<serde_json::Value> = JsonStore::load_list(&primary_path)?;
        let base_downloads_path = path_resolver::get_base_downloads_path(app_data_dir);

        let mut paths_to_delete = Vec::new();
        for item in &registry {
            let item_group = item["grupo"].as_str().unwrap_or("");
            if item_group == target_group {
                if let Some(local_path) = item["localPath"].as_str() {
                    let p = PathBuf::from(local_path);
                    paths_to_delete.push(if p.is_relative() { base_downloads_path.join(p) } else { p });
                }
            }
        }

        registry.retain(|item| item["grupo"].as_str().unwrap_or("") != target_group);
        JsonStore::save_atomic(&paths, &registry)?;

        for p in paths_to_delete {
            if p.exists() {
                let _ = fs::remove_dir_all(p);
            }
        }

        Ok(())
    }

    /// Carrega o histórico de análises salvas.
    pub fn load_analyses(app_data_dir: &Path) -> Result<Vec<serde_json::Value>, String> {
        let path = path_resolver::get_primary_registry_path(app_data_dir, ANALYSES_HISTORY_FILE);
        JsonStore::load_list(&path)
    }

    /// Salva ou atualiza uma análise configurada no histórico.
    pub fn save_analysis(app_data_dir: &Path, mut config: serde_json::Value) -> Result<(), String> {
        let paths = path_resolver::get_registry_paths(app_data_dir, ANALYSES_HISTORY_FILE);
        let primary_path = path_resolver::get_primary_registry_path(app_data_dir, ANALYSES_HISTORY_FILE);
        let mut history: Vec<serde_json::Value> = JsonStore::load_list(&primary_path)?;

        if config["id"].is_null() {
            config["id"] = serde_json::json!(uuid::Uuid::new_v4().to_string());
        }
        config["updatedAt"] = serde_json::json!(chrono::Utc::now().to_rfc3339());

        if let Some(idx) = history.iter().position(|item| item["id"] == config["id"]) {
            history[idx] = config;
        } else {
            history.push(config);
        }

        JsonStore::save_atomic(&paths, &history)
    }

    /// Remove uma análise pelo ID.
    pub fn delete_analysis(app_data_dir: &Path, id: &str) -> Result<(), String> {
        let paths = path_resolver::get_registry_paths(app_data_dir, ANALYSES_HISTORY_FILE);
        let primary_path = path_resolver::get_primary_registry_path(app_data_dir, ANALYSES_HISTORY_FILE);
        let mut history: Vec<serde_json::Value> = JsonStore::load_list(&primary_path)?;

        history.retain(|item| item["id"].as_str() != Some(id));
        JsonStore::save_atomic(&paths, &history)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_save_and_load_datasets() {
        let temp_dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&temp_dir).unwrap();

        let metadata = serde_json::json!({
            "tituloCurto": "2023",
            "grupo": "Censo Escolar",
            "formato": "csv"
        });
        let target_dir = temp_dir.join("datasets").join("censo_escolar").join("2023");
        fs::create_dir_all(&target_dir).unwrap();

        let final_files = vec!["escolas.csv".to_string(), "turmas.csv".to_string()];

        RegistryRepo::save_dataset(&temp_dir, metadata, &final_files, &target_dir).unwrap();

        let loaded = RegistryRepo::load_datasets(&temp_dir).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0]["id"].as_str(), Some("censo_escolar-2023"));
        assert_eq!(loaded[0]["files"].as_array().unwrap().len(), 2);

        // Delete dataset
        RegistryRepo::delete_dataset(&temp_dir, "censo_escolar-2023").unwrap();
        let loaded_after_del = RegistryRepo::load_datasets(&temp_dir).unwrap();
        assert!(loaded_after_del.is_empty());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_save_and_delete_analysis() {
        let temp_dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&temp_dir).unwrap();

        let config = serde_json::json!({
            "id": "analysis-123",
            "name": "Análise Teste",
            "groupName": "Censo Escolar"
        });

        RegistryRepo::save_analysis(&temp_dir, config).unwrap();

        let analyses = RegistryRepo::load_analyses(&temp_dir).unwrap();
        assert_eq!(analyses.len(), 1);
        assert_eq!(analyses[0]["id"].as_str(), Some("analysis-123"));
        assert_eq!(analyses[0]["name"].as_str(), Some("Análise Teste"));

        RegistryRepo::delete_analysis(&temp_dir, "analysis-123").unwrap();
        let after_del = RegistryRepo::load_analyses(&temp_dir).unwrap();
        assert!(after_del.is_empty());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
