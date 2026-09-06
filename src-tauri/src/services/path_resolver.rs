use std::fs::{self, File};
use std::path::{Path, PathBuf};

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
pub fn get_base_downloads_path(app_data_dir: &Path) -> PathBuf {
    #[cfg(all(debug_assertions, not(test)))]
    {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            return PathBuf::from(manifest_dir).join("downloads");
        }
    }
    app_data_dir.to_path_buf()
}

/// Retorna todos os caminhos onde o arquivo de registro JSON deve ser sincronizado (Dual-write dev/prod).
pub fn get_registry_paths(app_data_dir: &Path, filename: &str) -> Vec<PathBuf> {
    #[allow(unused_mut)]
    let mut paths = vec![app_data_dir.join(filename)];

    #[cfg(all(debug_assertions, not(test)))]
    {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let base = PathBuf::from(manifest_dir);
            paths.push(base.join("angular-ui").join("data").join(filename));
            paths.push(base.join("angular-ui").join("public").join("data").join(filename));
        }
    }

    paths
}

/// Retorna o caminho preferencial para leitura do arquivo de registro.
pub fn get_primary_registry_path(app_data_dir: &Path, filename: &str) -> PathBuf {
    #[cfg(all(debug_assertions, not(test)))]
    {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let dev_path = PathBuf::from(manifest_dir)
                .join("angular-ui")
                .join("public")
                .join("data")
                .join(filename);
            if dev_path.exists() {
                return dev_path;
            }
        }
    }

    app_data_dir.join(filename)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("Censo Escolar 2023!"), "censo_escolar_2023_");
        assert_eq!(sanitize_filename("dados-abertos_v1"), "dados-abertos_v1");
        assert_eq!(sanitize_filename("A/B/C"), "a_b_c");
    }

    #[test]
    fn test_resolve_dataset_dir() {
        let base = PathBuf::from("/tmp/downloads");
        let dir = resolve_dataset_dir(&base, "Censo Escolar", "2023");
        assert_eq!(dir, PathBuf::from("/tmp/downloads/datasets/censo_escolar/2023"));

        let dir_empty_group = resolve_dataset_dir(&base, "", "2023");
        assert_eq!(dir_empty_group, PathBuf::from("/tmp/downloads/datasets/sem-grupo/2023"));
    }

    #[test]
    fn test_detect_delimiter_from_file() {
        let temp_dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&temp_dir).unwrap();

        let csv_semi = temp_dir.join("semi.csv");
        let mut f1 = File::create(&csv_semi).unwrap();
        writeln!(f1, "col1;col2;col3\nval1;val2;val3").unwrap();

        let csv_comma = temp_dir.join("comma.csv");
        let mut f2 = File::create(&csv_comma).unwrap();
        writeln!(f2, "col1,col2,col3\nval1,val2,val3").unwrap();

        let csv_tab = temp_dir.join("tab.tsv");
        let mut f3 = File::create(&csv_tab).unwrap();
        writeln!(f3, "col1\tcol2\tcol3\nval1\tval2\tval3").unwrap();

        assert_eq!(detect_delimiter_from_file(&csv_semi), b';');
        assert_eq!(detect_delimiter_from_file(&csv_comma), b',');
        assert_eq!(detect_delimiter_from_file(&csv_tab), b'\t');

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
