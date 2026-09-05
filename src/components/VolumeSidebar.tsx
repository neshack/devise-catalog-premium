import { useVolumes } from "../stores/volumes";

export default function VolumeSidebar() {
  const { volumes, selected, select } = useVolumes();
  return (
    <aside className="w-64 border-r border-zinc-800 p-3">
      {volumes.map((v) => (
        <button
          key={v.label}
          onClick={() => select(v.label)}
          className={selected === v.label ? "text-white" : "text-zinc-400"}
        >
          {v.label} {v.offline ? "(offline)" : ""}
        </button>
      ))}
    </aside>
  );
}
