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
