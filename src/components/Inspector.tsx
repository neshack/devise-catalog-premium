import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Hit } from "./CatalogTree";

interface DuplicateGroup {
  blake3: string;
  size: number;
  count: number;
  sample_name: string;
}

export default function Inspector({
  hit,
  dbPath,
}: {
  hit: Hit | null;
  dbPath: string;
}) {
  const [dups, setDups] = useState<DuplicateGroup[] | null>(null);
  const [dupsError, setDupsError] = useState<string | null>(null);

  useEffect(() => {
    setDups(null);
    setDupsError(null);
  }, [hit?.id, dbPath]);

  async function loadDuplicates() {
    setDupsError(null);
    try {
      const rows = await invoke<DuplicateGroup[]>("list_duplicates", {
        dbPath,
        limit: 100,
      });
      setDups(rows);
    } catch (e) {
      setDupsError(String(e));
    }
  }

  return (
    <div className="w-80 p-3 border-l border-zinc-800">
      {hit === null ? (
        <div className="text-zinc-500">Sin selección</div>
      ) : (
        <div>
          <h2>{hit.name}</h2>
          <p>Volumen: {hit.volume_label}</p>
          <p>¿Dónde está? {hit.volume_label} (buscable sin disco)</p>
        </div>
      )}
      <div className="mt-4">
        <h3>Duplicados</h3>
        <button onClick={loadDuplicates} className="text-zinc-300 underline">
          ver duplicados
        </button>
        {dupsError !== null && <p className="text-red-400">{dupsError}</p>}
        {dups !== null &&
          (dups.length === 0 ? (
            <p className="text-zinc-500">Sin duplicados</p>
          ) : (
            dups.map((d) => (
              <div key={`${d.blake3}:${d.size}`} className="text-sm">
                {d.sample_name} — {d.count} × {d.size}
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
