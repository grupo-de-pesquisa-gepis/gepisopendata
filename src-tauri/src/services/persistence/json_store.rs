use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use serde::{de::DeserializeOwned, Serialize};

/// Utilitário genérico para persistência atômica e leitura segura de dados JSON.
/// 100% agnóstico a qualquer framework de UI.
pub struct JsonStore;

impl JsonStore {
    /// Carrega uma lista de elementos a partir de um arquivo JSON.
    /// Retorna vetor vazio se o arquivo não existir ou for inválido.
    pub fn load_list<T: DeserializeOwned>(path: &Path) -> Result<Vec<T>, String> {
        if !path.exists() {
            return Ok(Vec::new());
        }
        let file = File::open(path).map_err(|e| format!("Erro ao abrir arquivo {:?}: {}", path, e))?;
        let data: Vec<T> = serde_json::from_reader(file).unwrap_or_default();
        Ok(data)
    }

    /// Carrega um objeto opcional de um arquivo JSON.
    pub fn load_optional<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
        if !path.exists() {
            return Ok(None);
        }
        let file = File::open(path).map_err(|e| format!("Erro ao abrir arquivo {:?}: {}", path, e))?;
        let data: T = serde_json::from_reader(file).map_err(|e| format!("Erro no parsing de {:?}: {}", path, e))?;
        Ok(Some(data))
    }

    /// Salva dados de forma atômica e formatada (pretty-printed) em uma lista de caminhos de destino.
    /// Para cada caminho, cria os diretórios pais necessários, escreve em um arquivo temporário (.tmp)
    /// e realiza rename atômico.
    pub fn save_atomic<T: Serialize>(paths: &[PathBuf], data: &T) -> Result<(), String> {
        let json_bytes = serde_json::to_vec_pretty(data)
            .map_err(|e| format!("Erro ao serializar dados para JSON: {}", e))?;

        for target_path in paths {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Erro ao criar diretório {:?}: {}", parent, e))?;
            }

            let tmp_path = target_path.with_extension("tmp");
            {
                let mut tmp_file = File::create(&tmp_path)
                    .map_err(|e| format!("Erro ao criar arquivo temporário {:?}: {}", tmp_path, e))?;
                tmp_file.write_all(&json_bytes)
                    .map_err(|e| format!("Erro ao escrever no arquivo temporário {:?}: {}", tmp_path, e))?;
                tmp_file.flush()
                    .map_err(|e| format!("Erro ao sincronizar dados em {:?}: {}", tmp_path, e))?;
            }

            fs::rename(&tmp_path, target_path)
                .map_err(|e| format!("Erro ao renomear arquivo temporário para {:?}: {}", target_path, e))?;
        }

        Ok(())
    }
}
