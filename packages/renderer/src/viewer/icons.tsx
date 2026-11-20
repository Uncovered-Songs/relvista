import type { ReactElement, ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }): ReactElement {
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
    >
      {children}
    </svg>
  );
}

export const ZoomInIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14M5 7h4M7 5v4" />
  </Icon>
);
export const ZoomOutIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14M5 7h4" />
  </Icon>
);
export const FitIcon = () => (
  <Icon>
    <path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5" />
    <rect x="5.5" y="5.5" width="5" height="5" rx="1" />
  </Icon>
);
export const ExpandIcon = () => (
  <Icon>
    <path d="M9.5 2H14v4.5M14 2 9 7M6.5 14H2V9.5M2 14l5-5" />
  </Icon>
);
export const CollapseIcon = () => (
  <Icon>
    <path d="M13.5 6.5H9.5V2.5M9.5 6.5 14 2M2.5 9.5h4v4M6.5 9.5 2 14" />
  </Icon>
);
export const DownloadIcon = () => (
  <Icon>
    <path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />
  </Icon>
);
export const PrintIcon = () => (
  <Icon>
    <path d="M4.5 6V2h7v4M4.5 11.5h-2v-5.5h11v5.5h-2" />
    <rect x="4.5" y="9.5" width="7" height="4.5" rx="0.5" />
  </Icon>
);
export const ExternalIcon = () => (
  <Icon>
    <path d="M9.5 2H14v4.5M14 2 7.5 8.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5" />
  </Icon>
);
export const LayersIcon = () => (
  <Icon>
    <path d="m8 2 6 3.25-6 3.25-6-3.25L8 2Z" />
    <path d="m2 8.25 6 3.25 6-3.25M2 11.25l6 3.25 6-3.25" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);
export const AlertIcon = () => (
  <Icon>
    <path d="M8 1.75 14.5 13.5h-13L8 1.75Z" />
    <path d="M8 6v3.5M8 11.5v.01" />
  </Icon>
);
export const ChevronIcon = () => (
  <Icon>
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
  </Icon>
);
