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

/** Outlined "relvista" wordmark (Manrope Bold), from brand/logo-light.svg. Artwork: never live text. */
const WORDMARK_D = [
  'M7 0L7 -54L17.65 -54L17.65 -40.85L16.35 -42.55Q17.35 -45.25 19.03 -47.47',
  'Q20.7 -49.7 23.05 -51.15Q25.05 -52.55 27.48 -53.3Q29.9 -54.05 32.45 -54.22',
  'Q35 -54.4 37.4 -54L37.4 -42.75Q35 -43.45 31.9 -43.2Q28.8 -42.95 26.25 -41.45',
  'Q23.75 -40.1 22.18 -38Q20.6 -35.9 19.85 -33.22Q19.1 -30.55 19.1 -27.45L19.1 0Z',
  'M70.47 1.5Q62.27 1.5 56.07 -2.05Q49.87 -5.6 46.39 -11.9Q42.92 -18.2 42.92 -26.4',
  'Q42.92 -35.25 46.34 -41.78Q49.77 -48.3 55.79 -51.9Q61.82 -55.5 69.77 -55.5',
  'Q78.17 -55.5 84.04 -51.57Q89.92 -47.65 92.77 -40.5Q95.62 -33.35 94.92 -23.65',
  'L82.97 -23.65L82.97 -28.05Q82.92 -36.85 79.87 -40.9Q76.82 -44.95 70.27 -44.95',
  'Q62.92 -44.95 59.29 -40.37Q55.67 -35.8 55.67 -27Q55.67 -18.8 59.29 -14.3',
  'Q62.92 -9.8 69.77 -9.8Q74.22 -9.8 77.44 -11.77Q80.67 -13.75 82.42 -17.5L94.32 -13.9',
  'Q91.27 -6.6 84.77 -2.55Q78.27 1.5 70.47 1.5ZM51.87 -23.65L51.87 -32.75L89.02 -32.75',
  'L89.02 -23.65ZM107.13 0L107.13 -73.5L119.18 -73.5L119.18 0ZM148.77 0L129.17 -54',
  'L141.22 -54L154.82 -14.85L168.37 -54L180.47 -54L160.87 0ZM190.47 -62.2L190.47 -73.25',
  'L202.52 -73.25L202.52 -62.2ZM190.47 0L190.47 -54L202.52 -54L202.52 0ZM238.35 1.5',
  'Q228.35 1.5 222.1 -3Q215.85 -7.5 214.5 -15.65L226.8 -17.55Q227.75 -13.55 231 -11.25',
  'Q234.25 -8.95 239.2 -8.95Q243.55 -8.95 245.93 -10.67Q248.3 -12.4 248.3 -15.4',
  'Q248.3 -17.25 247.43 -18.37Q246.55 -19.5 243.6 -20.55Q240.65 -21.6 234.55 -23.2',
  'Q227.75 -25 223.75 -27.08Q219.75 -29.15 218 -32Q216.25 -34.85 216.25 -38.9',
  'Q216.25 -43.95 218.9 -47.7Q221.55 -51.45 226.33 -53.47Q231.1 -55.5 237.5 -55.5',
  'Q243.8 -55.5 248.68 -53.55Q253.55 -51.6 256.58 -48Q259.6 -44.4 260.25 -39.55',
  'L247.95 -37.35Q247.5 -40.8 244.83 -42.8Q242.15 -44.8 237.7 -45.05',
  'Q233.45 -45.3 230.85 -43.78Q228.25 -42.25 228.25 -39.5Q228.25 -37.95 229.3 -36.85',
  'Q230.35 -35.75 233.53 -34.65Q236.7 -33.55 243 -31.95Q249.5 -30.3 253.35 -28.17',
  'Q257.2 -26.05 258.93 -23.1Q260.65 -20.15 260.65 -15.95Q260.65 -7.85 254.73 -3.17',
  'Q248.8 1.5 238.35 1.5ZM303.3 0Q297.95 1 292.83 0.88Q287.7 0.75 283.65 -1.03',
  'Q279.6 -2.8 277.5 -6.65Q275.65 -10.15 275.55 -13.8Q275.45 -17.45 275.45 -22.05',
  'L275.45 -69L287.45 -69L287.45 -22.75Q287.45 -19.55 287.53 -17.07',
  'Q287.6 -14.6 288.55 -13.05Q290.35 -10.05 294.3 -9.7Q298.25 -9.35 303.3 -10.1Z',
  'M265.65 -44.55L265.65 -54L303.3 -54L303.3 -44.55ZM330.07 1.5Q324.22 1.5 320.17 -0.73',
  'Q316.12 -2.95 314.04 -6.65Q311.97 -10.35 311.97 -14.8Q311.97 -18.7 313.27 -21.83',
  'Q314.57 -24.95 317.27 -27.22Q319.97 -29.5 324.27 -30.95Q327.52 -32.05 331.89 -32.87',
  'Q336.27 -33.7 341.39 -34.43Q346.52 -35.15 352.12 -36L347.82 -33.55',
  'Q347.87 -39.15 345.32 -41.8Q342.77 -44.45 336.72 -44.45Q333.07 -44.45 329.67 -42.75',
  'Q326.27 -41.05 324.92 -36.9L313.92 -40.35Q315.92 -47.2 321.54 -51.35',
  'Q327.17 -55.5 336.72 -55.5Q343.97 -55.5 349.42 -53.15Q354.87 -50.8 357.52 -45.45',
  'Q358.97 -42.6 359.27 -39.62Q359.57 -36.65 359.57 -33.15L359.57 0L349.02 0L349.02 -11.7',
  'L350.77 -9.8Q347.12 -3.95 342.24 -1.23Q337.37 1.5 330.07 1.5ZM332.47 -8.1',
  'Q336.57 -8.1 339.47 -9.58Q342.37 -11.05 344.09 -13.12Q345.82 -15.2 346.42 -17.05',
  'Q347.37 -19.35 347.49 -22.33Q347.62 -25.3 347.62 -27.15L351.32 -26.05',
  'Q345.87 -25.2 341.97 -24.55Q338.07 -23.9 335.27 -23.33Q332.47 -22.75 330.32 -22.05',
  'Q328.27 -21.3 326.79 -20.3Q325.32 -19.3 324.54 -18Q323.77 -16.7 323.77 -14.95',
  'Q323.77 -13 324.77 -11.45Q325.77 -9.9 327.69 -9Q329.62 -8.1 332.47 -8.1Z',
].join('');

/**
 * The r-link mark (brand/mark.svg). Stroke follows the theme (--ed-logo-mark: blue on light, white
 * on dark); the dot is brand teal. Use at 20 px or larger. Decorative unless labelled by a parent.
 */
export function Logo(props: { size?: number; className?: string }): ReactElement {
  const size = props.size ?? 22;
  return (
    <svg
      className={props.className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 26V15.5C10 10.5 13 8 17 8"
        stroke="var(--ed-logo-mark)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="25" cy="8" r="3.4" fill="#14a38b" />
    </svg>
  );
}

/** The outlined wordmark, coloured by --ed-logo-text. Decorative: the parent carries the name. */
export function Wordmark(props: { height?: number; className?: string }): ReactElement {
  const height = props.height ?? 12;
  return (
    <svg
      className={props.className}
      height={height}
      width={Math.round(((height * 366) / 76) * 10) / 10}
      viewBox="150 10 366 76"
      aria-hidden="true"
      focusable="false"
    >
      <path transform="translate(150 84)" fill="var(--ed-logo-text)" d={WORDMARK_D} />
    </svg>
  );
}

/** Mark + wordmark lockup, in the brand proportions. `height` is the mark's size. */
export function Lockup(props: { height?: number; className?: string }): ReactElement {
  const h = props.height ?? 20;
  return (
    <span
      className={['ed-lockup', props.className].filter(Boolean).join(' ')}
      role="img"
      aria-label="relvista"
    >
      <Logo size={h} />
      <Wordmark height={Math.round(((h * 76) / 104) * 10) / 10} />
    </span>
  );
}
