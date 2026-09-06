use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::Emitter;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Configura o menu da aplicação Tauri e registra os listeners de eventos de navegação e diálogo.
pub fn setup_app_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let sobre_item = MenuItem::with_id(app, "sobre", "Sobre", true, None::<&str>)?;
    let ajuda_submenu = Submenu::with_items(app, "Ajuda", true, &[&sobre_item])?;
    let obter_item = MenuItem::with_id(app, "obter_dados", "Obter Conj. Dados", true, None::<&str>)?;
    let listar_item = MenuItem::with_id(app, "listar_dados", "Listar Conjunto De Dados", true, None::<&str>)?;
    let gerenciar_item = MenuItem::with_id(app, "gerenciar_dados", "Gerenciar Conjunto de dados", true, None::<&str>)?;
    let conjuntos_submenu = Submenu::with_items(app, "Conjuntos de Dados", true, &[&obter_item, &listar_item, &gerenciar_item])?;
    let selecionar_item = MenuItem::with_id(app, "selecionar_dados", "Selecionar Conjunto de Dados", true, None::<&str>)?;
    let configurar_item = MenuItem::with_id(app, "configurar_variaveis", "Configurar Variaveis", true, None::<&str>)?;
    let analises_item = MenuItem::with_id(app, "analises_descritivas", "Analises Descritivas", true, None::<&str>)?;
    let analisar_submenu = Submenu::with_items(app, "Analisar Dados", true, &[&selecionar_item, &configurar_item, &analises_item])?;

    let config_github_item = MenuItem::with_id(app, "config_colaboracao", "Config Github", true, None::<&str>)?;
    let list_prs_item = MenuItem::with_id(app, "list_pull_requests", "List Pull Requests", true, None::<&str>)?;
    let colaboracao_submenu = Submenu::with_items(app, "Colaboração", true, &[&config_github_item, &list_prs_item])?;
    let config_submenu = Submenu::with_items(app, "Configurações", true, &[&colaboracao_submenu])?;

    let menu = Menu::with_items(app, &[&conjuntos_submenu, &analisar_submenu, &config_submenu, &ajuda_submenu])?;
    app.set_menu(menu)?;

    app.on_menu_event(move |app, event| {
        if event.id == "sobre" {
            app.dialog()
                .message("Gepis Dados Abertos\nVersão 0.1.0\n\nEste projeto é uma iniciativa do grupo de pesquisa Gepis para promover a utilização de dados abertos.")
                .title("Sobre o Gepis Dados Abertos")
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        } else {
            let _ = app.emit("menu-navigation", event.id.0.as_str());
        }
    });

    Ok(())
}
