import type { JSX } from "react";
import type { FileKind } from "../lib/format";

interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number | undefined, children: JSX.Element, className?: string): JSX.Element {
  return (
    <svg
      width={size ?? 16}
      height={size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: IconProps) =>
  base(p.size, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, p.className);

export const IconX = (p: IconProps) =>
  base(p.size, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, p.className);

export const IconDisc = (p: IconProps) =>
  base(p.size, <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>, p.className);

export const IconDrive = (p: IconProps) =>
  base(p.size, <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15h.01" /><path d="M11 15h6" /><path d="m7.5 9 1 3h7l1-3" /></>, p.className);

export const IconFolder = (p: IconProps) =>
  base(p.size, <path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8L9.6 4.6A2 2 0 0 0 8.2 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z" />, p.className);

export const IconFile = (p: IconProps) =>
  base(p.size, <><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z" /><path d="M14 3v4h4" /></>, p.className);

/** Points at the folder it opens; the tree rotates it, it never mirrors. */
export const IconChevron = (p: IconProps) =>
  base(p.size, <path d="m9 5 7 7-7 7" />, p.className);

export const IconMusic = (p: IconProps) =>
  base(p.size, <><circle cx="7" cy="18" r="2.5" /><circle cx="17" cy="16" r="2.5" /><path d="M9.5 18V7l10-2v11" /></>, p.className);

export const IconImage = (p: IconProps) =>
  base(p.size, <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5-5 3 3 4-4 4 4" /></>, p.className);

export const IconVideo = (p: IconProps) =>
  base(p.size, <><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>, p.className);

export const IconDoc = (p: IconProps) =>
  base(p.size, <><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>, p.className);

export const IconArchive = (p: IconProps) =>
  base(p.size, <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" /></>, p.className);

export const IconCode = (p: IconProps) =>
  base(p.size, <><path d="m8 8-4 4 4 4" /><path d="m16 8 4 4-4 4" /><path d="m13 5-2 14" /></>, p.className);

export const IconChip = (p: IconProps) =>
  base(p.size, <><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>, p.className);

export const IconDownload = (p: IconProps) =>
  base(p.size, <><path d="M12 4v11" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></>, p.className);

export const IconCopy = (p: IconProps) =>
  base(p.size, <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>, p.className);

export const IconCheck = (p: IconProps) =>
  base(p.size, <path d="m4.5 12.5 5 5 10-11" />, p.className);

export const IconPlus = (p: IconProps) =>
  base(p.size, <><path d="M12 5v14" /><path d="M5 12h14" /></>, p.className);

export const IconScan = (p: IconProps) =>
  base(p.size, <><path d="M4 8V6a2 2 0 0 1 2-2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M20 16v2a2 2 0 0 1-2 2h-2" /><path d="M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /></>, p.className);

export const IconAlert = (p: IconProps) =>
  base(p.size, <><path d="M12 3 2.5 20h19Z" /><path d="M12 10v4" /><path d="M12 17.2h.01" /></>, p.className);

export const IconInfo = (p: IconProps) =>
  base(p.size, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>, p.className);

export const IconHelp = (p: IconProps) =>
  base(p.size, <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.4 2.1-2.4 3.3" /><path d="M12 17h.01" /></>, p.className);

export const IconClock = (p: IconProps) =>
  base(p.size, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>, p.className);

export const IconDuplicates = (p: IconProps) =>
  base(p.size, <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 4H6a2 2 0 0 0-2 2v10" /></>, p.className);

export const IconTable = (p: IconProps) =>
  base(p.size, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M9 10v10" /></>, p.className);

export const IconSort = (p: IconProps) =>
  base(p.size, <><path d="M8 5v14" /><path d="m5 16 3 3 3-3" /><path d="M16 19V5" /><path d="m13 8 3-3 3 3" /></>, p.className);

export const IconRefresh = (p: IconProps) =>
  base(p.size, <><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4h-4" /></>, p.className);

export const IconSpinner = (p: IconProps) =>
  base(p.size ?? 16, <path d="M12 3a9 9 0 1 0 9 9" className="spinner" />, p.className);

export const IconTrash = (p: IconProps) =>
  base(
    p.size,
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>,
    p.className,
  );

export const IconExternal = (p: IconProps) =>
  base(
    p.size,
    <>
      <path d="M14 4h6v6" />
      <path d="m20 4-9 9" />
      <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
    </>,
    p.className,
  );

export const IconSun = (p: IconProps) =>
  base(
    p.size,
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </>,
    p.className,
  );

export const IconMoon = (p: IconProps) =>
  base(
    p.size,
    <path d="M20.5 14.2A8.4 8.4 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
    p.className,
  );

export const IconMonitor = (p: IconProps) =>
  base(
    p.size,
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>,
    p.className,
  );

const KIND_ICON: Record<FileKind, (p: IconProps) => JSX.Element> = {
  audio: IconMusic,
  image: IconImage,
  video: IconVideo,
  doc: IconDoc,
  archive: IconArchive,
  code: IconCode,
  disk: IconChip,
  file: IconFile,
};

export function KindIcon({ kind, size }: { kind: FileKind; size?: number }): JSX.Element {
  const C = KIND_ICON[kind];
  return <C size={size} />;
}
