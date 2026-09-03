use std::collections::HashMap;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use polars::prelude::*;
use crate::models::{BarChartData, ColumnInfo, GroupAnalysis};
use crate::services::path_resolver::{detect_delimiter_from_file, find_files_recursive};
use crate::services::persistence::JsonStore;

/// Serviço de Processamento de Dados, ETL e Agregações Estatísticas com Polars (100% Puro Rust).
pub struct EtlService;

impl EtlService {
    /// Executa o pipeline ETL concatenando múltiplos arquivos CSV selecionados e salvando o arquivo consolidado.
    pub fn run_etl(
        app_data_dir: &Path,
        base_downloads_path: &Path,
        registry_path: &Path,
        group_name: &str,
        files: &[String],
        columns: &[String],
    ) -> Result<String, String> {
        tracing::info!("Starting ETL process for group: {}, files: {:?}, columns: {:?}", group_name, files, columns);

        let registry: Vec<serde_json::Value> = JsonStore::load_list(registry_path)?;
        let group_items: Vec<_> = registry
            .into_iter()
            .filter(|item| item["grupo"].as_str().unwrap_or("") == group_name)
            .collect();

        let mut full_paths = Vec::new();
        for rel_path in files {
            for item in &group_items {
                let local_path_str = item["localPath"].as_str().unwrap_or("");
                let p = PathBuf::from(local_path_str);
                let local_path = if p.is_relative() {
                    base_downloads_path.join(p)
                } else {
                    p
                };
                let full_path = local_path.join(rel_path);
                if full_path.exists() {
                    full_paths.push(full_path);
                    break;
                }
            }
        }

        if full_paths.is_empty() {
            return Err("Nenhum arquivo válido encontrado para o ETL".to_string());
        }

        let mut lazy_frames = Vec::new();
        let col_exprs: Vec<Expr> = columns.iter().map(|c| col(c).cast(DataType::String)).collect();

        for path in full_paths {
            let sep = detect_delimiter_from_file(&path);
            let lf = LazyCsvReader::new(path)
                .with_has_header(true)
                .with_separator(sep)
                .with_encoding(CsvEncoding::LossyUtf8)
                .with_infer_schema_length(Some(10000))
                .with_ignore_errors(true)
                .finish()
                .map_err(|e| format!("Erro ao ler CSV: {}", e))?
                .select(col_exprs.clone());

            lazy_frames.push(lf);
        }

        let merged_lf = concat(lazy_frames, UnionArgs::default())
            .map_err(|e| format!("Erro ao concatenar arquivos: {}", e))?;

        let mut df = merged_lf.collect()
            .map_err(|e| format!("Erro ao processar dados: {}", e))?;

        let output_dir = app_data_dir.join("processed_data").join(group_name);
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Erro ao criar diretório de saída: {}", e))?;

        let output_path = output_dir.join("analysis_ready.csv");
        let mut file = File::create(&output_path)
            .map_err(|e| format!("Erro ao criar arquivo de saída: {}", e))?;

        CsvWriter::new(&mut file)
            .include_header(true)
            .with_separator(b';')
            .finish(&mut df)
            .map_err(|e| format!("Erro ao salvar arquivo final: {}", e))?;

        let output_str = output_path.to_string_lossy().into_owned();
        tracing::info!("ETL process completed successfully. Output file: {}", output_str);
        Ok(output_str)
    }

    /// Gera os dados agregados para gráficos de barra a partir do arquivo CSV.
    pub fn get_barchart_data(
        file_path: &Path,
        category_col: &str,
        value_col: &str,
        metric: &str,
    ) -> Result<BarChartData, String> {
        tracing::info!("Starting get_barchart_data: file={:?}, category={}, value={}, metric={}", file_path, category_col, value_col, metric);

        if !file_path.exists() {
            return Err("Arquivo não encontrado".into());
        }

        let sep = detect_delimiter_from_file(file_path);
        let lf = LazyCsvReader::new(file_path)
            .with_has_header(true)
            .with_separator(sep)
            .with_encoding(CsvEncoding::LossyUtf8)
            .with_infer_schema_length(Some(10000))
            .with_ignore_errors(true)
            .finish()
            .map_err(|e| format!("Erro ao ler arquivo: {}", e))?;

        let agg_expr = match metric {
            "sum" => col(value_col).cast(DataType::Float64).sum(),
            "avg" => col(value_col).cast(DataType::Float64).mean(),
            _ => col(value_col).count(),
        };

        let df = lf
            .group_by([col(category_col).cast(DataType::String)])
            .agg([agg_expr.alias("result")])
            .collect()
            .map_err(|e| format!("Erro na agregação: {}", e))?;

        let cats: Vec<String> = df.column(category_col)
            .or_else(|_| df.column(category_col))
            .map_err(|e| e.to_string())?
            .iter()
            .map(|v| v.to_string().replace('\"', ""))
            .collect();

        let vals: Vec<f64> = df.column("result")
            .map_err(|e| e.to_string())?
            .cast(&DataType::Float64)
            .map_err(|e| format!("Erro ao converter para float: {}", e))?
            .f64()
            .map_err(|e| e.to_string())?
            .into_no_null_iter()
            .collect();

        tracing::info!("Bar chart data generated successfully: {} categories, {} values", cats.len(), vals.len());
        Ok(BarChartData {
            categories: cats,
            values: vals,
        })
    }

    /// Obtém uma amostra das primeiras N linhas de uma determinada coluna.
    pub fn get_variable_sample(
        file_path: &Path,
        column_name: &str,
        limit: usize,
    ) -> Result<Vec<String>, String> {
        tracing::info!("Starting get_variable_sample: file={:?}, column={}, limit={}", file_path, column_name, limit);

        if !file_path.exists() {
            return Err("Arquivo não encontrado".into());
        }

        let sep = detect_delimiter_from_file(file_path);
        let df = LazyCsvReader::new(file_path)
            .with_has_header(true)
            .with_separator(sep)
            .with_encoding(CsvEncoding::LossyUtf8)
            .with_infer_schema_length(Some(10000))
            .with_ignore_errors(true)
            .finish()
            .map_err(|e| format!("Erro ao ler arquivo: {}", e))?
            .select([col(column_name).cast(DataType::String)])
            .limit(limit as u32)
            .collect()
            .map_err(|e| format!("Erro ao processar amostra: {}", e))?;

        let values: Vec<String> = df.column(column_name)
            .map_err(|e| format!("Coluna não encontrada: {}", e))?
            .iter()
            .map(|v| v.to_string().replace('\"', ""))
            .collect();

        tracing::info!("Variable sample retrieved successfully: {} values", values.len());
        Ok(values)
    }

    /// Analisa todos os arquivos de um grupo para encontrar colunas comuns e formato predominante.
    pub fn analyze_group(
        registry_path: &Path,
        base_downloads_path: &Path,
        group_name: &str,
    ) -> Result<GroupAnalysis, String> {
        let registry: Vec<serde_json::Value> = JsonStore::load_list(registry_path)?;
        let group_items: Vec<_> = registry
            .into_iter()
            .filter(|item| item["grupo"].as_str().unwrap_or("") == group_name)
            .collect();

        if group_items.is_empty() {
            return Err("Grupo não encontrado".into());
        }

        let format = group_items[0]["formato"].as_str().unwrap_or("csv").to_lowercase();
        let mut all_files = Vec::new();
        let mut common_columns: Option<HashMap<String, String>> = None;

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

            let mut item_files = Vec::new();
            let _ = find_files_recursive(&local_path, &format, &mut item_files);

            for file_path in item_files {
                let rel_path = file_path
                    .strip_prefix(&local_path)
                    .unwrap_or(&file_path)
                    .to_string_lossy()
                    .into_owned();
                all_files.push(rel_path);

                if format == "csv" {
                    if let Ok(file) = File::open(&file_path) {
                        let delimiter = detect_delimiter_from_file(&file_path);
                        let mut rdr = csv::ReaderBuilder::new()
                            .has_headers(true)
                            .delimiter(delimiter)
                            .from_reader(file);

                        if let Ok(headers) = rdr.headers().map(|h| h.clone()) {
                            let mut current_file_cols = HashMap::new();
                            let types = if let Some(Ok(record)) = rdr.records().next() {
                                let mut t = Vec::new();
                                for val in record.iter() {
                                    t.push(if val.parse::<f64>().is_ok() { "Número" } else { "Texto" });
                                }
                                t
                            } else {
                                vec!["Texto"; headers.len()]
                            };

                            for (i, h) in headers.iter().enumerate() {
                                current_file_cols.insert(h.trim().to_string(), types.get(i).unwrap_or(&"Texto").to_string());
                            }

                            if let Some(common) = common_columns {
                                if current_file_cols.len() > 1 {
                                    let mut new_common = HashMap::new();
                                    for (name, col_type) in common {
                                        if current_file_cols.contains_key(&name) {
                                            new_common.insert(name, col_type);
                                        }
                                    }
                                    common_columns = Some(new_common);
                                } else {
                                    common_columns = Some(common);
                                }
                            } else if current_file_cols.len() > 1 {
                                common_columns = Some(current_file_cols);
                            }
                        }
                    }
                }
            }
        }

        let final_columns = common_columns
            .unwrap_or_default()
            .into_iter()
            .map(|(name, col_type)| ColumnInfo { name, col_type })
            .collect();

        Ok(GroupAnalysis {
            files: all_files,
            common_columns: final_columns,
            format,
        })
    }

    /// Identifica a interseção de colunas para uma lista específica de arquivos.
    pub fn get_columns_for_files(
        registry_path: &Path,
        base_downloads_path: &Path,
        group_name: &str,
        files: &[String],
    ) -> Result<Vec<ColumnInfo>, String> {
        let registry: Vec<serde_json::Value> = JsonStore::load_list(registry_path)?;
        let group_items: Vec<_> = registry
            .into_iter()
            .filter(|item| item["grupo"].as_str().unwrap_or("") == group_name)
            .collect();

        if group_items.is_empty() {
            return Err("Grupo não encontrado".into());
        }

        let mut common_columns: Option<HashMap<String, String>> = None;

        for rel_path in files {
            let mut found_full_path = None;
            for item in &group_items {
                let local_path_str = item["localPath"].as_str().unwrap_or("");
                let p = PathBuf::from(local_path_str);
                let local_path = if p.is_relative() {
                    base_downloads_path.join(p)
                } else {
                    p
                };
                let full_path = local_path.join(rel_path);
                if full_path.exists() {
                    found_full_path = Some(full_path);
                    break;
                }
            }

            if let Some(full_path) = found_full_path {
                if let Ok(file) = File::open(&full_path) {
                    let sep = detect_delimiter_from_file(&full_path);
                    let mut rdr = csv::ReaderBuilder::new()
                        .has_headers(true)
                        .delimiter(sep)
                        .from_reader(file);

                    if let Ok(headers) = rdr.headers().map(|h| h.clone()) {
                        let mut current_file_cols = HashMap::new();
                        let types = if let Some(Ok(record)) = rdr.records().next() {
                            let mut t = Vec::new();
                            for val in record.iter() {
                                t.push(if val.parse::<f64>().is_ok() { "Número" } else { "Texto" });
                            }
                            t
                        } else {
                            vec!["Texto"; headers.len()]
                        };

                        for (i, h) in headers.iter().enumerate() {
                            current_file_cols.insert(h.trim().to_string(), types.get(i).unwrap_or(&"Texto").to_string());
                        }

                        if let Some(common) = common_columns {
                            if current_file_cols.len() > 1 {
                                let mut new_common = HashMap::new();
                                for (name, col_type) in common {
                                    if current_file_cols.contains_key(&name) {
                                        new_common.insert(name, col_type);
                                    }
                                }
                                common_columns = Some(new_common);
                            } else {
                                common_columns = Some(common);
                            }
                        } else if current_file_cols.len() > 1 {
                            common_columns = Some(current_file_cols);
                        }
                    }
                }
            }
        }

        let result = common_columns
            .unwrap_or_default()
            .into_iter()
            .map(|(name, col_type)| ColumnInfo { name, col_type })
            .collect();

        Ok(result)
    }

    /// Retorna as colunas e tipos de um grupo no formato JSON para compatibilidade.
    pub fn get_group_columns(
        registry_path: &Path,
        base_downloads_path: &Path,
        group_name: &str,
    ) -> Result<Vec<serde_json::Value>, String> {
        let registry: Vec<serde_json::Value> = JsonStore::load_list(registry_path)?;
        let group_items: Vec<_> = registry
            .into_iter()
            .filter(|item| item["grupo"].as_str().unwrap_or("") == group_name)
            .collect();

        if group_items.is_empty() {
            return Err("Grupo não encontrado".into());
        }

        let mut common_columns: Option<HashMap<String, String>> = None;

        for item in group_items {
            let local_path_str = item["localPath"].as_str().unwrap_or("");
            let p = PathBuf::from(local_path_str);
            let local_path = if p.is_relative() {
                base_downloads_path.join(p)
            } else {
                p
            };
            let files = item["files"].as_array().ok_or("No files in item")?;

            let csv_file = files
                .iter()
                .find(|f| f.as_str().unwrap_or("").to_lowercase().ends_with(".csv"))
                .map(|f| f.as_str().unwrap_or(""));

            if let Some(file_name) = csv_file {
                let full_path = local_path.join(file_name);
                if !full_path.exists() {
                    continue;
                }

                let file = File::open(&full_path).map_err(|e| e.to_string())?;
                let delimiter = detect_delimiter_from_file(&full_path);
                let mut rdr = csv::ReaderBuilder::new()
                    .has_headers(true)
                    .delimiter(delimiter)
                    .from_reader(file);

                let headers = rdr.headers().map_err(|e| e.to_string())?.clone();

                let mut current_file_cols = HashMap::new();
                if let Some(result) = rdr.records().next() {
                    let record = result.map_err(|e| e.to_string())?;
                    for (i, header) in headers.iter().enumerate() {
                        let val = record.get(i).unwrap_or("");
                        let col_type = if val.parse::<f64>().is_ok() { "Número" } else { "Texto" };
                        current_file_cols.insert(header.trim().to_string(), col_type.to_string());
                    }
                }

                if let Some(common) = common_columns {
                    let mut new_common = HashMap::new();
                    for (name, col_type) in common {
                        if current_file_cols.contains_key(&name) {
                            new_common.insert(name, col_type);
                        }
                    }
                    common_columns = Some(new_common);
                } else {
                    common_columns = Some(current_file_cols);
                }
            }
        }

        let result = common_columns
            .unwrap_or_default()
            .into_iter()
            .map(|(name, col_type)| serde_json::json!({ "name": name, "type": col_type }))
            .collect();

        Ok(result)
    }
}
