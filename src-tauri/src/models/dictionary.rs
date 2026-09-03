use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub name: String,
    pub description: String,
    pub var_type: String,
}
