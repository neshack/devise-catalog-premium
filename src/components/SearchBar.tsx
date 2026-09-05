import { useState, useEffect } from "react";
import { parseSearchQuery } from "../lib/search";

export default function SearchBar({ onSearch }: { onSearch: (raw: string) => void }) {
  const [raw, setRaw] = useState("*.mp3");
  useEffect(() => {
    parseSearchQuery(raw);
    const t = setTimeout(() => onSearch(raw), 150);
    return () => clearTimeout(t);
  }, [raw, onSearch]);
  return (
    <input
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      placeholder='*.mp3 size:>5MB volume:"Backup-12"'
      className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
    />
  );
}
