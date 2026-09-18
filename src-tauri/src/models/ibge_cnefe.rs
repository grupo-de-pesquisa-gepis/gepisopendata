use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IbgeCnefeUfStatus {
    pub code: String,
    pub sigla: String,
    pub name: String,
    pub region: String,
    pub package_name: String,
    pub zip_file_name: String,
    pub zip_file_path: String,
    pub zip_size_bytes: u64,
    pub zip_exists: bool,
    pub is_extracted: bool,
    pub csv_file_name: Option<String>,
    pub csv_file_path: Option<String>,
    pub csv_size_bytes: u64,
    pub csv_exists: bool,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbgeCnefeOverview {
    pub ufs: Vec<IbgeCnefeUfStatus>,
    pub total_size_bytes: u64,
    pub total_zip_count: usize,
    pub total_extracted_count: usize,
    pub cnefe_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbgeCnefeDownloadRequest {
    pub uf: String,
    pub extract_zip: Option<bool>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbgeCnefeDownloadProgress {
    pub uf: String,
    pub stage: String, // "downloading" | "extracting" | "completed" | "error"
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
    pub percentage: Option<f64>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CnefeSchoolRecord {
    pub co_entidade: String,
    pub no_entidade: String,
    pub sg_uf: String,
    pub co_uf: String,
    pub no_municipio: String,
    pub co_municipio: String,
    pub co_cep: String,
    pub ds_endereco: String,
    pub nu_endereco: String,
    pub no_bairro: String,
    pub tp_dependencia: String,
    pub tp_localizacao: String,
    // Georreferenciamento do CNEFE:
    pub latitude: Option<String>,
    pub longitude: Option<String>,
    pub cnefe_nv_geo_coord: Option<String>,
    pub cnefe_dsc_estabelecimento: Option<String>,
    pub status_geolocalizacao: String, // "alta" | "media" | "baixa" | "ambiguo" | "sem_correspondencia"
    pub confianca_nome: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CnefeSchoolSummary {
    pub total_escolas: usize,
    pub total_georreferenciadas: usize,
    pub perc_georreferenciadas: f64,
    pub alta_confianca: usize,
    pub perc_alta: f64,
    pub media_confianca: usize,
    pub perc_media: f64,
    pub baixa_confianca: usize,
    pub perc_baixa: f64,
    pub ambiguas: usize,
    pub perc_ambiguas: f64,
    pub sem_correspondencia: usize,
    pub perc_sem_correspondencia: f64,
    pub ufs_processadas: Vec<String>,
    pub inep_censo_disponivel: bool,
    pub inep_censo_arquivo: Option<String>,
    pub cnefe_disponivel: bool,
    pub output_file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CnefeSchoolComparisonResult {
    pub summary: CnefeSchoolSummary,
    pub records: Vec<CnefeSchoolRecord>,
    pub total_records: usize,
    pub page: usize,
    pub page_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CnefeSchoolQuery {
    pub uf: Option<String>,
    pub status: Option<String>, // "all" | "georreferenciada" | "nao_georreferenciada" | "alta" | "media" | "baixa" | "ambiguo" | "sem_correspondencia"
    pub search: Option<String>,
    pub municipio: Option<String>,
    pub page: Option<usize>,
    pub page_size: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CnefeInepMatchProgress {
    pub stage: String,
    pub uf: Option<String>,
    pub current_step: usize,
    pub total_steps: usize,
    pub percentage: Option<f64>,
    pub message: String,
}
