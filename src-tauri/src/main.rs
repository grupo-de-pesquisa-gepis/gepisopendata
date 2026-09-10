// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod services;
mod commands;
mod app_menu;
mod logging;

use commands::*;
use std::fs;
use tauri::Manager;

fn init_app_data(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)?;
    }

    let files_to_copy = ["datasets-registry.json", "analyses-history.json"];
    for file_name in files_to_copy {
        let dest_path = app_data_dir.join(file_name);
        if !dest_path.exists() {
            let resource_path = format!("angular-ui/public/data/{}", file_name);
            if let Ok(content) = app.path().resolve(&resource_path, tauri::path::BaseDirectory::Resource) {
                if content.exists() {
                    let _ = fs::copy(content, dest_path);
                }
            }
        }
    }
    Ok(())
}

fn main() {
    // Carrega variáveis de ambiente a partir de .env se presente
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_mcp_gui::init())
        .invoke_handler(tauri::generate_handler![
            download_dataset,
            import_local_dataset,
            get_registry,
            check_path_exists,
            get_group_columns,
            analyze_group,
            get_columns_for_files,
            get_excel_files,
            parse_dictionary,
            run_etl,
            get_barchart_data,
            get_variable_sample,
            get_variables_preview,
            get_app_data_dir,
            save_analysis,
            get_analyses,
            delete_analysis,
            delete_dataset,
            delete_group,
            get_github_config,
            save_github_config,
            test_github_connection,
            push_dataset_to_github,
            publish_analysis,
            list_pull_requests,
            get_ibge_malhas_status,
            download_ibge_malha,
            delete_ibge_malha,
            open_ibge_malhas_folder,
            get_or_load_ibge_geojson
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().unwrap();
            if let Err(e) = logging::init_logging(&app_data_dir) {
                eprintln!("Failed to initialize logging: {}", e);
            } else {
                tracing::info!("Application started - Gepis Dados Abertos v0.1.2");
            }

            if let Err(e) = init_app_data(app) {
                eprintln!("Failed to initialize app data: {}", e);
            }

            app_menu::setup_app_menu(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
