import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileKind, formatBytes, formatCount, formatDate } from "../lib/format";
import { flattenTree, TREE_ROOT } from "../lib/tree";
import type { TreeDir, TreeFile } from "../lib/types";
import { useCatalog } from "../stores/catalog";
import ContextMenu from "./ContextMenu";
import TagDialog, { type TagTarget } from "./TagDialog";
import { IconChevron, IconFile, IconFolder, IconSearch, IconSpinner, IconTag, KindIcon } from "./icons";
import { EmptyState } from "./EmptyState";

type TreeMenu = { x: number; y: number; dir: TreeDir | null; file: TreeFile | null };

/** Height of one tree line, shared with the CSS. */
const ROW_HEIGHT = 30;

/**
 * The catalog as folders: a virtualized tree of one volume at a time.
 *
 * Folders are read on demand (one query per opened folder), so opening a
 * volume with a million files costs one level, not a million rows.
 */
export default function TreeView() {
  const { volumeFilter, tree, loadTree, toggleTreeDir, selected, selectTreeFile, updateTreeTags } =
    useCatalog();
  const [menu, setMenu] = useState<TreeMenu | null>(null);
  const [tagTarget, setTagTarget] = useState<TagTarget | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => flattenTree(tree.children, tree.expanded), [tree.children, tree.expanded]);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 14,
  });

  useEffect(() => {
    if (volumeFilter === null) return;
    // `revealInTree` arrives with the whole chain already loaded; reloading
    // here would collapse it back to the root.
    if (
      tree.children[TREE_ROOT] !== undefined ||
      tree.loading !== null ||
      tree.error !== null
    ) {
      return;
    }
    void loadTree();
  }, [loadTree, volumeFilter, tree.children, tree.loading, tree.error]);

  if (volumeFilter === null) {
    return (
      <EmptyState
        icon={<IconFolder size={26} />}
        title="Elige un volumen"
        hint="El árbol recorre un volumen a la vez, carpeta por carpeta. Selecciona uno en la barra lateral para ver su estructura real, tal como quedó indexada."
      />
    );
  }

  if (tree.error !== null) {
    return (
      <EmptyState
        icon={<IconSearch size={26} />}
        title="No se pudo leer la estructura"
        hint={tree.error}
      />
    );
  }

  const root = tree.children[TREE_ROOT];
  if (root === undefined) {
    return (
      <div className="empty">
        <IconSpinner size={22} />
        <span className="empty__hint">Leyendo la estructura de «{volumeFilter.label}»…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconFolder size={26} />}
        title={`«${volumeFilter.label}» no tiene archivos indexados`}
        hint="El volumen está en el catálogo pero su estructura quedó vacía: vuelve a escanearlo para llenarla."
      />
    );
  }

  const items = virt.getVirtualItems();

  return (
    <>
      {/* Misma tira de contexto que los resultados: qué se está mirando. */}
      <div className="results-span">
        <span className="results-span__label">Volumen</span>
        <span className="results-span__words">
          <b>{volumeFilter.label}</b> · {formatCount(root.dirs_total)}{" "}
          {root.dirs_total === 1 ? "carpeta" : "carpetas"} · {formatCount(root.files_total)}{" "}
          {root.files_total === 1 ? "archivo" : "archivos"} en la raíz
        </span>
      </div>

      <div
        className="results-scroll"
        ref={scrollRef}
        role="tree"
        aria-label={`Carpetas de ${volumeFilter.label}`}
      >
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {items.map((vi) => {
            const row = rows[vi.index];
            const dir = row.dir;
            const file = row.file;
            if (dir !== null) {
              const key = String(dir.id);
              const open = tree.expanded.includes(key);
              const loading = tree.loading === key;
              const inside = dir.files + dir.dirs;
              return (
                <div
                  key={row.key}
                  data-testid="tree-row"
                  role="treeitem"
                  aria-expanded={open}
                  className="tree-row tree-row--dir"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                    paddingLeft: 16 + row.depth * 16,
                  }}
                  onClick={() => void toggleTreeDir(key, dir.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, dir, file: null });
                  }}
                >
                  <span className="tree-row__mark" aria-hidden="true">
                    {loading ? (
                      <IconSpinner size={12} />
                    ) : (
                      <IconChevron size={12} className={open ? "is-open" : undefined} />
                    )}
                  </span>
                  <span className="tree-row__name">
                    <IconFolder size={14} />
                    <span className="tree-row__text" title={dir.name}>
                      {dir.name}
                    </span>
                    {dir.tags.slice(0, 2).map((tag) => (
                      <span className="tree-row__tag tree-row__tag--tag" key={tag}>
                        #{tag}
                      </span>
                    ))}
                    {dir.tags.length > 2 && (
                      <span className="tree-row__tag tree-row__tag--tag">
                        +{dir.tags.length - 2}
                      </span>
                    )}
                  </span>
                  <span className="tree-row__count">
                    {inside === 0
                      ? "vacía"
                      : `${formatCount(dir.files)} arch · ${formatCount(dir.dirs)} carp`}
                  </span>
                  <span className="tree-row__size">{formatBytes(dir.size)}</span>
                </div>
              );
            }
            if (file === null) return null;
            return (
              <div
                key={row.key}
                data-testid="tree-row"
                role="treeitem"
                className={`tree-row${selected?.id === file.id ? " is-selected" : ""}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                  paddingLeft: 16 + row.depth * 16,
                }}
                title={file.container_path === null ? file.name : `${file.container_path}/${file.name}`}
                onClick={() => void selectTreeFile(file.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, dir: null, file });
                }}
              >
                <span className="tree-row__mark" aria-hidden="true" />
                <span className="tree-row__name">
                  <KindIcon kind={fileKind(file.ext)} size={14} />
                  <span className="tree-row__text">{file.name}</span>
                  {file.container_path !== null && (
                    <span className="tree-row__tag">
                      {file.container_path.split("/").pop() ?? file.container_path}
                    </span>
                  )}
                  {file.tags.slice(0, 2).map((tag) => (
                    <span className="tree-row__tag tree-row__tag--tag" key={tag}>
                      #{tag}
                    </span>
                  ))}
                  {file.tags.length > 2 && (
                    <span className="tree-row__tag tree-row__tag--tag">
                      +{file.tags.length - 2}
                    </span>
                  )}
                </span>
                <span className="tree-row__count">{formatDate(file.mtime)}</span>
                <span className="tree-row__size">{formatBytes(file.size)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            menu.dir !== null
              ? [
                  {
                    label: "Etiquetar carpeta…",
                    icon: <IconTag size={14} />,
                    onSelect: () =>
                      setTagTarget({ kind: "dir", id: menu.dir!.id, name: menu.dir!.name }),
                  },
                  {
                    label: "Expandir o contraer",
                    icon: <IconFolder size={14} />,
                    onSelect: () => void toggleTreeDir(String(menu.dir!.id), menu.dir!.id),
                  },
                ]
              : [
                  {
                    label: "Ver detalles",
                    icon: <IconFile size={14} />,
                    onSelect: () => void selectTreeFile(menu.file!.id),
                  },
                  {
                    label: "Etiquetar archivo…",
                    icon: <IconTag size={14} />,
                    onSelect: () =>
                      setTagTarget({ kind: "file", id: menu.file!.id, name: menu.file!.name }),
                  },
                ]
          }
        />
      )}

      {tagTarget !== null && (
        <TagDialog
          target={tagTarget}
          onClose={() => setTagTarget(null)}
          onChanged={(tags) => updateTreeTags({ kind: tagTarget.kind, id: tagTarget.id }, tags)}
        />
      )}
    </>
  );
}
