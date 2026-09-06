use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use base64::{engine::general_purpose, Engine as _};
use crate::models::{GithubConfig, PullRequestInfo};

/// Cliente de Integração com a API REST do GitHub (100% Puro Rust).
pub struct GithubClient;

impl GithubClient {
    /// Carrega as configurações salvas do GitHub.
    pub fn load_config(config_path: &Path) -> Result<Option<GithubConfig>, String> {
        if config_path.exists() {
            let file = File::open(config_path).map_err(|e| e.to_string())?;
            let config: GithubConfig = serde_json::from_reader(file).map_err(|e| e.to_string())?;
            Ok(Some(config))
        } else {
            Ok(None)
        }
    }

    /// Salva as configurações de autenticação e repositório do GitHub.
    pub fn save_config(config_path: &Path, config: &GithubConfig) -> Result<(), String> {
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut file = File::create(config_path).map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Testa a conexão e verifica as permissões de escrita no repositório GitHub.
    pub async fn test_connection(token: &str, owner: &str, repo: &str) -> Result<String, String> {
        let client = reqwest::Client::builder()
            .user_agent("Gepis-OpenData-App")
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("https://api.github.com/repos/{}/{}", owner, repo);
        let response = client.get(&url)
            .header("Authorization", format!("token {}", token))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if response.status().is_success() {
            let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
            let permissions = json["permissions"].as_object();
            let can_push = permissions
                .and_then(|p| p.get("push"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if can_push {
                Ok("Conexão bem-sucedida! Você tem permissão de escrita.".into())
            } else {
                Err("Conexão estabelecida, mas você NÃO tem permissão de escrita neste repositório.".into())
            }
        } else {
            Err(format!(
                "Falha na conexão: {} - Verifique o token e as informações do repositório.",
                response.status()
            ))
        }
    }

    /// Compartilha um dataset enviando commit direto ao datasets-registry.json remoto no GitHub.
    pub async fn push_dataset(
        config: &GithubConfig,
        mut local_entry: serde_json::Value,
        dataset_id: &str,
    ) -> Result<String, String> {
        if let Some(obj) = local_entry.as_object_mut() {
            obj.insert("localPath".to_string(), serde_json::json!(""));
            obj.insert("exists".to_string(), serde_json::json!(false));
        }

        let client = reqwest::Client::builder()
            .user_agent("Gepis-OpenData-App")
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/angular-ui/public/data/datasets-registry.json",
            config.owner, config.repo
        );

        let response = client.get(&url)
            .header("Authorization", format!("token {}", config.token))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let mut remote_sha = String::new();
        let mut remote_registry: Vec<serde_json::Value> = Vec::new();

        if response.status().is_success() {
            let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
            remote_sha = json["sha"].as_str().unwrap_or("").to_string();

            let content_b64 = json["content"].as_str().unwrap_or("").replace('\n', "").replace('\r', "");
            let content_bytes = general_purpose::STANDARD.decode(content_b64).map_err(|e| e.to_string())?;
            remote_registry = serde_json::from_slice(&content_bytes).unwrap_or_default();
        } else if response.status() == 404 {
            println!("Rust => Remote registry not found (404), creating new one.");
        } else {
            return Err(format!("Erro ao buscar registro remoto: {}", response.status()));
        }

        let mut entry_exists = false;
        for item in remote_registry.iter_mut() {
            if item["id"] == local_entry["id"] {
                *item = local_entry.clone();
                entry_exists = true;
                break;
            }
        }
        if !entry_exists {
            remote_registry.push(local_entry);
        }

        let final_json = serde_json::to_string_pretty(&remote_registry).map_err(|e| e.to_string())?;
        let final_b64 = general_purpose::STANDARD.encode(final_json);

        let payload = serde_json::json!({
            "message": format!("Colaboração: Adicionando/Atualizando dataset {}", dataset_id),
            "content": final_b64,
            "sha": if remote_sha.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(remote_sha) }
        });

        let put_response = client.put(&url)
            .header("Authorization", format!("token {}", config.token))
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if put_response.status().is_success() {
            Ok("Dataset compartilhado com sucesso no GitHub!".into())
        } else {
            let status = put_response.status();
            let error_body = put_response.text().await.unwrap_or_default();
            Err(format!("Erro ao enviar para GitHub: {} - {}", status, error_body))
        }
    }

    /// Cria uma branch, envia o analyses-history.json atualizado e abre um Pull Request no repositório.
    pub async fn publish_analysis(
        config: &GithubConfig,
        history: &[serde_json::Value],
        analysis_id: Option<&str>,
    ) -> Result<String, String> {
        let final_json = serde_json::to_string_pretty(history).map_err(|e| e.to_string())?;
        let final_b64 = general_purpose::STANDARD.encode(final_json.as_bytes());

        let client = reqwest::Client::builder()
            .user_agent("Gepis-OpenData-App")
            .build()
            .map_err(|e| e.to_string())?;

        let default_branch = if config.pr_target_branch.trim().is_empty() {
            "production".to_string()
        } else {
            config.pr_target_branch.clone()
        };

        // 1) Obter commit SHA da base branch
        let ref_url = format!(
            "https://api.github.com/repos/{}/{}/git/ref/heads/{}",
            config.owner, config.repo, default_branch
        );
        let ref_resp = client.get(&ref_url)
            .header("Authorization", format!("token {}", config.token))
            .send().await.map_err(|e| e.to_string())?;
        if !ref_resp.status().is_success() {
            return Err(format!("Failed to get base ref: {}", ref_resp.status()));
        }
        let ref_json: serde_json::Value = ref_resp.json().await.map_err(|e| e.to_string())?;
        let base_sha = ref_json["object"]["sha"].as_str().ok_or("Cannot determine base sha")?;

        let analysis_info = if let Some(aid) = analysis_id {
            history.iter().find(|item| item["id"].as_str() == Some(aid))
        } else {
            None
        };

        // 2) Criar nome da branch
        let branch = if let Some(info) = analysis_info {
            let name = info["name"].as_str().unwrap_or("unknown");
            let sanitized_name = name.to_lowercase()
                .chars()
                .map(|c| if c.is_alphanumeric() { c } else { '-' })
                .collect::<String>()
                .split('-')
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("-");
            format!("contrib/analysis-{}", sanitized_name)
        } else {
            format!("contrib/sync-all-{}", chrono::Utc::now().format("%Y%m%d%H%M"))
        };

        // 3) Criar branch no GitHub
        let create_ref_url = format!("https://api.github.com/repos/{}/{}/git/refs", config.owner, config.repo);
        let create_ref_body = serde_json::json!({ "ref": format!("refs/heads/{}", branch), "sha": base_sha });
        let create_ref_resp = client.post(&create_ref_url)
            .header("Authorization", format!("token {}", config.token))
            .json(&create_ref_body)
            .send().await.map_err(|e| e.to_string())?;

        if !create_ref_resp.status().is_success() && create_ref_resp.status().as_u16() != 422 {
            let status = create_ref_resp.status();
            let text = create_ref_resp.text().await.unwrap_or_default();
            return Err(format!("Failed to create branch: {} - {}", status, text));
        }

        // 4) Verificar SHA do arquivo na nova branch (se já existir)
        let contents_url = format!(
            "https://api.github.com/repos/{}/{}/contents/angular-ui/public/data/analyses-history.json",
            config.owner, config.repo
        );
        let contents_resp = client.get(&contents_url)
            .header("Authorization", format!("token {}", config.token))
            .query(&[("ref", &branch)])
            .send().await.map_err(|e| e.to_string())?;

        let mut remote_sha: Option<String> = None;
        if contents_resp.status().is_success() {
            let contents_json: serde_json::Value = contents_resp.json().await.map_err(|e| e.to_string())?;
            if let Some(s) = contents_json["sha"].as_str() {
                remote_sha = Some(s.to_string());
            }
        }

        // 5) Atualizar arquivo na branch
        let message = if let Some(info) = analysis_info {
            format!("Contribuição: adicionando/atualizando análise '{}'", info["name"].as_str().unwrap_or("sem nome"))
        } else {
            "Contribuição: sincronização total das análises".to_string()
        };

        let put_body = if let Some(sha) = remote_sha {
            serde_json::json!({ "message": message, "content": final_b64, "branch": branch, "sha": sha })
        } else {
            serde_json::json!({ "message": message, "content": final_b64, "branch": branch })
        };

        let put_resp = client.put(&contents_url)
            .header("Authorization", format!("token {}", config.token))
            .json(&put_body)
            .send().await.map_err(|e| e.to_string())?;

        if !put_resp.status().is_success() {
            let status = put_resp.status();
            let t = put_resp.text().await.unwrap_or_default();
            return Err(format!("Failed to create/update file: {} - {}", status, t));
        }

        // 6) Criar o Pull Request
        let title = if let Some(info) = analysis_info {
            format!("Contribuição: Análise '{}'", info["name"].as_str().unwrap_or("Sem Nome"))
        } else {
            "Contribuição: Sincronização de Análises".to_string()
        };

        let body = if let Some(info) = analysis_info {
            let name = info["name"].as_str().unwrap_or("Sem Nome");
            let group = info["groupName"].as_str().unwrap_or("Desconhecido");
            let file_count = info["files"].as_array().map(|a| a.len()).unwrap_or(0);
            let var_count = info["variables"].as_array().map(|a| a.len()).unwrap_or(0);

            format!(
                "### Nova Contribuição de Análise\n\n\
                **Nome:** {}\n\
                **Grupo:** {}\n\
                **Arquivos processados:** {}\n\
                **Variáveis configuradas:** {}\n\n\
                Esta contribuição foi gerada automaticamente via Gepis OpenData Desktop.",
                name, group, file_count, var_count
            )
        } else {
            "Sincronização automática de todas as análises locais via aplicação desktop.".to_string()
        };

        let pr_url = format!("https://api.github.com/repos/{}/{}/pulls", config.owner, config.repo);
        let pr_body = serde_json::json!({ "title": title, "head": branch, "base": default_branch, "body": body });
        let pr_resp = client.post(&pr_url)
            .header("Authorization", format!("token {}", config.token))
            .json(&pr_body)
            .send().await.map_err(|e| e.to_string())?;

        if !pr_resp.status().is_success() {
            let status = pr_resp.status();
            let t = pr_resp.text().await.unwrap_or_default();
            return Err(format!("Failed to create PR: {} - {}", status, t));
        }

        let pr_json: serde_json::Value = pr_resp.json().await.map_err(|e| e.to_string())?;
        let pr_html = pr_json["html_url"].as_str().unwrap_or("").to_string();

        Ok(pr_html)
    }

    /// Lista os Pull Requests do repositório configurado no GitHub.
    pub async fn list_pull_requests(
        config: &GithubConfig,
        state: Option<&str>,
    ) -> Result<Vec<PullRequestInfo>, String> {
        let client = reqwest::Client::builder()
            .user_agent("Gepis-OpenData-App")
            .build()
            .map_err(|e| e.to_string())?;

        let state_param = state.unwrap_or("all");
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls?state={}&per_page=50",
            config.owner, config.repo, state_param
        );

        let mut req = client.get(&url);
        if !config.token.is_empty() {
            req = req.header("Authorization", format!("token {}", config.token));
        }

        let response = req.send().await.map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!(
                "Falha ao listar Pull Requests (HTTP {}). Verifique as configurações do repositório.",
                response.status()
            ));
        }

        let raw_prs: Vec<serde_json::Value> = response.json().await.map_err(|e| e.to_string())?;

        let prs = raw_prs
            .into_iter()
            .map(|item| {
                let id = item["id"].as_u64().unwrap_or(0);
                let number = item["number"].as_u64().unwrap_or(0);
                let title = item["title"].as_str().unwrap_or("").to_string();
                let body = item["body"].as_str().map(|s| s.to_string());
                let state = item["state"].as_str().unwrap_or("open").to_string();
                let html_url = item["html_url"].as_str().unwrap_or("").to_string();
                let user_login = item["user"]["login"].as_str().unwrap_or("").to_string();
                let user_avatar = item["user"]["avatar_url"].as_str().map(|s| s.to_string());
                let created_at = item["created_at"].as_str().unwrap_or("").to_string();
                let updated_at = item["updated_at"].as_str().map(|s| s.to_string());
                let closed_at = item["closed_at"].as_str().map(|s| s.to_string());
                let merged_at = item["merged_at"].as_str().map(|s| s.to_string());
                let is_draft = item["draft"].as_bool().unwrap_or(false);
                let head_ref = item["head"]["ref"].as_str().map(|s| s.to_string());
                let base_ref = item["base"]["ref"].as_str().map(|s| s.to_string());

                PullRequestInfo {
                    id,
                    number,
                    title,
                    body,
                    state,
                    html_url,
                    user_login,
                    user_avatar,
                    created_at,
                    updated_at,
                    closed_at,
                    merged_at,
                    is_draft,
                    head_ref,
                    base_ref,
                }
            })
            .collect();

        Ok(prs)
    }
}
