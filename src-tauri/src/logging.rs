use std::fs;
use std::path::Path;
use tracing_subscriber::fmt::time::SystemTime;

/// Inicializa o subsistema de logging da aplicação gravando em arquivo rotacionado diariamente.
pub fn init_logging(app_data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let logs_dir = app_data_dir.join("logs");
    fs::create_dir_all(&logs_dir)?;

    let file_appender = tracing_appender::rolling::daily(&logs_dir, "gepis-dados-abertos.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    // Mantém o guard vivo durante o ciclo de vida da aplicação para flush de logs
    let _guard = Box::leak(Box::new(guard));

    tracing_subscriber::fmt()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_timer(SystemTime::default())
        .with_target(true)
        .with_level(true)
        .with_thread_ids(true)
        .init();

    #[cfg(debug_assertions)]
    {
        eprintln!("Logging initialized. Logs directory: {:?}", logs_dir);
    }

    Ok(())
}
