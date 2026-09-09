use std::fs::{self, File};
use std::io::copy;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;
use zip::ZipArchive;

/// Motor de download HTTP com streaming e descompactação ZIP (100% puro Rust, agnóstico ao Tauri).
pub struct Downloader;

impl Downloader {
    /// Faz o download em streaming de um arquivo HTTP(S), gravando diretamente em disco por chunks
    /// para proteger a memória RAM e emitindo atualizações de progresso em tempo real.
    pub async fn download_file(
        url: &str,
        dest_path: &Path,
        on_progress: Option<&(dyn Fn(u64, u64) + Send + Sync)>,
    ) -> Result<(), String> {
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Erro ao criar pastas de destino {:?}: {}", parent, e))?;
        }

        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Erro ao criar cliente HTTP: {}", e))?;

        let mut response = client.get(url).send().await
            .map_err(|e| format!("Erro na requisição para {}: {}", url, e))?;

        if !response.status().is_success() {
            return Err(format!("Servidor retornou erro {}: {}", response.status(), url));
        }

        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;

        let mut file = tokio::fs::File::create(dest_path).await
            .map_err(|e| format!("Erro ao criar arquivo local {:?}: {}", dest_path, e))?;

        while let Some(chunk) = response.chunk().await.map_err(|e| format!("Erro ao receber dados: {}", e))? {
            file.write_all(&chunk).await
                .map_err(|e| format!("Erro ao gravar dados em disco: {}", e))?;
            downloaded += chunk.len() as u64;
            if let Some(callback) = on_progress {
                callback(downloaded, total_size);
            }
        }

        file.flush().await
            .map_err(|e| format!("Erro ao sincronizar arquivo em disco: {}", e))?;

        Ok(())
    }

    /// Descompacta recursivamente um arquivo ZIP e retorna a lista de arquivos descompactados.
    pub fn extract_zip(zip_path: &Path, target_dir: &Path) -> Result<Vec<String>, String> {
        let zip_file = File::open(zip_path)
            .map_err(|e| format!("Erro ao abrir arquivo ZIP {:?}: {}", zip_path, e))?;
        let mut archive = ZipArchive::new(zip_file)
            .map_err(|e| format!("Erro ao ler arquivo ZIP: {}", e))?;

        let mut extracted_files = Vec::new();

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("Erro ao ler entrada no ZIP: {}", e))?;
            let outpath = match file.enclosed_name() {
                Some(path) => path.to_owned(),
                None => continue,
            };

            if (*file.name()).ends_with('/') {
                fs::create_dir_all(target_dir.join(&outpath))
                    .map_err(|e| format!("Erro ao criar pasta: {}", e))?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(target_dir.join(p))
                            .map_err(|e| format!("Erro ao criar subpasta: {}", e))?;
                    }
                }

                let final_name = outpath.file_name().unwrap().to_string_lossy().into_owned();
                let extract_dest = target_dir.join(&final_name);
                let mut outfile = File::create(&extract_dest)
                    .map_err(|e| format!("Erro ao criar arquivo extraído {:?}: {}", extract_dest, e))?;
                copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Erro ao extrair arquivo: {}", e))?;

                if !extracted_files.contains(&final_name) {
                    extracted_files.push(final_name);
                }
            }
        }

        Ok(extracted_files)
    }

    /// Executa o pipeline completo: download em streaming do arquivo e descompactação automática se for ZIP.
    pub async fn download_and_extract(
        url: &str,
        target_dir: &Path,
        expected_format: &str,
        on_progress: Option<&(dyn Fn(u64, u64) + Send + Sync)>,
    ) -> Result<Vec<String>, String> {
        fs::create_dir_all(target_dir)
            .map_err(|e| format!("Erro ao criar diretório de destino {:?}: {}", target_dir, e))?;

        let file_name = url.split('/').last().unwrap_or("dataset.zip");
        let dest_path = target_dir.join(file_name);

        Self::download_file(url, &dest_path, on_progress).await?;

        let mut final_files = vec![file_name.to_string()];

        let is_zip = file_name.to_lowercase().ends_with(".zip");
        if is_zip && expected_format.to_lowercase() != "zip" {
            let mut extracted = Self::extract_zip(&dest_path, target_dir)?;
            for f in extracted.drain(..) {
                if !final_files.contains(&f) {
                    final_files.push(f);
                }
            }
        }

        Ok(final_files)
    }

    /// Importa uma lista de arquivos locais copiando-os para o diretório de destino.
    pub fn import_local_files(file_paths: &[String], target_dir: &Path) -> Result<Vec<String>, String> {
        fs::create_dir_all(target_dir)
            .map_err(|e| format!("Erro ao criar pastas de destino {:?}: {}", target_dir, e))?;

        let mut final_files = Vec::new();

        for path_str in file_paths {
            let src_path = PathBuf::from(path_str);
            if !src_path.exists() {
                continue;
            }

            let file_name = src_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("arquivo_desconhecido");

            let dest_path = target_dir.join(file_name);
            fs::copy(&src_path, &dest_path)
                .map_err(|e| format!("Erro ao copiar arquivo {}: {}", file_name, e))?;

            final_files.push(file_name.to_string());
        }

        if final_files.is_empty() {
            return Err("Nenhum arquivo válido foi selecionado para importação.".into());
        }

        Ok(final_files)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    #[test]
    fn test_import_local_files() {
        let temp_src = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let temp_dest = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&temp_src).unwrap();

        let src_file1 = temp_src.join("data1.csv");
        let src_file2 = temp_src.join("data2.csv");
        fs::write(&src_file1, "a,b,c").unwrap();
        fs::write(&src_file2, "d,e,f").unwrap();

        let files = vec![
            src_file1.to_string_lossy().into_owned(),
            src_file2.to_string_lossy().into_owned(),
        ];

        let imported = Downloader::import_local_files(&files, &temp_dest).unwrap();
        assert_eq!(imported.len(), 2);
        assert!(temp_dest.join("data1.csv").exists());
        assert!(temp_dest.join("data2.csv").exists());

        let _ = fs::remove_dir_all(&temp_src);
        let _ = fs::remove_dir_all(&temp_dest);
    }

    #[test]
    fn test_extract_zip() {
        let temp_dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let extract_dir = temp_dir.join("extracted");
        fs::create_dir_all(&temp_dir).unwrap();

        let zip_path = temp_dir.join("test.zip");
        let file = File::create(&zip_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);

        zip.start_file("sample.txt", SimpleFileOptions::default()).unwrap();
        zip.write_all(b"hello inside zip").unwrap();
        zip.finish().unwrap();

        let extracted = Downloader::extract_zip(&zip_path, &extract_dir).unwrap();
        assert_eq!(extracted, vec!["sample.txt".to_string()]);
        assert!(extract_dir.join("sample.txt").exists());

        let content = fs::read_to_string(extract_dir.join("sample.txt")).unwrap();
        assert_eq!(content, "hello inside zip");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
