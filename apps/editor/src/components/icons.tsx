/** Inline icons (16 px grid, currentColor). Decorative: always aria-hidden. */
import type { ReactElement, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Svg(props: P & { children: React.ReactNode }): ReactElement {
  const { children, ...rest } = props;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ChevronDown = (p: P) => (
  <Svg {...p} width="12" height="12">
    <path d="M4 6l4 4 4-4" />
  </Svg>
);
export const ChevronRight = (p: P) => (
  <Svg {...p} width="12" height="12">
    <path d="M6 4l4 4-4 4" />
  </Svg>
);
export const SaveIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 2.5h8l2.5 2.5v8.5h-11z" />
    <path d="M5 2.5v3.5h5v-3.5M5 13.5v-4h6v4" />
  </Svg>
);
export const ShareIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 9.5l3-3" />
    <path d="M7 4.5l1.5-1.5a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5L7.5 13a2.5 2.5 0 01-3.5-3.5L5.5 8" />
  </Svg>
);
export const DownloadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />
  </Svg>
);
export const LayoutIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="5" height="4" rx="1" />
    <rect x="9" y="9.5" width="5" height="4" rx="1" />
    <path d="M4.5 6.5v5h4.5" />
  </Svg>
);
export const SunIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
  </Svg>
);
export const MoonIcon = (p: P) => (
  <Svg {...p}>
    <path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z" />
  </Svg>
);
export const SystemIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 2.5v11a5.5 5.5 0 000-11z" fill="currentColor" stroke="none" />
  </Svg>
);
export const HelpIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.2 6.2a1.9 1.9 0 013.6.8c0 1.3-1.8 1.5-1.8 2.7M8 11.6v.1" />
  </Svg>
);
export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
export const MinusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 8h10" />
  </Svg>
);
export const FitIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </Svg>
);
export const UndoIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 4L2.5 6.5 5 9" />
    <path d="M2.5 6.5H10a3.5 3.5 0 010 7H7" />
  </Svg>
);
export const RedoIcon = (p: P) => (
  <Svg {...p}>
    <path d="M11 4l2.5 2.5L11 9" />
    <path d="M13.5 6.5H6a3.5 3.5 0 000 7h3" />
  </Svg>
);
export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);
export const MoreIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="3.5" cy="8" r="1" fill="currentColor" />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
    <circle cx="12.5" cy="8" r="1" fill="currentColor" />
  </Svg>
);
export const ErrorIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
  </Svg>
);
export const WarningIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 2l6.5 11.5h-13z" />
    <path d="M8 6.5v3M8 11.6v.1" />
  </Svg>
);
export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 8.5l3 3 7-7" />
  </Svg>
);
export const FileIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 1.5h5l3.5 3.5v9.5h-8.5z" />
    <path d="M9 1.5V5h3.5" />
  </Svg>
);
export const FolderIcon = (p: P) => (
  <Svg {...p}>
    <path d="M1.5 4a1 1 0 011-1h3.5l1.5 1.5h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1z" />
  </Svg>
);
export const CopyIcon = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
    <path d="M11 5V3.5A1 1 0 0010 2.5H3.5a1 1 0 00-1 1V10a1 1 0 001 1H5" />
  </Svg>
);

/** The relvista mark (from the docs favicon). */
export function Logo(): ReactElement {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M13 13h3v10h3"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="1.5"
        y="3.5"
        width="11.5"
        height="15"
        rx="2.5"
        fill="var(--ed-surface)"
        stroke="#2f6fed"
        strokeWidth="1.5"
      />
      <path d="M1.5 6a2.5 2.5 0 0 1 2.5-2.5h6.5A2.5 2.5 0 0 1 13 6v2.5H1.5z" fill="#2f6fed" />
      <path d="M4.25 12h6M4.25 15h4" stroke="#9aa6b8" strokeWidth="1.3" strokeLinecap="round" />
      <rect
        x="19"
        y="13.5"
        width="11.5"
        height="15"
        rx="2.5"
        fill="var(--ed-surface)"
        stroke="#14a38b"
        strokeWidth="1.5"
      />
      <path d="M19 16a2.5 2.5 0 0 1 2.5-2.5H28a2.5 2.5 0 0 1 2.5 2.5v2.5H19z" fill="#14a38b" />
      <path d="M21.75 22h6M21.75 25h4" stroke="#9aa6b8" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
