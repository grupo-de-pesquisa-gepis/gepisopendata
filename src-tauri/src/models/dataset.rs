use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub col_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupAnalysis {
    pub files: Vec<String>,
    pub common_columns: Vec<ColumnInfo>,
    pub format: String,
}
