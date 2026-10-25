/// Open the author's profile in the user's browser.
///
/// The URL is fixed here on purpose: the webview never gets to ask the shell
/// to open an arbitrary address, which would turn a presentation link into a
/// generic launcher.
#[tauri::command]
pub fn open_twitter() -> Result<(), String> {
    const URL: &str = "https://x.com/neshack";
    open_external(URL).map_err(|e| format!("no se pudo abrir el navegador: {e}"))
}

#[cfg(target_os = "linux")]
fn open_external(url: &str) -> std::io::Result<()> {
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
}

#[cfg(target_os = "macos")]
fn open_external(url: &str) -> std::io::Result<()> {
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
}

#[cfg(target_os = "windows")]
fn open_external(url: &str) -> std::io::Result<()> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map(|_| ())
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn open_external(_url: &str) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "sistema operativo no soportado",
    ))
}
