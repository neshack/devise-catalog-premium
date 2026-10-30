//! Catalog exports: CSV and JSON for machines, HTML for people.
//!
//! The HTML page carries the app's own visual language (graphite panel, amber
//! lamp, asset labels) and its mark, so an exported volume looks like a
//! document from Devise Catalog Premium and not like a bare dump. Nothing is
//! fetched from the network: everything it needs is inline.

pub struct Row {
    pub name: String,
    pub size: i64,
    pub volume: String,
    /// Full location: folder + name, or `archive ▸ entry` inside a container.
    pub path: String,
}

/// What identifies the exported volume, when the export is about one.
pub struct VolumeMeta {
    pub label: String,
    pub serial: String,
    pub description: Option<String>,
    pub cover: Option<String>,
}

pub struct HtmlOptions<'a> {
    pub volume: Option<&'a VolumeMeta>,
    /// App version, printed in the footer.
    pub version: &'a str,
    /// Human date, formatted by the caller (local time lives in the window).
    pub generated: &'a str,
    /// Rows and bytes in the selection. `rows` may be shorter: a page meant to
    /// be read is capped, and saying so is the only honest way to cap it.
    pub total_rows: usize,
    pub total_bytes: i64,
}

/// RFC-4180 quoting: quote fields containing `,`, `"`, space, `\n`/`\r`, or
/// with a leading `=`, `+`, `-`, `@` (formula-injection guard); inner quotes
/// are doubled.
fn csv_field(s: &str) -> String {
    let needs = s.contains([',', '"', ' ', '\n', '\r']) || s.starts_with(['=', '+', '-', '@']);
    if needs {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Only our own data URLs are embedded: anything else in the column is
/// ignored instead of being written into an `img src`.
fn safe_cover(cover: &Option<String>) -> Option<&str> {
    let url = cover.as_deref()?;
    let rest = url.strip_prefix("data:image/")?;
    if !rest.contains(";base64,") || rest.contains(['"', '\'', '<', '>', ' ']) {
        return None;
    }
    Some(url)
}

/// `1.234`, like the interface writes counts. Spanish catalog, Spanish dots.
fn group_thousands(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push('.');
        }
        out.push(c);
    }
    out
}

/// `36,3 MB` / `221 KB`, the same reading as the rest of the app (1024-based).
pub fn human_size(bytes: i64) -> String {
    const UNITS: [&str; 6] = ["B", "KB", "MB", "GB", "TB", "PB"];
    if bytes <= 0 {
        return "0 B".to_string();
    }
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else if value >= 100.0 {
        format!("{} {}", group_thousands(value.round() as u64), UNITS[unit])
    } else {
        format!("{:.1}", value).replace('.', ",") + " " + UNITS[unit]
    }
}

/// Civil date from Unix seconds (UTC), written the Spanish way: `29 oct 2026`.
/// The window passes its own local date to the page; this is the fallback for
/// callers that have no timezone (tests, other front ends).
pub fn format_date(secs: i64) -> String {
    const MONTHS: [&str; 12] = [
        "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
    ];
    // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
    let days = secs.div_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!("{d:02} {} {year}", MONTHS[(m - 1) as usize])
}

pub fn to_csv(rows: &[Row]) -> String {
    let mut s = String::from("name,size,volume,path\n");
    for r in rows {
        s.push_str(&format!(
            "{},{},{},{}\n",
            csv_field(&r.name),
            r.size,
            csv_field(&r.volume),
            csv_field(&r.path)
        ));
    }
    s
}

pub fn to_json(rows: &[Row]) -> String {
    serde_json::to_string_pretty(
        &rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "name": r.name,
                    "size": r.size,
                    "volume": r.volume,
                    "path": r.path,
                })
            })
            .collect::<Vec<_>>(),
    )
    // Serialization of plain strings/ints cannot realistically fail; fall back
    // to an empty array instead of panicking an IPC handler.
    .unwrap_or_else(|_| "[]".into())
}

/// The mark: a disc read by a spectral arc, same geometry as the app icon.
fn mark_svg(size: u32) -> String {
    format!(
        r##"<svg class="mark" width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="spectral" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d6d"/><stop offset=".35" stop-color="#ffb02e"/><stop offset=".62" stop-color="#8fd96a"/><stop offset=".8" stop-color="#35c6d6"/><stop offset="1" stop-color="#6a7cf5"/></linearGradient></defs><circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" stroke-opacity=".45"/><path d="M12 3.2a8.8 8.8 0 0 1 8.8 8.8" fill="none" stroke="url(#spectral)" stroke-width="2.6"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-opacity=".6"/></svg>"##
    )
}

pub fn to_html(rows: &[Row], opts: &HtmlOptions<'_>) -> String {
    let shown = rows.len();
    let title = match opts.volume {
        Some(v) => format!("{} — Devise Catalog Premium", v.label),
        None => "Catálogo completo — Devise Catalog Premium".to_string(),
    };

    // A single volume does not need a column repeating its own name.
    let volume_column = opts.volume.is_none();
    let mut body = String::new();
    for r in rows {
        body.push_str("<tr><td class=\"name\">");
        body.push_str(&html_escape(&r.name));
        body.push_str("</td><td class=\"path\">");
        body.push_str(&html_escape(&r.path));
        body.push_str("</td>");
        if volume_column {
            body.push_str("<td><span class=\"tag\">");
            body.push_str(&html_escape(&r.volume));
            body.push_str("</span></td>");
        }
        body.push_str(&format!(
            "<td class=\"num\">{}</td></tr>\n",
            human_size(r.size)
        ));
    }

    let hero = match opts.volume {
        Some(v) => {
            let cover = safe_cover(&v.cover)
                .map(|url| {
                    format!(
                        "<img class=\"cover\" src=\"{url}\" alt=\"Portada de {}\">",
                        html_escape(&v.label)
                    )
                })
                .unwrap_or_else(|| {
                    format!(
                        "<div class=\"cover cover--empty\" aria-hidden=\"true\">{}</div>",
                        mark_svg(44)
                    )
                });
            let description = v
                .description
                .as_deref()
                .map(|d| format!("<p class=\"lede\">{}</p>", html_escape(d)))
                .unwrap_or_default();
            format!(
                "<section class=\"hero\">{cover}<div class=\"hero__body\">\
                 <p class=\"legend\">Volumen</p><h1>{label}</h1>\
                 <p class=\"serial\">{serial}</p>{description}</div></section>",
                label = html_escape(&v.label),
                serial = html_escape(&v.serial),
            )
        }
        None => "<section class=\"hero hero--all\"><div class=\"hero__body\">\
                 <p class=\"legend\">Catálogo</p><h1>Todos los volúmenes</h1>\
                 <p class=\"serial\">Exportación completa del catálogo</p></div></section>"
            .to_string(),
    };

    let capped = opts.total_rows > shown;
    let cap_note = if capped {
        format!(
            "<p class=\"cap\">Esta página muestra las primeras <b>{shown}</b> de \
             <b>{total}</b> entradas para poder abrirse rápido. \
             Usa CSV o JSON para exportar la lista completa.</p>",
            shown = group_thousands(shown as u64),
            total = group_thousands(opts.total_rows as u64),
        )
    } else {
        String::new()
    };

    let stats = format!(
        "<div class=\"stats\"><div class=\"stat\"><span class=\"stat__value\">{files}</span>\
         <span class=\"stat__label\">archivos</span></div>\
         <div class=\"stat\"><span class=\"stat__value\">{size}</span>\
         <span class=\"stat__label\">indexados</span></div>\
         <div class=\"stat\"><span class=\"stat__value\">{stamp}</span>\
         <span class=\"stat__label\">generado</span></div></div>",
        files = group_thousands(opts.total_rows as u64),
        size = human_size(opts.total_bytes),
        stamp = html_escape(opts.generated),
    );

    format!(
        r##"<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Devise Catalog Premium {version}">
<title>{title}</title>
<link rel="icon" href="data:image/svg+xml,{icon}">
<style>
:root {{
  color-scheme: dark;
  --bg:#0d0f0e; --surface:#141816; --surface-2:#191d1a; --line:#262b27;
  --line-strong:#3a4239; --ink:#ecefe9; --muted:#a5b0a6; --faint:#7d8a80;
  --amber:#ffac1c; --amber-soft:rgba(255,172,28,.12);
  --ui:"Archivo",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,"Cascadia Code","Source Code Pro",Menlo,Consolas,monospace;
}}
* {{ box-sizing:border-box; }}
html {{ background:var(--bg); }}
body {{ margin:0; color:var(--ink); font-family:var(--ui); font-size:14px; line-height:1.5;
  background:radial-gradient(900px 420px at 18% -10%, rgba(255,172,28,.07), transparent 60%), var(--bg); }}
.wrap {{ max-width:1180px; margin:0 auto; padding:0 24px 48px; }}
.top {{ display:flex; align-items:center; gap:12px; padding:18px 0 14px; border-bottom:1px solid var(--line-strong); }}
.mark {{ flex:none; color:var(--ink); }}
.wordmark {{ font-size:14px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; line-height:1; }}
.wordmark small {{ display:block; margin-top:4px; font-family:var(--mono); font-size:8.5px; font-weight:500;
  letter-spacing:.3em; color:var(--faint); }}
.top__spacer {{ flex:1; }}
.top__meta {{ font-family:var(--mono); font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--faint); }}
.hero {{ display:flex; align-items:center; gap:20px; padding:28px 0 22px; border-bottom:1px solid var(--line); }}
.cover {{ width:88px; height:88px; flex:none; object-fit:cover; border:1px solid var(--line-strong);
  border-radius:3px; background:var(--surface-2); }}
.cover--empty {{ display:grid; place-items:center; color:var(--faint); }}
.hero__body {{ min-width:0; }}
.legend {{ margin:0 0 6px; font-size:10px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:var(--faint); }}
h1 {{ margin:0; font-size:clamp(26px,3.4vw,38px); font-weight:700; letter-spacing:-.01em; line-height:1.05; }}
.serial {{ margin:6px 0 0; font-family:var(--mono); font-size:11px; letter-spacing:.12em;
  text-transform:uppercase; color:var(--amber); }}
.lede {{ margin:10px 0 0; max-width:70ch; color:var(--muted); font-size:13.5px; }}
.stats {{ display:flex; flex-wrap:wrap; gap:10px; padding:16px 0; border-bottom:1px solid var(--line); }}
.stat {{ min-width:132px; padding:10px 14px; background:var(--surface); border:1px solid var(--line);
  border-radius:3px; }}
.stat__value {{ display:block; font-family:var(--mono); font-size:16px; font-weight:600; }}
.stat__label {{ display:block; margin-top:2px; font-size:9.5px; font-weight:700; letter-spacing:.16em;
  text-transform:uppercase; color:var(--faint); }}
.tools {{ display:flex; align-items:center; gap:12px; padding:18px 0 10px; }}
.tools label {{ font-size:10px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--faint); }}
.tools input {{ flex:1; max-width:420px; height:32px; padding:0 10px; color:var(--ink);
  background:#0a0c0b; border:1px solid var(--line-strong); border-radius:3px; font:inherit; font-size:13px; }}
.tools input:focus {{ outline:none; border-color:rgba(255,172,28,.4); }}
.cap {{ margin:0 0 10px; padding:9px 12px; font-size:12px; color:var(--muted);
  background:var(--amber-soft); border:1px solid rgba(255,172,28,.3); border-radius:3px; }}
.cap b {{ color:var(--ink); }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
thead th {{ position:sticky; top:0; z-index:1; padding:8px 10px; text-align:left;
  font-size:9.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--faint);
  background:var(--surface-2); border-bottom:1px solid var(--line-strong); }}
tbody td {{ padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }}
tbody tr:hover {{ background:var(--surface); }}
td.name {{ font-weight:600; }}
td.path {{ font-family:var(--mono); font-size:11px; color:var(--faint); word-break:break-all; }}
td.num {{ text-align:right; white-space:nowrap; font-family:var(--mono); font-size:11.5px; }}
.tag {{ display:inline-block; padding:2px 6px; font-family:var(--mono); font-size:10px;
  border:1px solid var(--line-strong); border-radius:2px; color:var(--muted); white-space:nowrap; }}
.empty-filter {{ display:none; padding:18px 0; color:var(--faint); font-size:13px; }}
.foot {{ display:flex; flex-wrap:wrap; gap:8px 18px; margin-top:24px; padding-top:14px;
  border-top:1px solid var(--line-strong); font-family:var(--mono); font-size:10px;
  letter-spacing:.12em; text-transform:uppercase; color:var(--faint); }}
.foot b {{ color:var(--amber); font-weight:500; }}
@media print {{
  :root {{
    color-scheme:light;
    --bg:#fff; --surface:#fff; --surface-2:#f6f6f4; --line:#e2e2e2; --line-strong:#c8c8c8;
    --ink:#111; --muted:#444; --faint:#666; --amber:#8a5a00; --amber-soft:#fff4dd;
  }}
  body {{ background:#fff; }}
  .tools,.cap {{ display:none; }}
  .cover {{ background:#fff; }}
  .top__meta,.wordmark small {{ color:#666; }}
  thead th {{ position:static; background:#f2f2f2; color:#555; }}
  tbody td {{ border-color:#e2e2e2; }}
  td.path,.tag {{ color:#555; }}
  .foot b {{ color:#8a5a00; }}
}}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    {mark}
    <div class="wordmark">Devise Catalog<small>Premium · v{version}</small></div>
    <div class="top__spacer"></div>
    <div class="top__meta">100 % local · sin red</div>
  </header>
  {hero}
  {stats}
  <div class="tools">
    <label for="filter">Filtrar</label>
    <input id="filter" type="search" placeholder="Nombre, ruta o volumen…" autocomplete="off" spellcheck="false">
  </div>
  {cap_note}
  <table>
    <thead><tr><th>Nombre</th><th>Ruta</th>{volume_head}<th style="text-align:right">Tamaño</th></tr></thead>
    <tbody>
{body}
    </tbody>
  </table>
  <p class="empty-filter" id="empty">Ninguna entrada coincide con el filtro.</p>
  <footer class="foot">
    <span>Generado con <b>Devise Catalog Premium</b></span>
    <span>{stamp}</span>
    <span>El catálogo no toca los discos</span>
  </footer>
</div>
<script>
(function () {{
  var input = document.getElementById("filter");
  var empty = document.getElementById("empty");
  var rows = Array.prototype.slice.call(document.querySelectorAll("tbody tr"));
  input.addEventListener("input", function () {{
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    rows.forEach(function (row) {{
      var hit = q === "" || row.textContent.toLowerCase().indexOf(q) !== -1;
      row.style.display = hit ? "" : "none";
      if (hit) shown++;
    }});
    empty.style.display = shown === 0 ? "block" : "none";
  }});
}})();
</script>
</body>
</html>
"##,
        version = html_escape(opts.version),
        title = html_escape(&title),
        icon = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Ccircle%20cx='12'%20cy='12'%20r='10'%20fill='none'%20stroke='%23ffac1c'%20stroke-width='2'/%3E%3C/svg%3E",
        mark = mark_svg(26),
        hero = hero,
        stats = stats,
        cap_note = cap_note,
        volume_head = if volume_column { "<th>Volumen</th>" } else { "" },
        body = body,
        stamp = html_escape(opts.generated),
    )
}
