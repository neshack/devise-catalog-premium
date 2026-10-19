import { formatBytes, formatCount, formatEta, percentOf } from "../lib/format";
import type { ScanRun } from "../lib/types";
import { useCatalog } from "../stores/catalog";

function formatRate(bytesPerSec: number | null): string | null {
  if (bytesPerSec === null || bytesPerSec < 1) return null;
  return `${formatBytes(bytesPerSec)}/s`;
}

const RELATIVE = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

/** How long ago the last heartbeat was. It is what dates an interruption. */
function sinceLabel(epochSeconds: number): string {
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (secs < 90) return "hace instantes";
  const mins = Math.round(secs / 60);
  if (mins < 90) return RELATIVE.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours < 36) return RELATIVE.format(-hours, "hour");
  return RELATIVE.format(-Math.round(hours / 24), "day");
}

/**
 * The always-visible state of the catalog's work: what it is reading, how far
 * it has come, and what is left — or, when nothing is live, where the last
 * attempt stopped and how to continue it.
 */
export default function ReadingStrip() {
  const { scan, pauseScan, resumeScan, cancelScan } = useCatalog();
  const { running, state, phase, filesSeen, filesTotal, currentPath, etaSecs, bytesPerSec, errorCount, run } =
    scan;

  // Nothing live, but the catalog remembers an attempt that never finished:
  // that is exactly the case the user has to be told about.
  if (!running && run !== null && (run.state === "interrupted" || run.state === "paused")) {
    return <StoppedStrip run={run} onResume={resumeScan} />;
  }
  if (!running) return null;

  const done = percentOf(filesSeen, filesTotal);
  const eta = formatEta(etaSecs);
  const rate = formatRate(bytesPerSec);
  const paused = state === "paused";
  const stopping = state === "cancelling";
  const label = paused
    ? "En pausa"
    : stopping
      ? "Cancelando"
      : phase === "walk"
        ? "Recorriendo carpetas"
        : "Indexando cambios";

  return (
    <section className="reading" aria-label="Escaneo en curso">
      <div className="reading__phase">
        <span className="reading__ladder" aria-hidden="true">
          <i className={`on${phase === "walk" ? " hot" : ""}`} />
          <i className={phase === "index" ? "on hot" : ""} />
        </span>
        <span className="reading__phase-text">{label}</span>
      </div>

      <div
        className="reading__track"
        role="progressbar"
        aria-label="Avance del escaneo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done ?? undefined}
      >
        {done !== null ? (
          <>
            <div className="reading__fill" style={{ width: `${done}%` }} />
            <div className="reading__beam" style={{ left: `${done}%` }} />
          </>
        ) : (
          // No total to divide by yet: the beam sweeps instead of inventing a
          // measurement the walk cannot know.
          <div className="reading__beam reading__beam--live" />
        )}
      </div>

      <div className="reading__figures">
        <div className="reading__fig">
          <b>{formatCount(filesSeen)}</b>
          <span>{filesTotal !== null ? `de ~${formatCount(filesTotal)} archivos` : "archivos"}</span>
        </div>
        {done !== null && (
          <div className="reading__fig">
            <b>{done} %</b>
            <span>completado</span>
          </div>
        )}
        {eta !== null && (
          <div className="reading__fig">
            <b>{eta}</b>
            <span>restante</span>
          </div>
        )}
        {rate !== null && (
          <div className="reading__fig">
            <b>{rate}</b>
            <span>velocidad</span>
          </div>
        )}
        {errorCount > 0 && (
          <div className="reading__fig">
            <b>{formatCount(errorCount)}</b>
            <span>sin leer</span>
          </div>
        )}
      </div>

      <div className="reading__actions">
        {paused ? (
          <button className="btn btn--sm" onClick={() => void resumeScan()}>
            Reanudar
          </button>
        ) : (
          <button className="btn btn--sm" onClick={() => void pauseScan()} disabled={stopping}>
            Pausar
          </button>
        )}
        <button className="btn btn--ghost btn--sm" onClick={() => void cancelScan()} disabled={stopping}>
          Cancelar
        </button>
      </div>

      {currentPath !== null && (
        <div className="reading__where" title={currentPath}>
          {currentPath}
        </div>
      )}
    </section>
  );
}

/** A run the catalog remembers but nobody is driving any more. */
function StoppedStrip({ run, onResume }: { run: ScanRun; onResume: () => Promise<void> }) {
  const where = run.current_path ?? run.root;
  return (
    <section className="reading" aria-label="Escaneo interrumpido">
      <div className="reading__phase">
        <span className="reading__ladder" aria-hidden="true">
          <i className="on" />
          <i />
        </span>
        <span className="reading__phase-text">
          {run.state === "paused" ? "En pausa" : "Escaneo interrumpido"}
        </span>
      </div>

      <div className="reading__track" aria-hidden="true">
        <div
          className="reading__fill"
          style={{ width: `${percentOf(run.files_seen, run.files_total) ?? 0}%` }}
        />
      </div>

      <div className="reading__figures">
        <div className="reading__fig">
          <b>{formatCount(run.files_seen)}</b>
          <span>
            {run.files_total !== null
              ? `de ~${formatCount(run.files_total)} archivos`
              : "archivos antes de parar"}
          </span>
        </div>
        <div className="reading__fig">
          <b>{sinceLabel(run.heartbeat_at)}</b>
          <span>última señal</span>
        </div>
        {run.error_count > 0 && (
          <div className="reading__fig">
            <b>{formatCount(run.error_count)}</b>
            <span>sin leer</span>
          </div>
        )}
      </div>

      <div className="reading__actions">
        <button className="btn btn--sm" onClick={() => void onResume()}>
          Reanudar
        </button>
      </div>

      <div className="reading__where" title={where}>
        {run.volume_label} · se quedó en {where}
      </div>
    </section>
  );
}
