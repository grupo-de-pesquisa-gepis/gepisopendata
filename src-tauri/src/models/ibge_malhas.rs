use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IbgeMalhaFileStatus {
    pub format: String,             // "geojson" | "shapefile"
    pub quality: Option<String>,    // "minima" | "intermediaria" | "maxima"
    pub file_name: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub exists: bool,
    pub is_extracted: bool,         // For shapefiles: true if extracted folder exists
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IbgeMalhaLevelStatus {
    pub id: String,                 // "pais", "regioes", "uf", "intermediarias", "imediatas", "municipios"
    pub name: String,
    pub description: String,
    pub package_name: String,       // e.g. "BR_UF_2024"
    pub expected_features: u32,
    pub geojson_files: Vec<IbgeMalhaFileStatus>,
    pub shapefile: Option<IbgeMalhaFileStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbgeMalhasOverview {
    pub levels: Vec<IbgeMalhaLevelStatus>,
    pub total_size_bytes: u64,
    pub total_files_count: usize,
    pub malhas_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbgeDownloadRequest {
    pub level: String,              // "pais" | "regioes" | "uf" | ...
    pub format: String,             // "geojson" | "shapefile"
    pub quality: Option<String>,    // "minima" | "intermediaria" | "maxima" (default: "minima")
    pub enrich_names: Option<bool>, // default: true
    pub extract_zip: Option<bool>,  // default: true (for shapefile)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbgeDownloadProgress {
    pub level: String,
    pub format: String,
    pub stage: String,              // "downloading" | "enriching" | "extracting" | "completed" | "error"
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
    pub percentage: Option<f64>,
    pub message: String,
}
