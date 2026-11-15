//! The system dialogs and the volume's catalog data.
//!
//! Picking a folder is the operating system's job, not the web view's: the
//! native dialog is the only place where a path can be chosen with drives,
//! mounts and network shares in front of the user. The chosen image is
//! downscaled and embedded in the catalog, so the cover survives the original
//! file being moved or deleted.

use base64::Engine as _;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;

/// A cover is an identification thumbnail, not a gallery: 256 px on its long
/// side is enough for the sidebar, the editor preview and the HTML export.
const COVER_SIDE: u32 = 256;
/// Refuse to decode absurd files just because a dialog offered them.
const MAX_IMAGE_BYTES: u64 = 32 * 1024 * 1024;
/// A data URL larger than this is not a thumbnail anymore.
const MAX_COVER_URL: usize = 1024 * 1024;
/// The plate color of the interface, so transparent PNGs do not turn black.
const BACKDROP: [u8; 3] = [0x19, 0x1d, 0x1a];

#[tauri::command]
pub async fn pick_scan_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Elige la unidad o carpeta que quieres escanear")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("no se pudo abrir el diálogo: {e}"))?
    .map(|p| p.into_path().map_err(|e| e.to_string()))
    .transpose()
    .map(|p| p.map(|p| p.to_string_lossy().into_owned()))
}

/// Device kinds the picker can send. Keeping the list at the boundary means an
/// unknown value can never reach the catalog, whatever the window sends.
const DEVICE_KINDS: [&str; 8] = [
    "optical",
    "usb",
    "external",
    "card",
    "internal",
    "nas",
    "image",
    "encrypted",
];

/// Normalize the identity fields together: a kind can stand alone, colors
/// cannot. Orphan colors would have no device to identify, so a missing kind
/// clears them instead of storing a half-identity.
fn validate_identity(
    media_kind: Option<&str>,
    colors: Option<Vec<String>>,
) -> Result<(Option<&str>, Option<String>), String> {
    let kind = media_kind.map(str::trim).filter(|k| !k.is_empty());
    if let Some(kind) = kind {
        if !DEVICE_KINDS.contains(&kind) {
            return Err(format!("Tipo de dispositivo desconocido: {kind}."));
        }
    }

    let mut clean = Vec::new();
    for color in colors.unwrap_or_default() {
        let hex = color.trim().to_ascii_lowercase();
        let is_hex = hex.len() == 7
            && hex.starts_with('#')
            && hex[1..].chars().all(|c| c.is_ascii_hexdigit());
        if !is_hex {
            return Err(format!(
                "Color no válido: «{color}». Usa seis dígitos hexadecimales, por ejemplo #ffac1c."
            ));
        }
        clean.push(hex);
    }
    if clean.len() > 2 {
        return Err("El indicador admite uno o dos colores.".to_string());
    }
    if kind.is_none() {
        return Ok((None, None));
    }

    let colors = if clean.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&clean).map_err(|e| e.to_string())?)
    };
    Ok((kind, colors))
}

/// Write (or clear) what a volume is: the kind of device it lives on and the
/// one or two colors of its indicator. This is catalog metadata only; the
/// device itself is never touched.
#[tauri::command]
pub fn set_volume_identity(
    db_path: String,
    volume_id: i64,
    media_kind: Option<String>,
    indicator_colors: Option<Vec<String>>,
) -> Result<(), String> {
    let (kind, colors) = validate_identity(media_kind.as_deref(), indicator_colors)?;
    let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    let changed = db
        .set_volume_identity(volume_id, kind, colors.as_deref())
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("el volumen ya no existe en el catálogo".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn pick_volume_cover(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Elige una imagen para identificar el volumen")
            .add_filter("Imágenes", &["png", "jpg", "jpeg", "webp"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| format!("no se pudo abrir el diálogo: {e}"))?;
    let Some(file) = picked else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    cover_from_path(&path).map(Some)
}

/// Read, shrink and encode the chosen picture as a JPEG data URL.
fn cover_from_path(path: &Path) -> Result<String, String> {
    let size = std::fs::metadata(path)
        .map_err(|e| format!("no se pudo leer la imagen: {e}"))?
        .len();
    if size > MAX_IMAGE_BYTES {
        return Err("La imagen pesa más de 32 MB. Elige una más pequeña.".to_string());
    }
    let image = image::ImageReader::open(path)
        .map_err(|e| format!("no se pudo abrir la imagen: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("no se pudo reconocer la imagen: {e}"))?
        .decode()
        .map_err(|_| {
            "Ese archivo no es una imagen que se pueda leer. Usa PNG, JPG o WebP.".to_string()
        })?;
    let thumb = image.thumbnail(COVER_SIDE, COVER_SIDE);
    let rgb = flatten_on_backdrop(&thumb);
    let mut jpeg = Vec::new();
    let mut out = std::io::Cursor::new(&mut jpeg);
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 78)
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("no se pudo preparar la imagen: {e}"))?;
    Ok(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&jpeg)
    ))
}

/// Composite any transparency over the interface's plate color.
fn flatten_on_backdrop(image: &image::DynamicImage) -> image::RgbImage {
    let rgba = image.to_rgba8();
    image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let p = rgba.get_pixel(x, y);
        let a = p[3] as u32;
        let mix = |back: u8, front: u8| ((back as u32 * (255 - a) + front as u32 * a) / 255) as u8;
        image::Rgb([
            mix(BACKDROP[0], p[0]),
            mix(BACKDROP[1], p[1]),
            mix(BACKDROP[2], p[2]),
        ])
    })
}

/// Store (or clear, with `None`) what the volume holds, in the user's words.
#[tauri::command]
pub fn set_volume_description(
    db_path: String,
    volume_id: i64,
    description: Option<String>,
) -> Result<(), String> {
    let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    let changed = db
        .set_volume_description(volume_id, description.as_deref())
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("el volumen ya no existe en el catálogo".to_string());
    }
    Ok(())
}

/// Store (or clear, with `None`) the catalog image of the volume.
#[tauri::command]
pub fn set_volume_cover(
    db_path: String,
    volume_id: i64,
    cover: Option<String>,
) -> Result<(), String> {
    if let Some(url) = cover.as_deref() {
        let valid = url.starts_with("data:image/") && url.len() <= MAX_COVER_URL;
        if !valid {
            return Err("la imagen del volumen no es válida".to_string());
        }
    }
    let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    let changed = db
        .set_volume_cover(volume_id, cover.as_deref())
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("el volumen ya no existe en el catálogo".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{flatten_on_backdrop, validate_identity};

    #[test]
    fn transparent_pixels_take_the_plate_color() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            2,
            2,
            image::Rgba([255, 0, 0, 0]),
        ));
        let flat = flatten_on_backdrop(&img);
        assert_eq!(flat.get_pixel(0, 0).0, super::BACKDROP);
    }

    #[test]
    fn opaque_pixels_keep_their_color() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            1,
            1,
            image::Rgba([255, 0, 0, 255]),
        ));
        assert_eq!(flatten_on_backdrop(&img).get_pixel(0, 0).0, [255, 0, 0]);
    }

    #[test]
    fn identity_accepts_one_or_two_colors_and_lowercases_them() {
        let (kind, colors) =
            validate_identity(Some("optical"), Some(vec!["#FFAC1C".into()])).unwrap();
        assert_eq!(kind, Some("optical"));
        assert_eq!(colors.as_deref(), Some(r##"["#ffac1c"]"##));

        let (_, colors) =
            validate_identity(Some("nas"), Some(vec!["#35C6D6".into(), "#6a7cf5".into()])).unwrap();
        assert_eq!(colors.as_deref(), Some(r##"["#35c6d6","#6a7cf5"]"##));
    }

    #[test]
    fn identity_can_exist_without_colors() {
        let (kind, colors) = validate_identity(Some("usb"), None).unwrap();
        assert_eq!(kind, Some("usb"));
        assert_eq!(colors, None);
    }

    #[test]
    fn identity_rejects_unknown_kinds_and_bad_colors() {
        assert!(validate_identity(Some("floppy"), None).is_err());
        assert!(validate_identity(Some("usb"), Some(vec!["red".into()])).is_err());
        assert!(validate_identity(Some("usb"), Some(vec!["#ffac1".into()])).is_err());
        assert!(validate_identity(
            Some("usb"),
            Some(vec!["#ffac1c".into(), "#000000".into(), "#ffffff".into()])
        )
        .is_err());
    }

    #[test]
    fn orphan_colors_are_dropped_with_the_kind() {
        let (kind, colors) = validate_identity(None, Some(vec!["#ffac1c".into()])).unwrap();
        assert_eq!(kind, None);
        assert_eq!(colors, None);
    }
}
