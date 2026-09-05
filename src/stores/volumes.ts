import { create } from "zustand";

interface V {
  label: string;
  serial: string;
  offline: boolean;
}

interface S {
  volumes: V[];
  selected: string | null;
  setVolumes: (v: V[]) => void;
  select: (l: string | null) => void;
}

export const useVolumes = create<S>((set) => ({
  volumes: [],
  selected: null,
  setVolumes: (volumes) => set({ volumes }),
  select: (selected) => set({ selected }),
}));
