use crate::models::{
    IbgeDownloadProgress, IbgeDownloadRequest, IbgeMalhaFileStatus, IbgeMalhaLevelStatus,
    IbgeMalhasOverview,
};
use flate2::read::GzDecoder;
use futures::StreamExt;
use reqwest::header::ACCEPT_ENCODING;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Emitter;

const API_MALHAS: &str = "https://servicodados.ibge.gov.br/api/v4/malhas/paises/BR";
const API_LOCALIDADES: &str = "https://servicodados.ibge.gov.br/api/v1/localidades";
const GEOJSON_MIME: &str = "application/vnd.geo+json";
const GEO_FTP_BASE: &str =
    "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2024/Brasil";

pub struct LevelMeta {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub package_name: &'static str,
    pub expected_features: u32,
    pub intraregiao: Option<&'static str>,
    pub localidades_recurso: Option<&'static str>,
}

pub const LEVELS: &[LevelMeta] = &[
    LevelMeta {
        id: "pais",
        name: "País (Brasil)",
        description: "Contorno territorial completo do Brasil",
        package_name: "BR_Pais_2024",
        expected_features: 1,
        intraregiao: None,
        localidades_recurso: None,
    },
    LevelMeta {
        id: "regioes",
        name: "Grandes Regiões",
        description: "5 Grandes Regiões (Norte, Nordeste, Centro-Oeste, Sudeste, Sul)",
        package_name: "BR_Regioes_2024",
        expected_features: 5,
        intraregiao: Some("regiao"),
        localidades_recurso: Some("regioes"),
    },
    LevelMeta {
        id: "uf",
        name: "Unidades da Federação",
        description: "26 Estados e Distrito Federal",
        package_name: "BR_UF_2024",
        expected_features: 27,
        intraregiao: Some("UF"),
        localidades_recurso: Some("estados"),
    },
    LevelMeta {
        id: "intermediarias",
        name: "Regiões Intermediárias",
        description: "133 Regiões Geográficas Intermediárias",
        package_name: "BR_RG_Intermediarias_2024",
        expected_features: 133,
        intraregiao: Some("regiao-intermediaria"),
        localidades_recurso: Some("regioes-intermediarias"),
    },
    LevelMeta {
        id: "imediatas",
        name: "Regiões Imediatas",
        description: "510 Regiões Geográficas Imediatas",
        package_name: "BR_RG_Imediatas_2024",
        expected_features: 510,
        intraregiao: Some("regiao-imediata"),
        localidades_recurso: Some("regioes-imediatas"),
    },
    LevelMeta {
        id: "municipios",
        name: "Municípios do Brasil",
        description: "Todos os 5.571 Municípios do Brasil",
        package_name: "BR_Municipios_2024",
        expected_features: 5571,
        intraregiao: Some("municipio"),
        localidades_recurso: Some("municipios"),
    },
];

pub const QUALITIES: &[&str] = &["minima", "intermediaria", "maxima"];

pub struct IbgeMalhasService;

impl IbgeMalhasService {
    pub fn get_base_dir(app_data_dir: &Path) -> PathBuf {
        app_data_dir.join("data").join("ibge_malha_municipal")
    }

    pub fn get_geojson_dir(app_data_dir: &Path) -> PathBuf {
        Self::get_base_dir(app_data_dir).join("geojsonfiles")
    }

    pub fn get_shapefile_dir(app_data_dir: &Path) -> PathBuf {
        Self::get_base_dir(app_data_dir).join("zipfiles")
    }

    pub fn get_status(app_data_dir: &Path) -> IbgeMalhasOverview {
        let geojson_dir = Self::get_geojson_dir(app_data_dir);
        let shapefile_dir = Self::get_shapefile_dir(app_data_dir);

        let mut levels_status = Vec::new();
        let mut total_size_bytes = 0u64;
        let mut total_files_count = 0usize;

        for meta in LEVELS {
            let mut geojson_files = Vec::new();
            for quality in QUALITIES {
                let file_name = format!("{}_{}.geojson", meta.package_name, quality);
                let file_path = geojson_dir.join(&file_name);
                let exists = file_path.exists();
                let size_bytes = if exists {
                    file_path.metadata().map(|m| m.len()).unwrap_or(0)
                } else {
                    0
                };
                let updated_at = if exists {
                    file_path
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

                if exists {
                    total_size_bytes += size_bytes;
                    total_files_count += 1;
                }

                geojson_files.push(IbgeMalhaFileStatus {
                    format: "geojson".to_string(),
                    quality: Some(quality.to_string()),
                    file_name,
                    file_path: file_path.to_string_lossy().to_string(),
                    size_bytes,
                    exists,
                    is_extracted: false,
                    updated_at,
                });
            }

            // Shapefile ZIP & folder status
            let zip_name = format!("{}.zip", meta.package_name);
            let zip_path = shapefile_dir.join(&zip_name);
            let zip_exists = zip_path.exists();
            let extracted_dir = shapefile_dir.join(meta.package_name);
            let is_extracted = extracted_dir.exists() && extracted_dir.is_dir();

            let zip_size = if zip_exists {
                zip_path.metadata().map(|m| m.len()).unwrap_or(0)
            } else {
                0
            };
            let zip_updated_at = if zip_exists {
                zip_path
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
                total_size_bytes += zip_size;
                total_files_count += 1;
            }

            let shapefile_status = Some(IbgeMalhaFileStatus {
                format: "shapefile".to_string(),
                quality: None,
                file_name: zip_name,
                file_path: zip_path.to_string_lossy().to_string(),
                size_bytes: zip_size,
                exists: zip_exists,
                is_extracted,
                updated_at: zip_updated_at,
            });

            levels_status.push(IbgeMalhaLevelStatus {
                id: meta.id.to_string(),
                name: meta.name.to_string(),
                description: meta.description.to_string(),
                package_name: meta.package_name.to_string(),
                expected_features: meta.expected_features,
                geojson_files,
                shapefile: shapefile_status,
            });
        }

        IbgeMalhasOverview {
            levels: levels_status,
            total_size_bytes,
            total_files_count,
            malhas_dir: Self::get_base_dir(app_data_dir)
                .to_string_lossy()
                .to_string(),
        }
    }

    pub fn build_geojson_url(intraregiao: Option<&str>, quality: &str) -> String {
        let mut url = format!(
            "{}?formato={}&qualidade={}",
            API_MALHAS, GEOJSON_MIME, quality
        );
        if let Some(intra) = intraregiao {
            url.push_str(&format!("&intrarregiao={}", intra));
        }
        url
    }

    pub fn build_shapefile_url(package_name: &str) -> String {
        format!("{}/{}.zip", GEO_FTP_BASE, package_name)
    }

    pub async fn download_malha(
        app_handle: &tauri::AppHandle,
        app_data_dir: &Path,
        req: IbgeDownloadRequest,
    ) -> Result<String, String> {
        let meta = LEVELS
            .iter()
            .find(|m| m.id == req.level)
            .ok_or_else(|| format!("Nível territorial desconhecido: {}", req.level))?;

        if req.format == "geojson" {
            let quality = req.quality.as_deref().unwrap_or("minima");
            if !QUALITIES.contains(&quality) {
                return Err(format!("Qualidade inválida: {}", quality));
            }
            let enrich = req.enrich_names.unwrap_or(true);
            Self::download_geojson(app_handle, app_data_dir, meta, quality, enrich).await
        } else if req.format == "shapefile" {
            let extract = req.extract_zip.unwrap_or(true);
            Self::download_shapefile(app_handle, app_data_dir, meta, extract).await
        } else {
            Err(format!("Formato não suportado: {}", req.format))
        }
    }

    pub async fn download_geojson(
        app_handle: &tauri::AppHandle,
        app_data_dir: &Path,
        meta: &LevelMeta,
        quality: &str,
        enrich: bool,
    ) -> Result<String, String> {
        let geojson_dir = Self::get_geojson_dir(app_data_dir);
        fs::create_dir_all(&geojson_dir)
            .map_err(|e| format!("Falha ao criar diretório de GeoJSON: {}", e))?;

        let target_file = geojson_dir.join(format!("{}_{}.geojson", meta.package_name, quality));
        let temp_file = geojson_dir.join(format!("{}_{}.geojson.tmp", meta.package_name, quality));

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| format!("Falha ao instanciar cliente HTTP: {}", e))?;

        let url = Self::build_geojson_url(meta.intraregiao, quality);
        tracing::info!(level = meta.id, quality, url = %url, "Iniciando download do GeoJSON IBGE");

        let _ = app_handle.emit(
            "ibge-download-progress",
            IbgeDownloadProgress {
                level: meta.id.to_string(),
                format: "geojson".to_string(),
                stage: "downloading".to_string(),
                bytes_downloaded: 0,
                total_bytes: None,
                percentage: Some(0.0),
                message: format!("Baixando malha GeoJSON para {}...", meta.name),
            },
        );

        let resp = client
            .get(&url)
            .header(ACCEPT_ENCODING, "gzip")
            .send()
            .await
            .map_err(|e| format!("Erro na requisição para {}: {}", url, e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "API de Malhas IBGE retornou erro HTTP {}: {}",
                resp.status(),
                url
            ));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Erro ao receber bytes do GeoJSON: {}", e))?;

        // Descomprime gzip se vier comprimido
        let raw_bytes = if bytes.len() >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b {
            let mut decoder = GzDecoder::new(&bytes[..]);
            let mut decompressed = Vec::new();
            decoder
                .read_to_end(&mut decompressed)
                .map_err(|e| format!("Erro ao descompactar Gzip do GeoJSON: {}", e))?;
            decompressed
        } else {
            bytes.to_vec()
        };

        let mut malha: Value = serde_json::from_slice(&raw_bytes)
            .map_err(|e| format!("Erro ao decodificar JSON retornado pela API: {}", e))?;

        // Enriquecimento com API de Localidades
        if enrich {
            if let Some(recurso) = meta.localidades_recurso {
                let _ = app_handle.emit(
                    "ibge-download-progress",
                    IbgeDownloadProgress {
                        level: meta.id.to_string(),
                        format: "geojson".to_string(),
                        stage: "enriching".to_string(),
                        bytes_downloaded: raw_bytes.len() as u64,
                        total_bytes: Some(raw_bytes.len() as u64),
                        percentage: Some(85.0),
                        message: format!("Enriquecendo {} com nomes e códigos do IBGE...", meta.name),
                    },
                );

                let loc_url = format!("{}/{}", API_LOCALIDADES, recurso);
                if let Ok(loc_resp) = client.get(&loc_url).send().await {
                    if loc_resp.status().is_success() {
                        if let Ok(loc_json) = loc_resp.json::<Value>().await {
                            let names_map = Self::build_localidades_map(&loc_json);
                            Self::enrich_geojson_properties(&mut malha, &names_map);
                        }
                    }
                }
            } else if meta.id == "pais" {
                if let Some(features) = malha.get_mut("features").and_then(|f| f.as_array_mut()) {
                    if let Some(first) = features.get_mut(0) {
                        if let Some(props) = first.get_mut("properties").and_then(|p| p.as_object_mut()) {
                            props.insert("nome".to_string(), json!("Brasil"));
                            props.insert("sigla".to_string(), json!("BR"));
                        }
                    }
                }
            }
        }

        let json_str = serde_json::to_string(&malha)
            .map_err(|e| format!("Erro ao serializar GeoJSON final: {}", e))?;

        fs::write(&temp_file, json_str.as_bytes())
            .map_err(|e| format!("Erro ao gravar arquivo temporário: {}", e))?;

        fs::rename(&temp_file, &target_file)
            .map_err(|e| format!("Erro ao renomear arquivo final: {}", e))?;

        let final_size = target_file.metadata().map(|m| m.len()).unwrap_or(0);
        tracing::info!(
            file = %target_file.display(),
            size_bytes = final_size,
            "Download e processamento do GeoJSON concluído com sucesso"
        );

        let _ = app_handle.emit(
            "ibge-download-progress",
            IbgeDownloadProgress {
                level: meta.id.to_string(),
                format: "geojson".to_string(),
                stage: "completed".to_string(),
                bytes_downloaded: final_size,
                total_bytes: Some(final_size),
                percentage: Some(100.0),
                message: format!("Download do GeoJSON para {} concluído!", meta.name),
            },
        );

        Ok(target_file.to_string_lossy().to_string())
    }

    pub async fn download_shapefile(
        app_handle: &tauri::AppHandle,
        app_data_dir: &Path,
        meta: &LevelMeta,
        extract: bool,
    ) -> Result<String, String> {
        let shapefile_dir = Self::get_shapefile_dir(app_data_dir);
        fs::create_dir_all(&shapefile_dir)
            .map_err(|e| format!("Falha ao criar diretório de Shapefiles: {}", e))?;

        let zip_file = shapefile_dir.join(format!("{}.zip", meta.package_name));
        let part_file = shapefile_dir.join(format!("{}.zip.part", meta.package_name));

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .map_err(|e| format!("Falha ao instanciar cliente HTTP: {}", e))?;

        let url = Self::build_shapefile_url(meta.package_name);
        tracing::info!(package = meta.package_name, url = %url, "Iniciando download do Shapefile do GeoFTP");

        let _ = app_handle.emit(
            "ibge-download-progress",
            IbgeDownloadProgress {
                level: meta.id.to_string(),
                format: "shapefile".to_string(),
                stage: "downloading".to_string(),
                bytes_downloaded: 0,
                total_bytes: None,
                percentage: Some(0.0),
                message: format!("Conectando ao GeoFTP para baixar {}.zip...", meta.package_name),
            },
        );

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Erro ao conectar com GeoFTP {}: {}", url, e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Servidor GeoFTP IBGE retornou erro HTTP {}: {}",
                resp.status(),
                url
            ));
        }

        let total_size = resp.content_length();
        let mut stream = resp.bytes_stream();
        let mut file = File::create(&part_file)
            .map_err(|e| format!("Erro ao criar arquivo de download parcial: {}", e))?;

        let mut downloaded: u64 = 0;
        let mut last_emit = std::time::Instant::now();

        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("Erro ao receber bloco de dados: {}", e))?;
            file.write_all(&chunk)
                .map_err(|e| format!("Erro ao gravar dados no disco: {}", e))?;
            downloaded += chunk.len() as u64;

            if last_emit.elapsed().as_millis() > 250 || (total_size.is_some() && downloaded == total_size.unwrap()) {
                let percentage = total_size.map(|total| (downloaded as f64 / total as f64) * 100.0);
                let _ = app_handle.emit(
                    "ibge-download-progress",
                    IbgeDownloadProgress {
                        level: meta.id.to_string(),
                        format: "shapefile".to_string(),
                        stage: "downloading".to_string(),
                        bytes_downloaded: downloaded,
                        total_bytes: total_size,
                        percentage,
                        message: format!(
                            "Baixando {}.zip: {:.1} MB / {:.1} MB",
                            meta.package_name,
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
            .map_err(|e| format!("Erro ao renomear pacote ZIP concluído: {}", e))?;

        if extract {
            let _ = app_handle.emit(
                "ibge-download-progress",
                IbgeDownloadProgress {
                    level: meta.id.to_string(),
                    format: "shapefile".to_string(),
                    stage: "extracting".to_string(),
                    bytes_downloaded: downloaded,
                    total_bytes: total_size,
                    percentage: Some(95.0),
                    message: format!("Extraindo pacote Shapefile {}...", meta.package_name),
                },
            );

            let extract_dir = shapefile_dir.join(meta.package_name);
            Self::extract_zip_archive(&zip_file, &extract_dir)?;
        }

        let _ = app_handle.emit(
            "ibge-download-progress",
            IbgeDownloadProgress {
                level: meta.id.to_string(),
                format: "shapefile".to_string(),
                stage: "completed".to_string(),
                bytes_downloaded: downloaded,
                total_bytes: Some(downloaded),
                percentage: Some(100.0),
                message: format!("Download do Shapefile {} concluído!", meta.package_name),
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

    pub async fn get_or_load_geojson(
        app_handle: &tauri::AppHandle,
        app_data_dir: &Path,
        level: &str,
        quality: &str,
    ) -> Result<String, String> {
        let meta = LEVELS
            .iter()
            .find(|m| m.id == level)
            .ok_or_else(|| format!("Nível desconhecido: {}", level))?;

        let geojson_dir = Self::get_geojson_dir(app_data_dir);
        let target_file = geojson_dir.join(format!("{}_{}.geojson", meta.package_name, quality));

        if target_file.exists() {
            return fs::read_to_string(&target_file)
                .map_err(|e| format!("Falha ao ler arquivo GeoJSON existente: {}", e));
        }

        Self::download_geojson(app_handle, app_data_dir, meta, quality, true).await?;
        fs::read_to_string(&target_file)
            .map_err(|e| format!("Falha ao ler arquivo GeoJSON após download: {}", e))
    }

    pub fn delete_malha(
        app_data_dir: &Path,
        level: &str,
        format: &str,
        quality: Option<&str>,
    ) -> Result<bool, String> {
        let meta = LEVELS
            .iter()
            .find(|m| m.id == level)
            .ok_or_else(|| format!("Nível desconhecido: {}", level))?;

        if format == "geojson" {
            let q = quality.unwrap_or("minima");
            let geojson_path = Self::get_geojson_dir(app_data_dir)
                .join(format!("{}_{}.geojson", meta.package_name, q));
            if geojson_path.exists() {
                fs::remove_file(&geojson_path)
                    .map_err(|e| format!("Falha ao remover arquivo GeoJSON: {}", e))?;
                return Ok(true);
            }
        } else if format == "shapefile" {
            let zip_path = Self::get_shapefile_dir(app_data_dir)
                .join(format!("{}.zip", meta.package_name));
            let extract_dir = Self::get_shapefile_dir(app_data_dir).join(meta.package_name);

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
            return Ok(deleted);
        }

        Ok(false)
    }

    fn build_localidades_map(loc_json: &Value) -> HashMap<String, HashMap<String, String>> {
        let mut map = HashMap::new();
        if let Some(array) = loc_json.as_array() {
            for item in array {
                if let Some(id_val) = item.get("id") {
                    let id_str = match id_val {
                        Value::Number(n) => n.to_string(),
                        Value::String(s) => s.clone(),
                        _ => continue,
                    };
                    let flattened = Self::flatten_localidade(item);
                    map.insert(id_str, flattened);
                }
            }
        }
        map
    }

    fn flatten_localidade(item: &Value) -> HashMap<String, String> {
        let mut props = HashMap::new();
        if let Some(nome) = item.get("nome").and_then(|v| v.as_str()) {
            props.insert("nome".to_string(), nome.to_string());
        }
        if let Some(sigla) = item.get("sigla").and_then(|v| v.as_str()) {
            props.insert("sigla".to_string(), sigla.to_string());
        }

        let intermediaria = item
            .get("regiao-intermediaria")
            .or_else(|| item.get("regiao-imediata").and_then(|i| i.get("regiao-intermediaria")));
        if let Some(inter) = intermediaria {
            if let Some(id) = inter.get("id") {
                props.insert("cd_rg_intermediaria".to_string(), id.to_string());
            }
            if let Some(nome) = inter.get("nome").and_then(|v| v.as_str()) {
                props.insert("nm_rg_intermediaria".to_string(), nome.to_string());
            }
        }

        let imediata = item.get("regiao-imediata");
        if let Some(im) = imediata {
            if let Some(id) = im.get("id") {
                props.insert("cd_rg_imediata".to_string(), id.to_string());
            }
            if let Some(nome) = im.get("nome").and_then(|v| v.as_str()) {
                props.insert("nm_rg_imediata".to_string(), nome.to_string());
            }
        }

        let uf = item
            .get("UF")
            .or_else(|| intermediaria.and_then(|i| i.get("UF")));
        if let Some(u) = uf {
            if let Some(id) = u.get("id") {
                props.insert("cd_uf".to_string(), id.to_string());
            }
            if let Some(nome) = u.get("nome").and_then(|v| v.as_str()) {
                props.insert("nm_uf".to_string(), nome.to_string());
            }
            if let Some(sigla) = u.get("sigla").and_then(|v| v.as_str()) {
                props.insert("sigla_uf".to_string(), sigla.to_string());
            }
        }

        let regiao = item
            .get("regiao")
            .or_else(|| uf.and_then(|u| u.get("regiao")));
        if let Some(r) = regiao {
            if let Some(id) = r.get("id") {
                props.insert("cd_regiao".to_string(), id.to_string());
            }
            if let Some(nome) = r.get("nome").and_then(|v| v.as_str()) {
                props.insert("nm_regiao".to_string(), nome.to_string());
            }
            if let Some(sigla) = r.get("sigla").and_then(|v| v.as_str()) {
                props.insert("sigla_regiao".to_string(), sigla.to_string());
            }
        }

        props
    }

    fn enrich_geojson_properties(
        malha: &mut Value,
        names_map: &HashMap<String, HashMap<String, String>>,
    ) {
        if let Some(features) = malha.get_mut("features").and_then(|f| f.as_array_mut()) {
            for feature in features {
                if let Some(props) = feature.get_mut("properties").and_then(|p| p.as_object_mut()) {
                    let codarea = props.get("codarea").and_then(|v| match v {
                        Value::String(s) => Some(s.clone()),
                        Value::Number(n) => Some(n.to_string()),
                        _ => None,
                    });

                    if let Some(codigo) = codarea {
                        if let Some(complemento) = names_map.get(&codigo) {
                            for (k, v) in complemento {
                                props.insert(k.clone(), json!(v));
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_build_geojson_urls() {
        let url_pais = IbgeMalhasService::build_geojson_url(None, "minima");
        assert_eq!(
            url_pais,
            "https://servicodados.ibge.gov.br/api/v4/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima"
        );

        let url_uf = IbgeMalhasService::build_geojson_url(Some("UF"), "maxima");
        assert_eq!(
            url_uf,
            "https://servicodados.ibge.gov.br/api/v4/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=maxima&intrarregiao=UF"
        );
    }

    #[test]
    fn test_build_shapefile_url() {
        let url = IbgeMalhasService::build_shapefile_url("BR_UF_2024");
        assert_eq!(
            url,
            "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2024/Brasil/BR_UF_2024.zip"
        );
    }

    #[test]
    fn test_get_status_structure() {
        let temp_dir = std::env::temp_dir().join("gepis_test_malhas_status");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let overview = IbgeMalhasService::get_status(&temp_dir);
        assert_eq!(overview.levels.len(), 6);
        assert_eq!(overview.levels[0].id, "pais");
        assert_eq!(overview.levels[2].id, "uf");
        assert_eq!(overview.levels[5].id, "municipios");
        assert_eq!(overview.total_files_count, 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_enrich_geojson_properties() {
        let mut geojson = json!({
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": { "codarea": "35" },
                    "geometry": null
                }
            ]
        });

        let mut names_map = HashMap::new();
        let mut sp_props = HashMap::new();
        sp_props.insert("nome".to_string(), "São Paulo".to_string());
        sp_props.insert("sigla".to_string(), "SP".to_string());
        names_map.insert("35".to_string(), sp_props);

        IbgeMalhasService::enrich_geojson_properties(&mut geojson, &names_map);

        let feature = &geojson["features"][0];
        assert_eq!(feature["properties"]["nome"], "São Paulo");
        assert_eq!(feature["properties"]["sigla"], "SP");
    }
}
