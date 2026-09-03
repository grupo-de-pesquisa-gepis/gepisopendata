use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubConfig {
    pub username: String,
    pub token: String,
    pub owner: String,
    pub repo: String,
    #[serde(default = "default_pr_branch")]
    pub pr_target_branch: String,
}

fn default_pr_branch() -> String {
    "production".to_string()
}
