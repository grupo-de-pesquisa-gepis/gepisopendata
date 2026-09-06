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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestInfo {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
    pub user_login: String,
    pub user_avatar: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
    pub merged_at: Option<String>,
    pub is_draft: bool,
    pub head_ref: Option<String>,
    pub base_ref: Option<String>,
}
