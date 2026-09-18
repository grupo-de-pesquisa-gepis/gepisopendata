use crate::models::{
    IbgeCnefeDownloadProgress, IbgeCnefeDownloadRequest, IbgeCnefeOverview, IbgeCnefeUfStatus,
};
use futures::StreamExt;
use std::fs::{self, File};
use std::io::Write;
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
