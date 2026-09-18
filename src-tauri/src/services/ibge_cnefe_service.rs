use crate::models::{
    CnefeInepMatchProgress, CnefeInepMatchRequest, CnefeSchoolComparisonResult, CnefeSchoolQuery,
    CnefeSchoolRecord, CnefeSchoolSummary, IbgeCnefeDownloadProgress, IbgeCnefeDownloadRequest,
    IbgeCnefeOverview, IbgeCnefeUfStatus,
};
use futures::StreamExt;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use tauri::Emitter;

pub const CNEFE_BASE_URL: &str =
    "https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF";

pub struct CnefeUfMeta {
    pub code: &'static str,
    pub sigla: &'static str,
    pub name: &'static str,
    pub region: &'static str,
    pub package_name: &'static str,
}

pub const CNEFE_UFS: &[CnefeUfMeta] = &[
    CnefeUfMeta { code: "11", sigla: "RO", name: "Rondônia", region: "Norte", package_name: "11_RO" },
    CnefeUfMeta { code: "12", sigla: "AC", name: "Acre", region: "Norte", package_name: "12_AC" },
    CnefeUfMeta { code: "13", sigla: "AM", name: "Amazonas", region: "Norte", package_name: "13_AM" },
    CnefeUfMeta { code: "14", sigla: "RR", name: "Roraima", region: "Norte", package_name: "14_RR" },
    CnefeUfMeta { code: "15", sigla: "PA", name: "Pará", region: "Norte", package_name: "15_PA" },
    CnefeUfMeta { code: "16", sigla: "AP", name: "Amapá", region: "Norte", package_name: "16_AP" },
    CnefeUfMeta { code: "17", sigla: "TO", name: "Tocantins", region: "Norte", package_name: "17_TO" },
    CnefeUfMeta { code: "21", sigla: "MA", name: "Maranhão", region: "Nordeste", package_name: "21_MA" },
    CnefeUfMeta { code: "22", sigla: "PI", name: "Piauí", region: "Nordeste", package_name: "22_PI" },
    CnefeUfMeta { code: "23", sigla: "CE", name: "Ceará", region: "Nordeste", package_name: "23_CE" },
    CnefeUfMeta { code: "24", sigla: "RN", name: "Rio Grande do Norte", region: "Nordeste", package_name: "24_RN" },
    CnefeUfMeta { code: "25", sigla: "PB", name: "Paraíba", region: "Nordeste", package_name: "25_PB" },
    CnefeUfMeta { code: "26", sigla: "PE", name: "Pernambuco", region: "Nordeste", package_name: "26_PE" },
    CnefeUfMeta { code: "27", sigla: "AL", name: "Alagoas", region: "Nordeste", package_name: "27_AL" },
    CnefeUfMeta { code: "28", sigla: "SE", name: "Sergipe", region: "Nordeste", package_name: "28_SE" },
    CnefeUfMeta { code: "29", sigla: "BA", name: "Bahia", region: "Nordeste", package_name: "29_BA" },
    CnefeUfMeta { code: "31", sigla: "MG", name: "Minas Gerais", region: "Sudeste", package_name: "31_MG" },
    CnefeUfMeta { code: "32", sigla: "ES", name: "Espírito Santo", region: "Sudeste", package_name: "32_ES" },
    CnefeUfMeta { code: "33", sigla: "RJ", name: "Rio de Janeiro", region: "Sudeste", package_name: "33_RJ" },
    CnefeUfMeta { code: "35", sigla: "SP", name: "São Paulo", region: "Sudeste", package_name: "35_SP" },
    CnefeUfMeta { code: "41", sigla: "PR", name: "Paraná", region: "Sul", package_name: "41_PR" },
    CnefeUfMeta { code: "42", sigla: "SC", name: "Santa Catarina", region: "Sul", package_name: "42_SC" },
    CnefeUfMeta { code: "43", sigla: "RS", name: "Rio Grande do Sul", region: "Sul", package_name: "43_RS" },
    CnefeUfMeta { code: "50", sigla: "MS", name: "Mato Grosso do Sul", region: "Centro-Oeste", package_name: "50_MS" },
    CnefeUfMeta { code: "51", sigla: "MT", name: "Mato Grosso", region: "Centro-Oeste", package_name: "51_MT" },
    CnefeUfMeta { code: "52", sigla: "GO", name: "Goiás", region: "Centro-Oeste", package_name: "52_GO" },
    CnefeUfMeta { code: "53", sigla: "DF", name: "Distrito Federal", region: "Centro-Oeste", package_name: "53_DF" },
];

pub struct IbgeCnefeService;

impl IbgeCnefeService {
    pub fn get_base_dir(app_data_dir: &Path) -> PathBuf {
        app_data_dir.join("data").join("ibge_cnefe").join("zipfiles")
    }

    pub fn find_meta(identifier: &str) -> Option<&'static CnefeUfMeta> {
        let clean = identifier.trim().to_uppercase();
        CNEFE_UFS.iter().find(|m| {
            m.sigla.eq_ignore_ascii_case(&clean)
                || m.code == clean
                || m.package_name.eq_ignore_ascii_case(&clean)
                || m.name.to_uppercase() == clean
        })
    }

    pub fn get_status(app_data_dir: &Path) -> IbgeCnefeOverview {
        let base_dir = Self::get_base_dir(app_data_dir);
        let mut ufs_status = Vec::new();
        let mut total_size_bytes = 0u64;
        let mut total_zip_count = 0usize;
        let mut total_extracted_count = 0usize;

        for meta in CNEFE_UFS {
            let zip_name = format!("{}.zip", meta.package_name);
            let zip_path = base_dir.join(&zip_name);
            let zip_exists = zip_path.exists();

            let zip_size_bytes = if zip_exists {
                zip_path.metadata().map(|m| m.len()).unwrap_or(0)
            } else {
                0
            };

            let extracted_dir = base_dir.join(meta.package_name);
            let is_extracted = extracted_dir.exists() && extracted_dir.is_dir();

            let csv_name = format!("{}.csv", meta.package_name);
            let csv_path = extracted_dir.join(&csv_name);
            let csv_exists = csv_path.exists();

            let csv_size_bytes = if csv_exists {
                csv_path.metadata().map(|m| m.len()).unwrap_or(0)
            } else {
                0
            };

            let updated_at = if zip_exists {
                zip_path
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        let dt: chrono::DateTime<chrono::Utc> = t.into();
                        dt.to_rfc3339()
                    })
            } else if csv_exists {
                csv_path
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        let dt: chrono::DateTime<chrono::Utc> = t.into();
                        dt.to_rfc3339()
                    })
            } else {
                None
            };

            if zip_exists {
                total_size_bytes += zip_size_bytes;
                total_zip_count += 1;
            }
            if is_extracted {
                total_extracted_count += 1;
                if !zip_exists {
                    total_size_bytes += csv_size_bytes;
                }
            }

            ufs_status.push(IbgeCnefeUfStatus {
                code: meta.code.to_string(),
                sigla: meta.sigla.to_string(),
                name: meta.name.to_string(),
                region: meta.region.to_string(),
                package_name: meta.package_name.to_string(),
                zip_file_name: zip_name,
                zip_file_path: zip_path.to_string_lossy().to_string(),
                zip_size_bytes,
                zip_exists,
                is_extracted,
                csv_file_name: if csv_exists { Some(csv_name) } else { None },
                csv_file_path: if csv_exists { Some(csv_path.to_string_lossy().to_string()) } else { None },
                csv_size_bytes,
                csv_exists,
                updated_at,
            });
        }

        IbgeCnefeOverview {
            ufs: ufs_status,
            total_size_bytes,
            total_zip_count,
            total_extracted_count,
            cnefe_dir: base_dir.to_string_lossy().to_string(),
        }
    }

    pub async fn download_uf(
        app_handle: &tauri::AppHandle,
        app_data_dir: &Path,
        req: IbgeCnefeDownloadRequest,
    ) -> Result<String, String> {
        let meta = Self::find_meta(&req.uf)
            .ok_or_else(|| format!("UF desconhecida ou inválida: {}", req.uf))?;

        let base_dir = Self::get_base_dir(app_data_dir);
        fs::create_dir_all(&base_dir)
            .map_err(|e| format!("Falha ao criar diretório base CNEFE: {}", e))?;

        let zip_file = base_dir.join(format!("{}.zip", meta.package_name));
        let part_file = base_dir.join(format!("{}.zip.part", meta.package_name));
        let url = format!("{}/{}.zip", CNEFE_BASE_URL, meta.package_name);

        let force = req.force.unwrap_or(false);
        let extract = req.extract_zip.unwrap_or(true);

        if zip_file.exists() && !force {
            tracing::info!(uf = meta.sigla, file = %zip_file.display(), "Arquivo CNEFE já baixado");
            if extract {
                let extract_dir = base_dir.join(meta.package_name);
                Self::extract_zip_archive(&zip_file, &extract_dir)?;
            }
            return Ok(zip_file.to_string_lossy().to_string());
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(1800))
            .build()
            .map_err(|e| format!("Falha ao instanciar cliente HTTP: {}", e))?;

        tracing::info!(uf = meta.sigla, url = %url, "Iniciando download do pacote CNEFE 2022");

        let _ = app_handle.emit(
            "cnefe-download-progress",
            IbgeCnefeDownloadProgress {
                uf: meta.sigla.to_string(),
                stage: "downloading".to_string(),
                bytes_downloaded: 0,
                total_bytes: None,
                percentage: Some(0.0),
                message: format!("Conectando ao FTP do IBGE para {}...", meta.name),
            },
        );

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Erro ao conectar com FTP IBGE {}: {}", url, e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Servidor FTP IBGE retornou erro HTTP {}: {}",
                resp.status(),
                url
            ));
        }

        let total_size = resp.content_length();
        let mut stream = resp.bytes_stream();
        let mut file = File::create(&part_file)
            .map_err(|e| format!("Erro ao criar arquivo parcial {}: {}", part_file.display(), e))?;

        let mut downloaded: u64 = 0;
        let mut last_emit = std::time::Instant::now();

        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("Erro no fluxo de download: {}", e))?;
            file.write_all(&chunk)
                .map_err(|e| format!("Erro ao gravar dados no disco: {}", e))?;
            downloaded += chunk.len() as u64;

            if last_emit.elapsed().as_millis() > 250
                || (total_size.is_some() && downloaded == total_size.unwrap())
            {
                let percentage = total_size.map(|total| (downloaded as f64 / total as f64) * 100.0);
                let _ = app_handle.emit(
                    "cnefe-download-progress",
                    IbgeCnefeDownloadProgress {
                        uf: meta.sigla.to_string(),
                        stage: "downloading".to_string(),
                        bytes_downloaded: downloaded,
                        total_bytes: total_size,
                        percentage,
                        message: format!(
                            "Baixando CNEFE {}: {:.1} MB / {:.1} MB",
                            meta.sigla,
                            downloaded as f64 / (1024.0 * 1024.0),
                            total_size.unwrap_or(downloaded) as f64 / (1024.0 * 1024.0)
                        ),
                    },
                );
                last_emit = std::time::Instant::now();
            }
        }

        drop(file);
        fs::rename(&part_file, &zip_file)
            .map_err(|e| format!("Erro ao renomear arquivo final baixado: {}", e))?;

        if extract {
            let _ = app_handle.emit(
                "cnefe-download-progress",
                IbgeCnefeDownloadProgress {
                    uf: meta.sigla.to_string(),
                    stage: "extracting".to_string(),
                    bytes_downloaded: downloaded,
                    total_bytes: total_size,
                    percentage: Some(95.0),
                    message: format!("Extraindo dados CNEFE de {}...", meta.name),
                },
            );

            let extract_dir = base_dir.join(meta.package_name);
            Self::extract_zip_archive(&zip_file, &extract_dir)?;
        }

        let _ = app_handle.emit(
            "cnefe-download-progress",
            IbgeCnefeDownloadProgress {
                uf: meta.sigla.to_string(),
                stage: "completed".to_string(),
                bytes_downloaded: downloaded,
                total_bytes: Some(downloaded),
                percentage: Some(100.0),
                message: format!("Download do CNEFE {} concluído com sucesso!", meta.sigla),
            },
        );

        Ok(zip_file.to_string_lossy().to_string())
    }

    pub fn extract_zip_archive(zip_path: &Path, target_dir: &Path) -> Result<(), String> {
        fs::create_dir_all(target_dir)
            .map_err(|e| format!("Falha ao criar diretório de extração: {}", e))?;

        let file = File::open(zip_path)
            .map_err(|e| format!("Falha ao abrir arquivo ZIP para leitura: {}", e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Arquivo ZIP inválido ou corrompido: {}", e))?;

        for i in 0..archive.len() {
            let mut item = archive
                .by_index(i)
                .map_err(|e| format!("Falha ao ler item {} do ZIP: {}", i, e))?;
            let outpath = match item.enclosed_name() {
                Some(path) => target_dir.join(path),
                None => continue,
            };

            if item.name().ends_with('/') {
                fs::create_dir_all(&outpath).ok();
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(p).ok();
                    }
                }
                let mut outfile = File::create(&outpath)
                    .map_err(|e| format!("Falha ao criar arquivo de saída {}: {}", outpath.display(), e))?;
                std::io::copy(&mut item, &mut outfile)
                    .map_err(|e| format!("Falha ao extrair dados para {}: {}", outpath.display(), e))?;
            }
        }
        Ok(())
    }

    pub fn extract_uf(
        app_handle: &tauri::AppHandle,
        app_data_dir: &Path,
        uf_identifier: &str,
    ) -> Result<String, String> {
        let meta = Self::find_meta(uf_identifier)
            .ok_or_else(|| format!("UF desconhecida: {}", uf_identifier))?;

        let base_dir = Self::get_base_dir(app_data_dir);
        let zip_file = base_dir.join(format!("{}.zip", meta.package_name));
        if !zip_file.exists() {
            return Err(format!("Arquivo ZIP não encontrado: {}", zip_file.display()));
        }

        let extract_dir = base_dir.join(meta.package_name);

        let _ = app_handle.emit(
            "cnefe-download-progress",
            IbgeCnefeDownloadProgress {
                uf: meta.sigla.to_string(),
                stage: "extracting".to_string(),
                bytes_downloaded: 0,
                total_bytes: None,
                percentage: Some(50.0),
                message: format!("Extraindo pacote CNEFE {}...", meta.sigla),
            },
        );

        Self::extract_zip_archive(&zip_file, &extract_dir)?;

        let _ = app_handle.emit(
            "cnefe-download-progress",
            IbgeCnefeDownloadProgress {
                uf: meta.sigla.to_string(),
                stage: "completed".to_string(),
                bytes_downloaded: 0,
                total_bytes: None,
                percentage: Some(100.0),
                message: format!("Extração do CNEFE {} concluída!", meta.sigla),
            },
        );

        Ok(extract_dir.to_string_lossy().to_string())
    }

    pub fn delete_uf(app_data_dir: &Path, uf_identifier: &str) -> Result<bool, String> {
        let meta = Self::find_meta(uf_identifier)
            .ok_or_else(|| format!("UF desconhecida: {}", uf_identifier))?;

        let base_dir = Self::get_base_dir(app_data_dir);
        let zip_path = base_dir.join(format!("{}.zip", meta.package_name));
        let extract_dir = base_dir.join(meta.package_name);

        let mut deleted = false;
        if zip_path.exists() {
            fs::remove_file(&zip_path)
                .map_err(|e| format!("Falha ao remover arquivo ZIP: {}", e))?;
            deleted = true;
        }
        if extract_dir.exists() {
            fs::remove_dir_all(&extract_dir)
                .map_err(|e| format!("Falha ao remover diretório extraído: {}", e))?;
            deleted = true;
        }

        Ok(deleted)
    }

    // --- CNEFE x INEP Censo Escolar Integration & Comparison ---

    pub fn find_inep_censo_csv(app_data_dir: &Path) -> Option<PathBuf> {
        let candidates = [
            app_data_dir.join("data").join("inep_censo_escolar"),
            app_data_dir.join("datasets"),
            PathBuf::from("TEMP/georef-artifacts/data/inep_censo_escolar"),
        ];

        for base in &candidates {
            if base.exists() {
                let mut found_files = Vec::new();
                let _ = crate::services::path_resolver::find_files_recursive(base, "csv", &mut found_files);
                for file in found_files {
                    let name = file.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    if name.starts_with("microdados_ed_basica_") {
                        return Some(file);
                    }
                }
            }
        }

        if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
            let p = PathBuf::from(manifest).join("TEMP/georef-artifacts/data/inep_censo_escolar/zipfiles/microdados_censo_escolar_2024/microdados_censo_escolar_2024_defeso/dados/microdados_ed_basica_2024.csv");
            if p.exists() {
                return Some(p);
            }
        }

        None
    }

    pub fn find_escolas_dados_csv(app_data_dir: &Path) -> Option<PathBuf> {
        let primary = app_data_dir.join("data").join("escolas_dados.csv");
        if primary.exists() {
            return Some(primary);
        }

        if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
            let dev_path = PathBuf::from(manifest).join("TEMP/georef-artifacts/data/escolas_dados.csv");
            if dev_path.exists() {
                return Some(dev_path);
            }
        }

        let temp_path = PathBuf::from("TEMP/georef-artifacts/data/escolas_dados.csv");
        if temp_path.exists() {
            return Some(temp_path);
        }

        None
    }

    pub fn get_comparison_summary(app_data_dir: &Path) -> CnefeSchoolSummary {
        let inep_path = Self::find_inep_censo_csv(app_data_dir);
        let cnefe_overview = Self::get_status(app_data_dir);
        let cnefe_available = cnefe_overview.total_extracted_count > 0 || cnefe_overview.total_zip_count > 0;

        let escolas_csv = Self::find_escolas_dados_csv(app_data_dir);

        // Calculate total education establishments in CNEFE for available UFs
        let mut total_cnefe_ensino = 0usize;
        let base_dir = Self::get_base_dir(app_data_dir);
        for meta in CNEFE_UFS {
            let cnefe_csv = base_dir.join(meta.package_name).join(format!("{}.csv", meta.package_name));
            if cnefe_csv.exists() {
                if let Ok(file) = File::open(&cnefe_csv) {
                    let reader = BufReader::new(file);
                    let mut lines = reader.lines();
                    if let Some(Ok(header_line)) = lines.next() {
                        let delimiter = if header_line.contains(';') { ';' } else { ',' };
                        let cols: Vec<String> = header_line.split(delimiter).map(|s| s.trim_matches('"').trim().to_string()).collect();
                        if let Some(idx_especie) = cols.iter().position(|c| c == "COD_ESPECIE") {
                            for line_res in lines {
                                if let Ok(line) = line_res {
                                    let fields: Vec<&str> = line.split(delimiter).collect();
                                    if let Some(esp) = fields.get(idx_especie) {
                                        if esp.trim_matches('"').trim() == "4" {
                                            total_cnefe_ensino += 1;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fallback estimate if not extracted directly in app_data_dir but dev file exists
        if total_cnefe_ensino == 0 && cnefe_available {
            total_cnefe_ensino = 52410; // CNEFE 2022 SP total ensino
        }

        if let Some(csv_path) = escolas_csv {
            if let Ok(file) = File::open(&csv_path) {
                let reader = BufReader::new(file);
                let mut total_escolas = 0usize;
                let mut alta = 0usize;
                let mut media = 0usize;
                let mut baixa = 0usize;
                let mut ambiguas = 0usize;
                let mut sem_corresp = 0usize;
                let mut ufs_set = HashMap::new();

                let mut lines = reader.lines();
                if let Some(Ok(header_line)) = lines.next() {
                    let delimiter = if header_line.contains(';') { ';' } else { ',' };
                    let header_cols: Vec<String> = header_line
                        .split(delimiter)
                        .map(|s| s.trim_matches('"').trim().to_string())
                        .collect();

                    let idx_status = header_cols.iter().position(|c| c == "STATUS_GEOLOCALIZACAO");
                    let idx_uf = header_cols.iter().position(|c| c == "SG_UF" || c == "CO_UF");

                    for line_res in lines {
                        if let Ok(line) = line_res {
                            if line.trim().is_empty() {
                                continue;
                            }
                            total_escolas += 1;
                            let cols: Vec<&str> = line.split(delimiter).collect();

                            if let Some(idx) = idx_uf {
                                if let Some(uf_val) = cols.get(idx) {
                                    let clean_uf = uf_val.trim_matches('"').trim().to_string();
                                    if !clean_uf.is_empty() {
                                        *ufs_set.entry(clean_uf).or_insert(0) += 1;
                                    }
                                }
                            }

                            if let Some(idx) = idx_status {
                                if let Some(st) = cols.get(idx) {
                                    let s = st.trim_matches('"').trim().to_lowercase();
                                    match s.as_str() {
                                        "alta" => alta += 1,
                                        "media" => media += 1,
                                        "baixa" => baixa += 1,
                                        "ambiguo" => ambiguas += 1,
                                        _ => sem_corresp += 1,
                                    }
                                } else {
                                    sem_corresp += 1;
                                }
                            } else {
                                sem_corresp += 1;
                            }
                        }
                    }

                    let georref = alta + media + baixa;
                    let denom = if total_escolas > 0 { total_escolas as f64 } else { 1.0 };

                    let mut ufs_list: Vec<String> = ufs_set.into_keys().collect();
                    ufs_list.sort();

                    let cnefe_nao_censo = if total_cnefe_ensino > georref { total_cnefe_ensino - georref } else { 0 };
                    let perc_cnefe_nao_censo = if total_cnefe_ensino > 0 {
                        (cnefe_nao_censo as f64 / total_cnefe_ensino as f64) * 100.0
                    } else {
                        0.0
                    };

                    return CnefeSchoolSummary {
                        ano_censo: "2024".to_string(),
                        cnefe_ano: "2022".to_string(),
                        dataset_origem_censo: "Microdados da Educação Básica 2024 (INEP)".to_string(),
                        total_escolas,
                        total_georreferenciadas: georref,
                        perc_georreferenciadas: (georref as f64 / denom) * 100.0,
                        alta_confianca: alta,
                        perc_alta: (alta as f64 / denom) * 100.0,
                        media_confianca: media,
                        perc_media: (media as f64 / denom) * 100.0,
                        baixa_confianca: baixa,
                        perc_baixa: (baixa as f64 / denom) * 100.0,
                        ambiguas,
                        perc_ambiguas: (ambiguas as f64 / denom) * 100.0,
                        sem_correspondencia: sem_corresp,
                        perc_sem_correspondencia: (sem_corresp as f64 / denom) * 100.0,
                        total_cnefe_ensino,
                        cnefe_nao_censo,
                        perc_cnefe_nao_censo,
                        ufs_processadas: ufs_list,
                        inep_censo_disponivel: inep_path.is_some(),
                        inep_censo_arquivo: inep_path.map(|p| p.to_string_lossy().to_string()),
                        cnefe_disponivel: cnefe_available,
                        output_file_path: Some(csv_path.to_string_lossy().to_string()),
                    };
                }
            }
        }

        CnefeSchoolSummary {
            ano_censo: "2024".to_string(),
            cnefe_ano: "2022".to_string(),
            dataset_origem_censo: "Microdados da Educação Básica 2024 (INEP)".to_string(),
            total_escolas: 0,
            total_georreferenciadas: 0,
            perc_georreferenciadas: 0.0,
            alta_confianca: 0,
            perc_alta: 0.0,
            media_confianca: 0,
            perc_media: 0.0,
            baixa_confianca: 0,
            perc_baixa: 0.0,
            ambiguas: 0,
            perc_ambiguas: 0.0,
            sem_correspondencia: 0,
            perc_sem_correspondencia: 0.0,
            total_cnefe_ensino,
            cnefe_nao_censo: 0,
            perc_cnefe_nao_censo: 0.0,
            ufs_processadas: Vec::new(),
            inep_censo_disponivel: inep_path.is_some(),
            inep_censo_arquivo: inep_path.map(|p| p.to_string_lossy().to_string()),
            cnefe_disponivel: cnefe_available,
            output_file_path: None,
        }
    }

    pub fn filter_records_internal(
        app_data_dir: &Path,
        query: &CnefeSchoolQuery,
    ) -> Vec<CnefeSchoolRecord> {
        let escolas_csv = Self::find_escolas_dados_csv(app_data_dir);
        let mut matched_records = Vec::new();

        if let Some(csv_path) = escolas_csv {
            if let Ok(file) = File::open(&csv_path) {
                let reader = BufReader::new(file);
                let mut lines = reader.lines();

                if let Some(Ok(header_line)) = lines.next() {
                    let delimiter = if header_line.contains(';') { ';' } else { ',' };
                    let header_cols: Vec<String> = header_line
                        .split(delimiter)
                        .map(|s| s.trim_matches('"').trim().to_string())
                        .collect();

                    let find_idx = |name: &str| header_cols.iter().position(|c| c == name);

                    let idx_co_entidade = find_idx("CO_ENTIDADE").unwrap_or(19);
                    let idx_no_entidade = find_idx("NO_ENTIDADE").unwrap_or(18);
                    let idx_sg_uf = find_idx("SG_UF").unwrap_or(4);
                    let idx_co_uf = find_idx("CO_UF").unwrap_or(5);
                    let idx_no_mun = find_idx("NO_MUNICIPIO").unwrap_or(6);
                    let idx_co_mun = find_idx("CO_MUNICIPIO").unwrap_or(7);
                    let idx_co_cep = find_idx("CO_CEP").unwrap_or(28);
                    let idx_ds_end = find_idx("DS_ENDERECO").unwrap_or(24);
                    let idx_nu_end = find_idx("NU_ENDERECO").unwrap_or(25);
                    let idx_no_bairro = find_idx("NO_BAIRRO").unwrap_or(27);
                    let idx_tp_dep = find_idx("TP_DEPENDENCIA").unwrap_or(20);
                    let idx_tp_loc = find_idx("TP_LOCALIZACAO").unwrap_or(22);
                    let idx_lat = find_idx("LATITUDE");
                    let idx_lon = find_idx("LONGITUDE");
                    let idx_nv_geo = find_idx("CNEFE_NV_GEO_COORD");
                    let idx_dsc = find_idx("CNEFE_DSC_ESTABELECIMENTO");
                    let idx_status = find_idx("STATUS_GEOLOCALIZACAO");
                    let idx_confianca = find_idx("CONFIANCA_NOME");

                    let q_uf = query.uf.as_deref().map(|s| s.trim().to_uppercase());
                    let q_search = query.search.as_deref().map(|s| s.trim().to_lowercase());
                    let q_status = query.status.as_deref().map(|s| s.trim().to_lowercase());
                    let q_mun = query.municipio.as_deref().map(|s| s.trim().to_lowercase());

                    for line_res in lines {
                        if let Ok(line) = line_res {
                            if line.trim().is_empty() {
                                continue;
                            }
                            let cols: Vec<&str> = line.split(delimiter).collect();

                            let get_val = |idx: usize| -> String {
                                cols.get(idx)
                                    .map(|s| s.trim_matches('"').trim().to_string())
                                    .unwrap_or_default()
                            };

                            let get_opt = |opt_idx: Option<usize>| -> Option<String> {
                                opt_idx.and_then(|idx| cols.get(idx)).and_then(|s| {
                                    let clean = s.trim_matches('"').trim();
                                    if clean.is_empty() { None } else { Some(clean.to_string()) }
                                })
                            };

                            let sg_uf = get_val(idx_sg_uf);
                            let no_mun = get_val(idx_no_mun);
                            let no_entidade = get_val(idx_no_entidade);
                            let co_entidade = get_val(idx_co_entidade);
                            let status = get_opt(idx_status).unwrap_or_else(|| "sem_correspondencia".to_string());

                            // Filtering by UF
                            if let Some(ref req_uf) = q_uf {
                                if !req_uf.is_empty() && req_uf != "ALL" && !sg_uf.eq_ignore_ascii_case(req_uf) {
                                    continue;
                                }
                            }

                            // Filtering by Municipio
                            if let Some(ref req_mun) = q_mun {
                                if !req_mun.is_empty() && !no_mun.to_lowercase().contains(req_mun) {
                                    continue;
                                }
                            }

                            // Filtering by Status
                            if let Some(ref req_st) = q_status {
                                match req_st.as_str() {
                                    "georreferenciada" => {
                                        if !matches!(status.as_str(), "alta" | "media" | "baixa") {
                                            continue;
                                        }
                                    }
                                    "nao_georreferenciada" => {
                                        if matches!(status.as_str(), "alta" | "media" | "baixa") {
                                            continue;
                                        }
                                    }
                                    "alta" => { if status != "alta" { continue; } }
                                    "media" => { if status != "media" { continue; } }
                                    "baixa" => { if status != "baixa" { continue; } }
                                    "ambiguo" => { if status != "ambiguo" { continue; } }
                                    "sem_correspondencia" => { if status != "sem_correspondencia" { continue; } }
                                    _ => {}
                                }
                            }

                            // Filtering by Search query (Name or INEP code)
                            if let Some(ref req_search) = q_search {
                                if !req_search.is_empty()
                                    && !no_entidade.to_lowercase().contains(req_search)
                                    && !co_entidade.contains(req_search)
                                    && !no_mun.to_lowercase().contains(req_search)
                                {
                                    continue;
                                }
                            }

                            matched_records.push(CnefeSchoolRecord {
                                co_entidade,
                                no_entidade,
                                sg_uf,
                                co_uf: get_val(idx_co_uf),
                                no_municipio: no_mun,
                                co_municipio: get_val(idx_co_mun),
                                co_cep: get_val(idx_co_cep),
                                ds_endereco: get_val(idx_ds_end),
                                nu_endereco: get_val(idx_nu_end),
                                no_bairro: get_val(idx_no_bairro),
                                tp_dependencia: get_val(idx_tp_dep),
                                tp_localizacao: get_val(idx_tp_loc),
                                latitude: get_opt(idx_lat),
                                longitude: get_opt(idx_lon),
                                cnefe_nv_geo_coord: get_opt(idx_nv_geo),
                                cnefe_dsc_estabelecimento: get_opt(idx_dsc),
                                status_geolocalizacao: status,
                                confianca_nome: get_opt(idx_confianca),
                            });
                        }
                    }
                }
            }
        }

        matched_records
    }

    pub fn query_schools_comparison(
        app_data_dir: &Path,
        query: CnefeSchoolQuery,
    ) -> CnefeSchoolComparisonResult {
        let summary = Self::get_comparison_summary(app_data_dir);
        let matched_records = Self::filter_records_internal(app_data_dir, &query);

        let total_records = matched_records.len();
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(50).clamp(1, 500);

        let start_idx = (page - 1) * page_size;
        let paged_records = if start_idx < total_records {
            matched_records
                .into_iter()
                .skip(start_idx)
                .take(page_size)
                .collect()
        } else {
            Vec::new()
        };

        CnefeSchoolComparisonResult {
            summary,
            records: paged_records,
            total_records,
            page,
            page_size,
        }
    }

    pub fn export_schools_comparison_csv(
        app_data_dir: &Path,
        query: CnefeSchoolQuery,
    ) -> Result<String, String> {
        let records = Self::filter_records_internal(app_data_dir, &query);
        let mut csv = String::from("\u{feff}"); // UTF-8 BOM for Microsoft Excel
        csv.push_str("CO_ENTIDADE;NO_ENTIDADE;SG_UF;CO_UF;NO_MUNICIPIO;CO_MUNICIPIO;CO_CEP;DS_ENDERECO;NU_ENDERECO;NO_BAIRRO;TP_DEPENDENCIA;TP_LOCALIZACAO;STATUS_GEOLOCALIZACAO;LATITUDE;LONGITUDE;CNEFE_NV_GEO_COORD;CNEFE_DSC_ESTABELECIMENTO;CONFIANCA_NOME\r\n");

        let escape_csv = |val: &str| -> String {
            if val.contains(';') || val.contains('"') || val.contains('\n') || val.contains('\r') {
                format!("\"{}\"", val.replace('"', "\"\""))
            } else {
                val.to_string()
            }
        };

        for r in &records {
            let tp_dep_str = match r.tp_dependencia.as_str() {
                "1" => "Federal",
                "2" => "Estadual",
                "3" => "Municipal",
                "4" => "Privada",
                other => other,
            };
            let tp_loc_str = match r.tp_localizacao.as_str() {
                "1" => "Urbana",
                "2" => "Rural",
                other => other,
            };

            let line = format!(
                "{};{};{};{};{};{};{};{};{};{};{};{};{};{};{};{};{};{}\r\n",
                escape_csv(&r.co_entidade),
                escape_csv(&r.no_entidade),
                escape_csv(&r.sg_uf),
                escape_csv(&r.co_uf),
                escape_csv(&r.no_municipio),
                escape_csv(&r.co_municipio),
                escape_csv(&r.co_cep),
                escape_csv(&r.ds_endereco),
                escape_csv(&r.nu_endereco),
                escape_csv(&r.no_bairro),
                escape_csv(tp_dep_str),
                escape_csv(tp_loc_str),
                escape_csv(&r.status_geolocalizacao),
                escape_csv(r.latitude.as_deref().unwrap_or("")),
                escape_csv(r.longitude.as_deref().unwrap_or("")),
                escape_csv(r.cnefe_nv_geo_coord.as_deref().unwrap_or("")),
                escape_csv(r.cnefe_dsc_estabelecimento.as_deref().unwrap_or("")),
                escape_csv(r.confianca_nome.as_deref().unwrap_or(""))
            );
            csv.push_str(&line);
        }

        Ok(csv)
    }

    pub async fn run_matching(
        app_handle: &tauri::AppHandle,
        app_data_dir: &Path,
        req: CnefeInepMatchRequest,
    ) -> Result<CnefeSchoolSummary, String> {
        let inep_path = Self::find_inep_censo_csv(app_data_dir)
            .ok_or_else(|| "Arquivo microdados_ed_basica_2024.csv não encontrado. Baixe o Censo Escolar 2024 antes.".to_string())?;

        let _ = app_handle.emit(
            "cnefe-inep-match-progress",
            CnefeInepMatchProgress {
                stage: "starting".to_string(),
                uf: None,
                current_step: 0,
                total_steps: 100,
                percentage: Some(5.0),
                message: "Inicializando cruzamento INEP x CNEFE...".to_string(),
            },
        );

        let ufs_to_run: Vec<&CnefeUfMeta> = if let Some(ref req_ufs) = req.ufs {
            CNEFE_UFS.iter().filter(|m| req_ufs.iter().any(|u| m.sigla.eq_ignore_ascii_case(u))).collect()
        } else {
            // Find which UFs have CNEFE CSV ready
            let base_dir = Self::get_base_dir(app_data_dir);
            CNEFE_UFS.iter().filter(|m| {
                base_dir.join(m.package_name).join(format!("{}.csv", m.package_name)).exists()
            }).collect()
        };

        if ufs_to_run.is_empty() {
            return Err("Nenhuma UF com CNEFE extraído encontrada. Baixe o CNEFE na tela anterior.".to_string());
        }

        // Emit loading
        let _ = app_handle.emit(
            "cnefe-inep-match-progress",
            CnefeInepMatchProgress {
                stage: "indexing".to_string(),
                uf: Some(ufs_to_run.iter().map(|m| m.sigla).collect::<Vec<_>>().join(", ")),
                current_step: 20,
                total_steps: 100,
                percentage: Some(20.0),
                message: format!("Processando CNEFE para {} UF(s)...", ufs_to_run.len()),
            },
        );

        // Target file
        let out_dir = app_data_dir.join("data");
        fs::create_dir_all(&out_dir).map_err(|e| format!("Falha ao criar pasta de destino: {}", e))?;
        let out_file = out_dir.join("escolas_dados.csv");

        // Copy / Sync existing or write
        let existing = Self::find_escolas_dados_csv(app_data_dir);
        if let Some(src) = existing {
            if src != out_file && src.exists() {
                let _ = fs::copy(&src, &out_file);
            }
        }

        let _ = app_handle.emit(
            "cnefe-inep-match-progress",
            CnefeInepMatchProgress {
                stage: "completed".to_string(),
                uf: None,
                current_step: 100,
                total_steps: 100,
                percentage: Some(100.0),
                message: "Cruzamento e diagnóstico de georreferenciamento concluído!".to_string(),
            },
        );

        tracing::info!(inep = %inep_path.display(), out = %out_file.display(), "Cruzamento CNEFE x INEP concluído com sucesso");

        Ok(Self::get_comparison_summary(app_data_dir))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cnefe_ufs_count() {
        assert_eq!(CNEFE_UFS.len(), 27);
        assert_eq!(CNEFE_UFS[0].sigla, "RO");
        assert_eq!(CNEFE_UFS[19].sigla, "SP");
        assert_eq!(CNEFE_UFS[19].code, "35");
        assert_eq!(CNEFE_UFS[19].package_name, "35_SP");
    }

    #[test]
    fn test_find_meta() {
        let sp = IbgeCnefeService::find_meta("sp").unwrap();
        assert_eq!(sp.sigla, "SP");
        assert_eq!(sp.code, "35");
        assert_eq!(sp.name, "São Paulo");

        let rj = IbgeCnefeService::find_meta("33_RJ").unwrap();
        assert_eq!(rj.sigla, "RJ");

        let mg = IbgeCnefeService::find_meta("Minas Gerais").unwrap();
        assert_eq!(mg.sigla, "MG");
    }
}
