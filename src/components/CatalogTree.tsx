import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

export interface Hit {
  id: number;
  name: string;
  size: number;
  volume_label: string;
}

export default function CatalogTree({
  hits,
  onSelect,
}: {
  hits: Hit[];
  onSelect?: (h: Hit) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: hits.length,
    getScrollElement: () => ref.current,
    estimateSize: () => 28,
  });
  if (hits.length === 0) {
    return <div className="flex-1 overflow-auto p-3 text-zinc-500">Sin resultados</div>;
  }
  return (
    <div ref={ref} className="flex-1 overflow-auto">
      <div style={{ height: virt.getTotalSize(), position: "relative" }}>
        {virt.getVirtualItems().map((vi) => {
          const h = hits[vi.index];
          return (
            <div
              key={h.id}
              onClick={() => onSelect?.(h)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
              className="text-sm px-2 cursor-pointer"
            >
              {h.name} — {h.size} — {h.volume_label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
