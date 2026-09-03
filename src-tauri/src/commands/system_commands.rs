use tauri::AppHandle;
use tauri::Manager;

#[tauri::command]
pub async fn get_app_data_dir(app_handle: AppHandle) -> Result<String, String> {
    let path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
