//! Fixtures are built byte by byte on purpose: no binary blobs checked into
//! the repo, and the tests document exactly which tags the parsers read.

use core_parsers::enrich;

/// Minimal FLAC: STREAMINFO (44.1 kHz, stereo, 16-bit) plus a Vorbis comment
/// holding ARTIST and ALBUM. No audio frames — the metadata is all we read.
fn flac_fixture(artist: &str, album: &str) -> Vec<u8> {
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
    let vendor = b"devise-catalog-tests";
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

/// Minimal JPEG whose APP1 segment carries little-endian EXIF with
/// ImageWidth (0x0100) and ImageLength (0x0101).
fn jpeg_exif_fixture(width: u16, height: u16) -> Vec<u8> {
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

#[test]
fn enrich_reads_audio_tags_and_image_dimensions() {
    let dir = tempfile::tempdir().unwrap();

    let flac = dir.path().join("song.flac");
    std::fs::write(&flac, flac_fixture("Nina Simone", "Feeling Good")).unwrap();
    let meta = enrich(&flac, "flac");
    let audio: serde_json::Value =
        serde_json::from_str(meta.audio_json.as_deref().expect("audio json")).unwrap();
    assert_eq!(audio["artist"], "Nina Simone");
    assert_eq!(audio["album"], "Feeling Good");
    assert_eq!(meta.image_json, None);

    let jpeg = dir.path().join("photo.jpg");
    std::fs::write(&jpeg, jpeg_exif_fixture(640, 480)).unwrap();
    let meta = enrich(&jpeg, "jpg");
    let image: serde_json::Value =
        serde_json::from_str(meta.image_json.as_deref().expect("image json")).unwrap();
    assert_eq!(image["width"], 640);
    assert_eq!(image["height"], 480);
    assert_eq!(meta.audio_json, None);
}

#[test]
fn enrich_leaves_other_extensions_and_broken_files_alone() {
    let dir = tempfile::tempdir().unwrap();

    // Not a media extension: never touches the file.
    let text = dir.path().join("notes.txt");
    std::fs::write(&text, b"hello").unwrap();
    let meta = enrich(&text, "txt");
    assert_eq!(meta.audio_json, None);
    assert_eq!(meta.image_json, None);

    // Claims to be audio and is not: no metadata, and above all no panic.
    let broken = dir.path().join("broken.mp3");
    std::fs::write(&broken, b"\x00\x01\x02 definitely not an mp3").unwrap();
    assert_eq!(enrich(&broken, "mp3").audio_json, None);

    // Claims to be a JPEG and is not.
    let broken_jpeg = dir.path().join("broken.jpg");
    std::fs::write(&broken_jpeg, b"\x00\x01\x02").unwrap();
    assert_eq!(enrich(&broken_jpeg, "jpg").image_json, None);
}

#[test]
fn enrich_survives_a_panicking_parser() {
    // Third-party parsers panic on malformed input often enough that the scan
    // must not die with them (spec §8).
    let guarded = core_parsers::guarded(|| -> u8 { panic!("parser exploded") });
    assert_eq!(guarded, None);
    assert_eq!(core_parsers::guarded(|| 7u8), Some(7));
}
