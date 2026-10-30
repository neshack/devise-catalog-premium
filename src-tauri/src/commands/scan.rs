use std::cell::{Cell, RefCell};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::atomic::{AtomicI64, AtomicU8, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use core_scanner::{ScanEntry, ScanMonitor, ScanProgress};

/// What the app can be doing with the one scan it runs at a time.
const IDLE: u8 = 0;
const RUNNING: u8 = 1;
const PAUSED: u8 = 2;
const CANCELLING: u8 = 3;

/// How often a live scan proves it is alive and mirrors its counters.
const BEAT_EVERY: Duration = Duration::from_secs(2);
/// How often progress reaches the window: faster than a human reads, slower
/// than a webview can be flooded.
const EMIT_EVERY: Duration = Duration::from_millis(150);
/// How long a parked walk sleeps before it beats again. Also the worst case
/// between pressing "reanudar" and the walk moving.
const PARK_POLL: Duration = Duration::from_millis(400);
/// A run quiet for this long can only belong to a process that is gone. Long
/// enough that a suspended laptop is never mistaken for a dead one.
const STALE_AFTER_SECS: i64 = 120;

/// Control plane of the single scan the app runs at a time.
///
/// Parking is a condition variable, never a spin loop: a paused scan costs
/// nothing while the window stays fully usable. State lives in an atomic so
/// the walk can see a cancellation without taking the lock.
struct ScanControl {
    state: AtomicU8,
    run_id: AtomicI64,
    lock: Mutex<()>,
    resumed: Condvar,
}

impl ScanControl {
    fn new() -> Self {
        Self {
            state: AtomicU8::new(IDLE),
            run_id: AtomicI64::new(0),
            lock: Mutex::new(()),
            resumed: Condvar::new(),
        }
    }

    fn state(&self) -> u8 {
        self.state.load(Ordering::SeqCst)
    }

    /// False when the scan was not running: pausing is a request, not a
    /// guarantee, because the scan may have finished a moment ago.
    fn pause(&self) -> bool {
        self.state
            .compare_exchange(RUNNING, PAUSED, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    fn resume(&self) -> bool {
        if self
            .state
            .compare_exchange(PAUSED, RUNNING, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            self.resumed.notify_all();
            true
        } else {
            false
        }
    }

    fn cancel(&self) {
        self.state.store(CANCELLING, Ordering::SeqCst);
        self.resumed.notify_all();
    }

    /// Blocks while a pause is in effect. Timing out rather than waiting
    /// forever is what lets a paused scan keep beating: the catalog must never
    /// look busy just because the app is asleep.
    fn park(&self) {
        if self.state() != PAUSED {
            return;
        }
        let mut guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        while self.state() == PAUSED {
            guard = match self.resumed.wait_timeout(guard, PARK_POLL) {
                Ok((next, _)) => next,
                Err(poisoned) => poisoned.into_inner().0,
            };
        }
    }
}

fn control() -> &'static ScanControl {
    static CONTROL: OnceLock<ScanControl> = OnceLock::new();
    CONTROL.get_or_init(ScanControl::new)
}

fn state_name(state: u8) -> &'static str {
    match state {
        RUNNING => "running",
        PAUSED => "paused",
        CANCELLING => "cancelling",
        _ => "idle",
    }
}

/// Throttled scan progress pushed to the UI (`scan://progress`) and mirrored
/// into the run row behind it.
///
/// During the walk `files_total` is an estimate (the previous scan's count): a
/// real total cannot be known without walking the disk again, and inventing
/// one would make the percentage a lie. In the index phase both totals are
/// exact, because the work left is known before it starts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct ScanEvent {
    pub run_id: i64,
    /// "walk" while the tree is traversed, "index" while rows are written.
    pub phase: &'static str,
    pub state: &'static str,
    pub files_seen: u64,
    pub bytes_seen: u64,
    pub files_total: Option<u64>,
    pub bytes_total: Option<u64>,
    pub current_path: Option<String>,
    pub error_count: u64,
    pub bytes_per_sec: Option<f64>,
    pub eta_secs: Option<u64>,
}

/// How an attempt ended. Cancelling and failing are outcomes, not transport
/// errors: the UI decides what to say about each.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct ScanOutcome {
    pub run_id: i64,
    /// The volume this attempt indexed: the window needs it to attach the
    /// description and the catalog image the user wrote in the scan dialog.
    pub volume_id: i64,
    pub files_seen: u64,
    pub state: &'static str,
}

#[tauri::command]
pub fn cancel_scan() -> Result<(), String> {
    control().cancel();
    Ok(())
}

/// Pause the live scan, if there is one. The row moves to `paused` so the
/// state survives even if the window is closed right after.
#[tauri::command]
pub fn pause_scan(db_path: String) -> Result<(), String> {
    let ctl = control();
    if !ctl.pause() {
        return Ok(());
    }
    let run_id = ctl.run_id.load(Ordering::SeqCst);
    if run_id != 0 {
        let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
        db.set_scan_run_state(run_id, "paused")
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Continue the scan: unpause when this process still owns it, restart it when
/// the process that started it is gone.
///
/// The restart is cheap and safe because the catalog is differential: files
/// whose size and mtime did not change are never read again, so a second pass
/// costs a walk and almost nothing else. Returns whether it had to restart.
#[tauri::command]
pub async fn resume_scan(app: tauri::AppHandle, db_path: String) -> Result<bool, String> {
    if control().resume() {
        return Ok(false);
    }
    if control().state() != IDLE {
        return Err("el escaneo ya está en marcha".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
        let run = db
            .latest_scan_run()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no hay ningún escaneo que reanudar".to_string())?;
        match run.state.as_str() {
            // Nothing to continue: those two ended on purpose.
            "completed" | "cancelled" => Err("el último escaneo ya había terminado".to_string()),
            _ => scan_volume_blocking(
                &app,
                &run.root,
                &run.volume_label,
                &run.volume_serial,
                &db_path,
                Some(run.id),
            )
            .map(|_| true),
        }
    })
    .await
    .map_err(|e| format!("scan task failed: {e}"))?
}

/// What the UI needs the moment it opens: whether this process is scanning,
/// and what the last attempt left behind.
#[derive(serde::Serialize)]
pub struct ScanStatus {
    pub live: &'static str,
    pub run: Option<core_db::ScanRun>,
}

#[tauri::command]
pub fn scan_status(db_path: String) -> Result<ScanStatus, String> {
    let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    Ok(ScanStatus {
        live: state_name(control().state()),
        run: db.latest_scan_run().map_err(|e| e.to_string())?,
    })
}

/// Close the runs a dead process left open. Called once, at start-up: a live
/// scan keeps beating and must never be swept. Returns how many were marked.
#[tauri::command]
pub fn recover_stale_scans(db_path: String) -> Result<usize, String> {
    let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    db.sweep_stale_scan_runs(STALE_AFTER_SECS)
        .map_err(|e| e.to_string())
}

/// Cheap stable hex hash for normalized dir paths (NOT a content hash; only a
/// unique-ish key for dirs so re-scans resolve the same row). No new deps.
fn dir_hash(normalized: &str) -> String {
    let mut h = DefaultHasher::new();
    normalized.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// Ensure the full normalized dir chain exists (`a/b` -> ensure `a`, then
/// `a/b` with real parent linkage). `dir_rel` is "" for the volume root.
/// Returns the leaf dir id. Idempotent via insert_dir upsert.
fn ensure_dir(
    db: &core_db::Db,
    volume_id: i64,
    dir_rel: &str,
    cache: &mut HashMap<String, i64>,
) -> Result<i64, String> {
    if dir_rel.is_empty() {
        if let Some(id) = cache.get("/") {
            return Ok(*id);
        }
        let id = db
            .insert_dir(volume_id, None, "/", &dir_hash("/"))
            .map_err(|e| e.to_string())?;
        cache.insert("/".to_string(), id);
        return Ok(id);
    }
    if let Some(id) = cache.get(dir_rel) {
        return Ok(*id);
    }
    let mut parent = ensure_dir(db, volume_id, "", cache)?;
    let mut acc = String::new();
    let mut leaf = parent;
    for comp in dir_rel.split('/').filter(|c| !c.is_empty()) {
        if !acc.is_empty() {
            acc.push('/');
        }
        acc.push_str(comp);
        if let Some(cached) = cache.get(&acc) {
            parent = *cached;
            leaf = *cached;
            continue;
        }
        let id = db
            .insert_dir(volume_id, Some(parent), comp, &dir_hash(&acc))
            .map_err(|e| e.to_string())?;
        cache.insert(acc.clone(), id);
        parent = id;
        leaf = id;
    }
    Ok(leaf)
}

/// Rebuild full normalized dir paths from (id, parent, name) rows. Legacy rows
/// (parent None, name holding a full "a/b" dkey) are used verbatim.
fn dir_full_paths(dirs: &[core_db::DirRow]) -> HashMap<i64, String> {
    let by_id: HashMap<i64, &core_db::DirRow> = dirs.iter().map(|d| (d.id, d)).collect();
    let mut memo: HashMap<i64, String> = HashMap::new();
    fn resolve(
        id: i64,
        by_id: &HashMap<i64, &core_db::DirRow>,
        memo: &mut HashMap<i64, String>,
    ) -> String {
        if let Some(p) = memo.get(&id) {
            return p.clone();
        }
        // Walk up to the nearest memoized (or root/cyclic) ancestor.
        let mut chain: Vec<i64> = Vec::new();
        let mut cur = id;
        loop {
            if memo.contains_key(&cur) || chain.contains(&cur) || !by_id.contains_key(&cur) {
                break;
            }
            chain.push(cur);
            match by_id[&cur].parent_id {
                Some(p) if p != cur => cur = p,
                _ => break,
            }
        }
        let mut base = memo.get(&cur).cloned().unwrap_or_default();
        for id in chain.iter().rev() {
            let row = by_id[id];
            if row.parent_id.is_none() && row.name.contains('/') {
                base = row.name.clone(); // legacy full-path row
            } else if base.is_empty() || base == "/" {
                base = if row.name == "/" {
                    "/".to_string()
                } else {
                    format!("/{}", row.name.trim_matches('/'))
                };
            } else {
                base = format!("{base}/{}", row.name.trim_matches('/'));
            }
        }
        if base.len() > 1 {
            base = base.trim_end_matches('/').to_string();
        }
        if base.is_empty() {
            base = "/".to_string();
        }
        // Canonical form: leading slash (matches scan-time dir_key), so rows
        // written by pre-normalization scans still resolve on re-scan.
        if !base.starts_with('/') {
            base = format!("/{base}");
        }
        memo.insert(id, base.clone());
        base
    }
    let ids: Vec<i64> = by_id.keys().copied().collect();
    let mut out = HashMap::new();
    for id in ids {
        out.insert(id, resolve(id, &by_id, &mut memo));
    }
    out
}

/// Async so the scan runs off the main thread (a sync command would freeze
/// the whole window during long walks); progress is streamed via events.
#[tauri::command]
pub async fn scan_volume(
    app: tauri::AppHandle,
    root: String,
    label: String,
    serial: String,
    db_path: String,
) -> Result<ScanOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scan_volume_blocking(&app, &root, &label, &serial, &db_path, None)
    })
    .await
    .map_err(|e| format!("scan task failed: {e}"))?
}

fn scan_volume_blocking(
    app: &tauri::AppHandle,
    root: &str,
    label: &str,
    serial: &str,
    db_path: &str,
    resume: Option<i64>,
) -> Result<ScanOutcome, String> {
    use tauri::Emitter;
    // One scan at a time is not a limitation to work around: two walks writing
    // the same volume would race each other's differential snapshot.
    if resume.is_none() && control().state() != IDLE {
        return Err("ya hay un escaneo en marcha".to_string());
    }
    let emitter = app.clone();
    scan_into_db(
        db_path,
        root,
        label,
        serial,
        resume,
        &move |event: ScanEvent| {
            let _ = emitter.emit("scan://progress", event);
        },
    )
}

/// Live bookkeeping of one attempt: the counters the UI reads, the heartbeat
/// that proves the scan is alive, and the errors that must outlive the process.
///
/// Every method takes `&self` on purpose: the walk reports through a trait
/// object, so shared borrows are what keep the pipeline readable.
struct Session<'a> {
    db: &'a core_db::Db,
    volume_id: i64,
    run_id: i64,
    emit: &'a dyn Fn(ScanEvent),
    phase: Cell<&'static str>,
    files_seen: Cell<u64>,
    bytes_seen: Cell<u64>,
    files_total: Cell<Option<u64>>,
    bytes_total: Cell<Option<u64>>,
    current: RefCell<Option<String>>,
    errors: RefCell<Vec<(String, String)>>,
    files_per_sec: Cell<f64>,
    bytes_per_sec: Cell<f64>,
    last_files: Cell<u64>,
    last_bytes: Cell<u64>,
    last_rate_at: Cell<Instant>,
    last_beat: Cell<Instant>,
    last_emit: Cell<Instant>,
}

impl<'a> Session<'a> {
    fn start(
        db: &'a core_db::Db,
        volume_id: i64,
        root: &str,
        resume: Option<i64>,
        emit: &'a dyn Fn(ScanEvent),
    ) -> Result<Self, String> {
        let run_id = match resume {
            Some(id) => {
                db.set_scan_run_state(id, "running")
                    .map_err(|e| e.to_string())?;
                id
            }
            None => db
                .start_scan_run(volume_id, root, "walk")
                .map_err(|e| e.to_string())?,
        };
        // The best estimate available for a walk that has not counted
        // anything yet: what the previous finished scan of this volume saw.
        let estimate = db
            .last_completed_file_count(volume_id)
            .map_err(|e| e.to_string())?;
        let now = Instant::now();
        let session = Self {
            db,
            volume_id,
            run_id,
            emit,
            phase: Cell::new("walk"),
            files_seen: Cell::new(0),
            bytes_seen: Cell::new(0),
            files_total: Cell::new(estimate.map(|n| n.max(0) as u64)),
            bytes_total: Cell::new(None),
            current: RefCell::new(None),
            errors: RefCell::new(Vec::new()),
            files_per_sec: Cell::new(0.0),
            bytes_per_sec: Cell::new(0.0),
            last_files: Cell::new(0),
            last_bytes: Cell::new(0),
            last_rate_at: Cell::new(now),
            last_beat: Cell::new(now - BEAT_EVERY),
            last_emit: Cell::new(now - EMIT_EVERY),
        };
        let ctl = control();
        ctl.run_id.store(run_id, Ordering::SeqCst);
        ctl.state.store(RUNNING, Ordering::SeqCst);
        // The window hears from the scan before the first file is read.
        session.tick();
        Ok(session)
    }

    fn set(&self, phase: &'static str, files: u64, bytes: u64, current: Option<&str>) {
        self.phase.set(phase);
        self.files_seen.set(files);
        self.bytes_seen.set(bytes);
        *self.current.borrow_mut() = current.filter(|c| !c.is_empty()).map(|c| c.to_string());
    }

    /// The index phase knows its exact size before it starts: that is what
    /// turns the percentage and the remaining time into measurements.
    fn begin_index(&self, files: u64, bytes: u64) {
        self.phase.set("index");
        self.files_seen.set(0);
        self.bytes_seen.set(0);
        self.files_total.set(Some(files));
        self.bytes_total.set(Some(bytes));
        self.last_files.set(0);
        self.last_bytes.set(0);
        self.files_per_sec.set(0.0);
        self.bytes_per_sec.set(0.0);
        self.last_rate_at.set(Instant::now());
        self.tick();
    }

    fn note_error(&self, path: &str, reason: &str) {
        // Kept in memory until the attempt ends: thousands of unreadable
        // folders would otherwise become thousands of tiny transactions, and a
        // half-written list helps nobody.
        self.errors
            .borrow_mut()
            .push((path.to_string(), reason.to_string()));
    }

    fn error_count(&self) -> u64 {
        self.errors.borrow().len() as u64
    }

    /// Smoothed throughput, heartbeat and event, all throttled. Called from
    /// the walk callback, from the index loop and from a paused scan's park.
    fn tick(&self) {
        let now = Instant::now();
        // Raw deltas inside one beat are far too jumpy to show a human, and an
        // ETA built on them would jump around instead of informing.
        let elapsed = now.duration_since(self.last_rate_at.get()).as_secs_f64();
        if elapsed >= 0.5 {
            let files = self.files_seen.get() as f64;
            let bytes = self.bytes_seen.get() as f64;
            let files_delta = (files - self.last_files.get() as f64).max(0.0) / elapsed;
            let bytes_delta = (bytes - self.last_bytes.get() as f64).max(0.0) / elapsed;
            let smooth = |prev: f64, next: f64| {
                if prev <= 0.0 {
                    next
                } else {
                    prev * 0.65 + next * 0.35
                }
            };
            self.files_per_sec
                .set(smooth(self.files_per_sec.get(), files_delta));
            self.bytes_per_sec
                .set(smooth(self.bytes_per_sec.get(), bytes_delta));
            self.last_files.set(self.files_seen.get());
            self.last_bytes.set(self.bytes_seen.get());
            self.last_rate_at.set(now);
        }
        if now.duration_since(self.last_beat.get()) >= BEAT_EVERY {
            let _ = self.db.beat_scan_run(self.run_id, &self.beat());
            self.last_beat.set(now);
        }
        if now.duration_since(self.last_emit.get()) >= EMIT_EVERY {
            let state = state_name(control().state());
            (self.emit)(self.event(state));
            self.last_emit.set(now);
        }
    }

    /// Bytes when the phase knows them (index), files when only an estimate
    /// exists (walk). Whichever pair is present drives the answer; silence is
    /// better than a made-up number.
    fn estimate_left(&self) -> Option<u64> {
        if let Some(total) = self.bytes_total.get() {
            let rate = self.bytes_per_sec.get();
            let seen = self.bytes_seen.get();
            if rate > 1.0 && total > seen {
                return Some(((total - seen) as f64 / rate).ceil() as u64);
            }
        }
        let total = self.files_total.get()?;
        let rate = self.files_per_sec.get();
        let seen = self.files_seen.get();
        if rate > 0.5 && total > seen {
            Some(((total - seen) as f64 / rate).ceil() as u64)
        } else {
            None
        }
    }

    fn beat(&self) -> core_db::RunBeat {
        core_db::RunBeat {
            phase: self.phase.get().to_string(),
            files_seen: self.files_seen.get() as i64,
            bytes_seen: self.bytes_seen.get() as i64,
            files_total: self.files_total.get().map(|n| n as i64),
            bytes_total: self.bytes_total.get().map(|n| n as i64),
            current_path: self.current.borrow().clone(),
            error_count: self.error_count() as i64,
        }
    }

    fn event(&self, state: &'static str) -> ScanEvent {
        ScanEvent {
            run_id: self.run_id,
            phase: self.phase.get(),
            state,
            files_seen: self.files_seen.get(),
            bytes_seen: self.bytes_seen.get(),
            files_total: self.files_total.get(),
            bytes_total: self.bytes_total.get(),
            current_path: self.current.borrow().clone(),
            error_count: self.error_count(),
            bytes_per_sec: (self.bytes_per_sec.get() > 1.0).then(|| self.bytes_per_sec.get()),
            eta_secs: self.estimate_left(),
        }
    }

    /// Close the attempt: what could not be read lands in the catalog, the row
    /// gets its outcome, the window gets one last event, and the app goes back
    /// to idle so another scan can start.
    fn finish(&self, state: &'static str, error: Option<&str>) {
        let _ = self
            .db
            .replace_scan_errors(self.volume_id, &self.errors.borrow());
        let _ = self
            .db
            .finish_scan_run(self.run_id, state, &self.beat(), error);
        (self.emit)(self.event(state));
        let ctl = control();
        ctl.state.store(IDLE, Ordering::SeqCst);
        ctl.run_id.store(0, Ordering::SeqCst);
        ctl.resumed.notify_all();
    }
}

/// The walk's view of the app: it can cancel, it can park, and everything it
/// reports goes through the session (heartbeat and events included).
struct LiveGate<'a> {
    session: &'a Session<'a>,
}

impl ScanMonitor for LiveGate<'_> {
    fn cancelled(&self) -> bool {
        control().state() == CANCELLING
    }

    fn park_if_paused(&self) {
        control().park();
        // Beating while parked is what keeps a paused scan looking alive
        // instead of looking like a process that died.
        self.session.tick();
    }

    fn progress(&self, progress: ScanProgress) {
        self.session.set(
            "walk",
            progress.files_seen as u64,
            progress.bytes_seen,
            Some(&progress.current_path),
        );
        self.session.tick();
    }

    fn failed(&self, path: &str, reason: &str) {
        self.session.note_error(path, reason);
        self.session.tick();
    }
}

/// Index `root` into the catalog at `db_path`, reporting progress through
/// `on_event`. Free of Tauri types on purpose: the whole scan pipeline
/// (walk, differential sync, enrichment, container expansion) is exercised
/// from tests by calling this directly.
///
/// Differential: files whose size and mtime are unchanged are skipped
/// entirely (no re-hash, no write); rows that no longer exist on disk are
/// deleted. `resume` continues an earlier attempt's row instead of opening a
/// new one, which is how a scan survives the app being killed mid-walk.
pub fn scan_into_db(
    db_path: &str,
    root: &str,
    label: &str,
    serial: &str,
    resume: Option<i64>,
    on_event: &dyn Fn(ScanEvent),
) -> Result<ScanOutcome, String> {
    let db = core_db::Db::open(Path::new(db_path)).map_err(|e| e.to_string())?;
    let vid = db.insert_volume(label, serial).map_err(|e| e.to_string())?;
    let session = Session::start(&db, vid, root, resume, on_event)?;
    let gate = LiveGate { session: &session };

    let rootp = Path::new(root).to_path_buf();
    let entries = core_scanner::collect_entries(&rootp, &gate);
    if gate.cancelled() {
        // A partial walk says nothing about what is on disk: indexing it would
        // make every file that was not reached yet look deleted.
        session.finish("cancelled", None);
        return Ok(ScanOutcome {
            run_id: session.run_id,
            volume_id: vid,
            files_seen: entries.len() as u64,
            state: "cancelled",
        });
    }

    match index_entries(&db, &session, &gate, vid, &rootp, entries) {
        Ok(files_seen) => {
            let state = if gate.cancelled() {
                "cancelled"
            } else {
                "completed"
            };
            session.finish(state, None);
            Ok(ScanOutcome {
                run_id: session.run_id,
                volume_id: vid,
                files_seen,
                state,
            })
        }
        Err(err) => {
            session.finish("failed", Some(&err));
            Err(err)
        }
    }
}

/// Second phase: decide what changed, index exactly that, prune what is gone.
fn index_entries(
    db: &core_db::Db,
    session: &Session<'_>,
    gate: &LiveGate<'_>,
    vid: i64,
    rootp: &Path,
    entries: Vec<ScanEntry>,
) -> Result<u64, String> {
    // Snapshot of what's already indexed for differential sync:
    // (dir, name, container) -> (size, mtime, id). Entries are removed from
    // this map as they are seen; leftovers are rows to DELETE. The container
    // belongs in the key because the same name can live on disk, inside one
    // archive and inside another, all of them in the same folder.
    let dir_paths = dir_full_paths(&db.dirs_for_volume(vid).map_err(|e| e.to_string())?);
    let mut existing: HashMap<RowKey, (i64, i64, i64)> = HashMap::new();
    for f in db.files_for_volume(vid).map_err(|e| e.to_string())? {
        let dir = dir_paths
            .get(&f.dir_id)
            .cloned()
            .unwrap_or_else(|| "/".to_string());
        existing.insert((dir, f.name, f.container_path), (f.size, f.mtime, f.id));
    }

    // The exact size of the work about to happen. Counting it up front is what
    // makes the percentage and the remaining time real instead of decorative.
    let mut todo_files = 0u64;
    let mut todo_bytes = 0u64;
    for e in &entries {
        match existing.get(&entry_key(&e.rel_path, &e.name, &e.container_path)) {
            Some((size, mtime, _)) if *size == e.size && *mtime == e.mtime => {}
            _ => {
                todo_files += 1;
                if e.container_path.is_none() {
                    todo_bytes += e.size.max(0) as u64;
                }
            }
        }
    }
    session.begin_index(todo_files, todo_bytes);

    let mut batch: Vec<core_db::NewFile> = Vec::with_capacity(5000);
    let mut total = 0u64;
    let mut done_files = 0u64;
    let mut done_bytes = 0u64;
    let mut dircache: HashMap<String, i64> = HashMap::new();
    for e in entries {
        if gate.cancelled() {
            // What was already read stays: those files exist. Nothing is
            // pruned from a partial pass, because everything not reached yet
            // would look deleted.
            if !batch.is_empty() {
                db.insert_file_batch(&batch).map_err(|e| e.to_string())?;
            }
            return Ok(total);
        }
        total += 1;
        // Normalize Windows separators so one volume never stores "a\b" and "a/b".
        let rel = e.rel_path.replace('\\', "/");
        let rel = rel.trim_start_matches('/').to_string();
        let (dir_rel, name) = match rel.rsplit_once('/') {
            Some((d, n)) => (d.to_string(), n.to_string()),
            None => (String::new(), rel.clone()),
        };
        // Canonical dir key matching dir_full_paths output.
        let dir_key = if dir_rel.is_empty() {
            "/".to_string()
        } else {
            format!("/{}", dir_rel.trim_matches('/'))
        };
        let abs = rootp.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        let expand_archive = e.ext.eq_ignore_ascii_case("zip");

        // Counted with the same predicate the pre-pass used, so the figures on
        // screen and the work being done cannot drift apart.
        let needs_work =
            match existing.get(&(dir_key.clone(), name.clone(), e.container_path.clone())) {
                Some((size, mtime, _)) => *size != e.size || *mtime != e.mtime,
                None => true,
            };
        if needs_work {
            done_files += 1;
            if e.container_path.is_none() {
                done_bytes += e.size.max(0) as u64;
            }
        }
        session.set("index", done_files, done_bytes, Some(&rel));
        session.tick();

        sync_row(
            db,
            session,
            vid,
            &mut existing,
            &mut batch,
            &mut dircache,
            Row {
                dir_rel: dir_rel.clone(),
                dir_key: dir_key.clone(),
                name,
                ext: e.ext,
                size: e.size,
                mtime: e.mtime,
                abs: Some(abs.clone()),
                container_path: e.container_path,
            },
        )?;

        // Archives are indexed by content too: the rows inside come from the
        // central directory, nothing is ever extracted.
        if expand_archive {
            for row in archive_rows(session, &abs, &rel, &dir_rel, &dir_key, e.mtime) {
                sync_row(
                    db,
                    session,
                    vid,
                    &mut existing,
                    &mut batch,
                    &mut dircache,
                    row,
                )?;
            }
        }
    }
    if !batch.is_empty() {
        db.insert_file_batch(&batch).map_err(|e| e.to_string())?;
    }
    // Whatever was never seen is gone from disk: delete it, then collect dirs
    // left empty (bottom-up, files/children never harmed).
    let missing: Vec<i64> = existing.values().map(|(_, _, id)| *id).collect();
    db.delete_files(&missing).map_err(|e| e.to_string())?;
    db.delete_empty_dirs(vid).map_err(|e| e.to_string())?;
    Ok(total)
}

/// How a walk entry is addressed in the catalog: the folder key, the name and,
/// for entries inside an archive, which archive.
fn entry_key(rel_path: &str, name: &str, container: &Option<String>) -> RowKey {
    let rel = rel_path.replace('\\', "/");
    let rel = rel.trim_start_matches('/');
    let dir_key = match rel.rsplit_once('/') {
        Some((d, _)) => format!("/{}", d.trim_matches('/')),
        None => "/".to_string(),
    };
    (dir_key, name.to_string(), container.clone())
}

/// Identity of a row inside a volume: its folder, its name, and — for entries
/// inside an archive — which archive.
type RowKey = (String, String, Option<String>);

/// One row to synchronize, either a file found on disk or an entry read from
/// an archive's central directory.
struct Row {
    dir_rel: String,
    dir_key: String,
    name: String,
    ext: String,
    size: i64,
    mtime: i64,
    /// Path on disk to hash and parse. `None` for archive entries: hashing
    /// every member of every archive costs far more than it is worth.
    abs: Option<std::path::PathBuf>,
    container_path: Option<String>,
}

/// Index pointer of a ZIP: enough of them in one archive and the catalog
/// (and the UI reading it) stops being useful, so the rest is dropped.
const MAX_ARCHIVE_ENTRIES: usize = 10_000;

/// Rows for what a ZIP holds, read from its central directory.
///
/// The row name is the entry's path inside the archive. Entry paths are unique
/// per archive, so two differently placed `readme.txt` cannot land on the same
/// row. Entries inherit the archive's mtime: that is when they arrived in the
/// catalog, and it keeps the differential comparison stable between scans.
fn archive_rows(
    session: &Session<'_>,
    archive: &Path,
    container_rel: &str,
    dir_rel: &str,
    dir_key: &str,
    mtime: i64,
) -> Vec<Row> {
    let entries = match core_parsers::guarded(|| core_parsers::list_container(archive)) {
        Some(Ok(entries)) => entries,
        // A truncated or unsupported archive is still a file, just one whose
        // insides nobody can read: saying so beats pretending it was empty.
        _ => {
            session.note_error(
                &archive.to_string_lossy(),
                "no se pudo leer el archivo comprimido",
            );
            return Vec::new();
        }
    };
    entries
        .into_iter()
        .filter_map(|entry| {
            let inner = entry.inner_path.replace('\\', "/");
            let inner = inner.trim_end_matches('/'); // directory marker, not a file
            if inner.is_empty() {
                return None;
            }
            let ext = Path::new(inner)
                .extension()
                .map(|e| e.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            Some(Row {
                dir_rel: dir_rel.to_string(),
                dir_key: dir_key.to_string(),
                name: inner.to_string(),
                ext,
                size: entry.size.min(i64::MAX as u64) as i64,
                mtime,
                abs: None,
                container_path: Some(container_rel.to_string()),
            })
        })
        .take(MAX_ARCHIVE_ENTRIES)
        .collect()
}

/// Bring one row in line with disk: skip it untouched when size and mtime
/// match, refresh it when they do not, insert it when it is new.
#[allow(clippy::too_many_arguments)]
fn sync_row(
    db: &core_db::Db,
    session: &Session<'_>,
    vid: i64,
    existing: &mut HashMap<RowKey, (i64, i64, i64)>,
    batch: &mut Vec<core_db::NewFile>,
    dircache: &mut HashMap<String, i64>,
    row: Row,
) -> Result<(), String> {
    let key = (row.dir_key, row.name.clone(), row.container_path.clone());
    // Hashing and metadata are best-effort: a file that vanished mid-scan or
    // that no parser understands still gets indexed. What could not be read is
    // written down instead of swallowed.
    let fingerprint = || match &row.abs {
        Some(path) => {
            let hash = match core_hash::blake3_partial(path, 65536) {
                Ok(hash) => Some(hash),
                Err(_) => {
                    session.note_error(
                        &path.to_string_lossy(),
                        "no se pudo leer para calcular el hash",
                    );
                    None
                }
            };
            (hash, core_parsers::enrich(path, &row.ext))
        }
        None => (None, core_parsers::FileEnrichment::default()),
    };
    match existing.remove(&key) {
        Some((size, mtime, _)) if size == row.size && mtime == row.mtime => Ok(()),
        Some((_, _, id)) => {
            let (hash, meta) = fingerprint();
            db.update_file(
                id,
                row.size,
                row.mtime,
                hash.as_deref(),
                meta.audio_json.as_deref(),
                meta.image_json.as_deref(),
            )
            .map_err(|e| e.to_string())
        }
        None => {
            let dir_id = ensure_dir(db, vid, &row.dir_rel, dircache)?;
            let (hash, meta) = fingerprint();
            batch.push(core_db::NewFile {
                dir_id,
                volume_id: vid,
                name: row.name,
                ext: row.ext,
                size: row.size,
                mtime: row.mtime,
                blake3: hash,
                container_path: row.container_path,
                audio_json: meta.audio_json,
                image_json: meta.image_json,
            });
            if batch.len() >= 5000 {
                db.insert_file_batch(batch).map_err(|e| e.to_string())?;
                batch.clear();
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_db::{Db, ParsedQuery};
    use std::fs;
    use std::path::Path as StdPath;

    /// Every row in the catalog, read through the same query interface the
    /// app uses (empty query = no MATCH, all rows).
    fn all_rows(db_path: &StdPath) -> Vec<core_db::SearchHit> {
        let db = Db::open(db_path).unwrap();
        db.search(
            &ParsedQuery {
                fts: String::new(),
                ext: None,
                exts: Vec::new(),
                min_size: None,
                max_size: None,
                volume: None,
                volume_serial: None,
                tags: Vec::new(),
            },
            1000,
        )
        .unwrap()
    }

    fn scan(db_path: &StdPath, root: &StdPath) -> ScanOutcome {
        scan_into_db(
            db_path.to_str().unwrap(),
            root.to_str().unwrap(),
            "TestVol",
            "SER-1",
            None,
            &|_| {},
        )
        .unwrap()
    }

    fn setup() -> (tempfile::TempDir, tempfile::TempDir) {
        (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap())
    }

    #[test]
    fn scan_indexes_nested_files_with_dir_paths() {
        let (root, cat) = setup();
        let db = cat.path().join("t.cdc");
        fs::create_dir_all(root.path().join("sub/deep")).unwrap();
        fs::write(root.path().join("top.txt"), b"hello").unwrap();
        fs::write(root.path().join("sub/deep/song.flac"), b"world").unwrap();

        assert_eq!(scan(&db, root.path()).files_seen, 2);

        let mut rows: Vec<(String, String)> = all_rows(&db)
            .into_iter()
            .map(|h| (h.path.clone(), h.name.clone()))
            .collect();
        rows.sort();
        assert_eq!(
            rows,
            vec![
                ("/".to_string(), "top.txt".to_string()),
                ("/sub/deep".to_string(), "song.flac".to_string()),
            ]
        );
    }

    #[test]
    fn scan_stores_audio_and_image_metadata() {
        let (root, cat) = setup();
        let db = cat.path().join("t.cdc");
        fs::write(
            root.path().join("track.flac"),
            core_parsers::fixtures::flac("Nina Simone", "Feeling Good"),
        )
        .unwrap();
        fs::write(
            root.path().join("cover.jpg"),
            core_parsers::fixtures::jpeg_with_dimensions(640, 480),
        )
        .unwrap();

        assert_eq!(scan(&db, root.path()).files_seen, 2);

        let rows = all_rows(&db);
        let audio = rows
            .iter()
            .find(|h| h.name == "track.flac")
            .expect("flac row");
        let audio_json = audio.audio_json.as_deref().expect("stored audio json");
        assert!(audio_json.contains("Nina Simone"), "got {audio_json}");
        assert!(audio_json.contains("Feeling Good"), "got {audio_json}");

        let image = rows
            .iter()
            .find(|h| h.name == "cover.jpg")
            .expect("jpg row");
        let image_json = image.image_json.as_deref().expect("stored image json");
        assert!(image_json.contains("\"width\":640"), "got {image_json}");
        assert!(image_json.contains("\"height\":480"), "got {image_json}");

        // A rescan that only changes the file's content must refresh the
        // metadata too, not keep the stale copy.
        fs::write(
            root.path().join("track.flac"),
            core_parsers::fixtures::flac("Bill Evans", "Waltz for Debby"),
        )
        .unwrap();
        scan(&db, root.path());
        let rows = all_rows(&db);
        let audio = rows
            .iter()
            .find(|h| h.name == "track.flac")
            .expect("flac row");
        let audio_json = audio.audio_json.as_deref().expect("refreshed audio json");
        assert!(audio_json.contains("Bill Evans"), "got {audio_json}");
        assert!(!audio_json.contains("Nina Simone"), "got {audio_json}");
    }

    #[test]
    fn scan_indexes_zip_entries_without_extracting() {
        let (root, cat) = setup();
        let db = cat.path().join("t.cdc");
        fs::write(
            root.path().join("fotos.zip"),
            core_parsers::fixtures::zip_with(&[
                ("docs/informe.pdf", b"fake pdf"),
                ("notas.txt", b"hello zip"),
            ]),
        )
        .unwrap();

        // One file on disk: the archive itself.
        assert_eq!(scan(&db, root.path()).files_seen, 1);

        let rows = all_rows(&db);
        assert_eq!(rows.len(), 3, "archive plus its two entries");
        let archive = rows
            .iter()
            .find(|h| h.name == "fotos.zip")
            .expect("archive row");
        assert_eq!(archive.container_path, None);

        let mut entries: Vec<(String, Option<String>, i64)> = rows
            .iter()
            .filter(|h| h.name != "fotos.zip")
            .map(|h| (h.name.clone(), h.container_path.clone(), h.size))
            .collect();
        entries.sort();
        assert_eq!(
            entries,
            vec![
                (
                    "docs/informe.pdf".to_string(),
                    Some("fotos.zip".to_string()),
                    8
                ),
                ("notas.txt".to_string(), Some("fotos.zip".to_string()), 9),
            ]
        );

        // Rescan: entries must neither duplicate nor get swept as missing,
        // even though the archive shows up as unchanged on disk.
        scan(&db, root.path());
        assert_eq!(all_rows(&db).len(), 3);

        // Removing the archive takes its entries with it.
        fs::remove_file(root.path().join("fotos.zip")).unwrap();
        scan(&db, root.path());
        assert_eq!(all_rows(&db).len(), 0);
    }

    #[test]
    fn scan_keeps_same_entry_name_from_different_archives_apart() {
        let (root, cat) = setup();
        let db = cat.path().join("t.cdc");
        for name in ["a.zip", "b.zip"] {
            fs::write(
                root.path().join(name),
                core_parsers::fixtures::zip_with(&[("readme.txt", b"same name inside")]),
            )
            .unwrap();
        }

        assert_eq!(scan(&db, root.path()).files_seen, 2);
        let containers: Vec<Option<String>> = all_rows(&db)
            .into_iter()
            .filter(|h| h.name == "readme.txt")
            .map(|h| h.container_path)
            .collect();
        assert_eq!(
            containers.len(),
            2,
            "both archives hold a readme.txt and both must be indexed"
        );

        // The old (dir, name) key would treat them as one row and re-insert
        // the loser on every scan.
        scan(&db, root.path());
        assert_eq!(all_rows(&db).len(), 4);
    }

    #[test]
    fn rescan_skips_unchanged_and_deletes_removed_files() {
        let (root, cat) = setup();
        let db = cat.path().join("t.cdc");
        fs::create_dir_all(root.path().join("sub")).unwrap();
        fs::write(root.path().join("top.txt"), b"hello").unwrap();
        fs::write(root.path().join("sub/gone.txt"), b"bye").unwrap();

        scan(&db, root.path());
        let first: Vec<String> = all_rows(&db).into_iter().map(|h| h.name).collect();
        assert_eq!(first.len(), 2);

        // Unchanged rescan must not duplicate rows.
        scan(&db, root.path());
        assert_eq!(all_rows(&db).len(), 2);

        // Removed file disappears, survivors stay.
        fs::remove_file(root.path().join("sub/gone.txt")).unwrap();
        scan(&db, root.path());
        let names: Vec<String> = all_rows(&db).into_iter().map(|h| h.name).collect();
        assert_eq!(names, vec!["top.txt".to_string()]);
    }

    #[test]
    fn pause_parks_the_walk_and_cancel_wakes_it() {
        let ctl = ScanControl::new();
        // Nothing is running yet: pausing is a no-op request, not a state.
        assert!(!ctl.pause());
        ctl.state.store(RUNNING, Ordering::SeqCst);
        assert!(ctl.pause());

        std::thread::scope(|scope| {
            let parked = scope.spawn(|| {
                let start = Instant::now();
                ctl.park();
                start.elapsed()
            });
            std::thread::sleep(Duration::from_millis(250));
            assert!(!parked.is_finished(), "a paused walk must not move");
            assert!(ctl.resume());
            let waited = parked.join().unwrap();
            assert!(waited >= Duration::from_millis(200), "waited {waited:?}");
        });

        // A cancel has to wake a parked walk too, or a paused scan could never
        // be stopped.
        ctl.state.store(PAUSED, Ordering::SeqCst);
        std::thread::scope(|scope| {
            let parked = scope.spawn(|| ctl.park());
            std::thread::sleep(Duration::from_millis(150));
            assert!(!parked.is_finished());
            ctl.cancel();
            parked.join().unwrap();
            assert_eq!(ctl.state(), CANCELLING);
        });
    }

    #[test]
    fn a_finished_scan_is_recorded_as_completed() {
        let (root, cat) = setup();
        let db_path = cat.path().join("t.cdc");
        fs::write(root.path().join("a.txt"), b"a").unwrap();
        fs::write(root.path().join("b.txt"), b"bb").unwrap();

        let outcome = scan(&db_path, root.path());
        assert_eq!(outcome.state, "completed");
        assert_eq!(outcome.files_seen, 2);

        let db = Db::open(&db_path).unwrap();
        let run = db.latest_scan_run().unwrap().expect("run row");
        assert_eq!(run.id, outcome.run_id);
        assert_eq!(run.state, "completed");
        assert_eq!(run.phase, "index");
        assert_eq!(run.files_seen, 2);
        assert_eq!(run.bytes_seen, 3);
        assert_eq!(run.files_total, Some(2));
        assert_eq!(run.bytes_total, Some(3));
        assert_eq!(run.error_count, 0);
    }

    #[test]
    fn a_process_that_vanished_leaves_an_interrupted_run() {
        let (_root, cat) = setup();
        let db_path = cat.path().join("t.cdc");
        let db = Db::open(&db_path).unwrap();
        let vid = db.insert_volume("TestVol", "SER-1").unwrap();
        // What a killed app leaves behind: a run that started, reported once
        // and then went quiet forever.
        let run_id = db.start_scan_run(vid, "/media/cd", "walk").unwrap();
        db.beat_scan_run(
            run_id,
            &core_db::RunBeat {
                phase: "walk".to_string(),
                files_seen: 40,
                bytes_seen: 900,
                files_total: Some(100),
                bytes_total: None,
                current_path: Some("fotos/2023".to_string()),
                error_count: 0,
            },
        )
        .unwrap();

        // A negative window means "anything not beating this very second",
        // which is how a suspended machine must not look alive.
        assert_eq!(db.sweep_stale_scan_runs(-1).unwrap(), 1);
        let latest = db.latest_scan_run().unwrap().unwrap();
        assert_eq!(latest.state, "interrupted");
        assert_eq!(latest.files_seen, 40);
        assert_eq!(latest.current_path.as_deref(), Some("fotos/2023"));

        // Sweeping again must leave closed runs alone.
        assert_eq!(db.sweep_stale_scan_runs(-1).unwrap(), 0);
    }

    #[test]
    fn resume_continues_the_same_run_and_skips_unchanged_files() {
        let (root, cat) = setup();
        let db_path = cat.path().join("t.cdc");
        fs::write(root.path().join("a.txt"), b"a").unwrap();
        fs::write(root.path().join("b.txt"), b"bb").unwrap();
        let first = scan(&db_path, root.path());

        // Kill the process, keep the row: that is all a later start can see.
        let db = Db::open(&db_path).unwrap();
        db.set_scan_run_state(first.run_id, "paused").unwrap();
        db.sweep_stale_scan_runs(-1).unwrap();

        let index_totals = std::cell::RefCell::new(Vec::new());
        let resumed = scan_into_db(
            db_path.to_str().unwrap(),
            root.path().to_str().unwrap(),
            "TestVol",
            "SER-1",
            Some(first.run_id),
            &|event| {
                if event.phase == "index" {
                    index_totals.borrow_mut().push((
                        event.files_total.unwrap_or(u64::MAX),
                        event.bytes_total.unwrap_or(u64::MAX),
                    ));
                }
            },
        )
        .unwrap();

        assert_eq!(
            resumed.run_id, first.run_id,
            "continuing, not starting over"
        );
        assert_eq!(resumed.state, "completed");
        assert_eq!(resumed.files_seen, 2);
        // Nothing changed on disk, so the second pass had nothing to index:
        // this is what makes resuming cheap.
        let totals = index_totals.borrow();
        assert!(
            totals
                .iter()
                .all(|(files, bytes)| *files == 0 && *bytes == 0),
            "expected no work left, got {totals:?}"
        );
        assert_eq!(all_rows(&db_path).len(), 2, "no duplicated rows");
    }

    #[test]
    fn unreadable_archives_are_written_down() {
        let (root, cat) = setup();
        let db_path = cat.path().join("t.cdc");
        fs::write(root.path().join("roto.zip"), b"not an archive at all").unwrap();

        let outcome = scan(&db_path, root.path());
        assert_eq!(outcome.state, "completed");

        let db = Db::open(&db_path).unwrap();
        let errors = db.scan_errors(1).unwrap();
        assert_eq!(errors.len(), 1, "one unreadable archive, one row");
        assert!(errors[0].0.ends_with("roto.zip"), "got {:?}", errors[0].0);
        assert!(errors[0].1.contains("comprimido"), "got {:?}", errors[0].1);
        // The archive itself is still indexed: it exists, nobody can just read
        // its insides.
        assert_eq!(all_rows(&db_path).len(), 1);
        let run = db.latest_scan_run().unwrap().unwrap();
        assert_eq!(run.error_count, 1);
    }
}
