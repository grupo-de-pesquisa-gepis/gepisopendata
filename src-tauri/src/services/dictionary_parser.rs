use std::path::Path;
use calamine::{open_workbook_auto, Reader};
use crate::models::DictionaryEntry;
use crate::services::path_resolver::find_files_recursive;

/// Parser de Dicionários de Dados em planilhas Excel (Calamine).
pub struct DictionaryParser;

impl DictionaryParser {
    /// Encontra todos os arquivos Excel (.xlsx, .xls) válidos em uma pasta.
    pub fn find_excel_files(dir: &Path) -> Vec<String> {
        let mut files = Vec::new();
        let _ = find_files_recursive(dir, "xlsx", &mut files);
        let _ = find_files_recursive(dir, "xls", &mut files);

        let mut result_set = std::collections::HashSet::new();
        for file_path in files {
            let rel_path = file_path
                .strip_prefix(dir)
                .unwrap_or(&file_path)
                .to_string_lossy()
                .into_owned();
            // Ignora arquivos temporários do Excel (~$...)
            if !rel_path.starts_with("~$") {
                result_set.insert(rel_path);
            }
        }

        let mut sorted_files: Vec<String> = result_set.into_iter().collect();
        sorted_files.sort();
        sorted_files
    }

    /// Lê as abas da planilha e extrai variáveis, descrições e tipos.
    pub fn parse_dictionary(file_path: &Path) -> Result<Vec<DictionaryEntry>, String> {
        if !file_path.exists() {
            return Err("Arquivo de dicionário não encontrado.".into());
        }

        let mut workbook = open_workbook_auto(file_path)
            .map_err(|e| format!("Erro ao abrir planilha Excel: {}", e))?;

        let mut entries = Vec::new();
        let sheets = workbook.sheet_names().to_owned();

        for sheet_name in sheets {
            if let Ok(range) = workbook.worksheet_range(&sheet_name) {
                let mut name_idx = None;
                let mut desc_idx = None;
                let mut type_idx = None;

                for row in range.rows() {
                    if name_idx.is_none() || desc_idx.is_none() {
                        for (col_idx, cell) in row.iter().enumerate() {
                            let cell_val = cell.to_string().to_lowercase();
                            if cell_val.contains("nome da variável") || cell_val.contains("nome da variavel") {
                                name_idx = Some(col_idx);
                            } else if cell_val.contains("descrição da variável") || cell_val.contains("descricao da variavel") {
                                desc_idx = Some(col_idx);
                            } else if cell_val == "tipo" {
                                type_idx = Some(col_idx);
                            }
                        }
                    } else {
                        let name = row.get(name_idx.unwrap()).map(|c| c.to_string()).unwrap_or_default();
                        let description = row.get(desc_idx.unwrap()).map(|c| c.to_string()).unwrap_or_default();
                        let v_type = type_idx
                            .and_then(|idx| row.get(idx))
                            .map(|c| c.to_string())
                            .unwrap_or_else(|| "Desconhecido".to_string());

                        if !name.trim().is_empty() {
                            entries.push(DictionaryEntry {
                                name: name.trim().to_string(),
                                description: description.trim().to_string(),
                                var_type: v_type.trim().to_string(),
                            });
                        }
                    }
                }
            }
        }

        Ok(entries)
    }
}
