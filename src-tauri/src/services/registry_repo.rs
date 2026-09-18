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

        Self::append_system_spatial_datasets(app_data_dir, &mut registry);

        Ok(registry)
    }

    /// Anexa dinamicamente conjuntos de dados espaciais e georreferenciados oficiais como somente-leitura
    fn append_system_spatial_datasets(app_data_dir: &Path, registry: &mut Vec<serde_json::Value>) {
        // 1. Censo Escolar 2024 Georreferenciado (INEP x IBGE CNEFE)
        let primary_escolas = app_data_dir.join("data").join("escolas_dados.csv");
        let escolas_opt = if primary_escolas.exists() {
            Some(primary_escolas)
        } else if app_data_dir.exists() {
            crate::services::IbgeCnefeService::find_escolas_dados_csv(app_data_dir)
        } else {
            None
        };

        if let Some(escolas_path) = escolas_opt {
            let entry_id = "inep_censo_georreferenciado-escolas_2024";
            if !registry.iter().any(|item| item["id"].as_str() == Some(entry_id)) {
                let parent_dir = escolas_path.parent().unwrap_or(app_data_dir);
                let filename = escolas_path.file_name().and_then(|f| f.to_str()).unwrap_or("escolas_dados.csv");
                registry.push(serde_json::json!({
                    "id": entry_id,
                    "titulo": "Escolas da Educação Básica 2024 (Georreferenciadas CNEFE IBGE)",
                    "tituloCurto": "Censo Escolar 2024 Georreferenciado",
                    "tituloLongo": "Escolas da Educação Básica 2024 com Coordenadas CNEFE IBGE 2022",
                    "grupo": "INEP - Censo Escolar Georreferenciado",
                    "formato": "csv",
                    "ano": "2024",
                    "descricao": "Base completa das escolas da Educação Básica com latitude, longitude, nível de precisão cartográfica e endereço oficial associados via cruzamento com o IBGE CNEFE 2022.",
                    "fonte": "INEP / IBGE CNEFE 2022",
                    "isReadOnly": true,
                    "isSpatial": true,
                    "isSystem": true,
                    "category": "georreferenciado",
                    "files": [filename],
                    "localPath": parent_dir.to_string_lossy(),
                    "dateAdded": "2024-01-01T00:00:00Z"
                }));
            }
        }

        // 2. IBGE Malhas Territoriais 2024
        let malhas_dir = app_data_dir.join("data").join("ibge_malhas");
        let malhas_geojson_dir = malhas_dir.join("geojson");
        let mut malhas_files = Vec::new();
        if malhas_geojson_dir.exists() {
            if let Ok(entries) = fs::read_dir(&malhas_geojson_dir) {
                for e in entries.flatten() {
                    let path = e.path();
                    if path.extension().and_then(|s| s.to_str()) == Some("geojson") {
                        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                            malhas_files.push(name.to_string());
                        }
                    }
                }
            }
        }
        if malhas_files.is_empty() && malhas_dir.exists() {
            let mut found = Vec::new();
            let _ = path_resolver::find_files_recursive(&malhas_dir, "geojson", &mut found);
            for f in found {
                if let Some(name) = f.file_name().and_then(|s| s.to_str()) {
                    malhas_files.push(name.to_string());
                }
            }
        }
        if !malhas_files.is_empty() {
            let entry_id = "ibge_malhas_territoriais-malhas_2024";
            if !registry.iter().any(|item| item["id"].as_str() == Some(entry_id)) {
                registry.push(serde_json::json!({
                    "id": entry_id,
                    "titulo": "Malhas Territoriais do Brasil 2024 (IBGE)",
                    "tituloCurto": "Malhas Territoriais 2024",
                    "tituloLongo": "Malhas Territoriais e Municipais do Brasil 2024 (IBGE)",
                    "grupo": "IBGE - Malhas Territoriais",
                    "formato": "geojson",
                    "ano": "2024",
                    "descricao": "Polígonos vetoriais oficiais das divisões territoriais brasileiras: País, Grandes Regiões, Unidades da Federação e Municípios.",
                    "fonte": "IBGE Malhas Municipais 2024",
                    "isReadOnly": true,
                    "isSpatial": true,
                    "isSystem": true,
                    "category": "malhas_ibge",
                    "files": malhas_files,
                    "localPath": malhas_dir.to_string_lossy(),
                    "dateAdded": "2024-01-01T00:00:00Z"
                }));
            }
        }

        // 3. IBGE CNEFE 2022
        let cnefe_dir = crate::services::IbgeCnefeService::get_base_dir(app_data_dir);
        let mut cnefe_files = Vec::new();
        if cnefe_dir.exists() {
            if let Ok(entries) = fs::read_dir(&cnefe_dir) {
                for e in entries.flatten() {
                    let path = e.path();
                    if path.is_file() {
                        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                            if name.ends_with(".zip") || name.ends_with(".csv") {
                                cnefe_files.push(name.to_string());
                            }
                        }
                    } else if path.is_dir() {
                        if let Ok(sub_entries) = fs::read_dir(&path) {
                            for sub in sub_entries.flatten() {
                                if let Some(sub_name) = sub.path().file_name().and_then(|s| s.to_str()) {
                                    if sub_name.ends_with(".csv") {
                                        cnefe_files.push(sub_name.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if !cnefe_files.is_empty() {
            let entry_id = "ibge_cnefe-cadastro_enderecos_2022";
            if !registry.iter().any(|item| item["id"].as_str() == Some(entry_id)) {
                registry.push(serde_json::json!({
                    "id": entry_id,
                    "titulo": "Cadastro Nacional de Endereços para Fins Estatísticos (CNEFE 2022)",
                    "tituloCurto": "CNEFE 2022 (IBGE)",
                    "tituloLongo": "IBGE CNEFE 2022 - Cadastro Nacional de Endereços Georreferenciados",
                    "grupo": "IBGE - CNEFE 2022",
                    "formato": "csv",
                    "ano": "2022",
                    "descricao": "Cadastro georreferenciado de endereços e coordenadas do Censo Demográfico 2022 do IBGE.",
                    "fonte": "IBGE - Censo Demográfico 2022",
                    "isReadOnly": true,
                    "isSpatial": true,
                    "isSystem": true,
                    "category": "cnefe_ibge",
                    "files": cnefe_files,
                    "localPath": cnefe_dir.to_string_lossy(),
                    "dateAdded": "2024-01-01T00:00:00Z"
                }));
            }
        }
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
        if id == "inep_censo_georreferenciado-escolas_2024"
            || id.starts_with("ibge_malhas_")
            || id.starts_with("ibge_cnefe-")
        {
            return Err("Este conjunto de dados é oficial do sistema (somente-leitura) e protegido contra exclusão.".to_string());
        }

        let paths = path_resolver::get_registry_paths(app_data_dir, DATASETS_REGISTRY_FILE);
        let primary_path = path_resolver::get_primary_registry_path(app_data_dir, DATASETS_REGISTRY_FILE);
        let mut registry: Vec<serde_json::Value> = JsonStore::load_list(&primary_path)?;
        let base_downloads_path = path_resolver::get_base_downloads_path(app_data_dir);

        let mut path_to_delete: Option<PathBuf> = None;
        if let Some(item) = registry.iter().find(|i| i["id"].as_str() == Some(id)) {
            if item["isReadOnly"].as_bool() == Some(true) || item["isSystem"].as_bool() == Some(true) {
                return Err("Este conjunto de dados é oficial do sistema (somente-leitura) e protegido contra exclusão.".to_string());
            }
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
        if target_group.starts_with("IBGE -") || target_group.starts_with("INEP - Censo Escolar Georreferenciado") {
            return Err("Este grupo é oficial do sistema (somente-leitura) e protegido contra exclusão.".to_string());
        }

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
        let user_entry = loaded.iter().find(|i| i["id"] == "censo_escolar-2023");
        assert!(user_entry.is_some());
        assert_eq!(user_entry.unwrap()["files"].as_array().unwrap().len(), 2);

        // Delete dataset
        RegistryRepo::delete_dataset(&temp_dir, "censo_escolar-2023").unwrap();
        let loaded_after_del = RegistryRepo::load_datasets(&temp_dir).unwrap();
        assert!(loaded_after_del.iter().find(|i| i["id"] == "censo_escolar-2023").is_none());

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
