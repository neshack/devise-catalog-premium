use std::path::Path;

#[cfg(feature = "test-fixtures")]
pub mod fixtures;

/// Extensions handed to `lofty`. Anything else is never opened.
const AUDIO_EXTS: &[&str] = &[
    "aac", "aiff", "ape", "flac", "m4a", "mp3", "mp4", "oga", "ogg", "opus", "wav", "wv", "wma",
];
/// Extensions handed to `rexif`, which only understands JPEG and TIFF
/// containers. PNG/WebP EXIF is out of scope: rexif would fail anyway.
const IMAGE_EXTS: &[&str] = &["jpeg", "jpg", "tif", "tiff"];

/// EXIF/TIFF tags for pixel dimensions, in the order we trust them.
const TAG_PIXEL_X: u16 = 0xA002;
const TAG_PIXEL_Y: u16 = 0xA003;
const TAG_IMAGE_WIDTH: u16 = 0x0100;
const TAG_IMAGE_LENGTH: u16 = 0x0101;

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct AudioMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u32>,
}

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct ImageMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

pub struct ContainerEntry {
    pub inner_path: String,
    pub size: u64,
}

/// Metadata extracted from a media file, already serialized for storage in
/// the `files.audio_json` / `files.image_json` columns.
#[derive(Debug, Default, PartialEq)]
pub struct FileEnrichment {
    pub audio_json: Option<String>,
    pub image_json: Option<String>,
}

/// Run a parser without letting it take the scan down with it. Third-party
/// decoders panic on malformed input more often than we would like, and a
/// corrupt file must never abort indexing a whole volume (spec §8).
pub fn guarded<T>(f: impl FnOnce() -> T) -> Option<T> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).ok()
}

/// Metadata for `path`, dispatched by extension. Unknown extensions and
/// unparseable files yield empty metadata instead of an error: enrichment is
/// best-effort and must not fail a scan.
pub fn enrich(path: &Path, ext: &str) -> FileEnrichment {
    let ext = ext.to_ascii_lowercase();
    if AUDIO_EXTS.contains(&ext.as_str()) {
        return FileEnrichment {
            audio_json: serialize_audio(path),
            image_json: None,
        };
    }
    if IMAGE_EXTS.contains(&ext.as_str()) {
        return FileEnrichment {
            audio_json: None,
            image_json: serialize_image(path),
        };
    }
    FileEnrichment::default()
}

fn serialize_audio(path: &Path) -> Option<String> {
    let meta = guarded(|| parse_audio(path))??;
    serde_json::to_string(&meta).ok()
}

fn serialize_image(path: &Path) -> Option<String> {
    let meta = guarded(|| parse_image(path))??;
    serde_json::to_string(&meta).ok()
}

pub fn parse_audio(path: &Path) -> Option<AudioMeta> {
    use lofty::prelude::{AudioFile, TaggedFileExt};
    use lofty::tag::Accessor;
    let tagged = lofty::read_from_path(path).ok()?;
    let bitrate = tagged.properties().audio_bitrate();
    let tag = tagged.primary_tag()?;
    let (artist, album) = (
        tag.artist().map(|s| s.to_string()),
        tag.album().map(|s| s.to_string()),
    );
    if artist.is_none() && album.is_none() && bitrate.is_none() {
        return None;
    }
    Some(AudioMeta {
        artist,
        album,
        bitrate,
    })
}

pub fn parse_image(path: &Path) -> Option<ImageMeta> {
    // GPS is deliberately never read (spec §6: always stripped).
    let data = std::fs::read(path).ok()?;
    let (exif, _warnings) = rexif::parse_buffer_quiet(&data);
    let exif = exif.ok()?;
    let dimension = |tag: u16| -> Option<u32> {
        exif.entries
            .iter()
            .find(|entry| entry.ifd.tag == tag)
            .and_then(|entry| match &entry.value {
                rexif::TagValue::U16(values) => values.first().map(|v| u32::from(*v)),
                rexif::TagValue::U32(values) => values.first().copied(),
                _ => None,
            })
    };
    Some(ImageMeta {
        width: dimension(TAG_PIXEL_X).or_else(|| dimension(TAG_IMAGE_WIDTH)),
        height: dimension(TAG_PIXEL_Y).or_else(|| dimension(TAG_IMAGE_LENGTH)),
    })
}

pub fn list_container(path: &Path) -> anyhow::Result<Vec<ContainerEntry>> {
    let f = std::fs::File::open(path)?;
    let mut z = zip::ZipArchive::new(f)?;
    let mut out = Vec::new();
    for i in 0..z.len() {
        let e = z.by_index(i)?;
        out.push(ContainerEntry {
            inner_path: e.name().to_string(),
            size: e.size(),
        });
    }
    Ok(out)
}
