//! Media fixtures built byte by byte, shared by this crate's tests and by the
//! scan wiring tests in the app crate. No binary blobs in the repo, and the
//! tests document exactly which tags the parsers are expected to read.
//!
//! Compiled only with the `test-fixtures` feature.

/// Minimal FLAC: STREAMINFO (44.1 kHz, stereo, 16-bit) plus a Vorbis comment
/// holding ARTIST and ALBUM. No audio frames — the metadata is all we read.
pub fn flac(artist: &str, album: &str) -> Vec<u8> {
    let mut out = Vec::from(*b"fLaC");

    let mut streaminfo = Vec::new();
    streaminfo.extend_from_slice(&4096u16.to_be_bytes()); // min block size
    streaminfo.extend_from_slice(&4096u16.to_be_bytes()); // max block size
    streaminfo.extend_from_slice(&[0, 0, 0]); // min frame size
    streaminfo.extend_from_slice(&[0, 0, 0]); // max frame size
    let packed: u64 = (44_100u64 << 44) | ((2 - 1) << 41) | ((16 - 1) << 36);
    streaminfo.extend_from_slice(&packed.to_be_bytes());
    streaminfo.extend_from_slice(&[0u8; 16]); // md5
    assert_eq!(streaminfo.len(), 34);

    out.push(0x00); // STREAMINFO, not the last block
    out.extend_from_slice(&[0, 0, 34]);
    out.extend_from_slice(&streaminfo);

    let mut vorbis = Vec::new();
    let vendor = b"cd-catalog-tests";
    vorbis.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
    vorbis.extend_from_slice(vendor);
    let comments = [format!("ARTIST={artist}"), format!("ALBUM={album}")];
    vorbis.extend_from_slice(&(comments.len() as u32).to_le_bytes());
    for comment in &comments {
        vorbis.extend_from_slice(&(comment.len() as u32).to_le_bytes());
        vorbis.extend_from_slice(comment.as_bytes());
    }

    out.push(0x84); // VORBIS_COMMENT, last block
    out.extend_from_slice(&(vorbis.len() as u32).to_be_bytes()[1..]); // 24-bit length
    out.extend_from_slice(&vorbis);
    out
}

/// A ZIP archive holding `entries` as `(path inside the archive, contents)`.
pub fn zip_with(entries: &[(&str, &[u8])]) -> Vec<u8> {
    use std::io::Write;
    let mut out = Vec::new();
    {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(&mut out));
        for (name, data) in entries {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap();
    }
    out
}

/// Minimal JPEG whose APP1 segment carries little-endian EXIF with
/// ImageWidth (0x0100) and ImageLength (0x0101).
pub fn jpeg_with_dimensions(width: u16, height: u16) -> Vec<u8> {
    let mut tiff = Vec::new();
    tiff.extend_from_slice(b"II");
    tiff.extend_from_slice(&42u16.to_le_bytes());
    tiff.extend_from_slice(&8u32.to_le_bytes()); // IFD0 offset
    tiff.extend_from_slice(&2u16.to_le_bytes()); // entry count
    for (tag, value) in [(0x0100u16, width), (0x0101u16, height)] {
        tiff.extend_from_slice(&tag.to_le_bytes());
        tiff.extend_from_slice(&3u16.to_le_bytes()); // type SHORT
        tiff.extend_from_slice(&1u32.to_le_bytes()); // count
        tiff.extend_from_slice(&value.to_le_bytes()); // value (4-byte field)
        tiff.extend_from_slice(&[0, 0]);
    }
    tiff.extend_from_slice(&0u32.to_le_bytes()); // no next IFD

    let mut jpeg = Vec::from([0xFF, 0xD8]);
    jpeg.extend_from_slice(&[0xFF, 0xE1]);
    jpeg.extend_from_slice(&((tiff.len() + 8) as u16).to_be_bytes());
    jpeg.extend_from_slice(b"Exif\0\0");
    jpeg.extend_from_slice(&tiff);
    jpeg.extend_from_slice(&[0xFF, 0xD9]);
    jpeg
}
