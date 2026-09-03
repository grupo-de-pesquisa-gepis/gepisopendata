use std::fs::{self, File};
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Sanitiza strings para uso seguro como nomes de pastas e arquivos.
pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .to_lowercase()
}

/// Detecta o delimitador de um arquivo CSV lendo os primeiros bytes.
pub fn detect_delimiter_from_file(path: &Path) -> u8 {
    use std::io::Read;
    if let Ok(mut file) = File::open(path) {
        let mut buffer = [0; 4096];
        if let Ok(n) = file.read(&mut buffer) {
            let first_line = buffer[..n]
                .split(|&b| b == b'\n' || b == b'\r')
                .next()
                .unwrap_or(&buffer[..n]);
            let semi = first_line.iter().filter(|&&b| b == b';').count();
            let comma = first_line.iter().filter(|&&b| b == b',').count();
            let tab = first_line.iter().filter(|&&b| b == b'\t').count();

            if tab > semi && tab > comma {
                return b'\t';
            }
            if comma > semi && comma > tab {
                return b',';
            }
        }
    }
    b';' // Padrão brasileiro (Governo/INEP)
}

/// Busca recursiva por arquivos com determinada extensão em um diretório.
pub fn find_files_recursive(dir: &Path, extension: &str, files: &mut Vec<PathBuf>) -> Result<(), std::io::Error> {
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                find_files_recursive(&path, extension, files)?;
            } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if ext.to_lowercase() == extension.to_lowercase() {
                    files.push(path);
                }
            }
        }
    }
    Ok(())
}

/// Retorna o diretório base de downloads da aplicação de forma portável (considerando dev e prod).
pub fn get_base_downloads_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    #[cfg(debug_assertions)]
    {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            path = PathBuf::from(manifest_dir).join("downloads");
        }
    }
    Ok(path)
}

/// Retorna todos os caminhos onde o arquivo de registro JSON deve ser sincronizado (Dual-write dev/prod).
pub fn get_registry_paths(app_handle: &tauri::AppHandle, filename: &str) -> Result<Vec<PathBuf>, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut paths = vec![app_data_dir.join(filename)];

    #[cfg(debug_assertions)]
    {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let base = PathBuf::from(manifest_dir);
            paths.push(base.join("angular-ui").join("data").join(filename));
            paths.push(base.join("angular-ui").join("public").join("data").join(filename));
        }
    }

    Ok(paths)
}

/// Retorna o caminho preferencial para leitura do arquivo de registro.
pub fn get_primary_registry_path(app_handle: &tauri::AppHandle, filename: &str) -> Result<PathBuf, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut path = app_data_dir.join(filename);

    #[cfg(debug_assertions)]
    {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let dev_path = PathBuf::from(manifest_dir)
                .join("angular-ui")
                .join("public")
                .join("data")
                .join(filename);
            if dev_path.exists() {
                path = dev_path;
            }
        }
    }

    Ok(path)
}

/// Resolve o caminho absoluto de destino de um dataset a partir do grupo e título curto.
pub fn resolve_dataset_dir(base_downloads_path: &Path, grupo: &str, titulo_curto: &str) -> PathBuf {
    let grupo_folder = if grupo.trim().is_empty() {
        "sem-grupo".to_string()
    } else {
        sanitize_filename(grupo)
    };
    let dataset_folder = sanitize_filename(titulo_curto);
    base_downloads_path.join("datasets").join(grupo_folder).join(dataset_folder)
}
