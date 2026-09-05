use std::{
    fs::File,
    io::{Read, Seek},
    path::Path,
};
pub fn blake3_partial(path: &Path, n: u64) -> anyhow::Result<String> {
    let mut f = File::open(path)?;
    let mut buf = vec![0u8; n.min(65536) as usize];
    let r = f.read(&mut buf)?;
    buf.truncate(r);
    let mut h = blake3::Hasher::new();
    h.update(&buf);
    h.update(&f.metadata()?.len().to_le_bytes());
    Ok(h.finalize().to_hex().to_string())
}
pub fn blake3_full(path: &Path) -> anyhow::Result<String> {
    let mut f = File::open(path)?;
    let mut h = blake3::Hasher::new();
    let mut buf = [0u8; 8192];
    loop {
        let r = f.read(&mut buf)?;
        if r == 0 {
            break;
        }
        h.update(&buf[..r]);
    }
    let _ = Seek::seek(&mut f, std::io::SeekFrom::Start(0));
    Ok(h.finalize().to_hex().to_string())
}
