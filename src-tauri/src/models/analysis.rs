use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BarChartData {
    pub categories: Vec<String>,
    pub values: Vec<f64>,
}
