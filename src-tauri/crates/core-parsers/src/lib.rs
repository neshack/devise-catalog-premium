use std::path::Path;
pub struct AudioMeta {
    pub artist: Option<String>,
    pub album: Option<String>,
    pub bitrate: Option<u32>,
}
pub struct ImageMeta {
    pub width: Option<u32>,
    pub height: Option<u32>,
}
pub struct ContainerEntry {
    pub inner_path: String,
    pub size: u64,
}

pub fn parse_audio(path: &Path) -> Option<AudioMeta> {
    use lofty::prelude::TaggedFileExt;
    use lofty::tag::Accessor;
    let tagged = lofty::read_from_path(path).ok()?;
    let tag = tagged.primary_tag()?;
    Some(AudioMeta {
        artist: tag.artist().map(|s| s.to_string()),
        album: tag.album().map(|s| s.to_string()),
        bitrate: None,
    })
}
pub fn parse_image(path: &Path) -> Option<ImageMeta> {
    // MVP: valida que el buffer sea JPEG con EXIF legible; dimensiones reales en follow-up.
    // GPS siempre ignorado por privacidad (spec §6).
    let data = std::fs::read(path).ok()?;
    let _exif = rexif::parse_buffer(&data).ok()?;
    Some(ImageMeta {
        width: None,
        height: None,
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
