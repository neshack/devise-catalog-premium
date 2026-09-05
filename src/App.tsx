import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import SearchBar from "./components/SearchBar";
import VolumeSidebar from "./components/VolumeSidebar";
import CatalogTree, { type Hit } from "./components/CatalogTree";
import Inspector from "./components/Inspector";
import { useVolumes } from "./stores/volumes";

const DB_PATH = "catalog.cdc";
const SEARCH_LIMIT = 200;

export default function App() {
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState<Hit | null>(null);
  const setVolumes = useVolumes((s) => s.setVolumes);

  const handleSearch = useCallback(
    async (raw: string) => {
      if (raw.trim() === "") {
        setHits([]);
        return;
      }
      try {
        const rows = await invoke<Hit[]>("search", {
          dbPath: DB_PATH,
          raw,
          limit: SEARCH_LIMIT,
        });
        setHits(rows);
        const seen = new Map<
          string,
          { label: string; serial: string; offline: boolean }
        >();
        for (const h of rows) {
          if (!seen.has(h.volume_label)) {
            seen.set(h.volume_label, {
              label: h.volume_label,
              serial: h.volume_label,
              offline: false,
            });
          }
        }
        setVolumes([...seen.values()]);
      } catch {
        setHits([]);
      }
    },
    [setVolumes]
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <h1 className="text-2xl font-bold">CD Catalog Premium</h1>
      <div className="my-3">
        <SearchBar onSearch={handleSearch} />
      </div>
      <div className="flex">
        <VolumeSidebar />
        <CatalogTree hits={hits} onSelect={setSelected} />
        <Inspector hit={selected} dbPath={DB_PATH} />
      </div>
    </main>
  );
}
